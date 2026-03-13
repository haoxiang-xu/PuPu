import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import TraceChain from "./trace_chain";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const renderTraceChain = ({
  frames,
  status = "done",
  streamingContent = "",
  onToolConfirmationDecision = null,
  toolConfirmationUiStateById = {},
}) =>
  render(
    <ConfigContext.Provider
      value={{
        theme: { color: "#222", font: { fontFamily: "sans-serif" } },
        onThemeMode: "light_mode",
      }}
    >
      <TraceChain
        frames={frames}
        status={status}
        streamingContent={streamingContent}
        onToolConfirmationDecision={onToolConfirmationDecision}
        toolConfirmationUiStateById={toolConfirmationUiStateById}
      />
    </ConfigContext.Provider>,
  );

const frame = ({ seq, type, payload = {}, ts = seq * 100 }) => ({
  seq,
  ts,
  type,
  payload,
});

describe("TraceChain final_message draft timeline", () => {
  test("shows one Assistant Draft for tool_call + two final_message frames", () => {
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_call",
        payload: { call_id: "call-1", tool_name: "read_file", arguments: {} },
      }),
      frame({
        seq: 3,
        type: "tool_result",
        payload: { call_id: "call-1", result: { content: "file body" } },
      }),
      frame({
        seq: 4,
        type: "final_message",
        payload: { content: "intermediate draft content" },
      }),
      frame({
        seq: 5,
        type: "final_message",
        payload: { content: "final answer content" },
      }),
      frame({ seq: 6, type: "done", payload: {} }),
    ];

    renderTraceChain({ frames, status: "done" });

    expect(screen.getAllByText("Response").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("intermediate draft content")).toBeInTheDocument();
    expect(screen.queryByText("final answer content")).not.toBeInTheDocument();
  });

  test("does not show draft when tool_call exists but only one final_message frame", () => {
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_call",
        payload: { call_id: "call-1", tool_name: "read_file", arguments: {} },
      }),
      frame({
        seq: 3,
        type: "final_message",
        payload: { content: "single final content" },
      }),
      frame({ seq: 4, type: "done", payload: {} }),
    ];

    renderTraceChain({ frames, status: "done" });

    expect(screen.queryByText("Assistant Draft")).not.toBeInTheDocument();
    expect(screen.queryByText("single final content")).not.toBeInTheDocument();
  });

  test("does not show draft when no tool_call exists", () => {
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "final_message",
        payload: { content: "candidate draft" },
      }),
      frame({
        seq: 3,
        type: "final_message",
        payload: { content: "final answer" },
      }),
      frame({ seq: 4, type: "done", payload: {} }),
    ];

    renderTraceChain({ frames, status: "done" });

    expect(screen.queryByText("Assistant Draft")).not.toBeInTheDocument();
    expect(screen.queryByText("candidate draft")).not.toBeInTheDocument();
  });

  test("keeps existing reasoning/tool/error items while inserting draft in sequence", () => {
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({ seq: 2, type: "reasoning", payload: { reasoning: "thinking" } }),
      frame({
        seq: 3,
        type: "tool_call",
        payload: { call_id: "call-1", tool_name: "read_file", arguments: {} },
      }),
      frame({
        seq: 4,
        type: "tool_result",
        payload: { call_id: "call-1", result: { content: "ok" } },
      }),
      frame({
        seq: 5,
        type: "final_message",
        payload: { content: "intermediate draft content" },
      }),
      frame({
        seq: 6,
        type: "final_message",
        payload: { content: "final answer content" },
      }),
      frame({
        seq: 7,
        type: "error",
        payload: { code: "oops", message: "failed" },
      }),
    ];

    const { container } = renderTraceChain({ frames, status: "error" });

    expect(screen.getByText("Reasoning")).toBeInTheDocument();
    expect(screen.getByText("read_file")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("Response")).toBeInTheDocument();

    const timelineText = container.textContent || "";
    expect(timelineText.indexOf("Reasoning")).toBeLessThan(
      timelineText.indexOf("Response"),
    );
    expect(timelineText.indexOf("Response")).toBeLessThan(
      timelineText.indexOf("Error"),
    );
  });

  test("in streaming mode, only non-latest final_message appears as draft", () => {
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_call",
        payload: { call_id: "call-1", tool_name: "read_file", arguments: {} },
      }),
      frame({
        seq: 3,
        type: "final_message",
        payload: { content: "older draft" },
      }),
      frame({
        seq: 4,
        type: "final_message",
        payload: { content: "latest in-progress answer" },
      }),
    ];

    renderTraceChain({ frames, status: "streaming" });

    expect(screen.getAllByText("Response").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("older draft")).toBeInTheDocument();
    expect(screen.getByText("latest in-progress answer")).toBeInTheDocument();
    expect(screen.getAllByText("Thinking…").length).toBeGreaterThan(0);
  });

  test("preserves leading whitespace in streaming content markdown", () => {
    const { container } = renderTraceChain({
      frames: [frame({ seq: 1, type: "stream_started", payload: {} })],
      status: "streaming",
      streamingContent: "    const x = 1;\n",
    });

    expect(container.querySelector("code.hljs")).toBeInTheDocument();
    expect(container).toHaveTextContent("const x = 1;");
  });

  test("uses the same markdown metrics as the final assistant response", () => {
    const { container } = renderTraceChain({
      frames: [frame({ seq: 1, type: "stream_started", payload: {} })],
      status: "streaming",
      streamingContent: "Paragraph one.\n\nParagraph two.",
    });

    const markdownRoot = container.querySelector("[data-markdown-id]");
    expect(markdownRoot).toBeInTheDocument();

    const styleTag = markdownRoot.querySelector("style");
    expect(styleTag?.textContent).toContain("font-size: 14px;");
    expect(styleTag?.textContent).toContain("line-height: 1.6;");
  });

  test("renders tool confirmation actions and forwards allow decision", () => {
    const onToolConfirmationDecision = jest.fn();
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_confirmation_request",
        payload: {
          call_id: "call-1",
          confirmation_id: "confirm-1",
          tool_name: "delete_file",
          arguments: { path: "demo.txt" },
        },
      }),
    ];

    renderTraceChain({
      frames,
      status: "streaming",
      onToolConfirmationDecision,
      toolConfirmationUiStateById: {
        "confirm-1": { status: "idle", error: "" },
      },
    });

    const allowButton = screen.getByRole("button", { name: "Allow" });
    fireEvent.click(allowButton);
    expect(onToolConfirmationDecision).toHaveBeenCalledWith({
      confirmationId: "confirm-1",
      approved: true,
    });
    expect(screen.getByRole("button", { name: "Deny" })).toBeInTheDocument();
  });

  test("hides tool confirmation actions after confirmation is resolved", () => {
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_confirmation_request",
        payload: {
          call_id: "call-1",
          confirmation_id: "confirm-1",
          tool_name: "delete_file",
          arguments: { path: "demo.txt" },
        },
      }),
      frame({
        seq: 3,
        type: "tool_confirmed",
        payload: {
          call_id: "call-1",
          tool_name: "delete_file",
        },
      }),
    ];

    renderTraceChain({
      frames,
      status: "done",
      onToolConfirmationDecision: jest.fn(),
      toolConfirmationUiStateById: {
        "confirm-1": { status: "submitted", error: "" },
      },
    });

    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deny" })).not.toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  test("shows submitted status when confirmation event is missing but UI is resolved", () => {
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_confirmation_request",
        payload: {
          call_id: "call-1",
          confirmation_id: "confirm-1",
          tool_name: "terminal_exec",
          arguments: { cmd: "pwd" },
        },
      }),
      frame({
        seq: 3,
        type: "tool_result",
        payload: {
          call_id: "call-1",
          tool_name: "terminal_exec",
          result: { ok: true },
        },
      }),
    ];

    renderTraceChain({
      frames,
      status: "streaming",
      onToolConfirmationDecision: jest.fn(),
      toolConfirmationUiStateById: {
        "confirm-1": { status: "submitted", error: "", resolved: true },
      },
    });

    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deny" })).not.toBeInTheDocument();
    expect(screen.getByText("Submitted")).toBeInTheDocument();
  });

  test("shows approved status from a resolved local UI decision when follow-up event is missing", () => {
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_confirmation_request",
        payload: {
          call_id: "call-1",
          confirmation_id: "confirm-1",
          tool_name: "terminal_exec",
          arguments: { cmd: "pwd" },
        },
      }),
    ];

    renderTraceChain({
      frames,
      status: "streaming",
      onToolConfirmationDecision: jest.fn(),
      toolConfirmationUiStateById: {
        "confirm-1": {
          status: "submitted",
          error: "",
          resolved: true,
          decision: "approved",
        },
      },
    });

    expect(screen.queryByRole("button", { name: "Allow" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deny" })).not.toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });
});
