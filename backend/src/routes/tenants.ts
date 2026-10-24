import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../database';

const router = Router();

/**
 * GET /api/tenants — List all tenants
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const tenants = db.prepare('SELECT * FROM tenants ORDER BY created_at DESC').all();
    res.json({ tenants });
  } catch (error: any) {
    console.error('[Tenants] List error:', error.message);
    res.status(500).json({ error: 'Failed to list tenants' });
  }
});

/**
 * POST /api/tenants — Create a new tenant
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, slug, default_currency, locale, tax_rate } = req.body;

    if (!name || !slug) {
      res.status(400).json({ error: 'name and slug are required' });
      return;
    }

    const db = getDb();
    const id = uuidv4();

    // Check slug uniqueness
    const existing = db
      .prepare('SELECT id FROM tenants WHERE slug = ?')
      .get(slug) as { id: string } | undefined;
    if (existing) {
      res.status(409).json({ error: `Tenant with slug "${slug}" already exists` });
      return;
    }

    db.prepare(
      `INSERT INTO tenants (id, name, slug, default_currency, locale, tax_rate)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      name,
      slug,
      default_currency || 'USD',
      locale || 'en-US',
      tax_rate ?? 0.0
    );

    const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id);
    res.status(201).json({ tenant });
  } catch (error: any) {
    console.error('[Tenants] Create error:', error.message);
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

/**
 * GET /api/tenants/:id — Get tenant details
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const tenant = db
      .prepare('SELECT * FROM tenants WHERE id = ?')
      .get(req.params.id);

    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found' });
      return;
    }

    res.json({ tenant });
  } catch (error: any) {
    console.error('[Tenants] Get error:', error.message);
    res.status(500).json({ error: 'Failed to get tenant' });
  }
});

export default router;
