import { act, renderHook, waitFor } from "@testing-library/react";
import { useOllamaLibrary } from "./use_ollama_library";
import pull_store from "../pull_store";
import { buildModelRef } from "../model_ref";
import api from "../../../../SERVICEs/api";

jest.mock("../../../../SERVICEs/api", () => ({
  __esModule: true,
  default: {
    ollama: {
      listModels: jest.fn(),
      searchLibrary: jest.fn(),
      pullModel: jest.fn(),
    },
  },
}));

jest.mock("../../../../SERVICEs/model_catalog_refresh", () => ({
  __esModule: true,
  emitModelCatalogRefresh: jest.fn(),
}));

jest.mock("../../../../SERVICEs/progress_bus", () => ({
  __esModule: true,
  start: jest.fn(),
  stop: jest.fn(),
}));

describe("useOllamaLibrary.handlePull — pull target and store key", () => {
  beforeEach(() => {
    // CRA's jest preset runs with resetMocks:true, so implementations have to
    // be re-installed for every test.
    api.ollama.listModels.mockResolvedValue([]);
    api.ollama.searchLibrary.mockResolvedValue([]);
    // Never settles: keeps the entry in pull_store so the key can be inspected.
    api.ollama.pullModel.mockImplementation(() => new Promise(() => {}));
    pull_store.map = {};
    pull_store.refs = {};
    pull_store.listeners = new Set();
  });

  const pullWith = async (modelName, size) => {
    const { result } = renderHook(() => useOllamaLibrary());
    await waitFor(() => expect(api.ollama.searchLibrary).toHaveBeenCalled());
    act(() => {
      result.current.handlePull(modelName, size);
    });
    return result;
  };

  it("pulls the bare name for a size-less model and keys the store by it", async () => {
    await pullWith("nomic-embed-text", "");

    expect(api.ollama.pullModel).toHaveBeenCalledTimes(1);
    expect(api.ollama.pullModel.mock.calls[0][0].name).toBe("nomic-embed-text");
    expect(Object.keys(pull_store.map)).toEqual(["nomic-embed-text"]);
    expect(pull_store.map["nomic-embed-text:"]).toBeUndefined();
    expect(
      pull_store.map["nomic-embed-text:nomic-embed-text"],
    ).toBeUndefined();
  });

  it("keeps name:size for a sized model", async () => {
    await pullWith("llama3.1", "8b");

    expect(api.ollama.pullModel.mock.calls[0][0].name).toBe("llama3.1:8b");
    expect(Object.keys(pull_store.map)).toEqual(["llama3.1:8b"]);
  });

  it.each([
    ["nomic-embed-text", ""],
    ["nomic-embed-text", undefined],
    ["llama3.1", "8b"],
  ])(
    "store key equals buildModelRef(%p, %p) — the card's derivation",
    async (modelName, size) => {
      await pullWith(modelName, size);

      const expected = buildModelRef(modelName, size);
      expect(Object.keys(pull_store.map)).toEqual([expected]);
      expect(api.ollama.pullModel.mock.calls[0][0].name).toBe(expected);
    },
  );
});
