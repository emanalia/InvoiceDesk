/**
 * Fastn integration tests.
 *
 * These run the downstream pipeline against a MOCK Fastn transport. The mock
 * returns the same response shapes the live connections returned during
 * verification, and records every call so the tests can assert the exact
 * verified input contracts. A mock proves wiring and contracts only; live
 * proof comes from `npm run test:fastn:live` against the real workspace.
 *
 * Run: DATABASE_PATH=/tmp/fastn-itest.db node dist/fastnIntegration.test.js
 */
import { initDatabase, getDb } from './database';
import { v4 as uuidv4 } from 'uuid';
import { setFastnTransportForTests, isFastnConfigured } from './services/fastn';
import { runInvoiceDownstream, setTenantSetting, getTenantSetting, linkTenantConnection, ingestGmailInvoices } from './services/connectorHub';
import { CONNECTOR_IDS, ACTION_IDS } from './services/fastnActions';

type Call = { tool: string; args: any };
const calls: Call[] = [];
let failNextAction: string | null = null;
let failures = 0;
let passes = 0;

function check(cond: boolean, name: string, detail?: string) {
  if (cond) {
    passes++;
    console.log(`  PASS: ${name}`);
  } else {
    failures++;
    console.error(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`);
  }
}

/** Mock Fastn workspace responding with verified response shapes. */
async function mockTransport(tool: string, args: any): Promise<any> {
  calls.push({ tool, args });
  if (tool === 'fastnPlatform__listConnections') {
    return {
      data: [
        { connectorId: CONNECTOR_IDS.gdrive, name: 'default', status: 'ACTIVE' },
        { connectorId: CONNECTOR_IDS.hubspot, name: 'default', status: 'ACTIVE' },
        { connectorId: CONNECTOR_IDS.gsheets, name: 'default', status: 'ACTIVE' },
        { connectorId: CONNECTOR_IDS.slack, name: 'default', status: 'ACTIVE' },
        { connectorId: CONNECTOR_IDS.gmail, name: 'default', status: 'ACTIVE' },
      ],
    };
  }
  if (tool !== 'fastnPlatform__executeAction') throw new Error('unexpected tool ' + tool);

  const id = args.id as string;
  if (failNextAction === id) {
    failNextAction = null;
    return { data: { success: false, status: 403, error: { message: 'insufficient permissions (mock)' } } };
  }
  const ok = (response: any) => ({ data: { success: true, status: 200, response } });
  switch (id) {
    case ACTION_IDS.driveCreateFile:
      return ok({ id: 'drive-file-1', name: args.input.name, mimeType: args.input.mimeType, size: '0' });
    case ACTION_IDS.driveUpdateFileContent:
      return ok({ id: args.input.fileId, size: String(Buffer.byteLength(args.input.content)), md5Checksum: 'abc123' });
    case ACTION_IDS.hubspotCreateNote:
      return ok({ id: '410857891546' });
    case ACTION_IDS.sheetsAppendValues:
      return ok({ updates: { updatedRange: 'Sheet1!A2:H2', updatedRows: 1, updatedCells: 8 } });
    case ACTION_IDS.slackPostMessage:
      return ok({ ok: true, channel: args.input.channel, ts: '1792852269.472869' });
    case ACTION_IDS.gmailList:
      return ok({ messages: [{ id: 'msg-1' }] });
    case ACTION_IDS.gmailGetMessage:
      return ok({
        id: 'msg-1',
        payload: {
          headers: [
            { name: 'Subject', value: 'Invoice INV-T-9' },
            { name: 'From', value: 'vendor@example.com' },
          ],
          parts: [
            { mimeType: 'text/plain', filename: '', body: { size: 5 } },
            {
              mimeType: 'text/plain',
              filename: 'INV-T-9.txt',
              body: { attachmentId: 'att-1', size: 10 },
            },
          ],
        },
      });
    case ACTION_IDS.gmailGetAttachment:
      return ok({
        data: Buffer.from('INVOICE\nInvoice Number: INV-T-9\nTotal: 10.00 USD\n').toString('base64url'),
      });
    default:
      throw new Error('mock has no response for action ' + id);
  }
}

function insertTenant(name: string): string {
  const id = uuidv4();
  getDb()
    .prepare('INSERT INTO tenants (id, name, slug) VALUES (?, ?, ?)')
    .run(id, name, name.toLowerCase().replace(/\W+/g, '-') + '-' + id.slice(0, 6));
  return id;
}

function insertInvoice(tenantId: string, status: string, extra: Partial<Record<string, any>> = {}): string {
  const id = uuidv4();
  getDb()
    .prepare(
      `INSERT INTO invoices (id, tenant_id, invoice_number, vendor_name, vendor_tax_id, invoice_date, currency,
         total_amount, status, source, raw_ocr_text, original_filename)
       VALUES (?, ?, ?, ?, ?, '2026-10-24', 'USD', ?, ?, 'upload', ?, ?)`
    )
    .run(
      id,
      tenantId,
      extra.invoice_number || 'INV-T-' + id.slice(0, 4),
      'Maple & Pine Test Vendor',
      'TAX-TEST-1',
      125,
      status,
      'INVOICE\nTotal: 125.00 USD\n',
      'synthetic.txt'
    );
  return id;
}

function insertCheck(invoiceId: string, name: string, passed: boolean, severity: string) {
  getDb()
    .prepare(
      `INSERT INTO deterministic_checks (id, invoice_id, check_name, passed, severity, message)
       VALUES (?, ?, ?, ?, ?, 'test')`
    )
    .run(uuidv4(), invoiceId, name, passed ? 1 : 0, severity);
}

function auditActions(invoiceId: string): string[] {
  return (getDb()
    .prepare('SELECT action FROM audit_trail WHERE invoice_id = ? ORDER BY created_at, rowid')
    .all(invoiceId) as Array<{ action: string }>).map((r) => r.action);
}

async function main() {
  initDatabase();
  setFastnTransportForTests(mockTransport);
  check(isFastnConfigured(), 'FASTN_API_KEY and FASTN_MCP_URL are set in the environment (values not printed)');


  console.log('\n--- Tenant A: all five connections linked, approved invoice ---');
  const tenantA = insertTenant('Maple Test A');
  const tenantB = insertTenant('Other Test B');
  for (const p of ['gdrive', 'hubspot', 'gsheets', 'slack', 'gmail'] as const) {
    await linkTenantConnection(tenantA, p, 'default');
  }
  setTenantSetting(tenantA, 'sheets_spreadsheet_id', '1PgfLK0gJZNOhe0xtV6ZTY_V_OLab_wYF7PWUZc9CqTk');
  setTenantSetting(tenantA, 'slack_channel', 'C0C8FSWCLQZ');

  const approved = insertInvoice(tenantA, 'APPROVED', { invoice_number: 'INV-TEST-001' });
  calls.length = 0;
  const r1 = await runInvoiceDownstream(tenantA, approved);
  const byOp = Object.fromEntries(r1.map((r) => [r.operation, r]));
  check(byOp.drive_archive?.outcome === 'OK', 'drive_archive OK');
  check(byOp.hubspot_note?.outcome === 'OK', 'hubspot_note OK');
  check(byOp.sheets_ledger?.outcome === 'OK', 'sheets_ledger OK for APPROVED invoice');
  check(byOp.slack_alert?.outcome === 'SKIPPED', 'slack_alert SKIPPED when no critical fraud flag');
  const driveUpdate = calls.find((c) => c.args?.id === ACTION_IDS.driveUpdateFileContent);
  check(!!driveUpdate && driveUpdate.args.input.content.includes('125.00'), 'Drive update carries real invoice text');
  const sheetsCall = calls.find((c) => c.args?.id === ACTION_IDS.sheetsAppendValues);
  check(
    !!sheetsCall && sheetsCall.args.input.spreadsheetId === '1PgfLK0gJZNOhe0xtV6ZTY_V_OLab_wYF7PWUZc9CqTk' &&
      sheetsCall.args.input.valueInputOption === 'USER_ENTERED',
    'Sheets append uses verified input contract with tenant spreadsheet id'
  );
  check(
    calls.every((c) => c.args?.connectionName === 'default'),
    'every call uses the tenant connection name (not a hardcoded value)'
  );
  const actions = auditActions(approved);
  check(
    ['FASTN_DRIVE_ARCHIVE_OK', 'FASTN_HUBSPOT_NOTE_OK', 'FASTN_SHEETS_LEDGER_OK', 'FASTN_SLACK_ALERT_SKIPPED'].every((a) =>
      actions.includes(a)
    ),
    'audit trail records each Fastn outcome'
  );

  console.log('\n--- NEEDS_REVIEW with CRITICAL fraud flag → Slack alert ---');
  const flagged = insertInvoice(tenantA, 'NEEDS_REVIEW');
  insertCheck(flagged, 'duplicate_invoice', false, 'CRITICAL');
  calls.length = 0;
  const r2 = await runInvoiceDownstream(tenantA, flagged);
  const slack = r2.find((r) => r.operation === 'slack_alert');
  check(slack?.outcome === 'OK', 'slack_alert OK on CRITICAL flag');
  check(
    calls.some((c) => c.args?.id === ACTION_IDS.slackPostMessage && c.args.input.channel === 'C0C8FSWCLQZ'),
    'Slack post sent to tenant channel'
  );
  check(!r2.find((r) => r.operation === 'sheets_ledger') || r2.find((r) => r.operation === 'sheets_ledger')?.outcome === 'SKIPPED',
    'NEEDS_REVIEW invoice never reaches the ledger');

  console.log('\n--- Failure is recorded, never reported as success ---');
  failNextAction = ACTION_IDS.hubspotCreateNote;
  const r3 = await runInvoiceDownstream(tenantA, approved);
  const hub = r3.find((r) => r.operation === 'hubspot_note');
  check(hub?.outcome === 'FAILED', 'Fastn action failure is reported as FAILED');
  check(auditActions(approved).includes('FASTN_HUBSPOT_NOTE_FAILED'), 'failure written to audit trail');

  console.log('\n--- Tenant isolation: tenant B has no connections or settings ---');
  const other = insertInvoice(tenantB, 'APPROVED');
  calls.length = 0;
  const r4 = await runInvoiceDownstream(tenantB, other);
  check(r4.every((r) => r.outcome === 'SKIPPED'), 'tenant B with no connections: every action SKIPPED');
  check(calls.filter((c) => c.tool === 'fastnPlatform__executeAction').length === 0,
    'tenant B never reaches Fastn with tenant A connection');
  check(getTenantSetting(tenantB, 'sheets_spreadsheet_id') === null, 'tenant B has no tenant A spreadsheet id');

  console.log('\n--- Gmail intake creates PENDING invoices and dedupes ---');
  calls.length = 0;
  const first = await ingestGmailInvoices(tenantA, 5);
  check(first.length === 1 && first[0].filename === 'INV-T-9.txt', 'Gmail attachment ingested as one invoice');
  const row = getDb().prepare('SELECT status, source, raw_ocr_text FROM invoices WHERE id = ?').get(first[0].invoice_id) as any;
  check(row?.status === 'PENDING' && row?.source === 'gmail', 'ingested invoice is PENDING with source=gmail');
  check(row?.raw_ocr_text?.includes('INV-T-9'), 'ingested invoice text came from the real attachment bytes');
  const second = await ingestGmailInvoices(tenantA, 5);
  check(second.length === 0, 'second ingest of the same attachment is deduped');

  console.log(`\nFastn integration tests: ${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
