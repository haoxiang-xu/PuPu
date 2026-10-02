import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import TraceChain from "./trace_chain";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const observedSequentialFrames = require("../../../docs/implementation/ticket-383-evidence/observed-sequential.legacy-frames.json");
const testFrame = (seq, type, payload = {}, run_id = "run-a", iteration = 0) => ({
  seq,
  ts: seq * 100,
  run_id,
  iteration,
  type,
  payload,
});

const renderTraceChain = (frames, props = {}) =>
  render(
    <ConfigContext.Provider
      value={{
        theme: { color: "#222", font: { fontFamily: "sans-serif" } },
        onThemeMode: "light_mode",
      }}
    >
      <TraceChain frames={frames} status="done" {...props} />
    </ConfigContext.Provider>,
  );

describe("TraceChain consecutive tool grouping", () => {
  test("groups the real sequential legacy calls without hiding either observation", () => {
    renderTraceChain(observedSequentialFrames);

    expect(screen.getByText("×2")).toBeInTheDocument();
    expect(screen.getAllByText("Observation")).toHaveLength(2);

    screen.getAllByRole("button").forEach((button) => {
      if (button.textContent.trim() === "detail") {
        fireEvent.click(button);
      }
    });

    expect(screen.getAllByText("Fixture output reviewed safely")).toHaveLength(2);
    expect(screen.getByText("fixture-1.txt")).toBeInTheDocument();
    expect(screen.getByText("fixture-2.txt")).toBeInTheDocument();
  });

  test("keeps owned V4-style output and count-only truncation in member order", () => {
    const callA = testFrame(1, "tool_call", {
      call_id: "call-a",
      tool_name: "read_file",
      arguments: { path: "alpha.txt" },
    });
    const resultA = testFrame(2, "tool_result", {
      call_id: "call-a",
      tool_name: "read_file",
      result: { content: "result alpha" },
    });
    const outputA = testFrame(3, "observation", {
      call_id: "call-a",
      content: "output alpha",
    });
    const callB = testFrame(4, "tool_call", {
      call_id: "call-b",
      tool_name: "read_file",
      tool_display_name: "Read a file",
      arguments: { path: "beta.txt" },
    });
    const resultB = testFrame(5, "tool_result", {
      call_id: "call-b",
      tool_name: "read_file",
      result: { content: "result beta" },
      observation_omitted: 7,
      observation_tail: [],
    });
    const outputB = testFrame(6, "observation", {
      call_id: "call-b",
      content: "output beta",
    });

    renderTraceChain([callA, resultA, outputA, callB, resultB, outputB]);

    expect(screen.getByText("×2")).toBeInTheDocument();
    expect(screen.getAllByText("Observation")).toHaveLength(2);
    const groupDetails = screen
      .getAllByRole("button")
      .find((button) => button.textContent.trim() === "detail");
    fireEvent.click(groupDetails);

    expect(screen.getAllByText("Observation")).toHaveLength(2);
    expect(screen.getByText("+7 more output lines coalesced")).toBeInTheDocument();
    expect(screen.getByText("output alpha")).toBeInTheDocument();
    expect(screen.getByText("output beta")).toBeInTheDocument();
  });

  test("keeps a same-tool call grouped when an earlier call’s truncation result arrives later", () => {
    const callA = testFrame(1, "tool_call", {
      call_id: "call-a",
      tool_name: "read_file",
      arguments: { path: "alpha.txt" },
    });
    const outputA = testFrame(2, "observation", {
      call_id: "call-a",
      content: "output alpha",
    });
    const callB = testFrame(3, "tool_call", {
      call_id: "call-b",
      tool_name: "read_file",
      arguments: { path: "beta.txt" },
    });
    const lateResultA = testFrame(4, "tool_result", {
      call_id: "call-a",
      tool_name: "read_file",
      result: { content: "result alpha" },
      observation_omitted: 7,
      observation_tail: [],
    });

    renderTraceChain([callA, outputA, callB, lateResultA]);

    expect(screen.getByText("×2")).toBeInTheDocument();
    expect(screen.getAllByText("Observation")).toHaveLength(1);
    expect(screen.getByText("+7 more output lines coalesced")).toBeInTheDocument();
    expect(screen.getByText("output alpha")).toBeInTheDocument();
  });

  test("keeps singleton and silent grouped-tool presentation unchanged", () => {
    const singleton = [
      testFrame(1, "tool_call", {
        call_id: "single",
        tool_name: "read_file",
        arguments: { path: "single.txt" },
      }),
    ];
    const { unmount } = renderTraceChain(singleton);
    expect(screen.queryByText("×2")).not.toBeInTheDocument();
    expect(screen.getByText("read_file")).toBeInTheDocument();
    unmount();

    const silent = [
      testFrame(1, "tool_call", {
        call_id: "silent-a",
        tool_name: "read_file",
        arguments: { path: "one.txt" },
      }),
      testFrame(2, "tool_call", {
        call_id: "silent-b",
        tool_name: "read_file",
        arguments: { path: "two.txt" },
      }),
    ];
    renderTraceChain(silent);
    expect(screen.getByText("×2")).toBeInTheDocument();
    const groupDetails = screen
      .getAllByRole("button")
      .find((button) => button.textContent.trim() === "detail");
    fireEvent.click(groupDetails);
    expect(screen.getByText("one.txt")).toBeInTheDocument();
    expect(screen.getByText("two.txt")).toBeInTheDocument();
  });

  test("always mode groups pending confirmations with every member control visible and callable", () => {
    const callA = testFrame(1, "tool_call", {
      call_id: "pending-a",
      tool_name: "web_fetch",
      toolkit_id: "core",
      timeline_merge_policy: "always",
      confirmation_id: "confirm-a",
      requires_confirmation: true,
      interact_type: "confirmation",
      description: "Fetch alpha",
    });
    const callB = testFrame(2, "tool_call", {
      ...callA.payload,
      call_id: "pending-b",
      confirmation_id: "confirm-b",
      description: "Fetch beta",
    });
    const onDecision = jest.fn();

    renderTraceChain([callA, callB], {
      onToolConfirmationDecision: onDecision,
      toolConfirmationUiStateById: {
        "confirm-a": { status: "idle" },
        "confirm-b": { status: "idle" },
      },
    });

    expect(screen.getByText("×2")).toBeInTheDocument();
    const allowButtons = screen.getAllByRole("button", { name: "Allow once" });
    expect(allowButtons).toHaveLength(2);
    fireEvent.click(allowButtons[1]);
    expect(onDecision).toHaveBeenCalledTimes(1);
    expect(onDecision).toHaveBeenCalledWith({
      confirmationId: "confirm-b",
      approved: true,
      scope: "once",
    });
  });

  test("always mode preserves visible answered-question controls for explicit selection opt-in", () => {
    const selectionCall = (seq, callId) =>
      testFrame(seq, "tool_call", {
        call_id: callId,
        tool_name: "ask_user_question",
        timeline_merge_policy: "always",
        confirmation_id: `confirm-${callId}`,
        requires_confirmation: true,
        interact_type: "single",
        interact_config: {
          question: "Pick one thing",
          options: [{ label: "Option A", value: "a" }],
        },
      });

    const onDecision = jest.fn();
    renderTraceChain([selectionCall(1, "question-a"), selectionCall(2, "question-b")], {
      onToolConfirmationDecision: onDecision,
      toolConfirmationUiStateById: {
        "confirm-question-a": { status: "idle" },
        "confirm-question-b": { status: "idle" },
      },
    });

    expect(screen.getByText("×2")).toBeInTheDocument();
    expect(screen.getAllByText("Pick one thing")).toHaveLength(2);
    const options = screen.getAllByText("Option A");
    expect(options).toHaveLength(2);
    fireEvent.click(options[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Submit" })[0]);
    expect(onDecision).toHaveBeenCalledWith({
      confirmationId: "confirm-question-a",
      approved: true,
      userResponse: { value: "a" },
      scope: "once",
    });
  });

  test("does not transfer expanded observation state to a shifted error row", () => {
    const callA = testFrame(1, "tool_call", {
      call_id: "call-a",
      tool_name: "read_file",
      arguments: { path: "alpha.txt" },
    });
    const resultA = testFrame(2, "tool_result", {
      call_id: "call-a",
      tool_name: "read_file",
      result: { content: "result alpha" },
    });
    const outputA = testFrame(3, "observation", {
      call_id: "call-a",
      content: "output alpha",
    });
    const firstFrames = [callA, resultA, outputA];
    const { rerender } = renderTraceChain(firstFrames);
    const detailButtons = screen
      .getAllByRole("button")
      .filter((button) => button.textContent.trim() === "detail");
    expect(detailButtons).toHaveLength(2);
    fireEvent.click(detailButtons[1]);
    expect(screen.getAllByRole("button").some((button) => button.textContent.trim() === "hide")).toBe(true);

    const callB = testFrame(4, "tool_call", {
      call_id: "call-b",
      tool_name: "read_file",
      arguments: { path: "beta.txt" },
    });
    const resultB = testFrame(5, "tool_result", {
      call_id: "call-b",
      tool_name: "read_file",
      result: { content: "result beta" },
    });
    const error = testFrame(6, "error", { message: "after the grouped calls" });
    rerender(
      <ConfigContext.Provider
        value={{
          theme: { color: "#222", font: { fontFamily: "sans-serif" } },
          onThemeMode: "light_mode",
        }}
      >
        <TraceChain frames={[...firstFrames, callB, resultB, error]} status="done" />
      </ConfigContext.Provider>,
    );

    expect(screen.getByText("×2")).toBeInTheDocument();
    expect(screen.getByText("after the grouped calls")).toBeInTheDocument();
    expect(screen.queryByText("hide")).not.toBeInTheDocument();
  });
});
