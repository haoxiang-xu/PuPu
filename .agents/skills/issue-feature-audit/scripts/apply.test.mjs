import test from "node:test";
import assert from "node:assert/strict";
import { applyTranslations } from "./apply.mjs";

test("applyTranslations inserts missing keys in en order, existing untouched", () => {
  const en = { a: { x: "X", y: "Y" }, b: "B" };
  const locale = { a: { x: "甲X" } }; // missing a.y and b
  const translations = { "a.y": "甲Y", "b": "乙" };
  assert.deepEqual(applyTranslations({ en, locale, translations }), {
    a: { x: "甲X", y: "甲Y" },
    b: "乙",
  });
});

test("applyTranslations preserves placeholders verbatim (writer does not interpolate)", () => {
  const en = { m: { t: "Last N turns — {count}" } };
  const locale = {};
  const translations = { "m.t": "最近 {count} 轮" };
  assert.deepEqual(applyTranslations({ en, locale, translations }), {
    m: { t: "最近 {count} 轮" },
  });
});

test("applyTranslations refuses to overwrite an existing value", () => {
  const en = { a: "A" };
  const locale = { a: "已译" };
  assert.deepEqual(applyTranslations({ en, locale, translations: { a: "NEW" } }), { a: "已译" });
});
