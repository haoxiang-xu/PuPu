import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { createStreamingMessageStore } from "../../SERVICEs/streaming_message_store";
import {
  StreamingMessageStoreContext,
} from "./components/streaming_message_store_context";
import TraceChain from "./trace_chain";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const renderTraceChain = ({
  frames,
  status = "done",
  streamingContent = "",
  messageId = "assistant",
  streamingMessageStore = null,
  notifyStreamingContentCommitted = jest.fn(),
  onToolConfirmationDecision = null,
  toolConfirmationUiStateById = {},
  subagentFrames = undefined,
  subagentMetaByRunId = undefined,
}) =>
  render(
    <ConfigContext.Provider
      value={{
        theme: { color: "#222", font: { fontFamily: "sans-serif" } },
        onThemeMode: "light_mode",
      }}
    >
      <StreamingMessageStoreContext.Provider
        value={{
          chatId: "chat",
          store: streamingMessageStore,
          notifyStreamingContentCommitted,
        }}
      >
        <TraceChain
          frames={frames}
          status={status}
          messageId={messageId}
          streamingContent={streamingContent}
          onToolConfirmationDecision={onToolConfirmationDecision}
          toolConfirmationUiStateById={toolConfirmationUiStateById}
          subagentFrames={subagentFrames}
          subagentMetaByRunId={subagentMetaByRunId}
        />
      </StreamingMessageStoreContext.Provider>
    </ConfigContext.Provider>,
  );

const frame = ({ seq, type, payload = {}, ts = seq * 100 }) => ({
  seq,
  ts,
  type,
  payload,
});

const makeRafScheduler = () => {
  const callbacks = [];
  return {
    scheduler: (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    },
    cancel: (id) => {
      callbacks[id - 1] = null;
    },
    flush: () => {
      const pending = callbacks.splice(0);
      pending.forEach((callback) => {
        if (typeof callback === "function") {
          callback();
        }
      });
    },
  };
};

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

  test("routes draft to timeline and terminal to bubble by finality, with no tool_call", () => {
    // #155-B: ownership is gated by finality, not by tool presence. A no-tool turn
    // with an explicit draft + terminal must render the draft in the timeline and
    // the terminal as the bubble body (never both), so the answer is not duplicated.
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "final_message",
        payload: { content: "candidate draft", finality: "draft" },
      }),
      frame({
        seq: 3,
        type: "final_message",
        payload: { content: "final answer", finality: "terminal" },
      }),
      frame({ seq: 4, type: "done", payload: {} }),
    ];

    renderTraceChain({ frames, status: "done" });

    expect(screen.getByText("candidate draft")).toBeInTheDocument();
    expect(screen.queryByText("final answer")).not.toBeInTheDocument();
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

  test("renders leading whitespace streaming content as plain text", () => {
    const { container } = renderTraceChain({
      frames: [frame({ seq: 1, type: "stream_started", payload: {} })],
      status: "streaming",
      streamingContent: "    const x = 1;\n",
    });

    expect(container.querySelector("code.hljs")).not.toBeInTheDocument();
    expect(
      container.querySelector("[data-streaming-plain-text]"),
    ).toBeInTheDocument();
    expect(container).toHaveTextContent("const x = 1;");
  });

  test("uses the same text metrics as the final assistant response while streaming", () => {
    const { container } = renderTraceChain({
      frames: [frame({ seq: 1, type: "stream_started", payload: {} })],
      status: "streaming",
      streamingContent: "Paragraph one.\n\nParagraph two.",
    });

    const streamingText = container.querySelector("[data-streaming-plain-text]");
    expect(streamingText).toBeInTheDocument();
    expect(streamingText).toHaveStyle({ fontSize: "14px", lineHeight: "1.6" });
  });

  test("reads active streaming response text from the external store", () => {
    const raf = makeRafScheduler();
    const store = createStreamingMessageStore({
      notifyScheduler: raf.scheduler,
      cancelScheduler: raf.cancel,
    });
    store.begin({ chatId: "chat", messageId: "assistant" });
    const { container } = renderTraceChain({
      frames: [],
      status: "streaming",
      messageId: "assistant",
      streamingContent: "",
      streamingMessageStore: store,
    });

    expect(screen.getAllByText("Thinking…").length).toBeGreaterThan(0);

    store.append({
      chatId: "chat",
      messageId: "assistant",
      delta: "streamed via store",
    });
    act(() => {
      raf.flush();
    });

    expect(screen.getByText("Response")).toBeInTheDocument();
    expect(container.textContent).toContain("streamed via store");
  });

  test("does not render the current streaming response twice when final_message mirrors the external store", () => {
    const raf = makeRafScheduler();
    const store = createStreamingMessageStore({
      notifyScheduler: raf.scheduler,
      cancelScheduler: raf.cancel,
    });
    store.begin({ chatId: "chat", messageId: "assistant" });
    store.append({
      chatId: "chat",
      messageId: "assistant",
      delta: "current streamed response",
    });
    store.flushNow({ chatId: "chat", messageId: "assistant" });

    const { container } = renderTraceChain({
      frames: [
        frame({ seq: 1, type: "stream_started", payload: {} }),
        frame({
          seq: 2,
          type: "tool_call",
          payload: { call_id: "call-1", tool_name: "read_file", arguments: {} },
        }),
        frame({
          seq: 3,
          type: "final_message",
          payload: { content: "current streamed response" },
        }),
      ],
      status: "streaming",
      messageId: "assistant",
      streamingMessageStore: store,
    });

    expect(screen.getAllByText("Response")).toHaveLength(1);
    expect(
      (container.textContent || "").match(/current streamed response/g),
    ).toHaveLength(1);
  });

  test("does not render stale streaming final_message snapshots beside the live response", () => {
    const raf = makeRafScheduler();
    const store = createStreamingMessageStore({
      notifyScheduler: raf.scheduler,
      cancelScheduler: raf.cancel,
    });
    store.begin({ chatId: "chat", messageId: "assistant" });
    store.append({
      chatId: "chat",
      messageId: "assistant",
      delta: "current streamed response plus continuation",
    });
    store.flushNow({ chatId: "chat", messageId: "assistant" });

    const { container } = renderTraceChain({
      frames: [
        frame({ seq: 1, type: "stream_started", payload: {} }),
        frame({
          seq: 2,
          type: "tool_call",
          payload: { call_id: "call-1", tool_name: "read_file", arguments: {} },
        }),
        frame({
          seq: 3,
          type: "final_message",
          payload: { content: "current streamed response" },
        }),
      ],
      status: "streaming",
      messageId: "assistant",
      streamingMessageStore: store,
    });

    expect(screen.getAllByText("Response")).toHaveLength(1);
    expect(screen.queryByText("current streamed response")).not.toBeInTheDocument();
    expect(container).toHaveTextContent(
      "current streamed response plus continuation",
    );
  });

  test("uses tighter markdown spacing for observation details", () => {
    const { container } = renderTraceChain({
      frames: [
        frame({ seq: 1, type: "stream_started", payload: {} }),
        frame({
          seq: 2,
          type: "observation",
          payload: { observation: "# README\n\n- First item\n- Second item" },
        }),
      ],
      status: "done",
    });

    fireEvent.click(screen.getByRole("button", { name: /detail/i }));

    const markdownRoot = container.querySelector("[data-markdown-id]");
    expect(markdownRoot).toBeInTheDocument();

    const styleTag = markdownRoot.querySelector("style");
    expect(styleTag?.textContent).toContain("margin-top: 6px;");
    expect(styleTag?.textContent).toContain("padding-left: 18px;");
    expect(styleTag?.textContent).toContain("margin: 0;");
  });

  test("prefers tool_display_name over canonical tool_name in the timeline", () => {
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_call",
        payload: {
          call_id: "call-1",
          tool_name: "workspace_2_extra_root_read_file",
          tool_display_name: "read_file",
          arguments: { path: "hello.txt" },
        },
      }),
    ];

    renderTraceChain({ frames, status: "done" });

    expect(screen.getByText("read_file")).toBeInTheDocument();
    expect(
      screen.queryByText("workspace_2_extra_root_read_file"),
    ).not.toBeInTheDocument();
  });

  test("right-aligns timeline delta labels to the row edge", () => {
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {}, ts: 0 }),
      frame({
        seq: 2,
        type: "reasoning",
        payload: { reasoning: "Read the project structure first." },
        ts: 120,
      }),
      frame({
        seq: 3,
        type: "tool_call",
        payload: {
          call_id: "call-1",
          tool_name: "read_file",
          arguments: { path: "src/example.js" },
        },
        ts: 450,
      }),
    ];

    renderTraceChain({ frames, status: "done" });

    ["+120ms", "+330ms"].forEach((label) => {
      const delta = screen.getByText(label);
      expect(delta.parentElement).toHaveStyle({
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
      });
      expect(delta).toHaveStyle({
        marginLeft: "auto",
        textAlign: "right",
        flexShrink: "0",
      });
    });
  });

  test("renders tool confirmation actions and forwards allow decision", () => {
    const onToolConfirmationDecision = jest.fn();
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_call",
        payload: {
          call_id: "call-1",
          confirmation_id: "confirm-1",
          requires_confirmation: true,
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

    const allowButton = screen.getByRole("button", { name: "Allow once" });
    fireEvent.click(allowButton);
    expect(onToolConfirmationDecision).toHaveBeenCalledWith({
      confirmationId: "confirm-1",
      approved: true,
      scope: "once",
    });
    expect(screen.getByRole("button", { name: "Deny" })).toBeInTheDocument();
  });

  test("forwards code diff approval as confirmation without user response", () => {
    const onToolConfirmationDecision = jest.fn();
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_call",
        payload: {
          call_id: "call-1",
          confirmation_id: "confirm-1",
          requires_confirmation: true,
          tool_name: "write",
          interact_type: "code_diff",
          interact_config: {
            title: "Create demo.txt",
            operation: "create",
            path: "/workspace/demo.txt",
            unified_diff:
              "--- a//workspace/demo.txt\n+++ b//workspace/demo.txt\n@@ -0,0 +1 @@\n+hello\n",
            truncated: false,
            total_lines: 4,
            displayed_lines: 4,
            fallback_description: "create demo.txt (+1 -0)",
          },
          arguments: { path: "/workspace/demo.txt", content: "hello" },
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

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    expect(onToolConfirmationDecision).toHaveBeenCalledWith({
      confirmationId: "confirm-1",
      approved: true,
      scope: "once",
    });
  });

  test("renders selector requests and submits other text responses", () => {
    const onToolConfirmationDecision = jest.fn();
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_call",
        payload: {
          call_id: "call-1",
          confirmation_id: "confirm-1",
          requires_confirmation: true,
          tool_name: "ask_user_question",
          interact_type: "single",
          interact_config: {
            title: "Angry Birds - Tech Stack",
            question: "Which stack do you want to use?",
            selection_mode: "single",
            options: [
              {
                label: "Web Canvas",
                value: "web_canvas",
                description: "Runs in the browser",
              },
            ],
            allow_other: true,
            other_label: "Other option",
            other_placeholder: "Describe it",
          },
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

    expect(screen.getByText("Which stack do you want to use?")).toBeInTheDocument();
    expect(screen.getByText("Web Canvas")).toBeInTheDocument();
    expect(screen.getByText("Other option")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "detail" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Other option"));
    fireEvent.change(screen.getByPlaceholderText("Describe it"), {
      target: { value: "Custom engine" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onToolConfirmationDecision).toHaveBeenCalledWith({
      confirmationId: "confirm-1",
      approved: true,
      userResponse: {
        value: "__other__",
        other_text: "Custom engine",
      },
      scope: "once",
    });
  });

  test("hides tool confirmation actions after confirmation is resolved", () => {
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_call",
        payload: {
          call_id: "call-1",
          confirmation_id: "confirm-1",
          requires_confirmation: true,
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
        type: "tool_call",
        payload: {
          call_id: "call-1",
          confirmation_id: "confirm-1",
          requires_confirmation: true,
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
        type: "tool_call",
        payload: {
          call_id: "call-1",
          confirmation_id: "confirm-1",
          requires_confirmation: true,
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

  test("restores persisted selector answers from confirmation trace frames", () => {
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_call",
        payload: {
          call_id: "call-1",
          confirmation_id: "confirm-1",
          requires_confirmation: true,
          tool_name: "ask_user_question",
          interact_type: "single",
          interact_config: {
            question: "Which stack do you want to use?",
            options: [
              {
                label: "Web Canvas",
                value: "web_canvas",
              },
            ],
            allow_other: true,
            other_label: "Other option",
            other_placeholder: "Describe it",
          },
        },
      }),
      frame({
        seq: 3,
        type: "tool_confirmed",
        payload: {
          call_id: "call-1",
          confirmation_id: "confirm-1",
          tool_name: "ask_user_question",
          user_response: {
            value: "__other__",
            other_text: "Custom engine",
          },
        },
      }),
    ];

    renderTraceChain({
      frames,
      status: "done",
      onToolConfirmationDecision: jest.fn(),
    });

    expect(screen.getByText("Selected")).toBeInTheDocument();
    expect(screen.getByText("Other option")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Custom engine")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
  });

  test("restores persisted selector answers from tool results", () => {
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_call",
        payload: {
          call_id: "call-1",
          confirmation_id: "confirm-1",
          requires_confirmation: true,
          tool_name: "ask_user_question",
          interact_type: "single",
          interact_config: {
            question: "Which stack do you want to use?",
            options: [
              {
                label: "Web Canvas",
                value: "web_canvas",
              },
            ],
            allow_other: true,
            other_label: "Other option",
            other_placeholder: "Describe it",
          },
        },
      }),
      frame({
        seq: 3,
        type: "tool_result",
        payload: {
          call_id: "call-1",
          tool_name: "ask_user_question",
          result: {
            submitted: true,
            selected_values: ["__other__"],
            other_text: "Custom engine",
          },
        },
      }),
    ];

    renderTraceChain({
      frames,
      status: "done",
      onToolConfirmationDecision: jest.fn(),
    });

    expect(screen.getByText("Other option")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Custom engine")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
  });

  test("restores persisted multi-select answers from tool results", () => {
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_call",
        payload: {
          call_id: "call-1",
          confirmation_id: "confirm-1",
          requires_confirmation: true,
          tool_name: "ask_user_question",
          interact_type: "multi",
          interact_config: {
            question: "Which platforms do you want?",
            options: [
              {
                label: "Web",
                value: "web",
              },
              {
                label: "Desktop",
                value: "desktop",
              },
            ],
          },
        },
      }),
      frame({
        seq: 3,
        type: "tool_result",
        payload: {
          call_id: "call-1",
          tool_name: "ask_user_question",
          result: {
            submitted: true,
            selected_values: ["web", "desktop"],
          },
        },
      }),
    ];

    renderTraceChain({
      frames,
      status: "done",
      onToolConfirmationDecision: jest.fn(),
    });

    expect(screen.getByText("Web")).toBeInTheDocument();
    expect(screen.getByText("Desktop")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
  });

  test("renders delegate child output in a separate collapsed timeline using exact subagent mapping", () => {
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_call",
        payload: {
          call_id: "call-1",
          tool_name: "delegate_to_subagent",
          arguments: {
            target: "analyzer",
            task: "Inspect the kernel package",
          },
        },
      }),
      frame({
        seq: 3,
        type: "tool_result",
        payload: {
          call_id: "call-1",
          tool_name: "delegate_to_subagent",
          result: {
            agent_name: "developer.analyzer.1",
            template_name: "analyzer",
            status: "completed",
            output: "Kernel package summary from the child agent.",
          },
        },
      }),
      frame({ seq: 4, type: "done", payload: {} }),
    ];

    renderTraceChain({
      frames,
      status: "done",
      subagentFrames: {
        "child-run-alpha": [
          frame({ seq: 1, type: "stream_started", payload: {}, ts: 10 }),
          frame({
            seq: 2,
            type: "final_message",
            payload: { content: "Child delegate final output" },
            ts: 20,
          }),
          frame({ seq: 3, type: "done", payload: {}, ts: 30 }),
        ],
      },
      subagentMetaByRunId: {
        "child-run-alpha": {
          subagentId: "developer.analyzer.1",
          mode: "delegate",
          template: "analyzer",
          batchId: "",
          parentId: "developer",
          lineage: ["developer", "developer.analyzer.1"],
          status: "completed",
        },
      },
    });

    expect(
      screen.queryByText("Kernel package summary from the child agent."),
    ).not.toBeInTheDocument();

    // Delegate label visible
    expect(screen.getByText("delegate")).toBeInTheDocument();

    // Branches auto-expand — child content visible immediately
    expect(screen.getByText("Child delegate final output")).toBeInTheDocument();
  });

  test("lazy renders large delegate child timelines until expanded", () => {
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_call",
        payload: {
          call_id: "call-1",
          tool_name: "delegate_to_subagent",
          arguments: {
            target: "analyzer",
            task: "Inspect a large trace",
          },
        },
      }),
      frame({
        seq: 3,
        type: "tool_result",
        payload: {
          call_id: "call-1",
          tool_name: "delegate_to_subagent",
          result: {
            agent_name: "developer.analyzer.1",
            template_name: "analyzer",
            status: "completed",
            output: "Large child summary",
          },
        },
      }),
    ];
    const childFrames = [
      frame({ seq: 1, type: "stream_started", payload: {}, ts: 10 }),
      ...Array.from({ length: 26 }, (_, index) =>
        frame({
          seq: index + 2,
          type: "tool_call",
          payload: {
            call_id: `child-call-${index}`,
            tool_name: "read",
            arguments: { path: `file-${index}.js` },
          },
          ts: 20 + index,
        }),
      ),
      frame({
        seq: 30,
        type: "final_message",
        payload: { content: "Large child hidden content" },
        ts: 60,
      }),
    ];

    renderTraceChain({
      frames,
      status: "done",
      subagentFrames: { "child-run-alpha": childFrames },
      subagentMetaByRunId: {
        "child-run-alpha": {
          subagentId: "developer.analyzer.1",
          mode: "delegate",
          template: "analyzer",
          status: "completed",
        },
      },
    });

    expect(
      screen.queryByText("Large child hidden content"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));

    expect(screen.getByText("Large child hidden content")).toBeInTheDocument();
  });

  test("keeps nested subagent detail panels within the trace width", () => {
    const longPath = `src/${"very-long-folder-name-".repeat(12)}target.js`;
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_call",
        payload: {
          call_id: "call-1",
          tool_name: "delegate_to_subagent",
          arguments: {
            target: "analyzer",
            task: "Inspect a nested trace detail",
          },
        },
      }),
      frame({
        seq: 3,
        type: "tool_result",
        payload: {
          call_id: "call-1",
          tool_name: "delegate_to_subagent",
          result: {
            agent_name: "developer.analyzer.1",
            template_name: "analyzer",
            status: "completed",
            output: "Nested child summary",
          },
        },
      }),
    ];

    const { container } = renderTraceChain({
      frames,
      status: "done",
      subagentFrames: {
        "child-run-alpha": [
          frame({ seq: 1, type: "stream_started", payload: {}, ts: 10 }),
          frame({
            seq: 2,
            type: "tool_call",
            payload: {
              call_id: "child-call-1",
              tool_name: "read_file",
              arguments: { path: longPath },
            },
            ts: 20,
          }),
        ],
      },
      subagentMetaByRunId: {
        "child-run-alpha": {
          subagentId: "developer.analyzer.1",
          mode: "delegate",
          template: "analyzer",
          status: "completed",
        },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /detail/i }));

    const traceRoot = container.firstElementChild;
    expect(traceRoot).toHaveStyle({
      width: "100%",
      maxWidth: "100%",
      minWidth: "0",
    });

    let detailCard = screen.getByText(longPath).parentElement;
    while (detailCard && !detailCard.style.background) {
      detailCard = detailCard.parentElement;
    }
    expect(detailCard).toHaveStyle({
      width: "100%",
      maxWidth: "100%",
      boxSizing: "border-box",
    });
    expect(detailCard).not.toHaveStyle({ overflowX: "auto" });

    let childTraceRoot = screen.getByText(longPath);
    while (
      childTraceRoot &&
      childTraceRoot.style.marginBottom !== "0px"
    ) {
      childTraceRoot = childTraceRoot.parentElement;
    }
    expect(childTraceRoot).toBeTruthy();
    expect(
      childTraceRoot.querySelector('[style*="padding-left: 2px"]'),
    ).not.toBeInTheDocument();
  });

  test("forwards selector requests from delegate child timelines", () => {
    const onToolConfirmationDecision = jest.fn();
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_call",
        payload: {
          call_id: "call-1",
          tool_name: "delegate_to_subagent",
          arguments: {
            target: "analyzer",
            task: "Ask the user which surface to inspect",
          },
        },
      }),
      frame({
        seq: 3,
        type: "tool_result",
        payload: {
          call_id: "call-1",
          tool_name: "delegate_to_subagent",
          result: {
            agent_name: "developer.analyzer.1",
            template_name: "analyzer",
            status: "running",
          },
        },
      }),
    ];

    renderTraceChain({
      frames,
      status: "streaming",
      onToolConfirmationDecision,
      toolConfirmationUiStateById: {
        "confirm-child": { status: "idle", error: "" },
      },
      subagentFrames: {
        "child-run-alpha": [
          frame({ seq: 1, type: "stream_started", payload: {}, ts: 10 }),
          frame({
            seq: 2,
            type: "tool_call",
            payload: {
              call_id: "ask-child",
              confirmation_id: "confirm-child",
              requires_confirmation: true,
              tool_name: "ask_user_question",
              interact_type: "single",
              interact_config: {
                question: "Child needs input?",
                options: [{ label: "Frontend", value: "frontend" }],
              },
            },
            ts: 20,
          }),
        ],
      },
      subagentMetaByRunId: {
        "child-run-alpha": {
          subagentId: "developer.analyzer.1",
          mode: "delegate",
          template: "analyzer",
          batchId: "",
          parentId: "developer",
          lineage: ["developer", "developer.analyzer.1"],
          status: "running",
        },
      },
    });

    expect(screen.queryByText("Child needs input?")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("Child needs input?")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Frontend"));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(onToolConfirmationDecision).toHaveBeenCalledWith({
      confirmationId: "confirm-child",
      approved: true,
      userResponse: { value: "frontend" },
      scope: "once",
    });
  });

  test("renders worker batch children as separate collapsed timelines in batch order", () => {
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_call",
        payload: {
          call_id: "call-1",
          tool_name: "spawn_worker_batch",
          arguments: {
            target: "analyzer",
            reason: "Parallelize the review",
            tasks: [{ task: "Inspect kernel" }, { task: "Inspect tools" }],
          },
        },
      }),
      frame({
        seq: 3,
        type: "tool_result",
        payload: {
          call_id: "call-1",
          tool_name: "spawn_worker_batch",
          result: {
            status: "completed",
            results: [
              {
                agent_name: "developer.analyzer.kernel",
                template_name: "analyzer",
                status: "completed",
                output: "Kernel worker summary",
              },
              {
                agent_name: "developer.analyzer.tools",
                template_name: "analyzer",
                status: "completed",
                output: "Tools worker summary",
              },
            ],
          },
        },
      }),
      frame({ seq: 4, type: "done", payload: {} }),
    ];

    renderTraceChain({
      frames,
      status: "done",
      subagentFrames: {
        "child-run-kernel": [
          frame({ seq: 1, type: "stream_started", payload: {}, ts: 10 }),
          frame({
            seq: 2,
            type: "final_message",
            payload: { content: "Kernel child timeline output" },
            ts: 20,
          }),
        ],
        "child-run-tools": [
          frame({ seq: 1, type: "stream_started", payload: {}, ts: 10 }),
          frame({
            seq: 2,
            type: "final_message",
            payload: { content: "Tools child timeline output" },
            ts: 20,
          }),
        ],
      },
      subagentMetaByRunId: {
        "child-run-kernel": {
          subagentId: "developer.analyzer.kernel",
          mode: "worker",
          template: "analyzer",
          batchId: "batch-1",
          parentId: "developer",
          lineage: ["developer", "developer.analyzer.kernel"],
          status: "completed",
        },
        "child-run-tools": {
          subagentId: "developer.analyzer.tools",
          mode: "worker",
          template: "analyzer",
          batchId: "batch-1",
          parentId: "developer",
          lineage: ["developer", "developer.analyzer.tools"],
          status: "completed",
        },
      },
    });

    // Worker result summaries not rendered directly
    expect(screen.queryByText("Kernel worker summary")).not.toBeInTheDocument();
    expect(screen.queryByText("Tools worker summary")).not.toBeInTheDocument();

    // Workers label visible
    expect(screen.getByText("workers")).toBeInTheDocument();

    // Branches auto-expand — child content visible immediately
    expect(screen.getByText("Kernel child timeline output")).toBeInTheDocument();
  });

  test("renders handoff child output in a BranchGraph accessible after expanding", () => {
    const frames = [
      frame({ seq: 1, type: "stream_started", payload: {} }),
      frame({
        seq: 2,
        type: "tool_call",
        payload: {
          call_id: "call-1",
          tool_name: "handoff_to_subagent",
          arguments: {
            target: "developer",
            reason: "Switch to the developer agent",
          },
        },
      }),
      frame({
        seq: 3,
        type: "tool_result",
        payload: {
          call_id: "call-1",
          tool_name: "handoff_to_subagent",
          result: {
            agent_name: "developer",
            status: "completed",
          },
        },
      }),
    ];

    renderTraceChain({
      frames,
      status: "done",
      subagentFrames: {
        "handoff-child-run": [
          frame({ seq: 1, type: "stream_started", payload: {}, ts: 10 }),
          frame({
            seq: 2,
            type: "final_message",
            payload: { content: "This should stay on the main output path." },
            ts: 20,
          }),
        ],
      },
      subagentMetaByRunId: {
        "handoff-child-run": {
          subagentId: "developer",
          mode: "handoff",
          template: "developer",
          batchId: "",
          parentId: "assistant",
          lineage: ["assistant", "developer"],
          status: "completed",
        },
      },
    });

    // Handoff label visible
    expect(screen.getByText("handoff")).toBeInTheDocument();

    // Branches auto-expand — child content visible immediately
    expect(
      screen.getByText("This should stay on the main output path."),
    ).toBeInTheDocument();
  });
});
