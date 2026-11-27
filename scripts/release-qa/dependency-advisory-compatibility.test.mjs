import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const builderRequire = createRequire(require.resolve("app-builder-lib"));
const universalRequire = createRequire(builderRequire.resolve("@electron/universal"));

test("packaging minimatch consumers retain file selection and universal allowlist behavior", () => {
  const { FileMatcher } = require("app-builder-lib/out/fileMatcher");
  const { hasMagic } = require("app-builder-lib/out/util/filter");
  const app = path.resolve("qa-application");
  const matcher = new FileMatcher(app, path.resolve("qa-output"), value => value,
    ["build/**/*", "!build/**/*.map", "electron/**/*"]);
  const filter = matcher.createFilter();
  const file = { isDirectory: () => false };
  const directory = { isDirectory: () => true };
  assert.equal(filter(path.join(app, "build"), directory), true);
  assert.equal(filter(path.join(app, "build/index.html"), file), true);
  assert.equal(filter(path.join(app, "build/static/中文.js"), file), true);
  assert.equal(filter(path.join(app, "build/static/index.js.map"), file), false);
  assert.equal(filter(path.join(app, "electron/main/index.js"), file), true);
  assert.equal(filter(path.join(app, "outside/private.json"), file), false);
  const { Minimatch } = builderRequire("minimatch");
  assert.equal(hasMagic(new Minimatch("plain.txt")), false);
  assert.equal(hasMagic(new Minimatch("**/*.js")), true);
  const { minimatch } = universalRequire("minimatch");
  assert.equal(minimatch("Contents/Resources/native/addon.node", "*.node", { matchBase: true }), true);
  assert.equal(minimatch("Contents/Resources/native/addon.dylib", "*.node", { matchBase: true }), false);
  assert.equal(minimatch("Contents/Frameworks/Helper.app/Contents/Info.plist", "**/Info.plist", { matchBase: true }), true);
});

test("both packaging minimatch copies bound globparts amplification and skip quadratic large-set deduplication", () => {
  // GHSA-g3hv-75wg-m249: repeated **/.. used to grow the first pass without
  // honoring an expansion bound, then feed every pair to the second pass.
  for (const owner of [builderRequire, universalRequire]) {
    const { Minimatch } = owner("minimatch");
    let expanded = 0;
    class Observed extends Minimatch {
      firstPhasePreProcess(parts) {
        const result = super.firstPhasePreProcess(parts);
        expanded = result.length;
        return result;
      }
    }
    new Observed("a/**/../".repeat(8) + "target", { optimizationLevel: 2, braceExpandMax: 16 });
    assert.ok(expanded <= 16, `preprocessing expanded ${expanded} patterns despite the bound`);
    const matcher = new Minimatch("*.js");
    let comparisons = 0;
    matcher.partsMatch = () => { comparisons += 1; return false; };
    const large = Array.from({ length: 1024 }, (_, i) => [String(i), "**", "target"]);
    assert.equal(matcher.secondPhasePreProcess(large), large);
    assert.equal(comparisons, 0);
    assert.equal(matcher.match("fixture.js"), true);
    assert.equal(matcher.match("fixture.txt"), false);
  }
});

test("serializer neutralizes script endings across function boundaries and retains worker options", () => {
  const serialize = require("serialize-javascript");
  function first() {}
  function second() {}
  first.toString = () => "function first(){ return 1 }//</script";
  second.toString = () => "function second(x){ return x } > <img src=x onerror=alert(1)>";
  const text = serialize({ nested: { first }, second }, { space: 2 });
  assert.doesNotMatch(text, /<\/script(?=$|[\t\n\f\r />])/i);
  assert.doesNotMatch(serialize("</script><img src=x>"), /<\/script/i);
  const options = {
    compress: { passes: 2 }, mangle: false,
    format: { comments: function keepLicense(_node, comment) { return /license/i.test(comment.value); } },
    pattern: /\.js$/i,
  };
  const restored = vm.runInNewContext(`(${serialize(options)})`);
  assert.equal(restored.compress.passes, 2);
  assert.equal(restored.mangle, false);
  assert.equal(restored.format.comments(null, { value: "LICENSE fixture" }), true);
  assert.equal(restored.format.comments(null, { value: "ordinary comment" }), false);
  assert.equal(restored.pattern.test("fixture.JS"), true);
});

const listen = server => new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve(server.address().port));
});
const close = server => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));

test("redirects strip cross-realm custom credentials while preserving same-origin requests", { timeout: 10000 }, async () => {
  // GHSA-mrwp-f3q8-3g9p: these two ephemeral servers are loopback-only.
  // No provider or real credential participates in the redirect boundary.
  const { http: redirects } = require("follow-redirects");
  const target = http.createServer((request, response) => response.end(JSON.stringify(request.headers)));
  const targetPort = await listen(target);
  let sourcePort;
  const source = http.createServer((request, response) => {
    if (request.url === "/same-target") return response.end(JSON.stringify(request.headers));
    response.writeHead(302, { location: request.url === "/same-source"
      ? `http://127.0.0.1:${sourcePort}/same-target`
      : `http://127.0.0.1:${targetPort}/target` });
    response.end();
  });
  try {
    sourcePort = await listen(source);
    const request = (pathname, headers, sensitiveHeaders) => new Promise((resolve, reject) => {
      const outgoing = redirects.get({ hostname: "127.0.0.1", port: sourcePort, path: pathname,
        headers, sensitiveHeaders }, response => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", chunk => { body += chunk; });
        response.on("error", reject);
        response.on("end", () => { try { resolve(JSON.parse(body)); } catch (error) { reject(error); } });
      });
      outgoing.on("error", reject);
      outgoing.setTimeout(3000, () => outgoing.destroy(new Error("loopback redirect test timed out")));
    });
    for (const crossRealm of [false, true]) {
      const sensitive = crossRealm ? vm.runInNewContext("['X-API-Key']") : ["X-API-Key"];
      assert.equal(Array.isArray(sensitive), true);
      assert.equal(sensitive instanceof Array, !crossRealm);
      for (const arrayHeaders of [false, true]) {
        const values = { "X-API-Key": "FAKE-REDIRECT-CREDENTIAL", "X-Harmless": "keep-me",
          Authorization: "Bearer fake-built-in", Cookie: "sid=fake-cookie" };
        const headers = arrayHeaders ? Object.entries(values).flat() : values;
        const foreign = await request("/foreign-source", headers, sensitive);
        assert.equal(foreign["x-api-key"], undefined);
        assert.equal(foreign.authorization, undefined);
        assert.equal(foreign.cookie, undefined);
        assert.equal(foreign["x-harmless"], "keep-me");
        const local = await request("/same-source", headers, sensitive);
        assert.equal(local["x-api-key"], values["X-API-Key"]);
        assert.equal(local.authorization, values.Authorization);
        assert.equal(local.cookie, values.Cookie);
      }
    }
  } finally {
    await Promise.all([close(source), close(target)]);
  }
});
