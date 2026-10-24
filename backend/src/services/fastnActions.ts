import { executeAction, FastnActionError } from './fastn';

/**
 * Verified Fastn connector registry and typed operations.
 *
 * Connector and action IDs, and the input shapes used below, were verified
 * against the live Maple & Pine connections with real calls:
 *   gmail list / getMessage / getAttachment  — read, tested with a synthetic invoice email
 *   drive createFile → updateFileContent     — content write, md5 + size read back
 *   sheets appendValues                      — write, read-back matched
 *   slack createChatPostMessage              — write, ts returned
 *   hubspot createNote                       — write, note id returned
 */

export const CONNECTOR_IDS = {
  gmail: 'ec3c1b4a-e281-4c5e-9a6b-90eb4a59882f',
  gdrive: '771fd846-8d4e-4cef-8045-571d3a0eafcc',
  gsheets: '38d254e2-b92e-44f4-81cd-8251fd9373d9',
  slack: '8de5d696-5289-4c9c-ade4-de918d019d06',
  hubspot: '9036a742-6baa-4c72-be3c-3789b34d6f9b',
} as const;

export type Provider = keyof typeof CONNECTOR_IDS;

export const ACTION_IDS = {
  gmailProfile: '727b6588-fd72-47de-ba8f-3999457ddfdb',
  gmailList: '8c4544f2-e9ce-413d-b01d-c824f280afae',
  gmailGetMessage: '5439d473-5629-4e9a-933a-f6b2f50c6106',
  gmailGetAttachment: '3fd66378-d614-42dd-ad70-611ed8d2391c',
  driveAbout: '8497d67a-734d-4a93-9764-b302bda1811b',
  driveCreateFile: '27ca7f55-6ac2-4a57-b4d7-941ef01be93b',
  driveUpdateFileContent: '9897591d-f0fb-447d-a960-0377bd4f0468',
  sheetsAppendValues: '00cdc78f-7b85-4a71-9caf-bd84813c92ef',
  sheetsCreateSpreadsheet: '1f235cb5-fe56-46ba-a377-f2dfb7f44b0f',
  slackChannelsList: '6be2a4d6-2870-4120-b052-6ac6fde11c9d',
  slackPostMessage: '9d4c12fc-97d5-4250-a830-4eae0035a593',
  hubspotListContacts: 'faf3ad68-b612-4780-9a79-efcffc43be97',
  hubspotCreateNote: 'b011525f-1075-4f83-9a1b-a52c8929f803',
} as const;

const DEFAULT_CONNECTION = 'default';

async function run(
  provider: Provider,
  actionId: string,
  connectionName: string,
  input: Record<string, any>
): Promise<any> {
  const res = await executeAction({
    connectorId: CONNECTOR_IDS[provider],
    actionId,
    connectionName: connectionName || DEFAULT_CONNECTION,
    input,
  });
  return res.response;
}

// ---------------------------------------------------------------------------
// Read-only health checks (used by POST /api/fastn/sync/:provider)
// ---------------------------------------------------------------------------

export async function healthCheck(provider: Provider, connectionName: string): Promise<any> {
  switch (provider) {
    case 'gmail':
      return run('gmail', ACTION_IDS.gmailProfile, connectionName, {});
    case 'gdrive':
      return run('gdrive', ACTION_IDS.driveAbout, connectionName, {});
    case 'slack':
      return run('slack', ACTION_IDS.slackChannelsList, connectionName, {});
    case 'hubspot':
      return run('hubspot', ACTION_IDS.hubspotListContacts, connectionName, { limit: 1 });
    case 'gsheets':
      throw new FastnActionError('Google Sheets health check needs a spreadsheet id; use the ledger operation.');
    default:
      throw new FastnActionError(`Unknown provider: ${provider}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Gmail → invoice intake
// ---------------------------------------------------------------------------

export interface GmailAttachment {
  messageId: string;
  subject: string;
  from: string;
  filename: string;
  mimeType: string;
  content: Buffer;
}

const INTAKE_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
  'image/bmp',
  'image/webp',
  'text/plain',
];

function walkParts(part: any, out: any[]): void {
  if (!part) return;
  if (part.filename && part.body?.attachmentId) out.push(part);
  for (const p of part.parts || []) walkParts(p, out);
}

function header(payload: any, name: string): string {
  const h = (payload?.headers || []).find((x: any) => String(x.name).toLowerCase() === name.toLowerCase());
  return h?.value || '';
}

/**
 * Lists matching Gmail messages and downloads their invoice-type attachments.
 * Returns raw bytes; the caller stores and OCRs them.
 */
export async function fetchGmailInvoiceAttachments(
  connectionName: string,
  query = 'has:attachment filename:pdf OR filename:png OR filename:jpg OR filename:txt',
  maxMessages = 10
): Promise<GmailAttachment[]> {
  const list = await run('gmail', ACTION_IDS.gmailList, connectionName, { q: query, maxResults: maxMessages });
  const messages: Array<{ id: string }> = list?.messages || [];
  const out: GmailAttachment[] = [];

  for (const m of messages) {
    const msg = await run('gmail', ACTION_IDS.gmailGetMessage, connectionName, { id: m.id, format: 'full' });
    const parts: any[] = [];
    walkParts(msg.payload, parts);

    for (const part of parts) {
      const mime = String(part.mimeType || '').toLowerCase();
      if (!INTAKE_MIME.includes(mime) && !/\.(pdf|png|jpe?g|tiff?|bmp|webp|txt)$/i.test(part.filename)) {
        continue;
      }
      const att = await run('gmail', ACTION_IDS.gmailGetAttachment, connectionName, {
        messageId: m.id,
        id: part.body.attachmentId,
      });
      // Gmail returns base64url in `data`.
      const content = Buffer.from(String(att.data || ''), 'base64url');
      out.push({
        messageId: m.id,
        subject: header(msg.payload, 'Subject'),
        from: header(msg.payload, 'From'),
        filename: part.filename,
        mimeType: mime,
        content,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 2. Google Drive → archive the actual invoice content
// ---------------------------------------------------------------------------

export interface DriveArchiveResult {
  fileId: string;
  name: string;
  md5Checksum: string | null;
  size: number;
}

/**
 * Creates a Drive file and writes its content (create → update content).
 * `content` is written as text; binary originals are archived as their OCR text
 * by the caller (documented in the audit record).
 */
export async function archiveInvoiceToDrive(
  connectionName: string,
  name: string,
  mimeType: string,
  content: string
): Promise<DriveArchiveResult> {
  const created = await run('gdrive', ACTION_IDS.driveCreateFile, connectionName, {
    name,
    mimeType,
    parents: [],
  });
  const fileId = created?.id;
  if (!fileId) throw new FastnActionError('Drive createFile returned no id');

  const updated = await run('gdrive', ACTION_IDS.driveUpdateFileContent, connectionName, {
    fileId,
    content,
    mimeType,
  });
  const size = Number(updated?.size || 0);
  if (size <= 0) {
    throw new FastnActionError(`Drive content write produced size ${size}; archive not verified`);
  }
  return { fileId, name, md5Checksum: updated?.md5Checksum || null, size };
}

// ---------------------------------------------------------------------------
// 3. Google Sheets → verified ledger row
// ---------------------------------------------------------------------------

export interface LedgerAppendResult {
  updatedRange: string;
  updatedRows: number;
  updatedCells: number;
}

export async function appendLedgerRow(
  connectionName: string,
  spreadsheetId: string,
  row: Array<string | number>
): Promise<LedgerAppendResult> {
  const res = await run('gsheets', ACTION_IDS.sheetsAppendValues, connectionName, {
    spreadsheetId,
    range: 'Sheet1!A1',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    values: [row.map((v) => String(v))],
  });
  const u = res?.updates || {};
  if (!u.updatedRows || u.updatedRows < 1) {
    throw new FastnActionError('Sheets append reported zero rows written');
  }
  return {
    updatedRange: u.updatedRange,
    updatedRows: u.updatedRows,
    updatedCells: u.updatedCells,
  };
}

// ---------------------------------------------------------------------------
// 4. Slack → review / fraud alert
// ---------------------------------------------------------------------------

export async function postSlackAlert(
  connectionName: string,
  channel: string,
  text: string
): Promise<{ channel: string; ts: string }> {
  const res = await run('slack', ACTION_IDS.slackPostMessage, connectionName, { channel, text });
  if (!res?.ok || !res?.ts) {
    throw new FastnActionError(`Slack post not confirmed: ${res?.error || 'no ts returned'}`);
  }
  return { channel: res.channel, ts: res.ts };
}

// ---------------------------------------------------------------------------
// 5. HubSpot → vendor / company note
// ---------------------------------------------------------------------------

export async function createHubspotVendorNote(
  connectionName: string,
  body: string
): Promise<{ id: string }> {
  const res = await run('hubspot', ACTION_IDS.hubspotCreateNote, connectionName, {
    properties: {
      hs_note_body: body,
      hs_timestamp: new Date().toISOString(),
    },
  });
  if (!res?.id) throw new FastnActionError('HubSpot note create returned no id');
  return { id: String(res.id) };
}
