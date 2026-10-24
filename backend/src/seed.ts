import { v4 as uuidv4 } from 'uuid';
import { initDatabase, getDb, closeDatabase } from './database';

/**
 * Seed script: creates 2 demo tenants with 3 sample invoices each.
 *
 * Tenant 1: Acme Corp (USD, en-US, 10% tax)
 * Tenant 2: EuroTech GmbH (EUR, de-DE, 19% tax)
 *
 * Each tenant gets:
 * 1. Clean invoice (all checks pass)
 * 2. Invoice with math discrepancy (line items don't add up)
 * 3. Suspicious invoice (suspicious keywords, altered bank details)
 *
 * Does NOT run LLM analysis — that's triggered on-demand.
 */

function seed(): void {
  console.log('[Seed] Starting database seed...');
  initDatabase();
  const db = getDb();

  // Check if data already exists
  const existing = db.prepare('SELECT COUNT(*) as count FROM tenants').get() as { count: number };
  if (existing.count > 0) {
    console.log('[Seed] Data already exists. Clearing existing data...');
    db.exec(`
      DELETE FROM audit_trail;
      DELETE FROM deterministic_checks;
      DELETE FROM llm_analyses;
      DELETE FROM invoice_line_items;
      DELETE FROM invoices;
      DELETE FROM fastn_connections;
      DELETE FROM tenants;
    `);
  }

  // ─── Tenant 1: Acme Corp ──────────────────────────────────────
  const tenant1Id = uuidv4();
  db.prepare(
    `INSERT INTO tenants (id, name, slug, default_currency, locale, tax_rate)
     VALUES (?, 'Acme Corp', 'acme-corp', 'USD', 'en-US', 10.0)`
  ).run(tenant1Id);
  console.log(`[Seed] Created tenant: Acme Corp (${tenant1Id})`);

  // ─── Tenant 2: EuroTech GmbH ──────────────────────────────────
  const tenant2Id = uuidv4();
  db.prepare(
    `INSERT INTO tenants (id, name, slug, default_currency, locale, tax_rate)
     VALUES (?, 'EuroTech GmbH', 'eurotech-gmbh', 'EUR', 'de-DE', 19.0)`
  ).run(tenant2Id);
  console.log(`[Seed] Created tenant: EuroTech GmbH (${tenant2Id})`);

  // ─── Invoices for Acme Corp ────────────────────────────────────
  createCleanInvoice(db, tenant1Id, 'USD', 0.10);
  createDiscrepancyInvoice(db, tenant1Id, 'USD', 0.10);
  createSuspiciousInvoice(db, tenant1Id, 'USD', 0.10);

  // ─── Invoices for EuroTech GmbH ────────────────────────────────
  createCleanInvoice(db, tenant2Id, 'EUR', 0.19);
  createDiscrepancyInvoice(db, tenant2Id, 'EUR', 0.19);
  createSuspiciousInvoice(db, tenant2Id, 'EUR', 0.19);

  closeDatabase();
  console.log('[Seed] ✅ Database seeded successfully!');
}

function createCleanInvoice(
  db: ReturnType<typeof getDb>,
  tenantId: string,
  currency: string,
  taxRate: number
): void {
  const invoiceId = uuidv4();
  const subtotal = 2500.0;
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;

  const ocrText = `
INVOICE
Invoice Number: INV-2024-001
Date: 2024-06-15
Due Date: 2024-07-15

From: TechSupply Inc.
Tax ID: US-98-7654321
Email: billing@techsupply.com

Bill To: ${currency === 'USD' ? 'Acme Corp' : 'EuroTech GmbH'}

Description                    Qty    Unit Price    Amount
───────────────────────────────────────────────────────────
Cloud Hosting (Monthly)        1      1,500.00      1,500.00
API Integration Service        5        200.00      1,000.00

Subtotal: ${currency} ${subtotal.toFixed(2)}
Tax (${(taxRate * 100).toFixed(0)}%): ${currency} ${taxAmount.toFixed(2)}
Total: ${currency} ${total.toFixed(2)}

Payment Terms: Net 30
Bank: First National Bank, Acct: 1234-5678-9012
`;

  db.prepare(
    `INSERT INTO invoices (id, tenant_id, invoice_number, vendor_name, vendor_email, vendor_tax_id,
     invoice_date, due_date, currency, subtotal, tax_amount, total_amount, status, source,
     raw_ocr_text, original_filename)
     VALUES (?, ?, 'INV-2024-001', 'TechSupply Inc.', 'billing@techsupply.com', 'US-98-7654321',
     '2024-06-15', '2024-07-15', ?, ?, ?, ?, 'PENDING', 'upload', ?, 'clean_invoice.pdf')`
  ).run(invoiceId, tenantId, currency, subtotal, taxAmount, total, ocrText);

  // Line items (correct math)
  db.prepare(
    `INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price, amount)
     VALUES (?, ?, 'Cloud Hosting (Monthly)', 1, 1500.00, 1500.00)`
  ).run(uuidv4(), invoiceId);

  db.prepare(
    `INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price, amount)
     VALUES (?, ?, 'API Integration Service', 5, 200.00, 1000.00)`
  ).run(uuidv4(), invoiceId);

  // Audit trail
  db.prepare(
    `INSERT INTO audit_trail (id, invoice_id, tenant_id, action, actor, details)
     VALUES (?, ?, ?, 'UPLOADED', 'system', '{"source": "seed", "type": "clean_invoice"}')`
  ).run(uuidv4(), invoiceId, tenantId);

  console.log(`[Seed]   ✓ Clean invoice: ${invoiceId}`);
}

function createDiscrepancyInvoice(
  db: ReturnType<typeof getDb>,
  tenantId: string,
  currency: string,
  taxRate: number
): void {
  const invoiceId = uuidv4();
  // Intentional discrepancy: line items sum to 3200, but subtotal says 3500
  const subtotal = 3500.0; // WRONG — should be 3200
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;

  const ocrText = `
INVOICE
Invoice Number: INV-2024-002
Date: 2024-07-01
Due Date: 2024-08-01

From: DataFlow Systems
Tax ID: US-55-1234567
Email: ap@dataflow.io

Bill To: ${currency === 'USD' ? 'Acme Corp' : 'EuroTech GmbH'}

Description                    Qty    Unit Price    Amount
───────────────────────────────────────────────────────────
Data Pipeline Setup            2      1,200.00      2,400.00
Training Workshop              1        800.00        800.00

Subtotal: ${currency} ${subtotal.toFixed(2)}
Tax (${(taxRate * 100).toFixed(0)}%): ${currency} ${taxAmount.toFixed(2)}
Total: ${currency} ${total.toFixed(2)}

Payment Terms: Net 45
Bank: Metro Business Bank, Acct: 9876-5432-1098
`;

  db.prepare(
    `INSERT INTO invoices (id, tenant_id, invoice_number, vendor_name, vendor_email, vendor_tax_id,
     invoice_date, due_date, currency, subtotal, tax_amount, total_amount, status, source,
     raw_ocr_text, original_filename)
     VALUES (?, ?, 'INV-2024-002', 'DataFlow Systems', 'ap@dataflow.io', 'US-55-1234567',
     '2024-07-01', '2024-08-01', ?, ?, ?, ?, 'PENDING', 'upload', ?, 'discrepancy_invoice.pdf')`
  ).run(invoiceId, tenantId, currency, subtotal, taxAmount, total, ocrText);

  // Line items: sum to 3200, but subtotal is 3500 — discrepancy!
  db.prepare(
    `INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price, amount)
     VALUES (?, ?, 'Data Pipeline Setup', 2, 1200.00, 2400.00)`
  ).run(uuidv4(), invoiceId);

  db.prepare(
    `INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price, amount)
     VALUES (?, ?, 'Training Workshop', 1, 800.00, 800.00)`
  ).run(uuidv4(), invoiceId);

  // Audit trail
  db.prepare(
    `INSERT INTO audit_trail (id, invoice_id, tenant_id, action, actor, details)
     VALUES (?, ?, ?, 'UPLOADED', 'system', '{"source": "seed", "type": "discrepancy_invoice"}')`
  ).run(uuidv4(), invoiceId, tenantId);

  console.log(`[Seed]   ✓ Discrepancy invoice: ${invoiceId}`);
}

function createSuspiciousInvoice(
  db: ReturnType<typeof getDb>,
  tenantId: string,
  currency: string,
  taxRate: number
): void {
  const invoiceId = uuidv4();
  const subtotal = 8500.0;
  const taxAmount = subtotal * taxRate;
  const total = subtotal + taxAmount;

  const ocrText = `
INVOICE — URGENT PAYMENT REQUIRED
Invoice Number: INV-2024-003
Date: 2024-08-10
Due Date: 2024-08-12

From: Global Services LLC
Tax ID: XX-00-0000000
Email: payments@globalservices-llc.com

Bill To: ${currency === 'USD' ? 'Acme Corp' : 'EuroTech GmbH'}

Description                         Qty    Unit Price    Amount
────────────────────────────────────────────────────────────────
Executive Consulting (Confidential)  1     5,000.00      5,000.00
Gift Card Program Administration     1     2,000.00      2,000.00
Wire Transfer Change Processing      1     1,500.00      1,500.00

Subtotal: ${currency} ${subtotal.toFixed(2)}
Tax (${(taxRate * 100).toFixed(0)}%): ${currency} ${taxAmount.toFixed(2)}
Total: ${currency} ${total.toFixed(2)}

*** IMPORTANT: Our bank details have changed! ***
*** Please use NEW account for wire transfer change ***
Payment Terms: Due upon receipt
Bank: Offshore International, Acct: XXXX-OFFSHORE-9999

Note: This is a confidential invoice. Urgent payment required via crypto or wire transfer change.
`;

  db.prepare(
    `INSERT INTO invoices (id, tenant_id, invoice_number, vendor_name, vendor_email, vendor_tax_id,
     invoice_date, due_date, currency, subtotal, tax_amount, total_amount, status, source,
     raw_ocr_text, original_filename)
     VALUES (?, ?, 'INV-2024-003', 'Global Services LLC', 'payments@globalservices-llc.com', 'XX-00-0000000',
     '2024-08-10', '2024-08-12', ?, ?, ?, ?, 'PENDING', 'upload', ?, 'suspicious_invoice.pdf')`
  ).run(invoiceId, tenantId, currency, subtotal, taxAmount, total, ocrText);

  // Line items — amounts are correct mathematically
  db.prepare(
    `INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price, amount)
     VALUES (?, ?, 'Executive Consulting (Confidential)', 1, 5000.00, 5000.00)`
  ).run(uuidv4(), invoiceId);

  db.prepare(
    `INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price, amount)
     VALUES (?, ?, 'Gift Card Program Administration', 1, 2000.00, 2000.00)`
  ).run(uuidv4(), invoiceId);

  db.prepare(
    `INSERT INTO invoice_line_items (id, invoice_id, description, quantity, unit_price, amount)
     VALUES (?, ?, 'Wire Transfer Change Processing', 1, 1500.00, 1500.00)`
  ).run(uuidv4(), invoiceId);

  // Audit trail
  db.prepare(
    `INSERT INTO audit_trail (id, invoice_id, tenant_id, action, actor, details)
     VALUES (?, ?, ?, 'UPLOADED', 'system', '{"source": "seed", "type": "suspicious_invoice"}')`
  ).run(uuidv4(), invoiceId, tenantId);

  console.log(`[Seed]   ✓ Suspicious invoice: ${invoiceId}`);
}

// Run the seed
seed();
