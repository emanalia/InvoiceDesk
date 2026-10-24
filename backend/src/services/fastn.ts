import { config } from '../config';

/**
 * Fastn client — executeAction path.
 *
 * Every connector call goes through the Fastn Workspace tool
 * `fastnPlatform__executeAction` (JSON-RPC `tools/call` over the Fastn MCP
 * endpoint). That is the exact path that was verified against the live
 * Maple & Pine connections. The previous REST guesses (/v1/connections,
 * /v1/session-tokens, /v1/connections/:id/trigger) were removed: they were
 * never verified and do not exist on the Fastn platform.
 *
 * Required env (server-side only, never logged):
 *   FASTN_API_KEY   — bearer token for the Fastn workspace
 *   FASTN_MCP_URL   — Fastn MCP endpoint, e.g. the gateway URL from the dashboard
 */

export class FastnNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FastnNotConfiguredError';
  }
}

export class FastnActionError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'FastnActionError';
    this.status = status;
  }
}

export interface ExecuteActionArgs {
  connectorId: string;
  actionId: string;
  connectionName: string;
  input: Record<string, any>;
}

export interface ExecuteActionResult {
  success: boolean;
  status: number;
  response: any;
}

/** Transport can be replaced in tests; production uses the MCP endpoint. */
export type FastnTransport = (toolName: string, args: Record<string, any>) => Promise<any>;

let transportOverride: FastnTransport | null = null;

export function setFastnTransportForTests(t: FastnTransport | null): void {
  transportOverride = t;
}

export function isFastnConfigured(): boolean {
  return Boolean(config.FASTN_API_KEY && config.FASTN_MCP_URL);
}

async function httpTransport(toolName: string, args: Record<string, any>): Promise<any> {
  if (!config.FASTN_API_KEY || !config.FASTN_MCP_URL) {
    throw new FastnNotConfiguredError(
      'FASTN_API_KEY and FASTN_MCP_URL must be set to call Fastn connectors.'
    );
  }

  const response = await fetch(config.FASTN_MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${config.FASTN_API_KEY}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    }),
  });

  const text = await response.text();
  const snippet = (t: string) =>
    (config.FASTN_API_KEY ? t.split(config.FASTN_API_KEY).join('***') : t).slice(0, 300);
  if (!response.ok) {
    throw new FastnActionError(`Fastn gateway HTTP ${response.status}: ${snippet(text)}`, response.status);
  }

  // Accept plain JSON or a single SSE "data:" frame.
  const dataLine = text.split('\n').find((l) => l.startsWith('data:'));
  const jsonText = dataLine ? dataLine.slice(5).trim() : text;
  let rpc: any;
  try {
    rpc = JSON.parse(jsonText);
  } catch {
    throw new FastnActionError(`Fastn gateway returned non-JSON (HTTP ${response.status}): ${snippet(text)}`);
  }
  if (rpc.error) {
    throw new FastnActionError(`Fastn JSON-RPC error: ${snippet(String(rpc.error.message || 'unknown'))}`);
  }
  const content = rpc.result?.content?.[0]?.text;
  if (!content) return rpc.result;
  try {
    return JSON.parse(content);
  } catch {
    throw new FastnActionError(`Fastn tool returned non-JSON text: ${snippet(String(content))}`);
  }
}

/**
 * Run one connector action through Fastn. Throws on any failure — callers must
 * never treat a thrown call as success.
 */
export async function executeAction(args: ExecuteActionArgs): Promise<ExecuteActionResult> {
  const transport = transportOverride || httpTransport;
  const envelope = await transport('fastnPlatform__executeAction', {
    connectorId: args.connectorId,
    id: args.actionId,
    connectionName: args.connectionName,
    input: args.input,
  });

  const data = envelope?.data ?? envelope;
  if (!data || data.success !== true) {
    const detail =
      data?.error?.message || data?.error || data?.response?.error?.message || 'action failed';
    throw new FastnActionError(`Fastn action failed (status ${data?.status ?? 'n/a'}): ${String(detail).slice(0, 300)}`, data?.status);
  }
  return { success: true, status: data.status, response: data.response };
}

/** List the workspace connections (used only to validate a link request). */
export async function listWorkspaceConnections(): Promise<any[]> {
  const transport = transportOverride || httpTransport;
  const envelope = await transport('fastnPlatform__listConnections', {});
  return envelope?.data || [];
}