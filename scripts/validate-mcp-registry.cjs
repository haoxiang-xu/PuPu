#!/usr/bin/env node
/*
 * Validation harness for the MCP toolkit registry.
 * Validates src/SERVICEs/mcp_toolkit_registry.json against its JSON schema,
 * then runs PuPu-specific catalog invariants the schema cannot express:
 *  - toolkitId format: mcp.<server>.<slug>
 *  - id + toolkitId global uniqueness
 *  - every entry.category is declared in registry.categories
 *  - trustLevel is one of the allowed enum values
 *  - user-facing availability is fail-closed for OAuth and unreviewed entries
 *  - executable stdio package versions are pinned for reproducible installs
 *  - policy summaries and known workspace path contracts remain accurate
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
const allowedStatuses = ["available", "coming_soon", "needs_review"];
const allowedOAuthReleaseStatuses = [
  "ready",
  "approval_required",
  "app_required",
  "disabled",
];

const stdioPackageSpec = (entry) => {
  const command = entry?.mcp?.command;
  const args = Array.isArray(entry?.mcp?.args) ? entry.mcp.args : [];
  if (command === "npx") {
    return args.find((arg) => typeof arg === "string" && !arg.startsWith("-")) || "";
  }
  if (command === "uvx") {
    const fromIndex = args.indexOf("--from");
    if (fromIndex >= 0) return String(args[fromIndex + 1] || "");
    return String(args.find((arg) => typeof arg === "string" && !arg.startsWith("-")) || "");
  }
  return "";
};

const isPinnedPackageSpec = (spec, command) => {
  if (!spec) return false;
  const exactNpmVersionRe =
    /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/;
  const exactPythonVersionRe =
    /^\d+(?:\.\d+)*(?:(?:a|b|rc)\d+)?(?:\.post\d+)?(?:\.dev\d+)?(?:\+[0-9A-Za-z]+(?:[._-][0-9A-Za-z]+)*)?$/;
  if (command === "uvx") {
    const match = spec.match(
      /^[A-Za-z0-9_.-]+(?:\[[A-Za-z0-9_,.-]+\])?==(.+)$/,
    );
    return Boolean(match && exactPythonVersionRe.test(match[1]));
  }
  if (command === "npx") {
    const separator = spec.lastIndexOf("@");
    return separator > 0 && exactNpmVersionRe.test(spec.slice(separator + 1));
  }
  return true;
};

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

  if (!allowedStatuses.includes(entry.status)) {
    fail(`${tag}: status "${entry.status}" not in ${JSON.stringify(allowedStatuses)}`);
  }
  if (entry.status !== "available" && entry.installable) {
    fail(`${tag}: non-available entries must not be installable`);
  }
  if (entry.trustLevel === "needs_review") {
    if (entry.status !== "needs_review" || entry.installable) {
      fail(`${tag}: needs_review entries must stay non-installable with status needs_review`);
    }
  }

  const oauth = entry?.auth?.oauth;
  const oauthReleaseStatus = oauth?.releaseStatus;
  if (oauth) {
    if (!allowedOAuthReleaseStatuses.includes(oauthReleaseStatus)) {
      fail(
        `${tag}: OAuth releaseStatus "${oauthReleaseStatus}" not in ${JSON.stringify(allowedOAuthReleaseStatuses)}`,
      );
    }
    if (oauthReleaseStatus === "ready" && entry.status !== "available") {
      fail(`${tag}: OAuth releaseStatus ready requires status available`);
    }
    if (
      oauth.clientRegistration === "user_credentials" &&
      oauthReleaseStatus === "ready" &&
      !oauth.oauthAppBundled
    ) {
      fail(`${tag}: user_credentials OAuth cannot be ready without a bundled OAuth app`);
    }
  }
  if (
    entry.status === "available" &&
    !entry.installable &&
    oauthReleaseStatus !== "ready"
  ) {
    fail(`${tag}: available entries must be installable or have release-ready OAuth`);
  }

  if (["npx", "uvx"].includes(entry?.mcp?.command)) {
    const spec = stdioPackageSpec(entry);
    if (!isPinnedPackageSpec(spec, entry.mcp.command)) {
      fail(`${tag}: stdio package must use an exact pinned version (got "${spec}")`);
    }
  }

  const expectedConfirmationCount = (entry.tools || []).filter(
    (tool) => tool?.requiresConfirmation,
  ).length;
  if (entry?.policySummary?.confirmationRequiredTools !== expectedConfirmationCount) {
    fail(
      `${tag}: policySummary.confirmationRequiredTools must equal ${expectedConfirmationCount}`,
    );
  }
  if (entry.status === "available" && !(entry.tools || []).length) {
    fail(`${tag}: available entries must declare at least one verified tool`);
  }
  if (
    entry.id === "workspace.sqlite" &&
    (entry.mcp?.args || []).includes("${WORKSPACE}")
  ) {
    fail(`${tag}: SQLite --db-path must resolve to a file inside the workspace, not the workspace directory`);
  }
}
if (!failed) console.log("  OK: toolkitId format, id/toolkitId uniqueness, category membership, trustLevel enum");

console.log(`[summary] ${registry.entries.length} entries, categories=${JSON.stringify(registry.categories)}`);
process.exit(failed ? 1 : 0);
