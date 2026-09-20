import { act, renderHook, waitFor } from "@testing-library/react";
import { useOllamaInstalled } from "./use_ollama_installed";
import { api } from "../../../../SERVICEs/api";

jest.mock("../../../../SERVICEs/api", () => {
  const ollama = {
    isBridgeAvailable: jest.fn(),
    getStatus: jest.fn(),
    restart: jest.fn(),
    listModels: jest.fn(),
  };
  return { __esModule: true, api: { ollama }, default: { ollama } };
});

const MODELS = [
  { name: "qwen3:30b", size: 18_000_000_000 },
  { name: "llama3.2:3b", size: 2_000_000_000 },
];

beforeEach(() => {
  // CRA's jest preset resets mock implementations between tests.
  api.ollama.isBridgeAvailable.mockReturnValue(true);
  api.ollama.getStatus.mockResolvedValue("running");
  api.ollama.restart.mockResolvedValue("running");
  api.ollama.listModels.mockResolvedValue(MODELS);
});

describe("useOllamaInstalled", () => {
  test("ready: lists the installed models", async () => {
    const { result } = renderHook(() => useOllamaInstalled());
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.models).toEqual(MODELS);
    expect(result.current.hasOllamaBridge).toBe(true);
  });

  test("not_found: the bridge says no binary, no HTTP probe is made", async () => {
    api.ollama.getStatus.mockResolvedValue("not_found");
    const { result } = renderHook(() => useOllamaInstalled());
    await waitFor(() => expect(result.current.status).toBe("not_found"));
    expect(api.ollama.listModels).not.toHaveBeenCalled();
    expect(result.current.models).toEqual([]);
  });

  test("offline: the probe fails", async () => {
    api.ollama.listModels.mockRejectedValue(new Error("ECONNREFUSED"));
    const { result } = renderHook(() => useOllamaInstalled());
    await waitFor(() => expect(result.current.status).toBe("offline"));
    expect(result.current.models).toEqual([]);
  });

  test("no bridge (web dev): skips getStatus and probes HTTP directly", async () => {
    api.ollama.isBridgeAvailable.mockReturnValue(false);
    const { result } = renderHook(() => useOllamaInstalled());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(api.ollama.getStatus).not.toHaveBeenCalled();
    expect(result.current.hasOllamaBridge).toBe(false);
  });

  test("enabled:false does not probe until enabled", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useOllamaInstalled({ enabled }),
      { initialProps: { enabled: false } },
    );
    expect(api.ollama.listModels).not.toHaveBeenCalled();
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.models).toEqual(MODELS);
  });

  test("removeLocally drops one tag without re-fetching (SEQ-002)", async () => {
    const { result } = renderHook(() => useOllamaInstalled());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const calls = api.ollama.listModels.mock.calls.length;
    act(() => result.current.removeLocally("qwen3:30b"));
    expect(result.current.models.map((m) => m.name)).toEqual(["llama3.2:3b"]);
    expect(api.ollama.listModels.mock.calls.length).toBe(calls);
  });

  test("restart: not_found short-circuits, otherwise reloads", async () => {
    const { result } = renderHook(() => useOllamaInstalled());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    api.ollama.restart.mockResolvedValue("not_found");
    await act(async () => {
      await result.current.restart();
    });
    expect(result.current.status).toBe("not_found");

    api.ollama.restart.mockResolvedValue("running");
    await act(async () => {
      await result.current.restart();
    });
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });
});
