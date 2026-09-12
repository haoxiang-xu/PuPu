import {
  clearContextWindowPrefs,
  readContextWindowPref,
  writeContextWindowPref,
} from "./context_window_prefs";

const STORAGE_KEY = "context_window_prefs";

describe("context_window_prefs", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("round-trips a window for one model without touching others", () => {
    writeContextWindowPref("ollama:deepseek-r1:14b", 65536);
    writeContextWindowPref("ollama:qwen3:14b", 16384);

    expect(readContextWindowPref("ollama:deepseek-r1:14b")).toBe(65536);
    expect(readContextWindowPref("ollama:qwen3:14b")).toBe(16384);
    expect(readContextWindowPref("ollama:gemma4:e2b")).toBeNull();
  });

  test("trims the model id and stores only positive integers", () => {
    writeContextWindowPref("  ollama:qwen3:14b  ", 32768);
    expect(readContextWindowPref("ollama:qwen3:14b")).toBe(32768);

    writeContextWindowPref("ollama:bad", "65536");
    writeContextWindowPref("ollama:bad2", 0);
    writeContextWindowPref("ollama:bad3", 4096.5);
    expect(readContextWindowPref("ollama:bad")).toBeNull();
    expect(readContextWindowPref("ollama:bad2")).toBeNull();
    expect(readContextWindowPref("ollama:bad3")).toBeNull();
  });

  test("a null window forgets the model rather than storing an empty value", () => {
    writeContextWindowPref("ollama:qwen3:14b", 65536);
    writeContextWindowPref("ollama:qwen3:14b", null);

    expect(readContextWindowPref("ollama:qwen3:14b")).toBeNull();
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(stored.byModel).not.toHaveProperty("ollama:qwen3:14b");
  });

  test("corrupted or foreign-version records read as empty, never throw", () => {
    window.localStorage.setItem(STORAGE_KEY, "{not json");
    expect(readContextWindowPref("ollama:qwen3:14b")).toBeNull();

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 99, byModel: { "ollama:qwen3:14b": 65536 } }),
    );
    expect(readContextWindowPref("ollama:qwen3:14b")).toBeNull();

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, byModel: { "ollama:qwen3:14b": "65536" } }),
    );
    expect(readContextWindowPref("ollama:qwen3:14b")).toBeNull();
  });

  test("keeps the most recently written models when the map is full", () => {
    for (let index = 0; index < 205; index += 1) {
      writeContextWindowPref(`ollama:model-${index}`, 8192);
    }
    expect(readContextWindowPref("ollama:model-0")).toBeNull();
    expect(readContextWindowPref("ollama:model-204")).toBe(8192);
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    expect(Object.keys(stored.byModel)).toHaveLength(200);
  });

  test("clear wipes everything", () => {
    writeContextWindowPref("ollama:qwen3:14b", 65536);
    clearContextWindowPrefs();
    expect(readContextWindowPref("ollama:qwen3:14b")).toBeNull();
  });
});
