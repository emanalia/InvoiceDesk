import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getDb } from '../database';
import { config } from '../config';
import { extractText } from '../services/ocr';

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(config.UPLOAD_DIR)) {
      fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
    }
    cb(null, config.UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${uuidv4()}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/tiff',
      'image/bmp',
      'image/webp',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

/**
 * POST /api/invoices/upload — Upload an invoice file, run OCR, create invoice record
 */
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.tenantId) {
      res.status(401).json({ error: 'Tenant ID required' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const db = getDb();
    const invoiceId = uuidv4();
    const filePath = req.file.path;
    const originalFilename = req.file.originalname;

    // Run OCR extraction
    let ocrText = '';
    let pages = 0;
    try {
      const ocrResult = await extractText(filePath);
      ocrText = ocrResult.text;
      pages = ocrResult.pages;
    } catch (ocrError: any) {
      console.warn('[OCR] Extraction failed:', ocrError.message);
      ocrText = `[OCR extraction failed: ${ocrError.message}]`;
    }

    // Extract preliminary invoice number if present in OCR text
    const defaultInvNumber = `UPLOAD-${Date.now().toString().slice(-6)}`;
    const preliminaryNumberMatch = ocrText.match(/Invoice\s*(?:Number|#)?[:\s]*([^\r\n]+)/i);
    const invoiceNumber = preliminaryNumberMatch ? preliminaryNumberMatch[1].trim() : defaultInvNumber;

    // Create invoice record
    db.prepare(
      `INSERT INTO invoices (id, tenant_id, invoice_number, vendor_name, status, source, raw_ocr_text, original_filename, file_path)
       VALUES (?, ?, ?, 'Pending Analysis', 'PENDING', 'upload', ?, ?, ?)`
    ).run(invoiceId, req.tenantId, invoiceNumber, ocrText, originalFilename, filePath);

    // Add audit trail entry
    db.prepare(
      `INSERT INTO audit_trail (id, invoice_id, tenant_id, action, actor, details)
       VALUES (?, ?, ?, 'UPLOADED', 'system', ?)`
    ).run(
      uuidv4(),
      invoiceId,
      req.tenantId,
      JSON.stringify({
        original_filename: originalFilename,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        ocr_pages: pages,
      })
    );

    const invoice = db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(invoiceId);

    res.status(201).json({ invoice, ocr: { pages, text_length: ocrText.length } });
  } catch (error: any) {
    console.error('[Invoices] Upload error:', error.message);
    res.status(500).json({ error: 'Failed to upload invoice' });
  }
});

/**
 * GET /api/invoices — List invoices for tenant (paginated)
 */
router.get('/', (req: Request, res: Response) => {
  try {
    if (!req.tenantId) {
      res.status(401).json({ error: 'Tenant ID required' });
      return;
    }

    const db = getDb();
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;
    const status = req.query.status as string | undefined;

    let query = 'SELECT * FROM invoices WHERE tenant_id = ?';
    const params: any[] = [req.tenantId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as count');
    const { count } = db.prepare(countQuery).get(...params) as { count: number };

    // Get paginated results
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    const invoices = db.prepare(query).all(...params);

    res.json({
      invoices,
      pagination: {
        page,
        limit,
        total: count,
        total_pages: Math.ceil(count / limit),
      },
    });
  } catch (error: any) {
    console.error('[Invoices] List error:', error.message);
    res.status(500).json({ error: 'Failed to list invoices' });
  }
});

/**
 * GET /api/invoices/:id — Full invoice detail with line items, analyses, checks, audit trail
 */
router.get('/:id', (req: Request, res: Response) => {
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

    // Get line items
    const lineItems = db
      .prepare('SELECT * FROM invoice_line_items WHERE invoice_id = ?')
      .all(invoiceId);

    // Get LLM analyses
    const analyses = db
      .prepare('SELECT * FROM llm_analyses WHERE invoice_id = ? ORDER BY created_at ASC')
      .all(invoiceId);

    // Get deterministic checks
    const checks = db
      .prepare('SELECT * FROM deterministic_checks WHERE invoice_id = ? ORDER BY created_at ASC')
      .all(invoiceId);

    // Get audit trail
    const auditTrail = db
      .prepare('SELECT * FROM audit_trail WHERE invoice_id = ? ORDER BY created_at DESC')
      .all(invoiceId);

    const formattedAnalyses = analyses.map((a: any) => ({
      ...a,
      extracted_data: a.extracted_data ? JSON.parse(a.extracted_data) : null,
      risk_flags: a.risk_flags ? JSON.parse(a.risk_flags) : [],
    }));

    const formattedChecks = checks.map((c: any) => ({
      ...c,
      passed: !!c.passed,
      details: c.details ? JSON.parse(c.details) : null,
    }));

    const formattedAuditTrail = auditTrail.map((e: any) => ({
      ...e,
      details: e.details ? JSON.parse(e.details) : null,
    }));

    res.json({
      invoice: {
        ...invoice,
        line_items: lineItems,
        analyses: formattedAnalyses,
        deterministic_checks: formattedChecks,
        audit_trail: formattedAuditTrail,
      },
      line_items: lineItems,
      analyses: formattedAnalyses,
      checks: formattedChecks,
      deterministic_checks: formattedChecks,
      audit_trail: formattedAuditTrail,
    });
  } catch (error: any) {
    console.error('[Invoices] Get error:', error.message);
    res.status(500).json({ error: 'Failed to get invoice' });
  }
});

/**
 * POST /api/invoices/:id/approve — Set status APPROVED, add audit entry
 */
router.post('/:id/approve', (req: Request, res: Response) => {
  try {
    if (!req.tenantId) {
      res.status(401).json({ error: 'Tenant ID required' });
      return;
    }

    const db = getDb();
    const invoice = db
      .prepare('SELECT * FROM invoices WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.tenantId) as any;

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    const actor = req.body.actor || 'user';
    const notes = req.body.notes || '';

    db.prepare(
      `UPDATE invoices SET status = 'APPROVED', updated_at = datetime('now') WHERE id = ?`
    ).run(req.params.id);

    db.prepare(
      `INSERT INTO audit_trail (id, invoice_id, tenant_id, action, actor, details)
       VALUES (?, ?, ?, 'APPROVED', ?, ?)`
    ).run(
      uuidv4(),
      req.params.id,
      req.tenantId,
      actor,
      JSON.stringify({ notes, previous_status: invoice.status })
    );

    const updated = db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(req.params.id);

    res.json({ invoice: updated, message: 'Invoice approved' });
  } catch (error: any) {
    console.error('[Invoices] Approve error:', error.message);
    res.status(500).json({ error: 'Failed to approve invoice' });
  }
});

/**
 * POST /api/invoices/:id/reject — Set status REJECTED with reason, add audit entry
 */
router.post('/:id/reject', (req: Request, res: Response) => {
  try {
    if (!req.tenantId) {
      res.status(401).json({ error: 'Tenant ID required' });
      return;
    }

    const db = getDb();
    const invoice = db
      .prepare('SELECT * FROM invoices WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.tenantId) as any;

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    const actor = req.body.actor || 'user';
    const reason = req.body.reason || 'No reason provided';

    db.prepare(
      `UPDATE invoices SET status = 'REJECTED', updated_at = datetime('now') WHERE id = ?`
    ).run(req.params.id);

    db.prepare(
      `INSERT INTO audit_trail (id, invoice_id, tenant_id, action, actor, details)
       VALUES (?, ?, ?, 'REJECTED', ?, ?)`
    ).run(
      uuidv4(),
      req.params.id,
      req.tenantId,
      actor,
      JSON.stringify({ reason, previous_status: invoice.status })
    );

    const updated = db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(req.params.id);

    res.json({ invoice: updated, message: 'Invoice rejected' });
  } catch (error: any) {
    console.error('[Invoices] Reject error:', error.message);
    res.status(500).json({ error: 'Failed to reject invoice' });
  }
});

export default router;
