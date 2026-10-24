import { Router, Request, Response } from 'express';
import { getDb } from '../database';
import { config } from '../config';
import { isFastnConfigured } from '../services/fastn';
import * as connectorHub from '../services/connectorHub';
import { CONNECTOR_IDS, Provider } from '../services/fastnActions';

const router = Router();

export const SUPPORTED_CONNECTORS = [
  {
    provider: 'gmail',
    name: 'Gmail',
    role: 'Inbound Ingestion',
    description: 'Extract PDF invoices automatically from incoming vendor emails',
    workflow_name: 'Fastn_Gmail_Invoice_Ingest',
  },
  {
    provider: 'gdrive',
    name: 'Google Drive',
    role: 'Inbound Ingestion',
    description: 'Monitors watched Drive folder for newly uploaded invoice scans',
    workflow_name: 'Fastn_GDrive_Folder_Watcher',
  },
  {
    provider: 'gsheets',
    name: 'Google Sheets',
    role: 'Outbound Ledger Sync',
    description: 'Appends approved invoice line items to the centralized finance sheet',
    workflow_name: 'Fastn_GSheets_Ledger_Append',
  },
  {
    provider: 'slack',
    name: 'Slack',
    role: 'Risk & Approval Alerts',
    description: 'Sends real-time audit notifications and alerts on CRITICAL fraud flags',
    workflow_name: 'Fastn_Slack_Finance_Alerts',
  },
  {
    provider: 'hubspot',
    name: 'HubSpot',
    role: 'Vendor Verification',
    description: 'Cross-references vendor names, emails and tax profiles with CRM vendor directory',
    workflow_name: 'Fastn_HubSpot_Vendor_Verify',
  },
];

const PROVIDERS = Object.keys(CONNECTOR_IDS) as Provider[];
const isProvider = (p: string): p is Provider => (PROVIDERS as string[]).includes(p);

/**
 * GET /api/fastn/session-token — embedded connect flow.
 * Not implemented: the previous REST endpoint was unverified. Returns an honest
 * 501 instead of a fake token.
 */
router.get('/session-token', (_req: Request, res: Response) => {
  if (!isFastnConfigured()) {
    res.status(500).json({
      error: 'FASTN_API_KEY and FASTN_MCP_URL are not configured; no session token can be issued.',
    });
    return;
  }
  res.status(501).json({
    error:
      'Embedded Fastn connect is not wired yet. Link accounts through the Fastn workspace, then call POST /api/fastn/connections/link.',
    requires_config: true,
  });
});

/**
 * GET /api/fastn/connections — per-tenant connector status (local DB + config).
 */
router.get('/connections', (req: Request, res: Response) => {
  try {
    if (!req.tenantId) {
      res.status(401).json({ error: 'Tenant ID required' });
      return;
    }
    const db = getDb();
    const localConnections = db
      .prepare('SELECT * FROM fastn_connections WHERE tenant_id = ? ORDER BY created_at DESC')
      .all(req.tenantId) as Array<{
        id: string;
        provider: string;
        fastn_connection_id: string | null;
        status: string;
        last_synced_at: string | null;
      }>;

    const configured = isFastnConfigured();
    const connectors = SUPPORTED_CONNECTORS.map((meta) => {
      const match = localConnections.find((c) => c.provider === meta.provider);
      const linked = match?.status === 'connected' && Boolean(match?.fastn_connection_id);
      return {
        id: match?.id || `conn_${meta.provider}`,
        provider: meta.provider,
        name: meta.name,
        role: meta.role,
        description: meta.description,
        workflow_name: meta.workflow_name,
        status: match?.status || 'disconnected',
        auth_status: linked ? 'authenticated' : 'not_connected',
        workflow_status: linked && configured ? 'published' : 'unpublished',
        execution_status: match?.last_synced_at ? 'executed' : linked ? 'ready' : 'awaiting_auth',
        fastn_connection_id: match?.fastn_connection_id || null,
        last_synced_at: match?.last_synced_at || null,
      };
    });

    res.json({
      connections: connectors,
      connectors,
      fastn_configured: configured,
      source: 'local',
      next_steps: configured
        ? []
        : ['Set FASTN_API_KEY and FASTN_MCP_URL in backend/.env', 'Restart the backend'],
    });
  } catch (error: any) {
    console.error('[Fastn] Connections error:', error.message);
    res.status(500).json({ error: 'Failed to load connections' });
  }
});

/**
 * POST /api/fastn/connections/link — { provider, connection_name }
 * Stores the link only after the named connection is confirmed ACTIVE in Fastn.
 */
router.post('/connections/link', async (req: Request, res: Response) => {
  try {
    if (!req.tenantId) {
      res.status(401).json({ error: 'Tenant ID required' });
      return;
    }
    const provider = String(req.body?.provider || '').toLowerCase();
    const connectionName = String(req.body?.connection_name || 'default');
    if (!isProvider(provider)) {
      res.status(400).json({ error: `Unknown provider. Use one of: ${PROVIDERS.join(', ')}` });
      return;
    }
    if (!isFastnConfigured()) {
      res.status(400).json({ error: 'FASTN_API_KEY and FASTN_MCP_URL must be set.', requires_config: true });
      return;
    }
    const linked = await connectorHub.linkTenantConnection(req.tenantId, provider, connectionName);
    res.json({ linked });
  } catch (error: any) {
    console.error('[Fastn] Link error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/fastn/config — { sheets_spreadsheet_id?, slack_channel? } per tenant
 */
router.put('/config', (req: Request, res: Response) => {
  if (!req.tenantId) {
    res.status(401).json({ error: 'Tenant ID required' });
    return;
  }
  const allowed = ['sheets_spreadsheet_id', 'slack_channel'];
  for (const key of allowed) {
    if (typeof req.body?.[key] === 'string' && req.body[key].trim()) {
      connectorHub.setTenantSetting(req.tenantId, key, req.body[key].trim());
    }
  }
  res.json({
    sheets_spreadsheet_id: connectorHub.getTenantSetting(req.tenantId, 'sheets_spreadsheet_id'),
    slack_channel: connectorHub.getTenantSetting(req.tenantId, 'slack_channel'),
  });
});

/**
 * POST /api/fastn/sync/:provider — read-only live check on the tenant's connection.
 */
router.post('/sync/:provider', async (req: Request, res: Response) => {
  try {
    if (!req.tenantId) {
      res.status(401).json({ error: 'Tenant ID required' });
      return;
    }
    const provider = String(req.params.provider).toLowerCase();
    if (!isProvider(provider)) {
      res.status(400).json({ error: 'Unknown provider' });
      return;
    }
    if (!isFastnConfigured()) {
      res.status(400).json({ error: 'FASTN_API_KEY and FASTN_MCP_URL must be set.', requires_config: true });
      return;
    }
    const result = await connectorHub.syncProvider(req.tenantId, provider);
    res.json({ success: true, provider, result });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/fastn/ingest/gmail — pull invoice attachments from the tenant's Gmail
 * and create PENDING invoices (then run /api/invoices/:id/analyze as usual).
 */
router.post('/ingest/gmail', async (req: Request, res: Response) => {
  try {
    if (!req.tenantId) {
      res.status(401).json({ error: 'Tenant ID required' });
      return;
    }
    const max = Math.min(parseInt(String(req.body?.max_messages || '10'), 10) || 10, 25);
    const ingested = await connectorHub.ingestGmailInvoices(req.tenantId, max);
    res.json({ ingested_count: ingested.length, ingested });
  } catch (error: any) {
    console.error('[Fastn] Gmail ingest error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/fastn/webhook — Webhook endpoint for Fastn callbacks
 * This does not require X-Tenant-ID header (webhook comes from Fastn servers).
 */
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const { event, data } = req.body;

    console.log('[Fastn Webhook] Received event:', event, data);

    if (!event) {
      res.status(400).json({ error: 'Missing event field' });
      return;
    }

    const db = getDb();

    switch (event) {
      case 'connection.created':
      case 'connection.updated': {
        const { tenant_id, provider, connection_id, status } = data || {};
        if (tenant_id && provider) {
          const { v4: uuidv4 } = require('uuid');

          const existing = db
            .prepare(
              'SELECT id FROM fastn_connections WHERE tenant_id = ? AND provider = ?'
            )
            .get(tenant_id, provider) as { id: string } | undefined;

          if (existing) {
            db.prepare(
              `UPDATE fastn_connections
               SET fastn_connection_id = ?, status = ?, last_synced_at = datetime('now')
               WHERE id = ?`
            ).run(connection_id || null, status || 'connected', existing.id);
          } else {
            db.prepare(
              `INSERT INTO fastn_connections (id, tenant_id, provider, fastn_connection_id, status)
               VALUES (?, ?, ?, ?, ?)`
            ).run(
              uuidv4(),
              tenant_id,
              provider,
              connection_id || null,
              status || 'connected'
            );
          }
        }
        break;
      }

      case 'connection.deleted': {
        const { tenant_id: tid, provider: prov } = data || {};
        if (tid && prov) {
          db.prepare(
            `UPDATE fastn_connections SET status = 'disconnected' WHERE tenant_id = ? AND provider = ?`
          ).run(tid, prov);
        }
        break;
      }

      case 'gmail.message_received':
      case 'gdrive.file_added': {
        console.log('[Fastn Webhook] Integration event:', event, JSON.stringify(data));
        break;
      }

      default:
        console.log('[Fastn Webhook] Unhandled event:', event);
    }

    res.json({ received: true });
  } catch (error: any) {
    console.error('[Fastn Webhook] Error:', error.message);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
