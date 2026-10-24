/**
 * Live smoke test against the REAL Fastn workspace (read-only).
 * Requires FASTN_API_KEY and FASTN_MCP_URL in the environment. Prints only
 * pass/fail and non-sensitive summaries; never prints keys or tokens.
 *
 * Run: npm run build && npm run test:fastn:live
 */
import { isFastnConfigured, listWorkspaceConnections, FastnActionError } from './services/fastn';
import { healthCheck, CONNECTOR_IDS, Provider } from './services/fastnActions';

async function main() {
  if (!isFastnConfigured()) {
    console.error('FASTN_API_KEY and FASTN_MCP_URL must be set. Nothing was called.');
    process.exit(2);
  }
  let failed = 0;
  try {
    const conns = await listWorkspaceConnections();
    const active = conns.filter((c: any) => c.status === 'ACTIVE').length;
    console.log(`PASS listConnections: ${conns.length} connections, ${active} ACTIVE`);
  } catch (e: any) {
    failed++;
    console.log(`FAIL listConnections: ${e.message}`);
  }

  const providers: Provider[] = ['gmail', 'gdrive', 'slack', 'hubspot'];
  for (const p of providers) {
    try {
      await healthCheck(p, 'default');
      console.log(`PASS ${p} health check (connector ${CONNECTOR_IDS[p]})`);
    } catch (e: any) {
      failed++;
      const msg = e instanceof FastnActionError ? e.message : String(e?.message || e);
      console.log(`FAIL ${p} health check: ${msg.slice(0, 200)}`);
    }
  }
  console.log(failed ? `\n${failed} check(s) failed.` : '\nAll read-only live checks passed.');
  process.exit(failed ? 1 : 0);
}

main();
