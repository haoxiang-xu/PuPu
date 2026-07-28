import { act, renderHook } from "@testing-library/react";
import {
  deleteAttachmentPayload,
  loadAttachmentPayload,
  saveAttachmentPayload,
} from "../../../SERVICEs/attachment_storage";
import {
  getChatsStore,
  updateChatDraft,
} from "../../../SERVICEs/chat_storage";
import { readFileAsDataUrl } from "../utils/chat_attachment_utils";
import { useChatAttachments } from "./use_chat_attachments";

jest.mock("../../../SERVICEs/attachment_storage", () => ({
  __esModule: true,
  deleteAttachmentPayload: jest.fn(),
  loadAttachmentPayload: jest.fn(),
  saveAttachmentPayload: jest.fn(),
}));

jest.mock("../../../SERVICEs/chat_storage", () => ({
  __esModule: true,
  getChatsStore: jest.fn(),
  updateChatDraft: jest.fn(),
}));

jest.mock("../utils/chat_attachment_utils", () => ({
  ...jest.requireActual("../utils/chat_attachment_utils"),
  readFileAsDataUrl: jest.fn(),
}));

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const renderAttachmentsHook = ({ setDraftAttachments, setStreamError }) =>
  renderHook(
    ({ chatId, draftAttachments }) =>
      useChatAttachments({
        chatId,
        draftAttachments,
        setDraftAttachments,
        attachmentsEnabled: true,
        attachmentsDisabledReason: "",
        supportsImageAttachments: true,
        supportsPdfAttachments: true,
        setStreamError,
        maxAttachmentBytes: 10_000_000,
        maxAttachmentCount: 5,
      }),
    {
      initialProps: {
        chatId: "chat-a",
        draftAttachments: [],
      },
    },
  );

describe("useChatAttachments async chat isolation", () => {
  const originalScreenshotApi = window.screenshotAPI;

  beforeEach(() => {
    jest.clearAllMocks();
    deleteAttachmentPayload.mockResolvedValue(undefined);
    loadAttachmentPayload.mockResolvedValue(null);
    saveAttachmentPayload.mockResolvedValue(undefined);
    getChatsStore.mockReturnValue({
      chatsById: {
        "chat-a": {
          draft: {
            text: "draft for A",
            attachments: [
              {
                id: "existing-a",
                name: "existing.png",
                mimeType: "image/png",
              },
            ],
          },
        },
        "chat-b": {
          draft: { text: "draft for B", attachments: [] },
        },
      },
    });
  });

  afterAll(() => {
    window.screenshotAPI = originalScreenshotApi;
  });

  test("finishing a file read after switching chats appends only to the source draft", async () => {
    const fileRead = createDeferred();
    readFileAsDataUrl.mockReturnValueOnce(fileRead.promise);
    const setDraftAttachments = jest.fn();
    const setStreamError = jest.fn();
    const { result, rerender } = renderAttachmentsHook({
      setDraftAttachments,
      setStreamError,
    });

    let processing;
    act(() => {
      processing = result.current.processFiles([
        { name: "from-a.png", type: "image/png", size: 3 },
      ]);
    });

    rerender({ chatId: "chat-b", draftAttachments: [] });

    await act(async () => {
      fileRead.resolve("data:image/png;base64,YWJj");
      await processing;
    });

    expect(setDraftAttachments).not.toHaveBeenCalled();
    expect(updateChatDraft).toHaveBeenCalledTimes(1);
    expect(updateChatDraft).toHaveBeenCalledWith(
      "chat-a",
      {
        attachments: [
          expect.objectContaining({ id: "existing-a" }),
          expect.objectContaining({
            kind: "file",
            name: "from-a.png",
            source: "local",
            mimeType: "image/png",
          }),
        ],
      },
      { source: "chat-page" },
    );
    expect(setStreamError).not.toHaveBeenCalled();
  });

  test("finishing a screenshot after switching chats appends only to the source draft", async () => {
    const screenshot = createDeferred();
    window.screenshotAPI = {
      capture: jest.fn(() => screenshot.promise),
    };
    const setDraftAttachments = jest.fn();
    const setStreamError = jest.fn();
    const { result, rerender } = renderAttachmentsHook({
      setDraftAttachments,
      setStreamError,
    });

    let capturing;
    act(() => {
      capturing = result.current.handleScreenshot();
    });

    rerender({ chatId: "chat-b", draftAttachments: [] });

    await act(async () => {
      screenshot.resolve({ ok: true, data: "YWJj", mimeType: "image/png" });
      await capturing;
    });

    expect(setDraftAttachments).not.toHaveBeenCalled();
    expect(updateChatDraft).toHaveBeenCalledTimes(1);
    expect(updateChatDraft).toHaveBeenCalledWith(
      "chat-a",
      {
        attachments: [
          expect.objectContaining({ id: "existing-a" }),
          expect.objectContaining({
            kind: "file",
            name: "screenshot.png",
            source: "screenshot",
            mimeType: "image/png",
          }),
        ],
      },
      { source: "chat-page" },
    );
    expect(setStreamError).not.toHaveBeenCalled();
  });

  test("a background screenshot failure does not show an error in the new chat", async () => {
    const screenshot = createDeferred();
    window.screenshotAPI = {
      capture: jest.fn(() => screenshot.promise),
    };
    const setDraftAttachments = jest.fn();
    const setStreamError = jest.fn();
    const { result, rerender } = renderAttachmentsHook({
      setDraftAttachments,
      setStreamError,
    });

    let capturing;
    act(() => {
      capturing = result.current.handleScreenshot();
    });

    rerender({ chatId: "chat-b", draftAttachments: [] });

    await act(async () => {
      screenshot.resolve({ ok: false, error: "capture failed" });
      await capturing;
    });

    expect(setStreamError).not.toHaveBeenCalled();
    expect(setDraftAttachments).not.toHaveBeenCalled();
    expect(updateChatDraft).not.toHaveBeenCalled();
  });
});
