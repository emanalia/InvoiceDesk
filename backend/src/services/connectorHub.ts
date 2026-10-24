import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database';
import { config } from '../config';
import { extractText } from './ocr';
import { isFastnConfigured, listWorkspaceConnections, FastnNotConfiguredError } from './fastn';
import {
  CONNECTOR_IDS,
  Provider,
  healthCheck,
  fetchGmailInvoiceAttachments,
  archiveInvoiceToDrive,
  appendLedgerRow,
  postSlackAlert,
  createHubspotVendorNote,
} from './fastnActions';

/**
 * ConnectorHub: tenant-scoped access to the verified Fastn connections.
 *
 * Tenant isolation: every lookup is keyed by tenant_id. A tenant can only use
 * a Fastn connection that is stored in its own fastn_connections rows, and its
 * downstream settings (spreadsheet id, Slack channel) live in
 * tenant_fastn_config. Nothing is read from a global connection list.
 */

export type DownstreamOutcome = 'OK' | 'FAILED' | 'SKIPPED';

export interface DownstreamResult {
  operation: 'drive_archive' | 'hubspot_note' | 'sheets_ledger' | 'slack_alert';
  outcome: DownstreamOutcome;
  reason?: string;
  detail?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Tenant connection & config lookups
// ---------------------------------------------------------------------------

export function getTenantConnectionName(tenantId: string, provider: Provider): string | null {
  const row = getDb()
    .prepare(
      `SELECT fastn_connection_id FROM fastn_connections
       WHERE tenant_id = ? AND provider = ? AND status = 'connected' AND fastn_connection_id IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(tenantId, provider) as { fastn_connection_id: string } | undefined;
  return row ? row.fastn_connection_id : null;
}

export function getTenantSetting(tenantId: string, key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM tenant_fastn_config WHERE tenant_id = ? AND key = ?')
    .get(tenantId, key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setTenantSetting(tenantId: string, key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO tenant_fastn_config (tenant_id, key, value, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
    )
    .run(tenantId, key, value);
}

/**
 * Link a tenant to an existing, ACTIVE workspace connection. The link is only
 * stored after the connection is confirmed live in Fastn.
 */
export async function linkTenantConnection(
  tenantId: string,
  provider: Provider,
  connectionName: string
): Promise<{ provider: Provider; connection_name: string; status: string }> {
  const all = await listWorkspaceConnections();
  const match = all.find(
    (c: any) => c.connectorId === CONNECTOR_IDS[provider] && c.name === connectionName && c.status === 'ACTIVE'
  );
  if (!match) {
    throw new Error(`No ACTIVE Fastn connection named "${connectionName}" for ${provider}.`);
  }

  const db = getDb();
  const existing = db
    .prepare('SELECT id FROM fastn_connections WHERE tenant_id = ? AND provider = ?')
    .get(tenantId, provider) as { id: string } | undefined;
  if (existing) {
    db.prepare(
      `UPDATE fastn_connections SET fastn_connection_id = ?, status = 'connected', last_synced_at = datetime('now') WHERE id = ?`
    ).run(connectionName, existing.id);
  } else {
    db.prepare(
      `INSERT INTO fastn_connections (id, tenant_id, provider, fastn_connection_id, status, last_synced_at)
       VALUES (?, ?, ?, ?, 'connected', datetime('now'))`
    ).run(uuidv4(), tenantId, provider, connectionName);
  }
  return { provider, connection_name: connectionName, status: 'connected' };
}

/** Read-only live check for one provider on this tenant's connection. */
export async function syncProvider(tenantId: string, provider: Provider): Promise<any> {
  const connectionName = getTenantConnectionName(tenantId, provider);
  if (!connectionName) {
    throw new Error(`No connected ${provider} account for this tenant. Link it first.`);
  }
  const response = await healthCheck(provider, connectionName);
  getDb()
    .prepare(`UPDATE fastn_connections SET last_synced_at = datetime('now') WHERE tenant_id = ? AND provider = ?`)
    .run(tenantId, provider);
  return response;
}

// ---------------------------------------------------------------------------
// Audit helper
// ---------------------------------------------------------------------------

function audit(tenantId: string, invoiceId: string, action: string, actor: string, details: any): void {
  getDb()
    .prepare(
      `INSERT INTO audit_trail (id, invoice_id, tenant_id, action, actor, details)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(uuidv4(), invoiceId, tenantId, action, actor, JSON.stringify(details));
}

// ---------------------------------------------------------------------------
// Downstream actions after verification
// ---------------------------------------------------------------------------

/**
 * Runs the Fastn downstream operations for one analysed invoice.
 * Every operation writes an audit entry: FASTN_<OP>_OK, _FAILED or _SKIPPED.
 * A failure never fails the analysis; it is recorded and returned.
 */
export async function runInvoiceDownstream(tenantId: string, invoiceId: string): Promise<DownstreamResult[]> {
  const db = getDb();
  const invoice = db
    .prepare('SELECT * FROM invoices WHERE id = ? AND tenant_id = ?')
    .get(invoiceId, tenantId) as any;
  if (!invoice) throw new Error('Invoice not found for downstream actions');

  const checks = db
    .prepare('SELECT check_name, passed, severity FROM deterministic_checks WHERE invoice_id = ?')
    .all(invoiceId) as Array<{ check_name: string; passed: number; severity: string }>;
  const criticalFailures = checks.filter((c) => !c.passed && c.severity === 'CRITICAL').map((c) => c.check_name);

  const results: DownstreamResult[] = [];

  const plan: Array<{
    operation: DownstreamResult['operation'];
    provider: Provider;
    applies: boolean;
    skipReason?: string;
    run: (connectionName: string) => Promise<Record<string, any>>;
  }> = [
    {
      operation: 'drive_archive',
      provider: 'gdrive',
      applies: true,
      run: async (conn) => {
        // Binary originals are archived as their extracted text (see note in fastnActions).
        const baseName = invoice.original_filename || `invoice-${invoiceId}`;
        const name = `${invoice.invoice_number || invoiceId} - ${baseName}.ocr.txt`;
        const archived = await archiveInvoiceToDrive(
          conn,
          name,
          'text/plain',
          invoice.raw_ocr_text || ''
        );
        return { ...archived, content_archived: 'extracted_text' };
      },
    },
    {
      operation: 'hubspot_note',
      provider: 'hubspot',
      applies: true,
      run: async (conn) => {
        const body =
          `Invoice Desk verification: ${invoice.invoice_number || invoiceId} from ${invoice.vendor_name || 'unknown vendor'}. ` +
          `Total ${invoice.total_amount} ${invoice.currency}. Status: ${invoice.status}. ` +
          `Tax ID: ${invoice.vendor_tax_id || 'not provided'}.`;
        return createHubspotVendorNote(conn, body);
      },
    },
    {
      operation: 'sheets_ledger',
      provider: 'gsheets',
      applies: invoice.status === 'APPROVED',
      skipReason: 'invoice not APPROVED — ledger only receives verified rows',
      run: async (conn) => {
        const spreadsheetId = getTenantSetting(tenantId, 'sheets_spreadsheet_id');
        if (!spreadsheetId) throw new SkipError('tenant has no sheets_spreadsheet_id configured');
        const row = [
          new Date().toISOString(),
          invoice.invoice_number || '',
          invoice.vendor_name || '',
          invoice.invoice_date || '',
          invoice.total_amount,
          invoice.currency,
          invoice.status,
          invoiceId,
        ];
        return { ...(await appendLedgerRow(conn, spreadsheetId, row)), spreadsheet_id: spreadsheetId };
      },
    },
    {
      operation: 'slack_alert',
      provider: 'slack',
      applies: invoice.status === 'NEEDS_REVIEW' && criticalFailures.length > 0,
      skipReason: 'no CRITICAL fraud flag on this invoice',
      run: async (conn) => {
        const channel = getTenantSetting(tenantId, 'slack_channel');
        if (!channel) throw new SkipError('tenant has no slack_channel configured');
        const text =
          `[Invoice Desk] CRITICAL review: ${invoice.invoice_number || invoiceId} from ${invoice.vendor_name || 'unknown vendor'} ` +
          `(${invoice.total_amount} ${invoice.currency}). Failed checks: ${criticalFailures.join(', ')}. Routed to review queue.`;
        return postSlackAlert(conn, channel, text);
      },
    },
  ];

  for (const step of plan) {
    const tag = step.operation.toUpperCase();
    if (!step.applies) {
      const r: DownstreamResult = { operation: step.operation, outcome: 'SKIPPED', reason: step.skipReason };
      results.push(r);
      audit(tenantId, invoiceId, `FASTN_${tag}_SKIPPED`, 'fastn', { reason: step.skipReason });
      continue;
    }
    if (!isFastnConfigured()) {
      const reason = 'FASTN_API_KEY / FASTN_MCP_URL not configured';
      results.push({ operation: step.operation, outcome: 'SKIPPED', reason });
      audit(tenantId, invoiceId, `FASTN_${tag}_SKIPPED`, 'fastn', { reason });
      continue;
    }
    const connectionName = getTenantConnectionName(tenantId, step.provider);
    if (!connectionName) {
      const reason = `tenant has no connected ${step.provider} account`;
      results.push({ operation: step.operation, outcome: 'SKIPPED', reason });
      audit(tenantId, invoiceId, `FASTN_${tag}_SKIPPED`, 'fastn', { reason });
      continue;
    }

    try {
      const detail = await step.run(connectionName);
      results.push({ operation: step.operation, outcome: 'OK', detail });
      audit(tenantId, invoiceId, `FASTN_${tag}_OK`, 'fastn', detail);
    } catch (err: any) {
      if (err instanceof SkipError) {
        results.push({ operation: step.operation, outcome: 'SKIPPED', reason: err.message });
        audit(tenantId, invoiceId, `FASTN_${tag}_SKIPPED`, 'fastn', { reason: err.message });
      } else {
        const message = err instanceof FastnNotConfiguredError ? err.message : String(err?.message || err).slice(0, 400);
        results.push({ operation: step.operation, outcome: 'FAILED', reason: message });
        audit(tenantId, invoiceId, `FASTN_${tag}_FAILED`, 'fastn', { error: message });
      }
    }
  }

  return results;
}

class SkipError extends Error {}

// ---------------------------------------------------------------------------
// Gmail → invoice intake
// ---------------------------------------------------------------------------

export interface IngestedInvoice {
  invoice_id: string;
  filename: string;
  gmail_message_id: string;
}

/**
 * Pulls invoice attachments from the tenant's Gmail, stores them, runs OCR and
 * creates PENDING invoices exactly like a manual upload. Attachments already
 * ingested for this tenant are skipped (dedupe on message id + filename).
 */
export async function ingestGmailInvoices(tenantId: string, maxMessages = 10): Promise<IngestedInvoice[]> {
  if (!isFastnConfigured()) {
    throw new FastnNotConfiguredError('FASTN_API_KEY / FASTN_MCP_URL must be set for Gmail intake.');
  }
  const connectionName = getTenantConnectionName(tenantId, 'gmail');
  if (!connectionName) {
    throw new Error('No connected Gmail account for this tenant. Link it first.');
  }

  const db = getDb();
  const attachments = await fetchGmailInvoiceAttachments(connectionName, undefined, maxMessages);
  const ingested: IngestedInvoice[] = [];

  for (const att of attachments) {
    const already = db
      .prepare(
        `SELECT id FROM audit_trail WHERE tenant_id = ? AND action = 'GMAIL_INGESTED'
         AND details LIKE ? AND details LIKE ?`
      )
      .get(tenantId, `%"gmail_message_id":"${att.messageId}"%`, `%"filename":"${att.filename.replace(/"/g, '')}"%`);
    if (already) continue;

    if (!fs.existsSync(config.UPLOAD_DIR)) fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
    const ext = path.extname(att.filename) || '.bin';
    const filePath = path.join(config.UPLOAD_DIR, `${Date.now()}-${uuidv4()}${ext}`);
    fs.writeFileSync(filePath, att.content);

    let ocrText = '';
    try {
      ocrText = ext.toLowerCase() === '.txt'
        ? fs.readFileSync(filePath, 'utf8')
        : (await extractText(filePath)).text;
    } catch (e: any) {
      ocrText = `[OCR extraction failed: ${e.message}]`;
    }

    const invoiceId = uuidv4();
    const match = ocrText.match(/Invoice\s*(?:Number|#)?[:\s]*([^\r\n]+)/i);
    const invoiceNumber = match ? match[1].trim() : `GMAIL-${Date.now().toString().slice(-6)}`;

    db.prepare(
      `INSERT INTO invoices (id, tenant_id, invoice_number, vendor_name, vendor_email, status, source, raw_ocr_text, original_filename, file_path)
       VALUES (?, ?, ?, 'Pending Analysis', ?, 'PENDING', 'gmail', ?, ?, ?)`
    ).run(invoiceId, tenantId, invoiceNumber, att.from || null, ocrText, att.filename, filePath);

    audit(tenantId, invoiceId, 'GMAIL_INGESTED', 'fastn', {
      gmail_message_id: att.messageId,
      filename: att.filename,
      subject: att.subject,
      from: att.from,
      bytes: att.content.length,
    });
    audit(tenantId, invoiceId, 'UPLOADED', 'system', {
      original_filename: att.filename,
      file_size: att.content.length,
      mime_type: att.mimeType,
      source: 'gmail',
    });

    ingested.push({ invoice_id: invoiceId, filename: att.filename, gmail_message_id: att.messageId });
  }
  return ingested;
}
