import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import TraceChain from "./trace_chain_v3";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const CTX = {
  theme: { color: "#222", font: { fontFamily: "sans-serif" } },
  onThemeMode: "light_mode",
};

const wrap = (props) =>
  render(
    <ConfigContext.Provider value={CTX}>
      <TraceChain {...props} />
    </ConfigContext.Provider>,
  );

const f = ({ seq, type, payload = {}, ts, run_id = "r1" }) => ({
  seq,
  ts: ts ?? seq * 100,
  run_id,
  type,
  payload,
});

/* ═══════════════════════════════════════════════════════════════════════ */

describe("TraceChainV3 — response merge", () => {
  it("merges final_message into preceding tool_call step", () => {
    const { container } = wrap({
      frames: [
        f({ seq: 1, type: "stream_started", run_id: "", payload: {} }),
        f({ seq: 2, type: "tool_call", payload: { call_id: "c1", tool_name: "read_file", arguments: { path: "/x" } } }),
        f({ seq: 3, type: "tool_result", payload: { call_id: "c1", result: { output: "ok" } } }),
        f({ seq: 4, type: "final_message", payload: { content: "I read the file." } }),
        f({ seq: 5, type: "tool_call", payload: { call_id: "c2", tool_name: "write_file", arguments: { path: "/y" } } }),
        f({ seq: 6, type: "tool_result", payload: { call_id: "c2", result: { output: "done" } } }),
        f({ seq: 7, type: "done", run_id: "", payload: { finished_at: 700 } }),
      ],
      status: "done",
      bubbleOwnsFinalMessage: false,
    });

    // "I read the file." should be present (merged into step)
    expect(screen.getByText(/I read the file/)).toBeInTheDocument();

    // It should be inside a data-step-response container
    const stepResponse = container.querySelector("[data-step-response]");
    expect(stepResponse).toBeTruthy();
  });

  it("renders final_message standalone when it precedes all tool_calls", () => {
    const { container } = wrap({
      frames: [
        f({ seq: 1, type: "stream_started", run_id: "", payload: {} }),
        f({ seq: 2, type: "final_message", payload: { content: "Hello first." } }),
        f({ seq: 3, type: "tool_call", payload: { call_id: "c1", tool_name: "search", arguments: {} } }),
        f({ seq: 4, type: "tool_result", payload: { call_id: "c1", result: {} } }),
        f({ seq: 5, type: "done", run_id: "", payload: { finished_at: 500 } }),
      ],
      status: "done",
      bubbleOwnsFinalMessage: false,
    });

    expect(screen.getByText(/Hello first/)).toBeInTheDocument();
  });

  it("does NOT merge final_message into subagent tool_call", () => {
    const { container } = wrap({
      frames: [
        f({ seq: 1, type: "stream_started", run_id: "", payload: {} }),
        f({ seq: 2, type: "tool_call", payload: { call_id: "c1", tool_name: "delegate_to_subagent", arguments: { target: "writer", task: "write" } } }),
        f({ seq: 3, type: "tool_result", payload: { call_id: "c1", result: { status: "completed", agent_name: "writer", output: "done" } } }),
        f({ seq: 4, type: "final_message", payload: { content: "Subagent finished." } }),
        f({ seq: 5, type: "done", run_id: "", payload: { finished_at: 500 } }),
      ],
      status: "done",
      bubbleOwnsFinalMessage: false,
    });

    // "Subagent finished." should still appear — as standalone, not lost
    expect(screen.getByText(/Subagent finished/)).toBeInTheDocument();
  });
});

/* ═══════════════════════════════════════════════════════════════════════ */

describe("TraceChainV3 — error rendering", () => {
  it("renders error as always-visible body (not collapsed details)", () => {
    const { container } = wrap({
      frames: [
        f({ seq: 1, type: "stream_started", run_id: "", payload: {} }),
        f({ seq: 2, type: "error", run_id: "", payload: { code: "rate_limit", message: "Too many requests" } }),
      ],
      status: "error",
    });

    const errorNode = container.querySelector("[data-error-node]");
    expect(errorNode).toBeTruthy();
    expect(errorNode.textContent).toContain("Too many requests");
  });
});

/* ═══════════════════════════════════════════════════════════════════════ */

describe("TraceChainV3 — continuation standalone", () => {
  it("renders __continuation__ with its own block style", () => {
    const { container } = wrap({
      frames: [
        f({ seq: 1, type: "stream_started", run_id: "", payload: {} }),
        f({ seq: 2, type: "tool_call", payload: {
          call_id: "cont1", tool_name: "__continuation__",
          confirmation_id: "cf1", requires_confirmation: true,
          interact_type: "confirmation", interact_config: {},
          description: "Agent reached 5 iterations.",
        } }),
      ],
      status: "streaming",
    });

    const continueBlock = container.querySelector("[data-continue-block]");
    expect(continueBlock).toBeTruthy();
    expect(continueBlock.textContent).toContain("Continue?");
  });
});

/* ═══════════════════════════════════════════════════════════════════════ */

describe("TraceChainV3 — interaction persistence", () => {
  it("shows persisted selection after resolve", () => {
    const { container } = wrap({
      frames: [
        f({ seq: 1, type: "stream_started", run_id: "", payload: {} }),
        f({ seq: 2, type: "tool_call", payload: {
          call_id: "ask1", tool_name: "ask_user_question",
          confirmation_id: "cf1", requires_confirmation: true,
          interact_type: "single",
          interact_config: { question: "Pick one", options: [{ value: "a", label: "A" }, { value: "b", label: "B" }] },
          description: "Pick one",
        } }),
        f({ seq: 3, type: "tool_confirmed", payload: { call_id: "ask1", user_response: { value: "a" } } }),
        f({ seq: 4, type: "tool_result", payload: { call_id: "ask1", result: { output: "User chose A" } } }),
        f({ seq: 5, type: "done", run_id: "", payload: { finished_at: 500 } }),
      ],
      status: "done",
    });

    const persisted = container.querySelector("[data-persisted-selection]");
    expect(persisted).toBeTruthy();
    expect(persisted.textContent).toContain("a");
  });
});

/* ═══════════════════════════════════════════════════════════════════════ */

describe("TraceChainV3 — spinner placement", () => {
  it("hides main spinner when subagent is active", () => {
    wrap({
      frames: [
        f({ seq: 1, type: "stream_started", run_id: "", payload: {} }),
        f({ seq: 2, type: "tool_call", payload: { call_id: "c1", tool_name: "delegate_to_subagent", arguments: { target: "w" } } }),
      ],
      status: "streaming",
      subagentMetaByRunId: { "child-1": { subagentId: "w", status: "running" } },
      subagentFrames: { "child-1": [] },
    });

    // Header shows "Thinking…" but timeline should NOT add its own spinner.
    // So only 1 instance of "Thinking…" (the header), not 2.
    const hits = screen.queryAllByText("Thinking\u2026");
    expect(hits.length).toBe(1);
  });

  it("shows main spinner when no subagent is active", () => {
    wrap({
      frames: [
        f({ seq: 1, type: "stream_started", run_id: "", payload: {} }),
      ],
      status: "streaming",
      streamingContent: "",
    });

    // Header "Thinking…" + timeline spinner "Thinking…" = 2
    const hits = screen.getAllByText("Thinking\u2026");
    expect(hits.length).toBe(2);
  });
});
