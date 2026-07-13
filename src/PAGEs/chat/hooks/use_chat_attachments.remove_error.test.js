import { renderHook, act } from "@testing-library/react";
import { useChatAttachments } from "./use_chat_attachments";
import { toast } from "../../../SERVICEs/toast";
import {
  deleteAttachmentPayload,
} from "../../../SERVICEs/attachment_storage";

jest.mock("../../../SERVICEs/attachment_storage", () => ({
  __esModule: true,
  deleteAttachmentPayload: jest.fn(),
  loadAttachmentPayload: jest.fn(),
  saveAttachmentPayload: jest.fn(),
}));

describe("useChatAttachments.removeDraftAttachment error surfacing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reports an attachment cleanup error when deleteAttachmentPayload rejects", async () => {
    const errorSpy = jest.spyOn(toast, "reportError").mockImplementation(() => "id-1");
    const cleanupError = new Error("quota exceeded");
    deleteAttachmentPayload.mockRejectedValueOnce(cleanupError);

    const initial = [
      { id: "att-1", name: "x.png", mimeType: "image/png", sizeBytes: 100 },
    ];
    const { result } = renderHook(() =>
      useChatAttachments({
        chatId: "c1",
        initialDraftAttachments: initial,
        attachmentsEnabled: true,
        attachmentsDisabledReason: "",
        supportsImageAttachments: true,
        supportsPdfAttachments: true,
        setStreamError: () => {},
        maxAttachmentBytes: 10_000_000,
        maxAttachmentCount: 5,
      }),
    );

    await act(async () => {
      result.current.removeDraftAttachment("att-1");
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(errorSpy).toHaveBeenCalledWith(cleanupError, {
      title: "Attachment storage cleanup failed",
      dedupeKey: "attachment_delete_failed",
    });
    expect(result.current.draftAttachments).toEqual([]);

    errorSpy.mockRestore();
  });
});
