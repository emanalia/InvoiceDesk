import { Request, Response, NextFunction } from 'express';
import { getDb } from '../database';

// Extend Express Request to include tenantId
declare global {
  namespace Express {
    interface Request {
      tenantId?: string;
    }
  }
}

/**
 * Middleware to extract and validate the tenant from the X-Tenant-ID header.
 * - For routes under /api/tenants (GET list, POST create), the header is optional.
 * - For all other routes, if missing, return 401.
 * - If provided, verifies the tenant exists in DB; returns 403 if not found.
 */
export function tenantContext(req: Request, res: Response, next: NextFunction): void {
  const tenantId = req.headers['x-tenant-id'] as string | undefined;

  // Determine if this is a tenant management route where tenant header is optional
  const fullPath = (req.originalUrl || req.url).split('?')[0];
  const isTenantRoute =
    fullPath === '/api/tenants' ||
    fullPath === '/api/tenants/' ||
    req.path === '/tenants' ||
    req.path === '/tenants/' ||
    req.path === '/';

  const isTenantGetOrCreate =
    isTenantRoute && (req.method === 'GET' || req.method === 'POST');

  // Also allow fastn webhook and public status without tenant header
  const isFastnWebhook =
    (fullPath === '/api/fastn/webhook' || req.path === '/fastn/webhook') && req.method === 'POST';

  const isPublicRoute =
    fullPath === '/api/health' ||
    req.path === '/health' ||
    fullPath === '/api/config/providers' ||
    req.path === '/config/providers';

  if (!tenantId) {
    if (isTenantGetOrCreate || isFastnWebhook || isPublicRoute) {
      return next();
    }
    res.status(401).json({ error: 'Missing X-Tenant-ID header' });
    return;
  }

  // Verify the tenant exists
  const db = getDb();
  const tenant = db.prepare('SELECT id FROM tenants WHERE id = ?').get(tenantId) as
    | { id: string }
    | undefined;

  if (!tenant) {
    res.status(403).json({ error: 'Tenant not found' });
    return;
  }

  req.tenantId = tenantId;
  next();
}
