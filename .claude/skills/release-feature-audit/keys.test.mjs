import test from "node:test";
import assert from "node:assert/strict";
import { flattenKeys, extractPlaceholders } from "./keys.mjs";

test("flattenKeys flattens nested string leaves in source order", () => {
  const obj = {
    settings: { title: "Settings", dev: "Dev" },
    appearance: { theme_light: "Light" },
  };
  assert.deepEqual(flattenKeys(obj), {
    "settings.title": "Settings",
    "settings.dev": "Dev",
    "appearance.theme_light": "Light",
  });
});

test("flattenKeys ignores non-string leaves and handles empty/null", () => {
  assert.deepEqual(flattenKeys({ a: 1, b: "x", c: null }), { b: "x" });
  assert.deepEqual(flattenKeys({}), {});
  assert.deepEqual(flattenKeys(null), {});
});

test("extractPlaceholders returns the set of {token} names", () => {
  assert.deepEqual([...extractPlaceholders("Last N turns — {count}")], ["count"]);
  assert.deepEqual(
    [...extractPlaceholders("The saved {label} key for {provider}")].sort(),
    ["label", "provider"],
  );
  assert.equal(extractPlaceholders("no tokens").size, 0);
  assert.equal(extractPlaceholders(undefined).size, 0);
});

import { mergeLocale, serializeLocale } from "./keys.mjs";

test("mergeLocale fills missing keys from translations in en order, keeps existing", () => {
  const en = {
    settings: { title: "Settings", dev: "Dev" },
    appearance: { language: "Language" },
  };
  const locale = {
    settings: { title: "设置" }, // missing settings.dev
    // appearance entirely missing
  };
  const translations = {
    "settings.dev": "开发",
    "appearance.language": "语言",
  };
  assert.deepEqual(mergeLocale(en, locale, translations), {
    settings: { title: "设置", dev: "开发" },
    appearance: { language: "语言" },
  });
});

test("mergeLocale never overwrites an existing value and preserves orphan keys", () => {
  const en = { a: { x: "X" } };
  const locale = { a: { x: "已译", legacy: "残留" } }; // legacy is orphan, x already translated
  const translations = { "a.x": "SHOULD_NOT_APPLY" };
  assert.deepEqual(mergeLocale(en, locale, translations), {
    a: { x: "已译", legacy: "残留" },
  });
});

test("mergeLocale leaves a key absent when neither locale nor translations have it", () => {
  const en = { a: "A", b: "B" };
  const locale = { a: "甲" };
  assert.deepEqual(mergeLocale(en, locale, {}), { a: "甲" });
});

test("serializeLocale uses 2-space indent and a trailing newline", () => {
  assert.equal(serializeLocale({ a: { b: "c" } }), '{\n  "a": {\n    "b": "c"\n  }\n}\n');
});
