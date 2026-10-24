import { Router, Request, Response } from 'express';
import { getDb } from '../database';

const router = Router();

/**
 * GET /api/invoices/:id/audit — Get audit trail for an invoice
 */
router.get('/:id/audit', (req: Request, res: Response) => {
  try {
    if (!req.tenantId) {
      res.status(401).json({ error: 'Tenant ID required' });
      return;
    }

    const db = getDb();

    // Verify invoice belongs to tenant
    const invoice = db
      .prepare('SELECT id FROM invoices WHERE id = ? AND tenant_id = ?')
      .get(req.params.id, req.tenantId) as { id: string } | undefined;

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found' });
      return;
    }

    const auditTrail = db
      .prepare(
        'SELECT * FROM audit_trail WHERE invoice_id = ? ORDER BY created_at DESC'
      )
      .all(req.params.id);

    res.json({
      audit_trail: auditTrail.map((entry: any) => ({
        ...entry,
        details: entry.details ? JSON.parse(entry.details) : null,
      })),
    });
  } catch (error: any) {
    console.error('[Audit] Error:', error.message);
    res.status(500).json({ error: 'Failed to get audit trail' });
  }
});

export default router;
