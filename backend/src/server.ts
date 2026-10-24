import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';

import { config } from './config';
import { initDatabase } from './database';
import { tenantContext } from './middleware/tenantContext';

// Import routes
import tenantsRouter from './routes/tenants';
import invoicesRouter from './routes/invoices';
import analysisRouter from './routes/analysis';
import fastnRouter from './routes/fastn';
import auditRouter from './routes/audit';

import { getProviderStatus } from './services/llmEvaluator';

// Initialize database
initDatabase();

// Ensure upload directory exists
if (!fs.existsSync(config.UPLOAD_DIR)) {
  fs.mkdirSync(config.UPLOAD_DIR, { recursive: true });
}

const app = express();

// ─── Global middleware ───────────────────────────────────────────
app.use(
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
  })
);

app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files statically (for development)
app.use('/uploads', express.static(config.UPLOAD_DIR));

// ─── Tenant context middleware ───────────────────────────────────
// Applied to all /api routes
app.use('/api', tenantContext);

// ─── API Routes ──────────────────────────────────────────────────
app.use('/api/tenants', tenantsRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/invoices', analysisRouter);  // POST /api/invoices/:id/analyze
app.use('/api/invoices', auditRouter);     // GET /api/invoices/:id/audit
app.use('/api/fastn', fastnRouter);

// ─── Provider & System Configuration Status ──────────────────────
app.get('/api/config/providers', (_req, res) => {
  res.json({
    status: 'ok',
    providers: getProviderStatus(),
    timestamp: new Date().toISOString(),
  });
});

// ─── Health check ────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: config.NODE_ENV,
    version: '1.0.0',
  });
});

// ─── 404 handler ─────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Error handler ───────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── Start server ────────────────────────────────────────────────
app.listen(config.PORT, () => {
  console.log(`
  ┌──────────────────────────────────────────────┐
  │  Invoice Desk API Server                     │
  │  Running on http://localhost:${config.PORT}          │
  │  Environment: ${config.NODE_ENV.padEnd(29)}│
  │  Database: ${path.basename(config.DATABASE_PATH).padEnd(33)}│
  └──────────────────────────────────────────────┘
  `);
});

export default app;
