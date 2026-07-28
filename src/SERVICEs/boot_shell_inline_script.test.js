/* eslint-env jest */

/*
 * public/index.html's inline <script> is the S1 static shell's palette
 * reader (see the boot-loading-gate design doc). It is plain HTML, outside
 * CRA's jest testMatch, so this test extracts the script body straight out
 * of the template and executes it against a jsdom document/localStorage to
 * verify it behaves per spec: applies a well-formed cache, and silently
 * no-ops (never throws) on missing/malformed/wrong-shape data.
 */

const fs = require("fs");
const path = require("path");

const INDEX_HTML_PATH = path.resolve(__dirname, "../../public/index.html");
const BOOT_PALETTE_KEY = "pupu_boot_palette";

const extractInlineScript = () => {
  const html = fs.readFileSync(INDEX_HTML_PATH, "utf-8");
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error("boot palette inline <script> not found in public/index.html");
  }
  return match[1];
};

const runInlineScript = () => {
  // eslint-disable-next-line no-new-func
  const fn = new Function(extractInlineScript());
  fn();
};

describe("public/index.html boot palette inline script", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
    window.localStorage.clear();
  });

  test("script is present in the template", () => {
    expect(() => extractInlineScript()).not.toThrow();
  });

  test("applies a well-formed cached palette as CSS custom properties", () => {
    window.localStorage.setItem(
      BOOT_PALETTE_KEY,
      JSON.stringify({
        background: "#111111",
        text: "#eeeeee",
        textMuted: "#999999",
        accent: "#38bdf8",
      }),
    );

    runInlineScript();

    const style = document.documentElement.style;
    expect(style.getPropertyValue("--boot-bg")).toBe("#111111");
    expect(style.getPropertyValue("--boot-fg")).toBe("#eeeeee");
    expect(style.getPropertyValue("--boot-fg-muted")).toBe("#999999");
    expect(style.getPropertyValue("--boot-accent")).toBe("#38bdf8");
  });

  test("no cache present: does not throw and sets no vars (today's dark-default fallback)", () => {
    expect(() => runInlineScript()).not.toThrow();
    expect(document.documentElement.style.getPropertyValue("--boot-bg")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--boot-accent")).toBe("");
  });

  test("malformed JSON in cache is caught and ignored, not thrown", () => {
    window.localStorage.setItem(BOOT_PALETTE_KEY, "{not valid json");
    expect(() => runInlineScript()).not.toThrow();
    expect(document.documentElement.style.getPropertyValue("--boot-bg")).toBe("");
  });

  test("non-object JSON (string/number/array) is ignored", () => {
    window.localStorage.setItem(BOOT_PALETTE_KEY, JSON.stringify("just a string"));
    expect(() => runInlineScript()).not.toThrow();
    expect(document.documentElement.style.getPropertyValue("--boot-bg")).toBe("");

    window.localStorage.setItem(BOOT_PALETTE_KEY, JSON.stringify(42));
    expect(() => runInlineScript()).not.toThrow();
    expect(document.documentElement.style.getPropertyValue("--boot-bg")).toBe("");
  });

  test("partial palette only sets the fields present", () => {
    window.localStorage.setItem(
      BOOT_PALETTE_KEY,
      JSON.stringify({ accent: "#65c466" }),
    );

    runInlineScript();

    expect(document.documentElement.style.getPropertyValue("--boot-accent")).toBe(
      "#65c466",
    );
    expect(document.documentElement.style.getPropertyValue("--boot-bg")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--boot-fg")).toBe("");
  });

  test("non-string field values (wrong shape) are ignored per field", () => {
    window.localStorage.setItem(
      BOOT_PALETTE_KEY,
      JSON.stringify({ background: 123, text: null, accent: "#38bdf8" }),
    );

    runInlineScript();

    expect(document.documentElement.style.getPropertyValue("--boot-bg")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--boot-fg")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--boot-accent")).toBe(
      "#38bdf8",
    );
  });
});
