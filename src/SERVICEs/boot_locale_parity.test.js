/* eslint-env jest */

/*
 * The boot gate is the one surface a user sees BEFORE anything else works, and
 * it is also the surface most likely to be shipped in English by accident: main
 * knows failure codes, not language, so every user-facing string here is a
 * locale lookup. A missing key degrades to the English fallback silently — this
 * guard is what makes that loud instead.
 */

import en from "../locales/en.json";
import zhCN from "../locales/zh-CN.json";
import zhTW from "../locales/zh-TW.json";
import ja from "../locales/ja.json";
import ko from "../locales/ko.json";
import es from "../locales/es.json";
import fr from "../locales/fr.json";
import de from "../locales/de.json";
import it from "../locales/it.json";
import ptBR from "../locales/pt-BR.json";
import ru from "../locales/ru.json";

const LOCALES = {
  en,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  ja,
  ko,
  es,
  fr,
  de,
  it,
  "pt-BR": ptBR,
  ru,
};

/* Read the emittable codes STRAIGHT FROM MAIN rather than transcribing them: a
   hand-copied list silently stops covering a code the day someone adds one.
   Requiring an Electron main module from a renderer test is established
   practice here — the src/electron/tests/** shims do exactly this. `unknown` is
   appended separately because it is the renderer's own fallback for an
   unrecognized code, not something main can emit. */
const {
  FAILURE_CODES,
} = require("../../electron/main/services/boot_readiness/service");

const FAILURE_KEYS = [...FAILURE_CODES, "unknown"];

const FLAT_KEYS = [
  "starting_runtime",
  "starting_mcp",
  "taking_longer",
  "click_to_start",
  "progress_label",
  "retry",
  "retrying",
];

describe("boot gate locale parity", () => {
  test("all 11 locales are covered", () => {
    expect(Object.keys(LOCALES)).toHaveLength(11);
  });

  test("the failure key list really comes from main, not a transcription", () => {
    // If the export is ever renamed or dropped, fail here with a clear reason
    // rather than silently degrading to an empty (vacuously passing) list.
    expect(Array.isArray(FAILURE_CODES)).toBe(true);
    expect(FAILURE_CODES.length).toBeGreaterThan(0);
    expect(FAILURE_KEYS).toContain("unknown");
  });

  Object.entries(LOCALES).forEach(([name, messages]) => {
    test(`${name} defines every boot.* string`, () => {
      const boot = messages.boot;
      expect(boot).toBeDefined();

      FLAT_KEYS.forEach((key) => {
        expect(typeof boot[key]).toBe("string");
        expect(boot[key].trim().length).toBeGreaterThan(0);
      });

      FAILURE_KEYS.forEach((key) => {
        expect(typeof boot.failure?.[key]).toBe("string");
        expect(boot.failure[key].trim().length).toBeGreaterThan(0);
      });
    });
  });

  test("no locale carries a boot key English does not define", () => {
    // Catches a stray key that would never be read, and a rename applied to
    // only some files.
    const shape = (boot) =>
      [
        ...Object.keys(boot).filter((k) => k !== "failure"),
        ...Object.keys(boot.failure || {}).map((k) => `failure.${k}`),
      ].sort();
    const expected = shape(en.boot);
    Object.entries(LOCALES).forEach(([name, messages]) => {
      expect({ name, shape: shape(messages.boot) }).toEqual({
        name,
        shape: expected,
      });
    });
  });

  test("non-English locales are actually translated, not copy-pasted English", () => {
    // "Plugins" is a product noun several locales legitimately keep, so only
    // the long-form failure prose is checked here.
    const untranslated = [];
    Object.entries(LOCALES).forEach(([name, messages]) => {
      if (name === "en") return;
      FAILURE_KEYS.forEach((key) => {
        if (messages.boot.failure[key] === en.boot.failure[key]) {
          untranslated.push(`${name}.failure.${key}`);
        }
      });
    });
    expect(untranslated).toEqual([]);
  });
});
