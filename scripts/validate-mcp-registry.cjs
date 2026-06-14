#!/usr/bin/env node
/*
 * Validation harness for the MCP toolkit registry.
 * Validates src/SERVICEs/mcp_toolkit_registry.json against its JSON schema,
 * then runs PuPu-specific catalog invariants the schema cannot express:
 *  - toolkitId format: mcp.<server>.<slug>
 *  - id + toolkitId global uniqueness
 *  - every entry.category is declared in registry.categories
 *  - trustLevel is one of the allowed enum values
 *
 * Usage: node scripts/validate-mcp-registry.cjs [path/to/registry.json]
 * Defaults to the in-repo registry. Exit code 1 on any failure (used by CI).
 */
const path = require("path");
const Ajv = require("ajv");

const root = path.resolve(__dirname, "..");
const registryPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "src/SERVICEs/mcp_toolkit_registry.json");
const registry = require(registryPath);
const schema = require(path.join(root, "src/SERVICEs/mcp_toolkit_registry.schema.json"));

// ajv6 is draft-07 native but rejects the explicit $schema URI unless the
// meta-schema is pre-registered; strip it so it uses its default dialect.
const { $schema, ...schemaBody } = schema;
const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schemaBody);

let failed = false;
const fail = (msg) => {
  failed = true;
  console.error("  FAIL:", msg);
};

console.log("[schema] validating registry against mcp_toolkit_registry.schema.json");
if (!validate(registry)) {
  for (const e of validate.errors) {
    fail(`${e.instancePath || "(root)"} ${e.message}`);
  }
} else {
  console.log("  OK: schema valid");
}

console.log("[invariants] PuPu catalog rules");
const toolkitIdRe = /^mcp\.[a-z0-9-]+\.[a-z0-9-]+$/;
const ids = new Map();
const toolkitIds = new Map();
const cats = new Set(registry.categories || []);

for (const entry of registry.entries || []) {
  const tag = entry.id || "(no id)";
  if (!toolkitIdRe.test(entry.toolkitId || "")) {
    fail(`${tag}: toolkitId "${entry.toolkitId}" does not match mcp.<server>.<slug>`);
  }
  if (ids.has(entry.id)) fail(`duplicate id: ${entry.id}`);
  ids.set(entry.id, true);
  if (toolkitIds.has(entry.toolkitId)) fail(`duplicate toolkitId: ${entry.toolkitId}`);
  toolkitIds.set(entry.toolkitId, true);
  if (entry.category && !cats.has(entry.category)) {
    fail(`${tag}: category "${entry.category}" not declared in registry.categories`);
  }
  const allowedTrust = ["official", "verified", "community", "needs_review"];
  if (entry.trustLevel && !allowedTrust.includes(entry.trustLevel)) {
    fail(`${tag}: trustLevel "${entry.trustLevel}" not in ${JSON.stringify(allowedTrust)}`);
  }
}
if (!failed) console.log("  OK: toolkitId format, id/toolkitId uniqueness, category membership, trustLevel enum");

console.log(`[summary] ${registry.entries.length} entries, categories=${JSON.stringify(registry.categories)}`);
process.exit(failed ? 1 : 0);
