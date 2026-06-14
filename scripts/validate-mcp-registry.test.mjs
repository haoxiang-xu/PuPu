import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const validator = path.join(here, "validate-mcp-registry.cjs");
const run = (arg) =>
  spawnSync("node", arg ? [validator, arg] : [validator], { encoding: "utf8" });

test("passes on the real in-repo registry", () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr);
});

test("fails on a registry with an illegal trustLevel", () => {
  const r = run(path.join(here, "fixtures", "registry-bad-trustlevel.json"));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /trustLevel "totally-bogus" not in/);
});
