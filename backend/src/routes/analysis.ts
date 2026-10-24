import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database';
import { runModelA, runModelB, LLMExtractionResult } from '../services/llmEvaluator';
import { arbitrate } from '../services/arbitrator';
import { runDeterministicChecks } from '../services/deterministic';
import { runInvoiceDownstream } from '../services/connectorHub';

const router = Router();

/**
 * POST /api/invoices/:id/analyze — Triggers full analysis pipeline:
 * 1. Dual-LLM extraction (Model A + Model B in parallel)
 * 2. Arbitration (compare & build consensus)
 * 3. Deterministic checks (8 rule-based checks)
 * 4. Status update on the invoice
 * 5. Audit trail entries
 */
router.post('/:id/analyze', async (req: Request, res: Response) => {
  const invoiceId = req.params.id as string;
  try {
    if (!req.tenantId) {
      res.status(401).json({ error: 'Tenant ID required' });
      return;
    }

    const db = getDb();
    const invoice = db
      .prepare('SELECT * FROM invoices WHERE id = ? AND tenant_id = ?')
      .get(invoiceId, req.tenantId) as any;

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    if (!invoice.raw_ocr_text || invoice.raw_ocr_text.startsWith('[OCR extraction failed')) {
      res.status(400).json({ error: 'Invoice has no OCR text to analyze' });
      return;
    }

    // Update status to PROCESSING
    db.prepare(
      `UPDATE invoices SET status = 'PROCESSING', updated_at = datetime('now') WHERE id = ?`
    ).run(invoiceId);

    // Add audit entry for analysis start
    db.prepare(
      `INSERT INTO audit_trail (id, invoice_id, tenant_id, action, actor, details)
       VALUES (?, ?, ?, 'ANALYSIS_STARTED', 'system', ?)`
    ).run(
      uuidv4(),
      invoiceId,
      req.tenantId,
      JSON.stringify({ triggered_by: req.body.actor || 'system' })
    );

    // Step 1: Run dual LLM analysis in parallel
    const [modelAResult, modelBResult] = await Promise.all([
      runModelA(invoice.raw_ocr_text),
      runModelB(invoice.raw_ocr_text),
    ]);

    // Clear previous analyses for this invoice
    db.prepare('DELETE FROM llm_analyses WHERE invoice_id = ?').run(invoiceId);

    // Store Model A results
    const modelAName = modelAResult.provider_info
      ? `${modelAResult.provider_info.name} (${modelAResult.provider_info.model})`
      : 'Model A: Extractor';
    const modelAId = uuidv4();
    db.prepare(
      `INSERT INTO llm_analyses (id, invoice_id, model_name, extracted_data, risk_flags, confidence_score, raw_response)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      modelAId,
      invoiceId,
      modelAName,
      JSON.stringify(modelAResult),
      JSON.stringify(modelAResult.risk_flags),
      modelAResult.confidence_score,
      JSON.stringify(modelAResult)
    );

    // Store Model B results
    const modelBName = modelBResult.provider_info
      ? `${modelBResult.provider_info.name} (${modelBResult.provider_info.model})`
      : 'Model B: Auditor';
    const modelBId = uuidv4();
    db.prepare(
      `INSERT INTO llm_analyses (id, invoice_id, model_name, extracted_data, risk_flags, confidence_score, raw_response)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      modelBId,
      invoiceId,
      modelBName,
      JSON.stringify(modelBResult),
      JSON.stringify(modelBResult.risk_flags),
      modelBResult.confidence_score,
      JSON.stringify(modelBResult)
    );

    // Step 2: Arbitrate — compare Model A vs Model B
    const arbitrationResult = arbitrate(modelAResult, modelBResult);

    // Store arbitration consensus record
    db.prepare(
      `INSERT INTO llm_analyses (id, invoice_id, model_name, extracted_data, risk_flags, confidence_score, raw_response)
       VALUES (?, ?, 'arbitration_consensus', ?, ?, ?, ?)`
    ).run(
      uuidv4(),
      invoiceId,
      JSON.stringify(arbitrationResult.consensus),
      JSON.stringify(arbitrationResult.discrepancies),
      arbitrationResult.overall_confidence,
      JSON.stringify(arbitrationResult)
    );

    // Step 3: Update invoice with consensus data
    const consensus = arbitrationResult.consensus;
    db.prepare(
      `UPDATE invoices SET
        vendor_name = ?,
        vendor_tax_id = ?,
        invoice_number = ?,
        invoice_date = ?,
        due_date = ?,
        currency = ?,
        subtotal = ?,
        tax_amount = ?,
        total_amount = ?,
        updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      consensus.vendor_name,
      consensus.vendor_tax_id,
      consensus.invoice_number,
      consensus.invoice_date,
      consensus.due_date,
      consensus.currency,
      consensus.subtotal,
      consensus.tax_amount,
      consensus.total_amount,
      invoiceId
    );

    // Insert consensus line items
    const insertLineItem = db.prepare(
      `INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price, amount)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    // Clear existing line items first
    db.prepare('DELETE FROM invoice_line_items WHERE invoice_id = ?').run(
      invoiceId
    );

    for (const li of consensus.line_items) {
      insertLineItem.run(
        uuidv4(),
        invoiceId,
        li.description,
        li.quantity,
        li.unit_price,
        li.amount
      );
    }

    // Step 4: Run deterministic checks
    // Clear existing checks first
    db.prepare('DELETE FROM deterministic_checks WHERE invoice_id = ?').run(
      invoiceId
    );

    const checkResults = runDeterministicChecks(
      invoiceId,
      consensus,
      req.tenantId
    );

    // Step 5: Determine final status
    const hasCriticalFail = checkResults.some(
      (c) => !c.passed && c.severity === 'CRITICAL'
    );
    const hasWarnings = checkResults.some(
      (c) => !c.passed && c.severity === 'WARNING'
    );

    let finalStatus: string;
    if (hasCriticalFail || arbitrationResult.recommended_status === 'NEEDS_REVIEW') {
      finalStatus = 'NEEDS_REVIEW';
    } else if (hasWarnings) {
      finalStatus = 'NEEDS_REVIEW';
    } else {
      finalStatus = 'APPROVED';
    }

    db.prepare(
      `UPDATE invoices SET status = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(finalStatus, invoiceId);

    // Add audit entry for analysis completion
    db.prepare(
      `INSERT INTO audit_trail (id, invoice_id, tenant_id, action, actor, details)
       VALUES (?, ?, ?, 'ANALYSIS_COMPLETED', 'system', ?)`
    ).run(
      uuidv4(),
      invoiceId,
      req.tenantId,
      JSON.stringify({
        model_a_confidence: modelAResult.confidence_score,
        model_b_confidence: modelBResult.confidence_score,
        overall_confidence: arbitrationResult.overall_confidence,
        discrepancy_count: arbitrationResult.discrepancies.length,
        checks_passed: checkResults.filter((c) => c.passed).length,
        checks_failed: checkResults.filter((c) => !c.passed).length,
        final_status: finalStatus,
      })
    );

    // Step 6: Fastn downstream actions (Drive archive, HubSpot note, Sheets ledger, Slack alert).
    // Each action is recorded in the audit trail as OK / FAILED / SKIPPED. A downstream
    // failure never changes the verification result or fails this request.
    let fastnActions: any[] = [];
    try {
      fastnActions = await runInvoiceDownstream(req.tenantId, invoiceId);
    } catch (downstreamError: any) {
      console.error('[Analysis] Fastn downstream error:', downstreamError.message);
      fastnActions = [{ operation: 'downstream', outcome: 'FAILED', reason: downstreamError.message }];
    }

    // Return the complete analysis result
    const updatedInvoice = db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(invoiceId);

    res.json({
      invoice: updatedInvoice,
      analysis: {
        model_a: modelAResult,
        model_b: modelBResult,
        arbitration: arbitrationResult,
        deterministic_checks: checkResults,
        final_status: finalStatus,
      },
      fastn_actions: fastnActions,
    });
  } catch (error: any) {
    console.error('[Analysis] Error:', error.message);

    // Update invoice status back if analysis fails
    try {
      const db = getDb();
      db.prepare(
        `UPDATE invoices SET status = 'PENDING', updated_at = datetime('now') WHERE id = ?`
      ).run(invoiceId);

      db.prepare(
        `INSERT INTO audit_trail (id, invoice_id, tenant_id, action, actor, details)
         VALUES (?, ?, ?, 'ANALYSIS_FAILED', 'system', ?)`
      ).run(
        uuidv4(),
        invoiceId,
        req.tenantId!,
        JSON.stringify({ error: error.message })
      );
    } catch (_) {
      // ignore cleanup errors
    }

    res.status(500).json({ error: 'Analysis failed', details: error.message });
  }
});

export default router;
