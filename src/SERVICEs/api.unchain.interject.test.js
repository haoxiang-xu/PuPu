import { api } from "./api";

describe("api.unchain.interject", () => {
  const originalUnchainApi = window.unchainAPI;

  beforeEach(() => {
    window.unchainAPI = {
      interject: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    window.unchainAPI = originalUnchainApi;
  });

  test("converts camelCase payload to snake_case and returns response as-is", async () => {
    const mockResponse = {
      resolved_channel: "auto",
      message_id: "msg_123",
      answer: "some_answer",
    };
    window.unchainAPI.interject.mockResolvedValue(mockResponse);

    const result = await api.unchain.interject({
      threadId: "thread_456",
      text: "Hello world",
      channel: "auto",
      messageId: "  fyi_client_1  ",
      options: { key: "value" },
    });

    expect(window.unchainAPI.interject).toHaveBeenCalledTimes(1);
    const [payload] = window.unchainAPI.interject.mock.calls[0];
    expect(payload).toEqual({
      thread_id: "thread_456",
      text: "Hello world",
      channel: "auto",
      message_id: "fyi_client_1",
      options: { key: "value" },
    });
    expect(result).toEqual(mockResponse);
  });

  test("trims threadId and text", async () => {
    window.unchainAPI.interject.mockResolvedValue({
      resolved_channel: "auto",
    });

    await api.unchain.interject({
      threadId: "  thread_456  ",
      text: "  Hello world  ",
    });

    const [payload] = window.unchainAPI.interject.mock.calls[0];
    expect(payload.thread_id).toBe("thread_456");
    expect(payload.text).toBe("Hello world");
  });

  test("defaults channel to 'auto' when not provided", async () => {
    window.unchainAPI.interject.mockResolvedValue({
      resolved_channel: "auto",
    });

    await api.unchain.interject({
      threadId: "thread_456",
      text: "Hello",
    });

    const [payload] = window.unchainAPI.interject.mock.calls[0];
    expect(payload.channel).toBe("auto");
  });

  test("defaults channel to 'auto' when empty string provided", async () => {
    window.unchainAPI.interject.mockResolvedValue({
      resolved_channel: "auto",
    });

    await api.unchain.interject({
      threadId: "thread_456",
      text: "Hello",
      channel: "",
    });

    const [payload] = window.unchainAPI.interject.mock.calls[0];
    expect(payload.channel).toBe("auto");
  });

  test("preserves channel value when provided", async () => {
    window.unchainAPI.interject.mockResolvedValue({
      resolved_channel: "direct",
    });

    await api.unchain.interject({
      threadId: "thread_456",
      text: "Hello",
      channel: "direct",
    });

    const [payload] = window.unchainAPI.interject.mock.calls[0];
    expect(payload.channel).toBe("direct");
  });

  test("includes options in request when provided as object", async () => {
    window.unchainAPI.interject.mockResolvedValue({
      resolved_channel: "auto",
    });

    const options = { timeout: 5000, priority: "high" };
    await api.unchain.interject({
      threadId: "thread_456",
      text: "Hello",
      options,
    });

    const [payload] = window.unchainAPI.interject.mock.calls[0];
    expect(payload.options).toEqual(options);
  });

  test("excludes options from request when not provided", async () => {
    window.unchainAPI.interject.mockResolvedValue({
      resolved_channel: "auto",
    });

    await api.unchain.interject({
      threadId: "thread_456",
      text: "Hello",
    });

    const [payload] = window.unchainAPI.interject.mock.calls[0];
    expect(payload.options).toBeUndefined();
  });

  test.each(["", "   ", 123, {}])(
    "rejects invalid optional messageId %p",
    async (messageId) => {
      await expect(
        api.unchain.interject({
          threadId: "thread_456",
          text: "Hello",
          messageId,
        }),
      ).rejects.toMatchObject({
        code: "invalid_interject_payload",
        message: "messageId must be a non-empty string when provided",
      });
    },
  );

  test("throws FrontendApiError when threadId is missing", async () => {
    await expect(
      api.unchain.interject({
        text: "Hello",
      }),
    ).rejects.toMatchObject({
      code: "invalid_interject_payload",
      message: "threadId and text are required",
    });
  });

  test("throws FrontendApiError when threadId is empty string", async () => {
    await expect(
      api.unchain.interject({
        threadId: "",
        text: "Hello",
      }),
    ).rejects.toMatchObject({
      code: "invalid_interject_payload",
    });
  });

  test("throws FrontendApiError when threadId is only whitespace", async () => {
    await expect(
      api.unchain.interject({
        threadId: "   ",
        text: "Hello",
      }),
    ).rejects.toMatchObject({
      code: "invalid_interject_payload",
    });
  });

  test("throws FrontendApiError when text is missing", async () => {
    await expect(
      api.unchain.interject({
        threadId: "thread_456",
      }),
    ).rejects.toMatchObject({
      code: "invalid_interject_payload",
      message: "threadId and text are required",
    });
  });

  test("throws FrontendApiError when text is empty string", async () => {
    await expect(
      api.unchain.interject({
        threadId: "thread_456",
        text: "",
      }),
    ).rejects.toMatchObject({
      code: "invalid_interject_payload",
    });
  });

  test("throws FrontendApiError when text is only whitespace", async () => {
    await expect(
      api.unchain.interject({
        threadId: "thread_456",
        text: "   ",
      }),
    ).rejects.toMatchObject({
      code: "invalid_interject_payload",
    });
  });

  test("throws error with code 'bridge_unavailable' when bridge method missing", async () => {
    window.unchainAPI = {};

    await expect(
      api.unchain.interject({
        threadId: "thread_456",
        text: "Hello",
      }),
    ).rejects.toMatchObject({
      code: "bridge_unavailable",
    });
  });

  test("wraps bridge rejection with toFrontendApiError", async () => {
    const bridgeError = new Error("Bridge failed");
    window.unchainAPI.interject.mockRejectedValue(bridgeError);

    await expect(
      api.unchain.interject({
        threadId: "thread_456",
        text: "Hello",
      }),
    ).rejects.toMatchObject({
      code: "unchain_interject_failed",
    });
  });

  test("uses fallback message when bridge error has no message", async () => {
    const bridgeError = new Error();
    bridgeError.message = "";
    window.unchainAPI.interject.mockRejectedValue(bridgeError);

    await expect(
      api.unchain.interject({
        threadId: "thread_456",
        text: "Hello",
      }),
    ).rejects.toMatchObject({
      code: "unchain_interject_failed",
      message: "Failed to send interject message",
    });
  });

  test("returns object with resolved_channel when response is not an object", async () => {
    window.unchainAPI.interject.mockResolvedValue("not_an_object");

    const result = await api.unchain.interject({
      threadId: "thread_456",
      text: "Hello",
    });

    expect(result).toEqual({ resolved_channel: "new_run" });
  });

  test("returns object with resolved_channel when response is null", async () => {
    window.unchainAPI.interject.mockResolvedValue(null);

    const result = await api.unchain.interject({
      threadId: "thread_456",
      text: "Hello",
    });

    expect(result).toEqual({ resolved_channel: "new_run" });
  });
});
