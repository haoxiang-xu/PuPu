import test from "node:test";
import assert from "node:assert/strict";
import { scanSource, mergeScans } from "./scan.mjs";

test("scanSource extracts static t() keys from single and double quotes", () => {
  const src = `const a = t("appearance.title"); const b = t('memory.last_n_turns', { count });`;
  const r = scanSource(src);
  assert.deepEqual([...r.staticKeys].sort(), ["appearance.title", "memory.last_n_turns"]);
});

test("scanSource counts dynamic t() calls (variable / template-literal args)", () => {
  const src = "t(s.labelKey); t(key); t(`a.${x}`); t(\"static.one\");";
  const r = scanSource(src);
  assert.equal(r.dynamicCount, 3);
  assert.deepEqual([...r.staticKeys], ["static.one"]);
});

test("scanSource collects dotted string literals anywhere (for conservative dead-key check)", () => {
  const src = `const SECTIONS = [{ labelKey: "toolkit.web" }, { labelKey: "toolkit.fs" }];`;
  const r = scanSource(src);
  assert.deepEqual([...r.literalKeys].sort(), ["toolkit.fs", "toolkit.web"]);
});

test("scanSource ignores t-suffixed identifiers like print(", () => {
  const r = scanSource("print('appearance.title'); format('x.y');");
  assert.equal(r.staticKeys.size, 0);
});

test("mergeScans unions keys and sums dynamic counts", () => {
  const merged = mergeScans([
    { staticKeys: new Set(["a.b"]), dynamicCount: 1, literalKeys: new Set(["a.b"]) },
    { staticKeys: new Set(["c.d"]), dynamicCount: 2, literalKeys: new Set(["e.f"]) },
  ]);
  assert.deepEqual([...merged.staticKeys].sort(), ["a.b", "c.d"]);
  assert.deepEqual([...merged.literalKeys].sort(), ["a.b", "e.f"]);
  assert.equal(merged.dynamicCount, 3);
});
