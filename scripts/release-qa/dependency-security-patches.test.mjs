import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import vm from "node:vm";
import test from "node:test";
import { AST_GUARD, PATCHES, patchSource, installPatches } from "./patch-security-dependencies.cjs";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "../..");
const readOriginal = (patch) => {
  const filename = path.join(root, "node_modules", patch.packageName, patch.file);
  const source = fs.readFileSync(filename, "utf8");
  return [...patch.replacements].reverse().reduce((text, [before, after]) => text.split(after).join(before), source);
};
function loadOriginal(patch) {
  const filename = path.join(root, "node_modules", patch.packageName, patch.file);
  const module = { exports: {} };
  vm.runInNewContext(readOriginal(patch), { module, exports: module.exports, require: createRequire(filename) });
  return module.exports;
}
function nestedAst(depth) {
  let node = { type: "text", value: "x" };
  for (let i = 0; i < depth; i++) node = { type: "root", nodes: [node] };
  return node;
}

test("upstream braces recursive walker reproduces the advisory", () => {
  const original = loadOriginal(PATCHES.find((p) => p.file === "lib/compile.js"));
  assert.throws(() => original(nestedAst(15000)), (error) => error.name === "RangeError" && /stack/i.test(error.message));
});

test("installed braces rejects nested strings and direct AST bypasses before recursion", () => {
  const braces = require("braces");
  for (const pattern of ["{".repeat(4000) + "a,b" + "}".repeat(4000), "(".repeat(4000) + "a" + ")".repeat(4000), "{".repeat(4000) + "a"]) {
    for (const action of [braces.compile, braces.expand, braces.stringify]) {
      assert.throws(() => action(pattern), { name: "SyntaxError", message: /safe nesting limit/ });
    }
  }
  for (const name of ["compile", "expand", "stringify"]) {
    const action = require(`braces/lib/${name}`);
    assert.throws(() => action(nestedAst(4000)), { name: "SyntaxError", message: /safe nesting limit/ });
    const cycle = { type: "root", nodes: [] }; cycle.nodes.push(cycle);
    assert.throws(() => action(cycle), /safe nesting limit/);
  }
  assert.deepEqual(braces.expand("src/{one,{two,three}}/*.{js,cjs}"), ["src/one/*.js", "src/one/*.cjs", "src/two/*.js", "src/two/*.cjs", "src/three/*.js", "src/three/*.cjs"]);
  assert.equal(braces.stringify('"' + "{".repeat(4000) + '"'), "{".repeat(4000));
});

test("upstream sprintf reproduces native precision failure; installed formatter bounds precision and padding", () => {
  const patch = PATCHES.find((p) => p.packageName === "sprintf-js");
  const original = loadOriginal(patch).sprintf;
  assert.throws(() => original("%.99999999f", 1.25), (error) => error.name === "RangeError");
  const { sprintf, vsprintf } = require("sprintf-js");
  for (const type of ["f", "e", "g"]) {
    assert.ok(sprintf(`%1$.999999999999999999999${type}`, 1.25).length <= 108);
    assert.ok(vsprintf(`%.999999999999999999999${type}`, [1.25]).length <= 108);
  }
  // This upstream grammar has no uppercase E/G conversion; preserve rejection.
  for (const type of ["E", "G"]) assert.throws(() => sprintf(`%.999999${type}`, 1.25), /unexpected placeholder/);
  assert.ok(sprintf("%999999999999999999999s", "x").length <= 65536);
  assert.equal(sprintf("%.0g", 12.5), "10");
  assert.equal(sprintf("%(name)s", { name: "PuPu" }), "PuPu");
  assert.equal(sprintf("%s %04d %.2f", "PuPu", 2, 1.25), "PuPu 0002 1.25");
});

test("bounded dependency patches are installed, idempotent, and fail closed on unknown bytes", () => {
  for (const patch of PATCHES) {
    const original = readOriginal(patch);
    const installed = fs.readFileSync(path.join(root, "node_modules", patch.packageName, patch.file), "utf8");
    assert.equal(installed, patchSource(original, patch));
    assert.equal(patchSource(installed, patch), installed);
    assert.throws(() => patchSource(original + "\n", patch), /Unrecognized/);
    if (patch.replacements.length > 1) assert.throws(() => patchSource(original.replace(...patch.replacements[0]), patch), /Unrecognized|Partially patched/);
  }
});

test("postinstall patches nested locked copies and rejects unreviewed package versions", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-nested-dependency-patch-"));
  const nested = "node_modules/tool/node_modules/braces";
  try {
    fs.writeFileSync(path.join(directory, "package-lock.json"), JSON.stringify({ packages: { [nested]: { version: "3.0.3" } } }));
    const packageRoot = path.join(directory, nested);
    fs.mkdirSync(path.join(packageRoot, "lib"), { recursive: true });
    fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({ version: "3.0.3" }));
    for (const patch of PATCHES.filter((p) => p.packageName === "braces")) fs.writeFileSync(path.join(packageRoot, patch.file), readOriginal(patch));
    installPatches(directory);
    assert.equal(fs.readFileSync(path.join(packageRoot, "lib/pupu-depth-guard.js"), "utf8"), AST_GUARD);
    for (const patch of PATCHES.filter((p) => p.packageName === "braces")) assert.equal(fs.readFileSync(path.join(packageRoot, patch.file), "utf8"), patchSource(readOriginal(patch), patch));
    installPatches(directory);
    fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({ version: "3.0.4" }));
    assert.throws(() => installPatches(directory), /Review braces 3.0.4/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("CRA middleware adaptation preserves order without wildcard source access", () => {
  process.env.NODE_ENV = "development";
  const options = require("react-scripts/config/webpackDevServer.config")(undefined, "127.0.0.1");
  assert.equal(options.allowedHosts, "auto");
  assert.equal(options.host, "127.0.0.1");
  assert.equal(options.headers?.["Access-Control-Allow-Origin"], undefined);
  assert.equal(options.https, undefined);
  assert.equal(options.server, "http");
  assert.equal(options.onBeforeSetupMiddleware, undefined);
  assert.equal(options.onAfterSetupMiddleware, undefined);
  const middlewares = options.setupMiddlewares([{ name: "host-header-check" }, { name: "cross-origin-header-check" }, { name: "webpack-dev-middleware" }], { app: {} });
  assert.deepEqual(middlewares.map((m) => m.name), ["host-header-check", "cross-origin-header-check", "pupu-eval-source-map", "webpack-dev-middleware", "pupu-served-path", "pupu-noop-service-worker"]);
});

test("real development server accepts local access and rejects foreign Host/Origin endpoints", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-secure-dev-server-"));
  const entry = path.join(directory, "entry.js");
  fs.writeFileSync(entry, 'console.log("LEGITIMATE_LOCAL_FIXTURE");');
  const webpack = require("webpack");
  const Server = require("webpack-dev-server");
  const compiler = webpack({ mode: "development", entry, output: { path: path.join(directory, "build"), filename: "fixture.js" }, infrastructureLogging: { level: "none" } });
  process.env.NODE_ENV = "development";
  const config = require("react-scripts/config/webpackDevServer.config")(undefined, "127.0.0.1");
  const server = new Server({ ...config, port: 0, host: "127.0.0.1", hot: false, client: false, webSocketServer: false, static: false, devMiddleware: { publicPath: "/", stats: "none" } }, compiler);
  try {
    await server.start();
    await new Promise((resolve) => server.middleware.waitUntilValid(resolve));
    const address = `http://127.0.0.1:${server.server.address().port}`;
    const local = await fetch(`${address}/fixture.js`);
    assert.equal(local.status, 200);
    assert.match(await local.text(), /LEGITIMATE_LOCAL_FIXTURE/);
    // Native request preserves Host/Sec-Fetch headers; fetch normalizes forbidden headers.
    const request = (pathname, headers) => new Promise((resolve, reject) => {
      http.get(`${address}${pathname}`, { headers }, (response) => {
        response.resume(); response.on("end", () => resolve(response));
      }).on("error", reject);
    });
    const hostileHost = await request("/fixture.js", { Host: "attacker.invalid" });
    assert.equal(hostileHost.statusCode, 403);
    const stats = server.middleware.context.stats;
    const moduleId = Array.from(stats.compilation.modules).find((module) => module.resource === fs.realpathSync(entry));
    assert.ok(moduleId, "real compiled entry module must exist");
    const sourcePath = `/__get-internal-source?fileName=${encodeURIComponent("webpack-internal:///" + stats.compilation.chunkGraph.getModuleId(moduleId))}`;
    const localSource = await fetch(`${address}${sourcePath}`);
    assert.equal(localSource.status, 200);
    assert.match(await localSource.text(), /LEGITIMATE_LOCAL_FIXTURE/);
    assert.equal((await request(sourcePath, { Host: "attacker.invalid" })).statusCode, 403);
    assert.equal((await request(sourcePath, { Origin: "http://attacker.invalid", "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "no-cors" })).statusCode, 403);
    const foreign = await request("/fixture.js", { Origin: "http://attacker.invalid", "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "no-cors" });
    assert.equal(foreign.statusCode, 403);
    assert.equal(foreign.headers["access-control-allow-origin"], undefined);
    const endpoint = await request("/webpack-dev-server/invalidate", { Origin: "http://attacker.invalid", "Sec-Fetch-Site": "cross-site" });
    assert.equal(endpoint.statusCode, 403);
    const subsequentLocal = await fetch(`${address}/fixture.js`);
    assert.equal(subsequentLocal.status, 200);
    assert.match(await subsequentLocal.text(), /LEGITIMATE_LOCAL_FIXTURE/);
  } finally {
    await server.stop();
    await new Promise((resolve) => compiler.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("locked runtime, owner overrides, and CI Node baseline stay on the secure compatible set", () => {
  const pkg = require("../../package.json");
  assert.equal(pkg.devDependencies.electron, "43.8.3");
  assert.equal(pkg.engines.node, ">=24.22.1 <25");
  assert.equal(pkg.devDependencies["@electron-internal/extract-zip"], "1.0.6");
  assert.equal(pkg.dependencies["react-spring"], undefined);
  assert.equal(pkg.dependencies["@react-spring/web"], "10.0.3");
  const workflows = path.join(root, ".github/workflows");
  for (const filename of fs.readdirSync(workflows)) {
    if (!filename.endsWith(".yml")) continue;
    for (const match of fs.readFileSync(path.join(workflows, filename), "utf8").matchAll(/node-version:\s*["']?(\d+)/g)) assert.equal(match[1], "24", filename);
  }
});
