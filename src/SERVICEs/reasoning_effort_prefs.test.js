import {
  clearReasoningEffortPrefs,
  readReasoningEffortPref,
  writeReasoningEffortPref,
} from "./reasoning_effort_prefs";

const STORAGE_KEY = "reasoning_effort_prefs";

describe("reasoning_effort_prefs", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("round-trips a level for one model without touching others", () => {
    writeReasoningEffortPref("openai:gpt-5.6-sol", "xhigh");
    writeReasoningEffortPref("anthropic:claude-opus-4-8", "max");

    expect(readReasoningEffortPref("openai:gpt-5.6-sol")).toBe("xhigh");
    expect(readReasoningEffortPref("anthropic:claude-opus-4-8")).toBe("max");
    expect(readReasoningEffortPref("openai:gpt-4.1")).toBeNull();
  });

  test("normalizes casing and surrounding whitespace on both sides", () => {
    writeReasoningEffortPref("  openai:gpt-5  ", "  HIGH ");
    expect(readReasoningEffortPref("openai:gpt-5")).toBe("high");
  });

  test("a null level forgets the model rather than storing an empty value", () => {
    writeReasoningEffortPref("openai:gpt-5", "high");
    writeReasoningEffortPref("openai:gpt-5", null);

    expect(readReasoningEffortPref("openai:gpt-5")).toBeNull();
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(stored.byModel).not.toHaveProperty("openai:gpt-5");
  });

  test("corrupted or foreign-version records read as empty, never throw", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(readReasoningEffortPref("openai:gpt-5")).toBeNull();

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 99, byModel: { "openai:gpt-5": "high" } }),
    );
    expect(readReasoningEffortPref("openai:gpt-5")).toBeNull();

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, byModel: { "openai:gpt-5": 7 } }),
    );
    expect(readReasoningEffortPref("openai:gpt-5")).toBeNull();
  });

  test("an empty or non-string model id is a no-op, not a stored empty key", () => {
    writeReasoningEffortPref("", "high");
    writeReasoningEffortPref(null, "high");
    expect(readReasoningEffortPref("")).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("caps growth at 200 models, evicting the least recently written", () => {
    for (let i = 0; i < 205; i += 1) {
      writeReasoningEffortPref(`model-${i}`, "high");
    }

    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(Object.keys(stored.byModel)).toHaveLength(200);
    expect(readReasoningEffortPref("model-0")).toBeNull();
    expect(readReasoningEffortPref("model-204")).toBe("high");
  });

  test("re-writing an existing model refreshes its recency", () => {
    writeReasoningEffortPref("keeper", "low");
    for (let i = 0; i < 199; i += 1) {
      writeReasoningEffortPref(`filler-${i}`, "high");
    }
    // "keeper" is now the oldest entry — touching it must move it to newest.
    writeReasoningEffortPref("keeper", "max");
    writeReasoningEffortPref("overflow", "high");

    expect(readReasoningEffortPref("keeper")).toBe("max");
    expect(readReasoningEffortPref("filler-0")).toBeNull();
  });

  test("clear drops everything", () => {
    writeReasoningEffortPref("openai:gpt-5", "high");
    clearReasoningEffortPrefs();
    expect(readReasoningEffortPref("openai:gpt-5")).toBeNull();
  });
});
