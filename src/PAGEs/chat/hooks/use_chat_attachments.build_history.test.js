import { renderHook } from "@testing-library/react";
import { useChatAttachments } from "./use_chat_attachments";

jest.mock("../../../SERVICEs/attachment_storage", () => ({
  __esModule: true,
  deleteAttachmentPayload: jest.fn(),
  loadAttachmentPayload: jest.fn(),
  saveAttachmentPayload: jest.fn(),
}));

const renderAttachmentsHook = () =>
  renderHook(() =>
    useChatAttachments({
      chatId: "c1",
      attachmentsEnabled: true,
      attachmentsDisabledReason: "",
      supportsImageAttachments: true,
      supportsPdfAttachments: true,
      setStreamError: () => {},
      maxAttachmentBytes: 10_000_000,
      maxAttachmentCount: 5,
    }),
  );

describe("useChatAttachments.buildHistoryForModel interjections", () => {
  test("expands fyi interjections into a preceding user message and drops btw entries", () => {
    const { result } = renderAttachmentsHook();

    const history = result.current.buildHistoryForModel(
      [
        { role: "user", content: "task" },
        {
          role: "assistant",
          content: "done",
          interjections: [
            { type: "fyi", text: "also in Chinese", origin: "user" },
            { type: "btw", text: "eta?", answer: "soon" },
          ],
        },
      ],
      "c1",
    );

    expect(history).toEqual([
      { role: "user", content: "task" },
      {
        role: "user",
        content:
          "<fyi_message>\n(sent while you were working on the previous response)\nalso in Chinese\n</fyi_message>",
      },
      { role: "assistant", content: "done" },
    ]);
  });

  test("passes through a message with no interjections unchanged (regression)", () => {
    const { result } = renderAttachmentsHook();

    const history = result.current.buildHistoryForModel(
      [
        { role: "user", content: "task" },
        { role: "assistant", content: "done" },
      ],
      "c1",
    );

    expect(history).toEqual([
      { role: "user", content: "task" },
      { role: "assistant", content: "done" },
    ]);
  });

  test("emits multiple fyi messages in order for multiple fyi entries", () => {
    const { result } = renderAttachmentsHook();

    const history = result.current.buildHistoryForModel(
      [
        {
          role: "assistant",
          content: "done",
          interjections: [
            { type: "fyi", text: "first" },
            { type: "fyi", text: "second" },
          ],
        },
      ],
      "c1",
    );

    expect(history).toEqual([
      {
        role: "user",
        content:
          "<fyi_message>\n(sent while you were working on the previous response)\nfirst\n</fyi_message>",
      },
      {
        role: "user",
        content:
          "<fyi_message>\n(sent while you were working on the previous response)\nsecond\n</fyi_message>",
      },
      { role: "assistant", content: "done" },
    ]);
  });

  test("does not attach fyi interjections carried on non-assistant messages", () => {
    const { result } = renderAttachmentsHook();

    const history = result.current.buildHistoryForModel(
      [
        {
          role: "system",
          content: "sys",
          interjections: [{ type: "fyi", text: "should not appear" }],
        },
      ],
      "c1",
    );

    expect(history).toEqual([{ role: "system", content: "sys" }]);
  });
});
