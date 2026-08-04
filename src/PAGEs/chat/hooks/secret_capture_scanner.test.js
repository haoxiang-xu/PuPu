/**
 * Memory V2 P0 secret gate — precise range scanner.
 *
 * These tests exist to lock the property the whole gate rests on: every
 * candidate's [start, end) is EXACT, derived arithmetically from the match
 * offset rather than by searching for the value's text afterwards. The
 * "duplicate value" cases below are the ones that would silently pass with an
 * indexOf/split-join implementation while redacting the wrong span.
 */
import {
  SECRET_CANDIDATE_MAX,
  applySecretHandleRanges,
  applySecretPlainRanges,
  detectLikelySecretAssignment,
  extractSecretCandidateValues,
  normalizeSecretLabel,
  scanOutgoingSecretText,
} from "./secret_capture";

const HANDLE = (n) => `pvh1_${String(n).repeat(64).slice(0, 64)}`;

/* Every candidate's range must slice back to what the rule claims it found. */
const sliceAll = (text, scan) =>
  scan.candidates.map((candidate) => text.slice(candidate.start, candidate.end));

describe("scanOutgoingSecretText — ranges", () => {
  test("clean prose yields no candidates", () => {
    const scan = scanOutgoingSecretText(
      "Please remember to rotate the password policy next quarter.",
    );
    expect(scan).toEqual({ ok: true, candidates: [] });
  });

  test("assignment captures ONLY the value, not the key or separator", () => {
    const text = "use api_key=abcd1234efgh please";
    const scan = scanOutgoingSecretText(text);
    expect(scan.ok).toBe(true);
    expect(sliceAll(text, scan)).toEqual(["abcd1234efgh"]);
    expect(scan.candidates[0].kind).toBe("assignment");
    expect(scan.candidates[0].label).toBe("API key");
  });

  test("quotes are excluded from the range", () => {
    const text = 'config: { "password": "hunter2abc999" }';
    const scan = scanOutgoingSecretText(text);
    expect(sliceAll(text, scan)).toEqual(["hunter2abc999"]);
    expect(scan.candidates[0].label).toBe("Password");
  });

  test("trailing sentence punctuation is excluded from the range", () => {
    const text = "the token=abcd1234efgh. Thanks!";
    const scan = scanOutgoingSecretText(text);
    expect(sliceAll(text, scan)).toEqual(["abcd1234efgh"]);
  });

  test("a value that also appears elsewhere is located by offset, not by search", () => {
    // The literal `abcd1234efgh` appears BEFORE the assignment as prose. A
    // search-based implementation would redact the prose copy and leave the
    // real credential in place.
    const text = "abcd1234efgh is not the key; the real api_key=abcd1234efgh";
    const scan = scanOutgoingSecretText(text);
    expect(scan.candidates).toHaveLength(1);
    expect(scan.candidates[0].start).toBe(text.lastIndexOf("abcd1234efgh"));
    expect(scan.candidates[0].end).toBe(text.length);
  });

  test("UTF-16 offsets survive astral-plane characters before the match", () => {
    const text = "🔐🔑 emoji prefix api_key=abcd1234efgh";
    const scan = scanOutgoingSecretText(text);
    expect(sliceAll(text, scan)).toEqual(["abcd1234efgh"]);
    // Emoji are surrogate PAIRS: the offset must count code units, not chars.
    expect(text.slice(0, scan.candidates[0].start)).toContain("🔐🔑");
  });

  test("known tokens capture the WHOLE token", () => {
    const text = `deploy with ghp_${"a".repeat(24)} now`;
    const scan = scanOutgoingSecretText(text);
    expect(sliceAll(text, scan)).toEqual([`ghp_${"a".repeat(24)}`]);
    expect(scan.candidates[0].kind).toBe("known_token");
    expect(scan.candidates[0].label).toBe("GitHub token");
  });

  test("PEM captures the complete BEGIN..END block", () => {
    const body = "MIIBOgIBAAJBAK\nabc123\n";
    const text = `key:\n-----BEGIN RSA PRIVATE KEY-----\n${body}-----END RSA PRIVATE KEY-----\ndone`;
    const scan = scanOutgoingSecretText(text);
    expect(scan.ok).toBe(true);
    expect(scan.candidates).toHaveLength(1);
    expect(scan.candidates[0].kind).toBe("pem");
    const captured = text.slice(
      scan.candidates[0].start,
      scan.candidates[0].end,
    );
    expect(captured.startsWith("-----BEGIN RSA PRIVATE KEY-----")).toBe(true);
    expect(captured.endsWith("-----END RSA PRIVATE KEY-----")).toBe(true);
    expect(captured).toContain(body.trim());
  });

  test("an unterminated PEM block fails closed as ambiguous", () => {
    const scan = scanOutgoingSecretText(
      "-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK\n",
    );
    expect(scan).toEqual({ ok: false, code: "secret_capture_ambiguous" });
  });

  test("multiple distinct candidates are returned sorted and non-overlapping", () => {
    const text = `api_key=abcd1234efgh and password: zzzz9999yyyy and ghp_${"b".repeat(24)}`;
    const scan = scanOutgoingSecretText(text);
    expect(scan.ok).toBe(true);
    expect(scan.candidates).toHaveLength(3);
    for (let i = 1; i < scan.candidates.length; i += 1) {
      expect(scan.candidates[i].start).toBeGreaterThanOrEqual(
        scan.candidates[i - 1].end,
      );
    }
    expect(scan.candidates.map((c) => c.label)).toEqual([
      "API key",
      "Password",
      "GitHub token",
    ]);
  });

  test("a nested duplicate (assignment whose value IS a known token) collapses to one", () => {
    const text = `api_key=sk-${"a".repeat(20)}`;
    const scan = scanOutgoingSecretText(text);
    expect(scan.ok).toBe(true);
    expect(scan.candidates).toHaveLength(1);
    expect(sliceAll(text, scan)).toEqual([`sk-${"a".repeat(20)}`]);
  });

  /* ── explicit {{secret:...}} syntax is a CANDIDATE, never an exemption ──
     The regression this whole file exists to prevent: an earlier scanner
     treated wrapped spans as excluded regions, so a message using the
     documented syntax scanned clean, skipped the gate and deposited late. */
  test("explicit syntax is reported as a candidate, not excluded", () => {
    const text = "{{secret:My key}}api_key=abcd1234efgh{{/secret}} thanks";
    const scan = scanOutgoingSecretText(text);
    expect(scan.ok).toBe(true);
    expect(scan.candidates).toHaveLength(1);
    const candidate = scan.candidates[0];
    expect(candidate.kind).toBe("explicit");
    // The NAME the user typed becomes the default label.
    expect(candidate.label).toBe("My key");
    // Replacement span is the WHOLE wrapper...
    expect(text.slice(candidate.start, candidate.end)).toBe(
      "{{secret:My key}}api_key=abcd1234efgh{{/secret}}",
    );
    // ...while the value span is the inner value only.
    expect(text.slice(candidate.valueStart, candidate.valueEnd)).toBe(
      "api_key=abcd1234efgh",
    );
  });

  test("a heuristic hit inside an explicit block is not double-reported", () => {
    const scan = scanOutgoingSecretText(
      "{{secret:My key}}api_key=abcd1234efgh{{/secret}} thanks",
    );
    expect(scan.candidates.map((c) => c.kind)).toEqual(["explicit"]);
  });

  test("explicit and heuristic candidates are merged in document order", () => {
    const text =
      "first {{secret:Deploy key}}zzzz9999yyyy{{/secret}} then api_key=abcd1234efgh end";
    const scan = scanOutgoingSecretText(text);
    expect(scan.ok).toBe(true);
    expect(scan.candidates.map((c) => c.kind)).toEqual([
      "explicit",
      "assignment",
    ]);
    expect(scan.candidates.map((c) => c.label)).toEqual([
      "Deploy key",
      "API key",
    ]);
    for (let i = 1; i < scan.candidates.length; i += 1) {
      expect(scan.candidates[i].start).toBeGreaterThanOrEqual(
        scan.candidates[i - 1].end,
      );
    }
    expect(extractSecretCandidateValues(text, scan.candidates)).toEqual([
      "zzzz9999yyyy",
      "abcd1234efgh",
    ]);
  });

  test("malformed explicit syntax fails the whole scan closed", () => {
    expect(scanOutgoingSecretText("{{secret:key}}value-without-close")).toEqual({
      ok: false,
      code: "secret_capture_malformed",
    });
    expect(scanOutgoingSecretText("dangling {{/secret}} tail")).toEqual({
      ok: false,
      code: "secret_capture_malformed",
    });
    expect(scanOutgoingSecretText("{{secret:   }}v{{/secret}}")).toEqual({
      ok: false,
      code: "secret_capture_invalid_label",
    });
    expect(scanOutgoingSecretText("{{secret:key}}{{/secret}}")).toEqual({
      ok: false,
      code: "secret_capture_empty_value",
    });
  });

  test("explicit blocks count toward the candidate cap", () => {
    const text = Array.from(
      { length: SECRET_CANDIDATE_MAX + 1 },
      (_unused, index) => `{{secret:k${index}}}v${index}{{/secret}}`,
    ).join(" ");
    expect(scanOutgoingSecretText(text)).toEqual({
      ok: false,
      code: "secret_capture_too_many_candidates",
    });
  });

  test("an existing handle marker is excluded", () => {
    const scan = scanOutgoingSecretText(
      `use <secret-handle label="API key" handle="${HANDLE(1)}"/> now`,
    );
    expect(scan).toEqual({ ok: true, candidates: [] });
  });

  test("more than the maximum number of candidates fails closed", () => {
    const text = Array.from(
      { length: SECRET_CANDIDATE_MAX + 1 },
      (_unused, index) => `token=abcdefgh${index}`,
    ).join(" ");
    expect(scanOutgoingSecretText(text)).toEqual({
      ok: false,
      code: "secret_capture_too_many_candidates",
    });
  });

  test("exactly the maximum number of candidates is allowed", () => {
    const text = Array.from(
      { length: SECRET_CANDIDATE_MAX },
      (_unused, index) => `token=abcdefgh${index}`,
    ).join(" ");
    const scan = scanOutgoingSecretText(text);
    expect(scan.ok).toBe(true);
    expect(scan.candidates).toHaveLength(SECRET_CANDIDATE_MAX);
  });

  test("scanning is pure — repeated calls give identical results", () => {
    const text = `api_key=abcd1234efgh and ghp_${"c".repeat(24)}`;
    const first = scanOutgoingSecretText(text);
    const second = scanOutgoingSecretText(text);
    const third = scanOutgoingSecretText(text);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  test("scanning does not disturb the boolean predicate's regex state", () => {
    const text = `api_key=abcd1234efgh and ghp_${"d".repeat(24)}`;
    expect(detectLikelySecretAssignment(text)).toBe(true);
    scanOutgoingSecretText(text);
    expect(detectLikelySecretAssignment(text)).toBe(true);
    scanOutgoingSecretText("nothing here");
    expect(detectLikelySecretAssignment(text)).toBe(true);
  });
});

describe("extractSecretCandidateValues", () => {
  test("slices exactly the candidate ranges", () => {
    const text = "api_key=abcd1234efgh and password: zzzz9999yyyy";
    const scan = scanOutgoingSecretText(text);
    expect(extractSecretCandidateValues(text, scan.candidates)).toEqual([
      "abcd1234efgh",
      "zzzz9999yyyy",
    ]);
  });
});

describe("applySecretHandleRanges", () => {
  test("replaces each range with its marker and keeps everything else byte-identical", () => {
    const text = "use api_key=abcd1234efgh please";
    const scan = scanOutgoingSecretText(text);
    const out = applySecretHandleRanges(text, scan.candidates, [HANDLE(1)]);
    expect(out).toBe(
      `use api_key=<secret-handle label="API key" handle="${HANDLE(1)}"/> please`,
    );
    expect(out).not.toContain("abcd1234efgh");
  });

  test("replaces multiple ranges in order", () => {
    const text = "api_key=abcd1234efgh then password: zzzz9999yyyy end";
    const scan = scanOutgoingSecretText(text);
    const out = applySecretHandleRanges(text, scan.candidates, [
      HANDLE(1),
      HANDLE(2),
    ]);
    expect(out).toContain(`handle="${HANDLE(1)}"`);
    expect(out).toContain(`handle="${HANDLE(2)}"`);
    expect(out).toContain(" then ");
    expect(out.endsWith(" end")).toBe(true);
    expect(out).not.toContain("abcd1234efgh");
    expect(out).not.toContain("zzzz9999yyyy");
  });

  test("returns null (fail closed) when a handle is missing or blank", () => {
    const text = "api_key=abcd1234efgh";
    const scan = scanOutgoingSecretText(text);
    expect(applySecretHandleRanges(text, scan.candidates, [])).toBeNull();
    expect(applySecretHandleRanges(text, scan.candidates, ["  "])).toBeNull();
  });

  test("returns null when ranges are out of bounds or out of order", () => {
    const text = "api_key=abcd1234efgh";
    expect(
      applySecretHandleRanges(
        text,
        [{ start: 0, end: text.length + 5, label: "x" }],
        [HANDLE(1)],
      ),
    ).toBeNull();
    expect(
      applySecretHandleRanges(
        text,
        [
          { start: 10, end: 14, label: "x" },
          { start: 2, end: 6, label: "y" },
        ],
        [HANDLE(1), HANDLE(2)],
      ),
    ).toBeNull();
  });

  test("the marker label is XML-escaped so a name cannot break out of the tag", () => {
    const text = "api_key=abcd1234efgh";
    const scan = scanOutgoingSecretText(text);
    const out = applySecretHandleRanges(
      text,
      scan.candidates.map((c) => ({ ...c, label: 'a"><b>' })),
      [HANDLE(1)],
    );
    expect(out).toContain("&quot;&gt;&lt;b&gt;");
    expect(out).not.toContain('label="a"><b>"');
  });
});

describe("applySecretHandleRanges — explicit spans", () => {
  test("an explicit block is replaced whole: no wrapper, no value", () => {
    const text = "use {{secret:API key}}sk-live-PLAINTEXT-99{{/secret}} now";
    const scan = scanOutgoingSecretText(text);
    const out = applySecretHandleRanges(text, scan.candidates, [HANDLE(1)]);
    expect(out).toBe(
      `use <secret-handle label="API key" handle="${HANDLE(1)}"/> now`,
    );
    expect(out).not.toContain("sk-live-PLAINTEXT-99");
    expect(out).not.toContain("{{secret:");
    expect(out).not.toContain("{{/secret}}");
  });
});

describe("applySecretPlainRanges", () => {
  test("strips the wrapper but keeps the value the user approved", () => {
    const text = "use {{secret:API key}}sk-live-PLAINTEXT-99{{/secret}} now";
    const scan = scanOutgoingSecretText(text);
    const out = applySecretPlainRanges(text, scan.candidates);
    expect(out).toBe("use sk-live-PLAINTEXT-99 now");
    expect(out).not.toContain("{{secret:");
    expect(out).not.toContain("{{/secret}}");
  });

  test("a heuristic-only message is returned byte-identical", () => {
    const text = "my api_key=abcd1234efgh please";
    const scan = scanOutgoingSecretText(text);
    expect(applySecretPlainRanges(text, scan.candidates)).toBe(text);
  });

  test("mixed explicit + heuristic keeps both values and drops both wrappers", () => {
    const text =
      "a {{secret:One}}zzzz9999yyyy{{/secret}} b api_key=abcd1234efgh c";
    const scan = scanOutgoingSecretText(text);
    expect(applySecretPlainRanges(text, scan.candidates)).toBe(
      "a zzzz9999yyyy b api_key=abcd1234efgh c",
    );
  });

  test("no candidates leaves the text untouched", () => {
    expect(applySecretPlainRanges("plain words", [])).toBe("plain words");
  });

  test("returns null (fail closed) on out-of-bounds or out-of-order ranges", () => {
    const text = "api_key=abcd1234efgh";
    expect(
      applySecretPlainRanges(text, [{ start: 0, end: text.length + 5 }]),
    ).toBeNull();
    expect(
      applySecretPlainRanges(text, [
        { start: 10, end: 14 },
        { start: 2, end: 6 },
      ]),
    ).toBeNull();
    // A value span that escapes its own replacement span is rejected too.
    expect(
      applySecretPlainRanges(text, [
        { start: 2, end: 6, valueStart: 2, valueEnd: 9 },
      ]),
    ).toBeNull();
  });
});

describe("normalizeSecretLabel", () => {
  test("trims and NFC-normalizes", () => {
    expect(normalizeSecretLabel("  My Key  ")).toBe("My Key");
    expect(normalizeSecretLabel("é")).toBe("é");
  });

  test("rejects empty, control-bearing, and oversized names", () => {
    expect(normalizeSecretLabel("   ")).toBe("");
    expect(normalizeSecretLabel("ab")).toBe("");
    expect(normalizeSecretLabel("x".repeat(121))).toBe("");
    expect(normalizeSecretLabel(null)).toBe("");
  });
});
