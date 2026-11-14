import {
  MODEL_CHIP_PINS_STORAGE_KEY,
  readPinnedModelChips,
  togglePinnedModelChip,
} from "./model_chip_pins";

beforeEach(() => window.localStorage.clear());

test("starts empty and toggles pins in pin order", () => {
  expect(readPinnedModelChips()).toEqual([]);
  expect(togglePinnedModelChip("ollama:a")).toEqual(["ollama:a"]);
  expect(togglePinnedModelChip("openai:b")).toEqual(["ollama:a", "openai:b"]);
  expect(readPinnedModelChips()).toEqual(["ollama:a", "openai:b"]);
  expect(togglePinnedModelChip("ollama:a")).toEqual(["openai:b"]);
  expect(JSON.parse(window.localStorage.getItem(MODEL_CHIP_PINS_STORAGE_KEY))).toEqual({
    version: 1,
    pinned: ["openai:b"],
  });
});

test("reads corrupted or foreign data as no pins", () => {
  window.localStorage.setItem(MODEL_CHIP_PINS_STORAGE_KEY, "{not json");
  expect(readPinnedModelChips()).toEqual([]);
  window.localStorage.setItem(MODEL_CHIP_PINS_STORAGE_KEY, JSON.stringify({ version: 9, pinned: ["x"] }));
  expect(readPinnedModelChips()).toEqual([]);
  window.localStorage.setItem(
    MODEL_CHIP_PINS_STORAGE_KEY,
    JSON.stringify({ version: 1, pinned: ["a", "a", 3, " ", "b"] }),
  );
  expect(readPinnedModelChips()).toEqual(["a", "b"]);
});
