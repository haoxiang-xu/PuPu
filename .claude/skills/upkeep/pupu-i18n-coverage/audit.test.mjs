import test from "node:test";
import assert from "node:assert/strict";
import { auditLocales } from "./audit.mjs";

const en = {
  settings: { title: "Settings", dev: "Dev" },
  memory: { last_n_turns: "Last N turns — {count}" },
};

test("detects missing, orphan, and placeholder mismatch per locale", () => {
  const locales = {
    de: {
      settings: { title: "Einstellungen", dev: "Dev", legacy: "Alt" }, // legacy = orphan
      memory: { last_n_turns: "Letzte Züge" }, // dropped {count} placeholder
    },
  };
  const code = { staticKeys: new Set(), dynamicCount: 0, literalKeys: new Set() };
  const r = auditLocales({ en, locales, code });
  assert.deepEqual(r.locales.de.missing, []);
  assert.deepEqual(r.locales.de.orphan, ["settings.legacy"]);
  assert.deepEqual(r.locales.de.placeholderMismatch, [
    { key: "memory.last_n_turns", en: ["count"], locale: [] },
  ]);
  assert.equal(r.locales.de.suspectedUntranslated, undefined); // strict off by default
});

test("missing keys are reported in en order", () => {
  const locales = { ja: { settings: { title: "設定" } } };
  const code = { staticKeys: new Set(), dynamicCount: 0, literalKeys: new Set() };
  const r = auditLocales({ en, locales, code });
  assert.deepEqual(r.locales.ja.missing, ["settings.dev", "memory.last_n_turns"]);
});

test("strict mode flags values byte-identical to English (translatable only)", () => {
  const locales = { fr: { settings: { title: "Settings", dev: "Dev" }, memory: { last_n_turns: "Last N turns — {count}" } } };
  const code = { staticKeys: new Set(), dynamicCount: 0, literalKeys: new Set() };
  const r = auditLocales({ en, locales, code, strict: true });
  assert.ok(r.locales.fr.suspectedUntranslated.includes("settings.title"));
  assert.ok(r.locales.fr.suspectedUntranslated.includes("memory.last_n_turns"));
});

test("code section: missingInEn (bug) and conservative deadKeys", () => {
  const locales = {};
  const code = {
    staticKeys: new Set(["settings.title", "settings.ghost"]), // ghost not in en -> bug
    dynamicCount: 4,
    literalKeys: new Set(["memory.last_n_turns"]), // referenced only as a literal, still alive
  };
  const r = auditLocales({ en, locales, code });
  assert.deepEqual(r.code.missingInEn, ["settings.ghost"]);
  assert.deepEqual(r.code.deadKeys, ["settings.dev"]); // title+last_n_turns referenced; dev is dead
  assert.equal(r.code.dynamicCount, 4);
  assert.match(r.code.note, /static analysis/);
});
