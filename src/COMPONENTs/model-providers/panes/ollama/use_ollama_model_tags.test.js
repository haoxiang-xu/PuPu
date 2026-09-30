import { act, renderHook } from "@testing-library/react";
import {
  __resetOllamaModelTagsCache,
  dropModelTagsRequest,
  requestModelTags,
  useOllamaModelTags,
} from "./use_ollama_model_tags";

const mockPending = new Map(); // name → resolve
jest.mock("../../../../SERVICEs/api", () => ({
  __esModule: true,
  default: { ollama: { fetchLibraryTags: jest.fn() } },
}));
const api = require("../../../../SERVICEs/api").default;

const settle = async (name, tags = [{ tag: "latest", size_label: "1GB" }]) => {
  await act(async () => {
    mockPending.get(name).resolve(tags);
    await new Promise((r) => setTimeout(r, 0));
  });
};

beforeEach(() => {
  __resetOllamaModelTagsCache();
  mockPending.clear();
  // CRA's jest preset resets implementations between tests.
  api.ollama.fetchLibraryTags.mockImplementation(
    (name) =>
      new Promise((resolve, reject) => {
        mockPending.set(name, { resolve, reject });
      }),
  );
});

describe("model tags scheduler", () => {
  test("at most three fetches in flight; the queue drains as they settle", async () => {
    ["a", "b", "c", "d", "e"].forEach((n) => requestModelTags(n));
    expect(api.ollama.fetchLibraryTags.mock.calls.map((c) => c[0])).toEqual(["a", "b", "c"]);
    await settle("a");
    expect(api.ollama.fetchLibraryTags.mock.calls.map((c) => c[0])).toEqual(["a", "b", "c", "d"]);
    await settle("b");
    await settle("c");
    expect(api.ollama.fetchLibraryTags.mock.calls.map((c) => c[0])).toEqual(["a", "b", "c", "d", "e"]);
  });

  test("requests are de-duplicated and cached for the session", async () => {
    requestModelTags("a");
    requestModelTags("a");
    expect(api.ollama.fetchLibraryTags).toHaveBeenCalledTimes(1);
    await settle("a");
    requestModelTags("a");
    expect(api.ollama.fetchLibraryTags).toHaveBeenCalledTimes(1);
  });

  test("hover priority jumps the queue; leaving the window drops an unstarted request", () => {
    ["a", "b", "c", "d", "e", "f"].forEach((n) => requestModelTags(n));
    requestModelTags("f", { priority: true });
    dropModelTagsRequest("d");
    // a, b, c in flight; f is now first in the queue, d gone
    expect(api.ollama.fetchLibraryTags).toHaveBeenCalledTimes(3);
    act(() => mockPending.get("a").resolve([]));
    return act(async () => {
      await new Promise((r) => setTimeout(r, 0));
      expect(api.ollama.fetchLibraryTags.mock.calls.map((c) => c[0])).toEqual(["a", "b", "c", "f"]);
    });
  });

  test("the hook reports idle → loading → ready, and error with retry", async () => {
    const { result, rerender } = renderHook(({ n }) => useOllamaModelTags(n), { initialProps: { n: "x" } });
    expect(result.current.state).toBe("idle");
    act(() => requestModelTags("x"));
    expect(result.current.state).toBe("loading");
    await settle("x", [{ tag: "7b", size_label: "4GB" }]);
    expect(result.current.state).toBe("ready");
    expect(result.current.tags[0].tag).toBe("7b");

    rerender({ n: "y" });
    act(() => requestModelTags("y"));
    await act(async () => {
      mockPending.get("y").reject(new Error("timeout"));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.state).toBe("error");
    act(() => result.current.retry());
    expect(result.current.state).toBe("loading");
    expect(api.ollama.fetchLibraryTags.mock.calls.filter((c) => c[0] === "y").length).toBe(2);
  });
});
