import http from 'http';
import app from './server';
import { getDb } from './database';

const PORT = 3999; // Isolated test port

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, message?: string) {
  if (condition) {
    results.push({ name, passed: true });
    console.log(`  ✅ PASS: ${name}`);
  } else {
    results.push({ name, passed: false, error: message || 'Assertion failed' });
    console.error(`  ❌ FAIL: ${name} — ${message || 'Assertion failed'}`);
  }
}

async function request(
  method: string,
  path: string,
  headers: Record<string, string> = {},
  body?: any
): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };
    if (data) {
      reqHeaders['Content-Length'] = Buffer.byteLength(data).toString();
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: PORT,
        path,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let resData = '';
        res.on('data', (chunk) => {
          resData += chunk;
        });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(resData);
          } catch {
            parsed = resData;
          }
          resolve({ status: res.statusCode || 500, body: parsed });
        });
      }
    );

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING INVOICE DESK VERIFICATION & TEST SUITE');
  console.log('======================================================\n');

  const server = app.listen(PORT, '127.0.0.1');

  try {
    // ─── Phase 1: Tenants & Isolation ─────────────────────────────────
    console.log('--- Phase 1: Tenants & Tenant Isolation ---');
    const tenantsRes = await request('GET', '/api/tenants');
    assert(tenantsRes.status === 200, 'GET /api/tenants returns 200');
    const tenantsList = tenantsRes.body.tenants || tenantsRes.body;
    assert(Array.isArray(tenantsList) && tenantsList.length >= 2, 'At least 2 seeded tenants exist');

    const tenant1 = tenantsList.find((t: any) => t.slug === 'acme-corp');
    const tenant2 = tenantsList.find((t: any) => t.slug === 'eurotech-gmbh');
    assert(!!tenant1 && !!tenant2, 'Tenants Acme Corp and EuroTech GmbH exist');

    // Missing tenant ID header
    const noTenantRes = await request('GET', '/api/invoices');
    assert(noTenantRes.status === 401, 'Request without X-Tenant-ID is rejected with 401');

    // Invalid tenant ID header
    const invalidTenantRes = await request('GET', '/api/invoices', {
      'X-Tenant-ID': '00000000-0000-0000-0000-000000000000',
    });
    assert(invalidTenantRes.status === 403, 'Request with non-existent tenant ID is rejected with 403');

    // Tenant 1 invoices
    const t1InvoicesRes = await request('GET', '/api/invoices', { 'X-Tenant-ID': tenant1.id });
    assert(t1InvoicesRes.status === 200, 'GET /api/invoices with Tenant 1 returns 200');
    const t1Invoices = t1InvoicesRes.body.invoices || [];
    assert(t1Invoices.length === 3, 'Tenant 1 has exactly 3 seeded invoices');

    // Tenant 2 invoices
    const t2InvoicesRes = await request('GET', '/api/invoices', { 'X-Tenant-ID': tenant2.id });
    assert(t2InvoicesRes.status === 200, 'GET /api/invoices with Tenant 2 returns 200');
    const t2Invoices = t2InvoicesRes.body.invoices || [];
    assert(t2Invoices.length === 3, 'Tenant 2 has exactly 3 seeded invoices');

    // Cross-tenant isolation check: Tenant 1 cannot access Tenant 2's invoice
    const t2InvoiceId = t2Invoices[0].id;
    const crossTenantRes = await request('GET', `/api/invoices/${t2InvoiceId}`, {
      'X-Tenant-ID': tenant1.id,
    });
    assert(crossTenantRes.status === 404, 'Server-side tenant isolation: Tenant 1 cannot access Tenant 2 invoice (404)');

    // Cross-tenant audit check: Tenant 1 cannot access Tenant 2's audit trail
    const crossAuditRes = await request('GET', `/api/invoices/${t2InvoiceId}/audit`, {
      'X-Tenant-ID': tenant1.id,
    });
    assert(crossAuditRes.status === 404, 'Server-side tenant isolation: Tenant 1 cannot access Tenant 2 audit trail (404)');

    // ─── Phase 2: Verification Logic (Clean Invoice) ───────────────────
    console.log('\n--- Phase 2: Verification Logic (Clean Invoice) ---');
    const cleanInvoice = t1Invoices.find((i: any) => i.original_filename === 'clean_invoice.pdf');
    assert(!!cleanInvoice, 'Clean invoice found for Tenant 1');

    const cleanAnalyzeRes = await request('POST', `/api/invoices/${cleanInvoice.id}/analyze`, {
      'X-Tenant-ID': tenant1.id,
    });
    assert(cleanAnalyzeRes.status === 200, 'POST /api/invoices/:id/analyze succeeds with 200');
    assert(cleanAnalyzeRes.body.analysis?.final_status === 'APPROVED', 'Clean invoice results in APPROVED final_status');
    const passedChecks = cleanAnalyzeRes.body.analysis?.deterministic_checks?.filter((c: any) => c.passed).length;
    assert(passedChecks === 8, `All 8 deterministic checks passed for clean invoice (got ${passedChecks}/8)`);

    // Verify GET /:id returns embedded line items and checks
    const cleanDetailRes = await request('GET', `/api/invoices/${cleanInvoice.id}`, {
      'X-Tenant-ID': tenant1.id,
    });
    assert(cleanDetailRes.status === 200, 'GET /api/invoices/:id for clean invoice returns 200');
    assert(
      Array.isArray(cleanDetailRes.body.invoice?.line_items) &&
        cleanDetailRes.body.invoice.line_items.length >= 2,
      'Invoice detail response embeds line items'
    );
    assert(
      Array.isArray(cleanDetailRes.body.invoice?.deterministic_checks) &&
        cleanDetailRes.body.invoice.deterministic_checks.length === 8,
      'Invoice detail response embeds all 8 deterministic checks'
    );

    // ─── Phase 3: Verification Logic (Discrepancy Invoice) ─────────────
    console.log('\n--- Phase 3: Verification Logic (Discrepancy Invoice) ---');
    const discInvoice = t1Invoices.find((i: any) => i.original_filename === 'discrepancy_invoice.pdf');
    assert(!!discInvoice, 'Discrepancy invoice found for Tenant 1');

    const discAnalyzeRes = await request('POST', `/api/invoices/${discInvoice.id}/analyze`, {
      'X-Tenant-ID': tenant1.id,
    });
    assert(discAnalyzeRes.status === 200, 'POST /api/invoices/:id/analyze for discrepancy succeeds with 200');
    assert(discAnalyzeRes.body.analysis?.final_status === 'NEEDS_REVIEW', 'Discrepancy invoice results in NEEDS_REVIEW');
    const mathCheck = discAnalyzeRes.body.analysis?.deterministic_checks?.find(
      (c: any) => c.check_name === 'math_sum_check'
    );
    assert(mathCheck && !mathCheck.passed, 'math_sum_check correctly failed for discrepancy invoice');

    // ─── Phase 4: Verification Logic (Suspicious Invoice) ──────────────
    console.log('\n--- Phase 4: Verification Logic (Suspicious Invoice) ---');
    const suspInvoice = t1Invoices.find((i: any) => i.original_filename === 'suspicious_invoice.pdf');
    assert(!!suspInvoice, 'Suspicious invoice found for Tenant 1');

    const suspAnalyzeRes = await request('POST', `/api/invoices/${suspInvoice.id}/analyze`, {
      'X-Tenant-ID': tenant1.id,
    });
    assert(suspAnalyzeRes.status === 200, 'POST /api/invoices/:id/analyze for suspicious succeeds with 200');
    assert(suspAnalyzeRes.body.analysis?.final_status === 'NEEDS_REVIEW', 'Suspicious invoice results in NEEDS_REVIEW');
    const kwCheck = suspAnalyzeRes.body.analysis?.deterministic_checks?.find(
      (c: any) => c.check_name === 'suspicious_keywords'
    );
    assert(kwCheck && !kwCheck.passed && kwCheck.severity === 'CRITICAL', 'suspicious_keywords failed with CRITICAL severity');

    // ─── Phase 5: Workflow Decisions & Audit Trail ─────────────────────
    console.log('\n--- Phase 5: Workflow Decisions & Audit Trail ---');
    // Manual approve on discrepancy invoice
    const approveRes = await request('POST', `/api/invoices/${discInvoice.id}/approve`, {
      'X-Tenant-ID': tenant1.id,
    });
    assert(approveRes.status === 200, 'POST /api/invoices/:id/approve succeeds');
    assert(approveRes.body.invoice?.status === 'APPROVED', 'Invoice status updated to APPROVED');

    // Audit trail verification
    const auditRes = await request('GET', `/api/invoices/${discInvoice.id}/audit`, {
      'X-Tenant-ID': tenant1.id,
    });
    assert(auditRes.status === 200, 'GET /api/invoices/:id/audit returns 200');
    const actions = (auditRes.body.audit_trail || []).map((a: any) => a.action);
    assert(actions.includes('APPROVED'), 'Audit trail records APPROVED action');
    assert(actions.includes('ANALYSIS_STARTED'), 'Audit trail records ANALYSIS_STARTED action');
    assert(actions.includes('ANALYSIS_COMPLETED'), 'Audit trail records ANALYSIS_COMPLETED action');

    // ─── Phase 6: Fastn Server-Side API Security & Connectors ───────────
    console.log('\n--- Phase 6: Fastn Integration & Security Checks ---');
    // Test Fastn session token request without configured FASTN_API_KEY
    const sessionRes = await request('GET', '/api/fastn/session-token', {
      'X-Tenant-ID': tenant1.id,
    });
    assert(
      sessionRes.status === 500 &&
        typeof sessionRes.body?.error === 'string' &&
        sessionRes.body.error.includes('FASTN_API_KEY'),
      'Fastn session token fails safely when FASTN_API_KEY is not set (no fake tokens)'
    );

    // Fastn connections query: all 5 connectors mapped
    const connRes = await request('GET', '/api/fastn/connections', {
      'X-Tenant-ID': tenant1.id,
    });
    assert(connRes.status === 200, 'GET /api/fastn/connections returns 200');
    const connectors = connRes.body.connectors || connRes.body.connections;
    assert(Array.isArray(connectors) && connectors.length === 5, 'All 5 target Fastn connectors are returned');
    const providerNames = connectors.map((c: any) => c.provider);
    assert(
      providerNames.includes('gmail') &&
        providerNames.includes('gdrive') &&
        providerNames.includes('gsheets') &&
        providerNames.includes('slack') &&
        providerNames.includes('hubspot'),
      'Connectors cover Gmail, Google Drive, Google Sheets, Slack, and HubSpot'
    );

    // Test honest execution: trying to sync an unauthenticated connector fails honestly
    const fakeSyncRes = await request('POST', '/api/fastn/sync/gmail', {
      'X-Tenant-ID': tenant1.id,
    });
    assert(
      fakeSyncRes.status === 400 &&
        (fakeSyncRes.body.requires_config || fakeSyncRes.body.error?.includes('FASTN_API_KEY') || fakeSyncRes.body.error?.includes('not authenticated')),
      'Fastn sync fails honestly without fake execution when unauthenticated'
    );

    // ─── Phase 7: Provider Configuration Status ───────────────────────
    console.log('\n--- Phase 7: Provider Configuration Status ---');
    const configRes = await request('GET', '/api/config/providers');
    assert(configRes.status === 200, 'GET /api/config/providers returns 200');
    assert(
      configRes.body.providers?.model_a?.env_key === 'GEMINI_API_KEY',
      'Model A is mapped to Google Gemini (GEMINI_API_KEY)'
    );
    assert(
      configRes.body.providers?.model_b?.env_key === 'OPENROUTER_API_KEY',
      'Model B is mapped to OpenRouter (OPENROUTER_API_KEY)'
    );
    assert(
      configRes.body.providers?.fastn?.env_key === 'FASTN_API_KEY',
      'Fastn provider is mapped to FASTN_API_KEY'
    );

    console.log('\n======================================================');
    const totalPassed = results.filter((r) => r.passed).length;
    const totalFailed = results.filter((r) => !r.passed).length;
    console.log(`Test Summary: ${totalPassed} passed, ${totalFailed} failed out of ${results.length}`);
    console.log('======================================================\n');

    server.close();
    process.exit(totalFailed > 0 ? 1 : 0);
  } catch (err: any) {
    console.error('Fatal test error:', err);
    server.close();
    process.exit(1);
  }
}

runTests();
