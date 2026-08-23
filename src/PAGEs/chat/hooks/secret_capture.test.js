/**
 * secret_capture pure-helper tests — syntax parsing, limits, marker building,
 * conservative unwrapped-credential heuristic, and the no-plaintext-in-
 * errors invariant.
 *
 * The scanner/gate-facing helpers (scanOutgoingSecretText, the range
 * appliers) are covered in secret_capture_scanner.test.js.
 */
import {
  SECRET_CAPTURE_TOTAL_VALUE_MAX_BYTES,
  buildSecretHandleMarker,
  detectLikelySecretAssignment,
  hasSecretCaptureSyntax,
  parseSecretCaptureBlocks,
  utf8ByteLength,
} from "./secret_capture";

const HANDLE = `pvh1_${"a".repeat(64)}`;

/* Convenience view over the offset-only parser: these tests care about
   label/value pairs, while the parser deliberately returns SPANS so the gate
   can rebuild the message by slicing rather than by searching for text. */
const capturesOf = (text) => {
  const parsed = parseSecretCaptureBlocks(text);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    captures: parsed.blocks.map((block) => ({
      label: block.label,
      value: text.slice(block.valueStart, block.valueEnd),
    })),
  };
};

describe("parseSecretCaptureBlocks", () => {
  test("plain text has no blocks", () => {
    expect(parseSecretCaptureBlocks("hello world")).toEqual({
      ok: true,
      blocks: [],
    });
  });

  test("captures a single wrapped secret and reports both spans", () => {
    const text = "use {{secret:API key}}sk-value-123{{/secret}} please";
    const parsed = parseSecretCaptureBlocks(text);
    expect(parsed.ok).toBe(true);
    expect(parsed.blocks).toHaveLength(1);
    const block = parsed.blocks[0];
    expect(block.label).toBe("API key");
    // Replacement span = the whole wrapper; value span = the value only.
    expect(text.slice(block.start, block.end)).toBe(
      "{{secret:API key}}sk-value-123{{/secret}}",
    );
    expect(text.slice(block.valueStart, block.valueEnd)).toBe("sk-value-123");
    expect(text.slice(0, block.start)).toBe("use ");
    expect(text.slice(block.end)).toBe(" please");
  });

  test("supports multiline values and multiple captures", () => {
    expect(
      capturesOf(
        "a {{secret:pem}}line1\nline2\nline3{{/secret}} b " +
          "{{secret:db pass}}p@ss{{/secret}} c",
      ).captures,
    ).toEqual([
      { label: "pem", value: "line1\nline2\nline3" },
      { label: "db pass", value: "p@ss" },
    ]);
  });

  test("NFC-normalizes and trims the label", () => {
    // "e" + combining acute accent → NFC "é"; padded with spaces.
    const parsed = capturesOf("{{secret:  clé API  }}value-1{{/secret}}");
    expect(parsed.ok).toBe(true);
    expect(parsed.captures[0].label).toBe("clé API");
  });

  test("rejects an unterminated block (fail closed)", () => {
    expect(
      parseSecretCaptureBlocks("{{secret:key}}value-without-close"),
    ).toEqual({ ok: false, code: "secret_capture_malformed" });
  });

  test("rejects a stray close tag", () => {
    expect(parseSecretCaptureBlocks("just text {{/secret}}").ok).toBe(false);
    expect(
      parseSecretCaptureBlocks("{{secret:a}}v{{/secret}} tail {{/secret}}").ok,
    ).toBe(false);
  });

  test("rejects an empty label and an oversized label", () => {
    expect(parseSecretCaptureBlocks("{{secret:   }}v{{/secret}}")).toEqual({
      ok: false,
      code: "secret_capture_invalid_label",
    });
    const longLabel = "x".repeat(121);
    expect(
      parseSecretCaptureBlocks(`{{secret:${longLabel}}}v{{/secret}}`),
    ).toEqual({ ok: false, code: "secret_capture_invalid_label" });
  });

  test("rejects a label with control characters", () => {
    expect(parseSecretCaptureBlocks("{{secret:a\tb}}v{{/secret}}")).toEqual({
      ok: false,
      code: "secret_capture_invalid_label",
    });
  });

  test("rejects an empty value", () => {
    expect(parseSecretCaptureBlocks("{{secret:key}}{{/secret}}")).toEqual({
      ok: false,
      code: "secret_capture_empty_value",
    });
  });

  test("enforces the 64KiB TOTAL value limit across captures", () => {
    const half = "a".repeat(SECRET_CAPTURE_TOTAL_VALUE_MAX_BYTES / 2);
    const okText = `{{secret:one}}${half}{{/secret}}{{secret:two}}${half}{{/secret}}`;
    expect(parseSecretCaptureBlocks(okText).ok).toBe(true);
    const overText = `{{secret:one}}${half}{{/secret}}{{secret:two}}${half}x{{/secret}}`;
    expect(parseSecretCaptureBlocks(overText)).toEqual({
      ok: false,
      code: "secret_capture_too_large",
    });
  });

  test("counts multibyte characters by UTF-8 bytes", () => {
    expect(utf8ByteLength("abc")).toBe(3);
    expect(utf8ByteLength("é")).toBe(2);
    expect(utf8ByteLength("中")).toBe(3);
    expect(utf8ByteLength("😀")).toBe(4);
  });
});

describe("redaction markers", () => {
  test("marker carries only label and handle, XML-escaped", () => {
    const marker = buildSecretHandleMarker('a"<b>&c', HANDLE);
    expect(marker).toBe(
      `<secret-handle label="a&quot;&lt;b&gt;&amp;c" handle="${HANDLE}"/>`,
    );
    expect(marker).not.toContain("value");
  });
});

describe("detectLikelySecretAssignment (conservative)", () => {
  test.each([
    ["password=hunter2secret99", true],
    ["api_key: abcd1234efgh5678", true],
    ['token="Zx9Yw8Vu7Tt6"', true],
    ["client_secret= n0tAPlaceholder99", true],
    ["here is sk-abcdefghij1234567890 inline", true],
    ["ghp_abcdefghijklmnopqrst123456 in a paste", true],
    ["AKIAIOSFODNN7EXAMPLE was leaked", true],
    ["-----BEGIN RSA PRIVATE KEY-----", true],
  ])("detects %s", (text, expected) => {
    expect(detectLikelySecretAssignment(text)).toBe(expected);
  });

  test.each([
    ["I forgot my password again, can you help?", false],
    ["the token bucket algorithm limits requests", false],
    ["set password=<your-password> in the config", false],
    ["export API_KEY=${MY_API_KEY}", false],
    ["password: changeme", false],
    ["api_key: your_key_here", false],
    ["token = process.env.TOKEN", false],
    ["password=short1", false],
    // letters-only value stays below the conservative bar
    ["password=correcthorsebattery", false],
    // ordinary long prose never triggers
    [
      "This is a long paragraph about authentication tokens and how " +
        "passwords should be stored using bcrypt with a decent cost factor.",
      false,
    ],
  ])("does not flag %s", (text, expected) => {
    expect(detectLikelySecretAssignment(text)).toBe(expected);
  });
});

describe("hasSecretCaptureSyntax", () => {
  test("detects open and close markers", () => {
    expect(hasSecretCaptureSyntax("{{secret:a}}v{{/secret}}")).toBe(true);
    expect(hasSecretCaptureSyntax("plain")).toBe(false);
    expect(hasSecretCaptureSyntax(null)).toBe(false);
  });
});
