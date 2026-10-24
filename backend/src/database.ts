import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from './config';

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function initDatabase(): Database.Database {
  const dbDir = path.dirname(config.DATABASE_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(config.DATABASE_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create all tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      default_currency TEXT DEFAULT 'USD',
      locale TEXT DEFAULT 'en-US',
      tax_rate REAL DEFAULT 0.0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      invoice_number TEXT,
      vendor_name TEXT,
      vendor_email TEXT,
      vendor_tax_id TEXT,
      invoice_date TEXT,
      due_date TEXT,
      currency TEXT DEFAULT 'USD',
      subtotal REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'PENDING',
      source TEXT DEFAULT 'upload',
      raw_ocr_text TEXT,
      original_filename TEXT,
      file_path TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );

    CREATE TABLE IF NOT EXISTS invoice_line_items (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      description TEXT,
      quantity REAL DEFAULT 1,
      unit_price REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    );

    CREATE TABLE IF NOT EXISTS llm_analyses (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      model_name TEXT NOT NULL,
      extracted_data TEXT,
      risk_flags TEXT,
      confidence_score REAL,
      raw_response TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    );

    CREATE TABLE IF NOT EXISTS deterministic_checks (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      check_name TEXT NOT NULL,
      passed INTEGER NOT NULL,
      severity TEXT NOT NULL,
      message TEXT,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    );

    CREATE TABLE IF NOT EXISTS audit_trail (
      id TEXT PRIMARY KEY,
      invoice_id TEXT NOT NULL,
      tenant_id TEXT NOT NULL,
      action TEXT NOT NULL,
      actor TEXT DEFAULT 'system',
      details TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    );

    CREATE TABLE IF NOT EXISTS fastn_connections (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      fastn_connection_id TEXT,
      status TEXT DEFAULT 'disconnected',
      last_synced_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );
    CREATE TABLE IF NOT EXISTS tenant_fastn_config (
      tenant_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (tenant_id, key),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );
  `);

  // Create indexes for common queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id ON invoices(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice_id ON invoice_line_items(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_llm_analyses_invoice_id ON llm_analyses(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_deterministic_checks_invoice_id ON deterministic_checks(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_audit_trail_invoice_id ON audit_trail(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_audit_trail_tenant_id ON audit_trail(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_fastn_connections_tenant_id ON fastn_connections(tenant_id);
  `);

  console.log('[DB] Database initialized successfully at', config.DATABASE_PATH);
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    console.log('[DB] Database connection closed.');
  }
}
