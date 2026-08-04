import {
  DEFAULT_MEMORY_AGENT_DISPLAY_NAME,
  MEMORY_AGENT_SYSTEM_NODE_ID,
  normalizeMemoryAgentSettings,
  readMemoryAgentSettings,
  updateMemoryAgentSettings,
  subscribeMemoryAgentSettings,
} from "./memory_agent_settings";

describe("memory_agent_settings service", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("exposes the fixed system node id", () => {
    expect(MEMORY_AGENT_SYSTEM_NODE_ID).toBe("system:memory-agent");
  });

  test("reads defaults when nothing is stored", () => {
    expect(readMemoryAgentSettings()).toEqual({
      displayName: DEFAULT_MEMORY_AGENT_DISPLAY_NAME,
      additionalInstructions: "",
      provider: "",
      modelId: "",
    });
  });

  test("normalizes junk records fail-safe", () => {
    expect(normalizeMemoryAgentSettings(null)).toEqual({
      displayName: DEFAULT_MEMORY_AGENT_DISPLAY_NAME,
      additionalInstructions: "",
      provider: "",
      modelId: "",
    });
    expect(
      normalizeMemoryAgentSettings({
        displayName: "   ",
        additionalInstructions: 42,
        provider: { nope: true },
        modelId: " gpt-4.1 ",
      }),
    ).toEqual({
      displayName: DEFAULT_MEMORY_AGENT_DISPLAY_NAME,
      additionalInstructions: "",
      provider: "",
      modelId: "gpt-4.1",
    });
  });

  test("update merges partial patches and persists under memory_agent_v2", async () => {
    await updateMemoryAgentSettings({ provider: "openai" });
    await updateMemoryAgentSettings({ modelId: "gpt-4.1" });

    const root = JSON.parse(window.localStorage.getItem("settings") || "{}");
    expect(root.memory_agent_v2).toEqual({
      displayName: DEFAULT_MEMORY_AGENT_DISPLAY_NAME,
      additionalInstructions: "",
      provider: "openai",
      modelId: "gpt-4.1",
    });
    expect(readMemoryAgentSettings().provider).toBe("openai");
  });

  test("notifies subscribers with normalized settings", async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeMemoryAgentSettings(listener);

    await updateMemoryAgentSettings({ displayName: "Archivist" });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: "Archivist" }),
    );

    unsubscribe();
    await updateMemoryAgentSettings({ displayName: "Other" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("write failures stay visible to the caller (rejected promise)", async () => {
    const spy = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("quota exceeded");
      });

    try {
      await expect(
        updateMemoryAgentSettings({ displayName: "Doomed" }),
      ).rejects.toThrow(/localStorage write failed/);
    } finally {
      spy.mockRestore();
    }
  });
});
