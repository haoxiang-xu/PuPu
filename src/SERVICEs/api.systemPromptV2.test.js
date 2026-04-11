import { api } from "./api";

const writeSettings = (settings) => {
  window.localStorage.setItem("settings", JSON.stringify(settings || {}));
};

describe("api.unchain.startStreamV2 system prompt injection", () => {
  const originalUnchainApi = window.unchainAPI;

  beforeEach(() => {
    window.localStorage.clear();
    window.unchainAPI = {
      startStreamV2: jest.fn(() => ({ cancel: jest.fn() })),
    };
  });

  afterEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  afterAll(() => {
    window.unchainAPI = originalUnchainApi;
  });

  test("injects runtime settings defaults into options.system_prompt_v2", () => {
    writeSettings({
      runtime: {
        system_prompt_v2: {
          enabled: true,
          sections: {
            personality: "  Helpful and concise  ",
            rules: "Do not fabricate facts.",
          },
        },
      },
    });

    api.unchain.startStreamV2({
      message: "hello",
      options: { modelId: "openai:gpt-5" },
    });

    expect(window.unchainAPI.startStreamV2).toHaveBeenCalledTimes(1);
    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(payload.options.system_prompt_v2).toEqual({
      enabled: true,
      defaults: {
        personality: "Helpful and concise",
        rules: "Do not fabricate facts.",
      },
    });
  });

  test("uses built-in global default rules when runtime config is missing", () => {
    api.unchain.startStreamV2({
      message: "hello",
      options: { modelId: "openai:gpt-5" },
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(payload.options.system_prompt_v2.enabled).toBe(true);
    expect(payload.options.system_prompt_v2.defaults.rules).toContain(
      "Tool use is optional.",
    );
    expect(payload.options.system_prompt_v2.defaults.rules).toContain(
      "Output may be truncated",
    );
  });

  test("keeps caller-provided overrides while injecting runtime defaults", () => {
    writeSettings({
      runtime: {
        system_prompt_v2: {
          enabled: true,
          sections: {
            personality: "Helpful",
            rules: "No hallucinations.",
          },
        },
      },
    });

    api.unchain.startStreamV2({
      message: "hello",
      options: {
        modelId: "openai:gpt-5",
        system_prompt_v2: {
          overrides: {
            rules: "Answer in Chinese.",
            context: null,
          },
        },
      },
    });

    const [payload] = window.unchainAPI.startStreamV2.mock.calls[0];
    expect(payload.options.system_prompt_v2).toEqual({
      enabled: true,
      defaults: {
        personality: "Helpful",
        rules: "No hallucinations.",
      },
      overrides: {
        rules: "Answer in Chinese.",
        context: null,
      },
    });
  });
});
