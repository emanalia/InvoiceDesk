/**
 * Auth diagnostic for the Fastn MCP endpoint. Read-only, sends one MCP
 * `initialize` request per auth variant. Prints status codes and headers only.
 * Never prints the key, the full URL query string, or the full response body.
 *
 * Run: npm run build && node dist/fastnAuthProbe.js
 */
import { config } from './config';

function redact(text: string): string {
  let out = text;
  for (const secret of [config.FASTN_API_KEY]) {
    if (secret) out = out.split(secret).join('***');
  }
  return out.slice(0, 200);
}

async function probe(label: string, headers: Record<string, string>): Promise<void> {
  try {
    const res = await fetch(config.FASTN_MCP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...headers,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'invoice-desk-probe', version: '1.0.0' },
        },
      }),
    });
    const body = await res.text();
    console.log(`\n[${label}] HTTP ${res.status}`);
    const www = res.headers.get('www-authenticate');
    if (www) console.log(`  www-authenticate: ${redact(www)}`);
    console.log(`  body: ${redact(body)}`);
  } catch (e: any) {
    console.log(`\n[${label}] network error: ${String(e?.message || e).slice(0, 200)}`);
  }
}

async function main() {
  if (!config.FASTN_MCP_URL) {
    console.log('FASTN_MCP_URL is empty in the environment.');
    process.exit(2);
  }
  const u = new URL(config.FASTN_MCP_URL);
  console.log('Endpoint host:', u.host);
  console.log('Endpoint path:', u.pathname);
  console.log('Query string present:', u.search.length > 0, '(value not printed)');
  console.log('Key length:', config.FASTN_API_KEY.length, '(value not printed)');

  const key = config.FASTN_API_KEY;
  await probe('no auth', {});
  await probe('Authorization: Bearer', { Authorization: `Bearer ${key}` });
  await probe('x-api-key', { 'x-api-key': key });
  await probe('Authorization: Bearer + x-api-key', { Authorization: `Bearer ${key}`, 'x-api-key': key });
}

main();
