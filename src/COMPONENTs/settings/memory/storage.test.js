/* Characterization tests for the memory settings store.
   Model-visible surface (§0.3): these values flow into the chat request
   payload, so defaults / normalization / clamping are locked byte-for-byte
   across the settings-repository conversion (Phase 1B T3). */

import {
  DEFAULT_MEMORY_SETTINGS,
  normalizeMemorySettings,
  readMemorySettings,
  writeMemorySettings,
} from "./storage";

const readRoot = () =>
  JSON.parse(window.localStorage.getItem("settings") || "{}");

beforeEach(() => {
  window.localStorage.clear();
});

describe("DEFAULT_MEMORY_SETTINGS", () => {
  test("is byte-for-byte stable", () => {
    expect(DEFAULT_MEMORY_SETTINGS).toEqual({
      enabled: true,
      long_term_enabled: true,
      long_term_extract_every_n_turns: 6,
      embedding_provider: "auto",
      ollama_embedding_model: "nomic-embed-text",
      openai_embedding_model: "text-embedding-3-small",
      last_n_turns: 8,
      vector_top_k: 4,
      vector_min_score: 0,
      long_term_top_k: 4,
      long_term_min_score: 0,
    });
  });
});

describe("normalizeMemorySettings", () => {
  test("returns defaults for non-object input", () => {
    expect(normalizeMemorySettings(null)).toEqual(DEFAULT_MEMORY_SETTINGS);
    expect(normalizeMemorySettings([1, 2])).toEqual(DEFAULT_MEMORY_SETTINGS);
    expect(normalizeMemorySettings("x")).toEqual(DEFAULT_MEMORY_SETTINGS);
  });

  test("clamps integer fields into their ranges", () => {
    const result = normalizeMemorySettings({
      long_term_extract_every_n_turns: 999,
      last_n_turns: 0,
      vector_top_k: -3,
      long_term_top_k: 11.9,
    });
    expect(result.long_term_extract_every_n_turns).toBe(20);
    expect(result.last_n_turns).toBe(1);
    expect(result.vector_top_k).toBe(0);
    expect(result.long_term_top_k).toBe(10);
  });

  test("floors fractional integers and falls back on non-numeric", () => {
    const result = normalizeMemorySettings({
      last_n_turns: 3.9,
      vector_top_k: "not-a-number",
    });
    expect(result.last_n_turns).toBe(3);
    expect(result.vector_top_k).toBe(DEFAULT_MEMORY_SETTINGS.vector_top_k);
  });

  test("clamps thresholds to [0,1] with 2-decimal rounding", () => {
    expect(normalizeMemorySettings({ vector_min_score: 1.7 }).vector_min_score).toBe(1);
    expect(normalizeMemorySettings({ vector_min_score: -0.5 }).vector_min_score).toBe(0);
    expect(
      normalizeMemorySettings({ vector_min_score: 0.12345 }).vector_min_score,
    ).toBe(0.12);
    expect(
      normalizeMemorySettings({ long_term_min_score: "bogus" })
        .long_term_min_score,
    ).toBe(DEFAULT_MEMORY_SETTINGS.long_term_min_score);
  });

  test("normalizes embedding provider case/whitespace and rejects unknowns", () => {
    expect(
      normalizeMemorySettings({ embedding_provider: "  OpenAI " })
        .embedding_provider,
    ).toBe("openai");
    expect(
      normalizeMemorySettings({ embedding_provider: "gemini" })
        .embedding_provider,
    ).toBe("auto");
    expect(
      normalizeMemorySettings({ embedding_provider: 7 }).embedding_provider,
    ).toBe("auto");
  });

  test("keeps non-empty trimmed model names and restores defaults otherwise", () => {
    const result = normalizeMemorySettings({
      ollama_embedding_model: "  custom-embed  ",
      openai_embedding_model: "   ",
    });
    expect(result.ollama_embedding_model).toBe("custom-embed");
    expect(result.openai_embedding_model).toBe(
      DEFAULT_MEMORY_SETTINGS.openai_embedding_model,
    );
  });

  test("honors legacy long_term_* aliases in priority order", () => {
    expect(
      normalizeMemorySettings({ long_term_vector_top_k: 7 }).long_term_top_k,
    ).toBe(7);
    expect(
      normalizeMemorySettings({
        long_term_episode_top_k: 2,
        long_term_playbook_top_k: 9,
      }).long_term_top_k,
    ).toBe(2);
    expect(
      normalizeMemorySettings({
        long_term_top_k: 5,
        long_term_vector_top_k: 9,
      }).long_term_top_k,
    ).toBe(5);
    expect(
      normalizeMemorySettings({ long_term_episode_min_score: 0.336 })
        .long_term_min_score,
    ).toBe(0.34);
  });

  test("coerces boolean fields with type checks", () => {
    expect(normalizeMemorySettings({ enabled: false }).enabled).toBe(false);
    expect(normalizeMemorySettings({ enabled: "false" }).enabled).toBe(true);
    expect(
      normalizeMemorySettings({ long_term_enabled: 0 }).long_term_enabled,
    ).toBe(true);
  });
});

describe("readMemorySettings", () => {
  test("returns defaults when settings are absent", () => {
    expect(readMemorySettings()).toEqual(DEFAULT_MEMORY_SETTINGS);
  });

  test("returns defaults on corrupt settings JSON", () => {
    window.localStorage.setItem("settings", "{not json");
    expect(readMemorySettings()).toEqual(DEFAULT_MEMORY_SETTINGS);
  });

  test("returns defaults when memory section is not an object", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ memory: "corrupt" }),
    );
    expect(readMemorySettings()).toEqual(DEFAULT_MEMORY_SETTINGS);
  });

  test("merges saved values over defaults and normalizes", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({
        memory: { enabled: false, vector_top_k: 99, embedding_provider: "OLLAMA" },
      }),
    );
    expect(readMemorySettings()).toEqual({
      ...DEFAULT_MEMORY_SETTINGS,
      enabled: false,
      vector_top_k: 10,
      embedding_provider: "ollama",
    });
  });
});

describe("writeMemorySettings", () => {
  test("persists a normalized merge of current values and the patch", () => {
    writeMemorySettings({ enabled: false });
    writeMemorySettings({ vector_min_score: 0.456 });
    const stored = readRoot().memory;
    expect(stored.enabled).toBe(false);
    expect(stored.vector_min_score).toBe(0.46);
    // The stored object is the full normalized settings shape.
    expect(Object.keys(stored).sort()).toEqual(
      Object.keys(DEFAULT_MEMORY_SETTINGS).sort(),
    );
    expect(readMemorySettings()).toEqual({
      ...DEFAULT_MEMORY_SETTINGS,
      enabled: false,
      vector_min_score: 0.46,
    });
  });

  test("preserves sibling settings sections", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ runtime: { workspace_root: "/keep" } }),
    );
    writeMemorySettings({ last_n_turns: 12 });
    const root = readRoot();
    expect(root.runtime).toEqual({ workspace_root: "/keep" });
    expect(root.memory.last_n_turns).toBe(12);
  });

  test("repairs corrupt settings JSON by rebuilding the root", () => {
    window.localStorage.setItem("settings", "{not json");
    writeMemorySettings({ enabled: false });
    expect(readMemorySettings().enabled).toBe(false);
  });

  test("drops legacy alias keys from the persisted shape", () => {
    window.localStorage.setItem(
      "settings",
      JSON.stringify({ memory: { long_term_vector_top_k: 7 } }),
    );
    writeMemorySettings({});
    const stored = readRoot().memory;
    expect(stored.long_term_top_k).toBe(7);
    expect(stored.long_term_vector_top_k).toBeUndefined();
  });
});
