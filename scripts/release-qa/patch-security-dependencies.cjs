// Bounded compatibility/security fixes for upstream packages without a release.
// Reject unexpected package versions, partial patches, and changed source bytes.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const digest = (source) => createHash("sha256").update(source).digest("hex");
const AST_GUARD = `'use strict';
module.exports = function assertSafeAst(ast) {
  const pending = [[ast, 0]];
  const seen = new Set();
  let count = 0;
  while (pending.length) {
    const [node, depth] = pending.pop();
    if (!node || typeof node !== 'object') continue;
    if (depth > 128 || ++count > 65536 || seen.has(node)) {
      throw new SyntaxError('Brace pattern exceeds safe nesting limit');
    }
    seen.add(node);
    if (Array.isArray(node.nodes)) {
      for (const child of node.nodes) pending.push([child, depth + 1]);
    }
  }
};
`;

const PATCHES = [
  {
    packageName: "braces", version: "3.0.3", file: "lib/parse.js",
    sha256: "e572166565f15fa6ad9865ae49d678218e32aabfd1b3720f6d0d43d39800d310",
    replacements: [["      stack.push(block);", "      if (stack.length >= 128) throw new SyntaxError('Brace pattern exceeds safe nesting limit');\n      stack.push(block);"]],
  },
  ...[
    ["compile", "dc98f22eee3d511785d92a00758d5f0d48efed5f5813bdecc2de430c529b5c9f", "const compile = (ast, options = {}) => {"],
    ["expand", "41ccc196ebfa7b7781a634e721eb744e4e7bcb54cba427a7e3d6806a1b9e58f7", "const expand = (ast, options = {}) => {"],
    ["stringify", "379f22d77bfa1478341ccd49c5e4267464aabcbba03558bab332aac23fc6f23a", "module.exports = (ast, options = {}) => {"],
  ].map(([name, sha256, entry]) => ({
    packageName: "braces", version: "3.0.3", file: `lib/${name}.js`, sha256,
    replacements: [[entry, `${entry}\n  require('./pupu-depth-guard')(ast);`]],
  })),
  {
    packageName: "sprintf-js", version: "1.1.3", file: "src/sprintf.js",
    sha256: "95add43f116385be221745307fae02d06751b01d4f939df1debb17dbe2ebf4eb",
    replacements: [[
      "                ph = parse_tree[i] // convenience purposes only",
      "                ph = parse_tree[i] // convenience purposes only\n" +
      "                // Bound attacker-controlled precision and padding before native formatters.\n" +
      "                if (ph.width) ph.width = String(Math.min(Number(ph.width), 65536))\n" +
      "                if (ph.precision) {\n" +
      "                    var precisionLimit = /[efg]/.test(ph.type) ? 100 : 65536\n" +
      "                    ph.precision = String(Math.max(ph.type === 'g' ? 1 : 0, Math.min(Number(ph.precision), precisionLimit)))\n" +
      "                }",
    ]],
  },
  {
    packageName: "react-scripts", version: "5.0.1", file: "config/webpackDevServer.config.js",
    sha256: "daa396142f04f2065bd516119f02406b3a1b12474c95f601422223f72fc6b0c9",
    replacements: [
      ["const host = process.env.HOST || '0.0.0.0';", "const host = process.env.HOST || '127.0.0.1';"],
      ["allowedHosts: disableFirewall ? 'all' : [allowedHost],", "allowedHosts: 'auto',"],
      ["    headers: {\n      'Access-Control-Allow-Origin': '*',\n      'Access-Control-Allow-Methods': '*',\n      'Access-Control-Allow-Headers': '*',\n    },", "    // Development source must remain same-origin; never grant wildcard CORS."],
      ["    https: getHttpsConfig(),", "    server: (() => { const options = getHttpsConfig(); return options ? { type: 'https', options } : 'http'; })(),"],
      ["    onBeforeSetupMiddleware(devServer) {", "    setupMiddlewares(middlewares, devServer) {"],
      ["      devServer.app.use(evalSourceMapMiddleware(devServer));", "      // Keep WDS Host/Origin guards ahead of every source-producing handler.\n      const sourceIndex = middlewares.findIndex((middleware) => middleware.name === 'webpack-dev-middleware');\n      const sourceServer = { get _stats() { return devServer.middleware.context.stats; } };\n      middlewares.splice(sourceIndex < 0 ? middlewares.length : sourceIndex, 0, { name: 'pupu-eval-source-map', middleware: evalSourceMapMiddleware(sourceServer) });"],
      ["    },\n    onAfterSetupMiddleware(devServer) {", "      // WDS 5 appends redirect/service-worker handlers after its built-in middleware."],
      ["      devServer.app.use(redirectServedPath(paths.publicUrlOrPath));", "      middlewares.push({ name: 'pupu-served-path', middleware: redirectServedPath(paths.publicUrlOrPath) });"],
      ["      devServer.app.use(noopServiceWorkerMiddleware(paths.publicUrlOrPath));", "      middlewares.push({ name: 'pupu-noop-service-worker', middleware: noopServiceWorkerMiddleware(paths.publicUrlOrPath) });\n      return middlewares;"],
    ],
  },
];

function patchSource(source, patch) {
  const replace = (text, from, to) => text.split(from).join(to);
  const original = [...patch.replacements].reverse().reduce((text, [before, after]) =>
    after ? replace(text, after, before) : text, source);
  if (digest(original) !== patch.sha256) {
    throw new Error(`Unrecognized ${patch.packageName}/${patch.file} bytes; review dependency security patch`);
  }
  const patched = patch.replacements.reduce((text, [before, after]) => replace(text, before, after), original);
  if (source !== original && source !== patched) {
    throw new Error(`Partially patched ${patch.packageName}/${patch.file}; reinstall dependencies`);
  }
  return patched;
}

function installPatches(root = path.resolve(__dirname, "../..")) {
  const packages = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8")).packages;
  const installedRoots = (name) => Object.keys(packages)
    .filter((key) => key === `node_modules/${name}` || key.endsWith(`/node_modules/${name}`))
    .map((key) => path.join(root, key));
  for (const patch of PATCHES) {
    for (const packageRoot of installedRoots(patch.packageName)) {
      const metadataPath = path.join(packageRoot, "package.json");
      if (!fs.existsSync(metadataPath)) continue; // npm --omit=dev may omit tooling.
      const version = JSON.parse(fs.readFileSync(metadataPath, "utf8")).version;
      if (version !== patch.version) throw new Error(`Review ${patch.packageName} ${version} before applying security patch`);
      const filename = path.join(packageRoot, patch.file);
      const source = fs.readFileSync(filename, "utf8");
      const patched = patchSource(source, patch);
      if (source !== patched) fs.writeFileSync(filename, patched);
    }
  }
  for (const packageRoot of installedRoots("braces")) {
    const guardPath = path.join(packageRoot, "lib/pupu-depth-guard.js");
    if (!fs.existsSync(path.dirname(guardPath))) continue;
    if (fs.existsSync(guardPath) && fs.readFileSync(guardPath, "utf8") !== AST_GUARD) {
      throw new Error("Unrecognized braces nesting guard; reinstall dependencies");
    }
    if (!fs.existsSync(guardPath)) fs.writeFileSync(guardPath, AST_GUARD);
  }
  console.log("[dependency-security] Bounded upstream security and compatibility patches verified");
}

module.exports = { AST_GUARD, PATCHES, patchSource, installPatches };
if (require.main === module) installPatches();
