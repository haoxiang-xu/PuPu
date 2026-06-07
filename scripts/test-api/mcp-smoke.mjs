#!/usr/bin/env node
import { runMcpSmoke, DEFAULT_MCP_SMOKE_BASE_URL } from "./mcp-smoke-lib.mjs";

const usage = () => `
Usage:
  UNCHAIN_AUTH_TOKEN=... node scripts/test-api/mcp-smoke.mjs [options]

Options:
  --base-url <url>       Unchain runtime URL. Default: ${DEFAULT_MCP_SMOKE_BASE_URL}
  --auth-token <token>   Runtime auth token. Default: UNCHAIN_AUTH_TOKEN
  --no-health            Skip per-installed-MCP health checks.
  --oauth-start <entry>  Start one OAuth flow and print only a sanitized auth URL summary.
  --memory-install-cleanup
                         Install the registry cleanup MCP if missing, verify catalog, then delete it.
  --json                 Print JSON only.
  --help                 Show this help.

Examples:
  UNCHAIN_AUTH_TOKEN=... node scripts/test-api/mcp-smoke.mjs
  UNCHAIN_AUTH_TOKEN=... node scripts/test-api/mcp-smoke.mjs --oauth-start <entry-id>
`;

const parseArgs = (argv) => {
  const opts = {
    baseUrl: process.env.UNCHAIN_BASE_URL || DEFAULT_MCP_SMOKE_BASE_URL,
    authToken: process.env.UNCHAIN_AUTH_TOKEN || "",
    checkHealth: true,
    oauthStartEntry: "",
    memoryInstallCleanup: false,
    jsonOnly: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      opts.help = true;
    } else if (arg === "--json") {
      opts.jsonOnly = true;
    } else if (arg === "--no-health") {
      opts.checkHealth = false;
    } else if (arg === "--memory-install-cleanup") {
      opts.memoryInstallCleanup = true;
    } else if (arg === "--base-url") {
      opts.baseUrl = argv[++index] || "";
    } else if (arg === "--auth-token") {
      opts.authToken = argv[++index] || "";
    } else if (arg === "--oauth-start") {
      opts.oauthStartEntry = argv[++index] || "";
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return opts;
};

const main = async () => {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(usage().trim());
    return;
  }
  const summary = await runMcpSmoke({
    baseUrl: opts.baseUrl,
    authToken: opts.authToken,
    checkHealth: opts.checkHealth,
    oauthStartEntry: opts.oauthStartEntry,
    memoryInstallCleanup: opts.memoryInstallCleanup,
    logger: opts.jsonOnly ? () => {} : console.log,
  });
  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error) => {
  console.error("[mcp-smoke] FAIL:", error.message);
  if (error.body) {
    console.error(JSON.stringify(error.body, null, 2));
  }
  process.exit(1);
});
