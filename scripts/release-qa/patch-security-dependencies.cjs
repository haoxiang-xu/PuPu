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

function assertFileIdentity(filename, fd) {
  const opened = fs.fstatSync(fd, { bigint: true });
  let current;
  try { current = fs.lstatSync(filename, { bigint: true }); }
  catch (cause) {
    if (cause.code !== "ENOENT") throw cause;
    const error = new Error(`Dependency patch file identity disappeared: ${filename}`, { cause });
    error.code = "EPATCH_IDENTITY";
    throw error;
  }
  if (!opened.isFile() || !current.isFile() || current.isSymbolicLink()) {
    throw new Error(`Dependency patch requires a regular non-symbolic file: ${filename}`);
  }
  if (opened.dev !== current.dev || opened.ino !== current.ino) {
    const error = new Error(`Dependency patch file identity changed: ${filename}`);
    error.code = "EPATCH_IDENTITY";
    throw error;
  }
}

function openRegularFile(filename, access) {
  // No truncation: validate the opened object before reading or changing bytes.
  // NONBLOCK also avoids hanging on a substituted FIFO before fstat rejects it.
  const fd = fs.openSync(filename, access | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  try {
    assertFileIdentity(filename, fd);
    return fd;
  } catch (error) {
    fs.closeSync(fd);
    throw error;
  }
}

function readRegularFile(filename) {
  const fd = openRegularFile(filename, fs.constants.O_RDONLY);
  try {
    const source = fs.readFileSync(fd, "utf8");
    assertFileIdentity(filename, fd);
    return source;
  } finally { fs.closeSync(fd); }
}

function writeCompleteFile(fd, source) {
  const bytes = Buffer.from(source, "utf8");
  let offset = 0;
  while (offset < bytes.length) {
    const written = fs.writeSync(fd, bytes, offset, bytes.length - offset, offset);
    if (!Number.isInteger(written) || written <= 0 || written > bytes.length - offset) {
      throw new Error("Dependency patch write made no valid progress");
    }
    offset += written;
  }
  fs.ftruncateSync(fd, bytes.length);
}

function patchFile(filename, patch) {
  const fd = openRegularFile(filename, fs.constants.O_RDWR);
  try {
    const source = fs.readFileSync(fd, "utf8");
    assertFileIdentity(filename, fd);
    const patched = patchSource(source, patch);
    if (source !== patched) {
      writeCompleteFile(fd, patched);
      assertFileIdentity(filename, fd);
    }
  } finally { fs.closeSync(fd); }
}

function ensureGuardFile(filename) {
  let fd;
  try {
    // A winning racer, including a symlink, must never be overwritten.
    fd = fs.openSync(filename, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o644);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    if (readRegularFile(filename) !== AST_GUARD) {
      throw new Error("Unrecognized braces nesting guard; reinstall dependencies");
    }
    return;
  }
  try {
    assertFileIdentity(filename, fd);
    writeCompleteFile(fd, AST_GUARD);
    assertFileIdentity(filename, fd);
  } finally { fs.closeSync(fd); }
}

function installPatches(root = path.resolve(__dirname, "../..")) {
  const packages = JSON.parse(readRegularFile(path.join(root, "package-lock.json"))).packages;
  const installedRoots = (name) => Object.keys(packages)
    .filter((key) => key === `node_modules/${name}` || key.endsWith(`/node_modules/${name}`))
    .map((key) => path.join(root, key));
  const guardRoots = new Set();
  for (const patch of PATCHES) {
    for (const packageRoot of installedRoots(patch.packageName)) {
      const metadataPath = path.join(packageRoot, "package.json");
      let metadata;
      try { metadata = readRegularFile(metadataPath); }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        // npm --omit=dev may omit the entire package, never half an install.
        try { fs.lstatSync(packageRoot); }
        catch (missing) { if (missing.code === "ENOENT") continue; throw missing; }
        throw error;
      }
      const version = JSON.parse(metadata).version;
      if (version !== patch.version) throw new Error(`Review ${patch.packageName} ${version} before applying security patch`);
      const filename = path.join(packageRoot, patch.file);
      patchFile(filename, patch);
      if (patch.packageName === "braces") guardRoots.add(packageRoot);
    }
  }
  for (const packageRoot of guardRoots) {
    ensureGuardFile(path.join(packageRoot, "lib/pupu-depth-guard.js"));
  }
  console.log("[dependency-security] Bounded upstream security and compatibility patches verified");
}

module.exports = { AST_GUARD, PATCHES, patchSource, installPatches };
if (require.main === module) installPatches();
