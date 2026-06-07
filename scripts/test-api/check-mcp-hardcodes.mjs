#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const REGISTRY_PATH = resolve(ROOT, "src/SERVICEs/mcp_toolkit_registry.json");
const REGISTRY = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));

const SEARCH_ROOTS = [
  "src/SERVICEs",
  "src/COMPONENTs/toolkit",
  "src/COMPONENTs/settings/local_storage/components",
  "src/COMPONENTs/chat-input",
  "src/COMPONENTs/agents",
  "unchain_runtime/server/mcp_registry.py",
  "unchain_runtime/server/mcp_toolkits.py",
  "unchain_runtime/server/mcp_oauth.py",
  "unchain_runtime/server/mcp_oauth_apps.py",
  "unchain_runtime/server/mcp_external_registries.py",
  "unchain_runtime/server/mcp_secrets.py",
  "unchain_runtime/server/route_mcp.py",
  "scripts/test-api",
  "electron",
];

const ALLOWED_PATH_PARTS = [
  `${sep}tests${sep}`,
  `${sep}docs${sep}`,
  `${sep}node_modules${sep}`,
  `${sep}build${sep}`,
  `${sep}dist${sep}`,
  `${sep}__pycache__${sep}`,
];

const ALLOWED_FILE_PATTERNS = [
  /\.test\.[cm]?[jt]sx?$/,
  /\.test\.mjs$/,
  /test_.*\.py$/,
  /mcp_toolkit_registry\.json$/,
  /check-mcp-hardcodes\.mjs$/,
];

const PRODUCT_FILE_PATTERNS = [
  /\.[cm]?[jt]sx?$/,
  /\.mjs$/,
  /\.py$/,
  /\.cjs$/,
];

const addToken = (tokens, value) => {
  const clean = String(value || "").trim();
  if (clean.length >= 8) tokens.add(clean);
};

const collectEndpointTokens = (tokens, oauth = {}) => {
  for (const key of [
    "mcpUrl",
    "protectedResourceMetadataUrl",
    "authorizationServerMetadataUrl",
    "authorizationEndpoint",
    "tokenEndpoint",
    "registrationEndpoint",
  ]) {
    addToken(tokens, oauth[key]);
  }
};

const collectMetadataTokens = (tokens, metadata = {}) => {
  addToken(tokens, metadata?.request?.url);
  for (const value of Object.values(metadata?.request?.headers || {})) {
    addToken(tokens, value);
  }
  for (const selector of Object.values(metadata?.fields || {})) {
    const clean = String(selector || "").trim();
    if (clean.includes(".") || clean.includes("_")) addToken(tokens, clean);
  }
  const iconSelector = String(metadata?.icon?.urlPath || "").trim();
  if (iconSelector.includes(".") || iconSelector.includes("_")) {
    addToken(tokens, iconSelector);
  }
};

const registryTokens = () => {
  const tokens = new Set();
  for (const entry of REGISTRY.entries || []) {
    addToken(tokens, entry.id);
    addToken(tokens, entry.toolkitId);
    addToken(tokens, entry?.mcp?.url);
    for (const secret of entry.secrets || []) {
      addToken(tokens, secret.key);
    }
    for (const header of entry?.mcp?.headers || []) {
      addToken(tokens, header.valueFromSecret || header.value_from_secret);
    }
    collectEndpointTokens(tokens, entry?.auth?.oauth || {});
    collectMetadataTokens(tokens, entry?.metadata || {});
  }
  return [...tokens].sort();
};

const isAllowed = (absPath) => {
  if (ALLOWED_PATH_PARTS.some((part) => absPath.includes(part))) return true;
  return ALLOWED_FILE_PATTERNS.some((pattern) => pattern.test(absPath));
};

const isProductFile = (absPath) =>
  PRODUCT_FILE_PATTERNS.some((pattern) => pattern.test(absPath));

const walk = (dir, files = []) => {
  for (const name of readdirSync(dir)) {
    const absPath = resolve(dir, name);
    const stat = statSync(absPath);
    if (stat.isDirectory()) {
      if (!isAllowed(`${absPath}${sep}`)) walk(absPath, files);
    } else if (isProductFile(absPath) && !isAllowed(absPath)) {
      files.push(absPath);
    }
  }
  return files;
};

const files = SEARCH_ROOTS.flatMap((root) => {
  const absRoot = resolve(ROOT, root);
  const stat = statSync(absRoot);
  if (stat.isDirectory()) return walk(absRoot);
  return isProductFile(absRoot) && !isAllowed(absRoot) ? [absRoot] : [];
});

const tokens = registryTokens();
const violations = [];
for (const file of files) {
  const content = readFileSync(file, "utf8");
  for (const token of tokens) {
    const index = content.indexOf(token);
    if (index === -1) continue;
    const before = content.slice(0, index);
    const line = before.split(/\r?\n/).length;
    violations.push({
      file: relative(ROOT, file),
      line,
      token,
    });
  }
}

if (violations.length) {
  console.error("Curated MCP registry tokens must live in mcp_toolkit_registry.json.");
  for (const violation of violations) {
    console.error(`${violation.file}:${violation.line} contains ${violation.token}`);
  }
  process.exit(1);
}

console.log(`No curated MCP hardcodes found in ${files.length} product files.`);
