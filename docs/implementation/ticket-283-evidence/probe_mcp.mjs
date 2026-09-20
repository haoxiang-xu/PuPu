// Opt-in public/invalid-credential probes. No real keys or private user data.
// Install the three pinned packages into /tmp/pupu-283-mcp-{brave,tavily,firecrawl}
// with --ignore-scripts and the catalog's --before cutoff before running.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const sdk = '/tmp/pupu-283-mcp-brave/node_modules/@modelcontextprotocol/sdk/dist/esm';
const { Client } = await import(pathToFileURL(path.join(sdk, 'client/index.js')));
const { StdioClientTransport } = await import(pathToFileURL(path.join(sdk, 'client/stdio.js')));
const { StreamableHTTPClientTransport } = await import(pathToFileURL(path.join(sdk, 'client/streamableHttp.js')));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-283-mcp-probe-'));
const cases = [
  { id: 'dev.microsoft-learn', url: 'https://learn.microsoft.com/api/mcp',
    call: { name: 'microsoft_docs_search', arguments: { query: 'Microsoft Learn MCP server' } } },
  { id: 'productivity.brave-search', package: '@brave/brave-search-mcp-server', version: '2.1.0',
    script: '/tmp/pupu-283-mcp-brave/node_modules/@brave/brave-search-mcp-server/dist/index.js',
    args: ['--transport', 'stdio', '--enabled-tools', 'brave_web_search', 'brave_news_search', 'brave_image_search', 'brave_video_search'],
    env: { BRAVE_API_KEY: 'pupu-invalid-test-credential' },
    call: { name: 'brave_web_search', arguments: { query: 'Microsoft Learn MCP' } },
    credentialMode: 'intentionally invalid key; authenticated success NOT_RUN' },
  { id: 'productivity.tavily', package: 'tavily-mcp', version: '0.2.21',
    script: '/tmp/pupu-283-mcp-tavily/node_modules/tavily-mcp/build/index.js',
    call: { name: 'tavily_search', arguments: { query: 'Microsoft Learn MCP', max_results: 1 } },
    credentialMode: 'upstream keyless public mode; catalog-required-key success NOT_RUN' },
  { id: 'productivity.firecrawl', package: 'firecrawl-mcp', version: '3.22.4',
    script: '/tmp/pupu-283-mcp-firecrawl/node_modules/firecrawl-mcp/dist/index.js',
    call: { name: 'firecrawl_scrape', arguments: { url: 'https://example.com', formats: ['markdown'] } },
    credentialMode: 'upstream keyless public mode; catalog-required-key success NOT_RUN' },
];
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const probe = async (test) => {
  const client = new Client({ name: 'pupu-marketplace-qualification', version: '0.1' });
  const record = { id: test.id, package: test.package, version: test.version, endpoint: test.url,
    credentialMode: test.credentialMode || 'no authentication required', node: process.version,
    packagedPuPuUnchainPair: 'NOT_RUN' };
  const transport = test.url
    ? new StreamableHTTPClientTransport(new URL(test.url))
    : new StdioClientTransport({ command: process.execPath, args: [test.script, ...(test.args || [])],
      cwd: scratch, env: { PATH: process.env.PATH || '', ...(test.env || {}) }, stderr: 'pipe' });
  // Drain diagnostics without storing provider requests or possible credentials.
  transport.stderr?.on('data', () => {});
  const timer = setTimeout(() => client.close().catch(() => {}), 45000);
  try {
    await client.connect(transport, { timeout: 20000 });
    record.initialize = 'PASS';
    record.server = client.getServerVersion();
    const tools = await client.listTools({}, { timeout: 15000 });
    record.tools = tools.tools.map((tool) => tool.name);
    record.toolSchemaSha256 = sha256(JSON.stringify(tools.tools));
    if (!record.tools.includes(test.call.name)) throw new Error('Expected preview tool is absent');
    const result = await client.callTool(test.call, undefined, { timeout: 20000 });
    const text = JSON.stringify(result);
    record.call = { name: test.call.name, isError: result.isError === true, bytes: Buffer.byteLength(text),
      sha256: sha256(text), excerpt: text.slice(0, 360).replaceAll('pupu-invalid-test-credential', '[invalid test key]') };
  } catch (error) {
    record.failure = String(error.message || error).slice(0, 600).replaceAll('pupu-invalid-test-credential', '[invalid test key]');
  } finally {
    clearTimeout(timer);
    await client.close().catch(() => {});
  }
  console.log(JSON.stringify(record));
  return record;
};
try {
  const records = await Promise.all(cases.map(probe));
  fs.writeFileSync(path.join(here, 'mcp-probes.json'), `${JSON.stringify({ checkedAt: new Date().toISOString(),
    boundary: 'BC-283-003', check: 'AC-283-005', records }, null, 2)}\n`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
