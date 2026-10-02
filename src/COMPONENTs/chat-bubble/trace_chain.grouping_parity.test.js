import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { StreamingMessageStoreContext } from "./components/streaming_message_store_context";
import TraceChain from "./trace_chain";
import { createRuntimeEventStreamReplayProjector } from "../../SERVICEs/runtime_events/stream_replay_projector";
import { createRuntimeEventStore } from "../../SERVICEs/runtime_events/event_store";
import {
  createIncrementalActivityTreeProjector,
  reduceActivityTree,
} from "../../SERVICEs/runtime_events/activity_tree";
import { adaptActivityTreeToTraceChain } from "../../SERVICEs/runtime_events/trace_chain_adapter";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const actualV4Events = require("../../../docs/implementation/ticket-383-evidence/observed-sequential.sidecar-runtime-events.json");
const actualV2Frames = require("../../../docs/implementation/ticket-383-evidence/observed-sequential.legacy-frames.json");

const renderTrace = (frames, props = {}) =>
  render(
    <ConfigContext.Provider
      value={{
        theme: { color: "#222", font: { fontFamily: "sans-serif" } },
        onThemeMode: "light_mode",
      }}
    >
      <StreamingMessageStoreContext.Provider
        value={{
          chatId: props.chatId || "chat-a",
          store: null,
          notifyStreamingContentCommitted: jest.fn(),
        }}
      >
        <TraceChain frames={frames} status="done" {...props} />
      </StreamingMessageStoreContext.Provider>
    </ConfigContext.Provider>,
  );

const replay = (events) => {
  const projector = createRuntimeEventStreamReplayProjector();
  let projection = null;
  events.forEach((event, index) => {
    projection = projector.append(event, index + 1);
  });
  return projection;
};

const makeBatchedReplay = (events, batchSize) => {
  const store = createRuntimeEventStore();
  const projector = createIncrementalActivityTreeProjector();
  let activityTree = null;

  for (let start = 0; start < events.length; start += batchSize) {
    store.appendManyForReduction(events.slice(start, start + batchSize));
    activityTree = projector.reduce(store.getReductionSnapshot());
  }

  return adaptActivityTreeToTraceChain(activityTree);
};

describe("TraceChain tool grouping replay and lifecycle parity", () => {
  test("each actual V4 live prefix matches a fresh replay and visible group count", () => {
    const liveProjector = createRuntimeEventStreamReplayProjector();

    actualV4Events.forEach((event, index) => {
      const live = liveProjector.append(event, index + 1);
      const fresh = replay(actualV4Events.slice(0, index + 1));
      const callCount = live.traceFrames.filter(
        (frame) => frame.type === "tool_call",
      ).length;

      expect(live.traceFrames).toEqual(fresh.traceFrames);
      const view = renderTrace(live.traceFrames, {
        messageId: `prefix-${index + 1}`,
        status: live.status,
      });
      if (callCount >= 2) {
        expect(screen.getByText(`×${callCount}`)).toBeInTheDocument();
      } else {
        expect(screen.queryByText(/^×\d+$/)).not.toBeInTheDocument();
      }
      view.unmount();
    });
  });

  test("each actual V2 frame prefix preserves arrived observations and grouping count", () => {
    actualV2Frames.forEach((_frame, index) => {
      const prefix = actualV2Frames.slice(0, index + 1);
      const callCount = prefix.filter((frame) => frame.type === "tool_call").length;
      const observationCount = prefix.filter(
        (frame) => frame.type === "observation",
      ).length;
      const view = renderTrace(prefix, {
        messageId: `legacy-prefix-${index + 1}`,
        status: "streaming",
      });

      if (callCount >= 2) {
        expect(screen.getByText("×2")).toBeInTheDocument();
      } else {
        expect(screen.queryByText(/^×\d+$/)).not.toBeInTheDocument();
      }
      expect(screen.queryAllByText("Observation")).toHaveLength(
        observationCount,
      );
      view.unmount();
    });

    const reopenedFrames = JSON.parse(JSON.stringify(actualV2Frames));
    ["streaming", "waiting", "done", "error"].forEach((status) => {
      const view = renderTrace(reopenedFrames, {
        messageId: `legacy-reopen-${status}`,
        status,
      });
      expect(screen.getByText("×2")).toBeInTheDocument();
      expect(screen.getAllByText("Observation")).toHaveLength(2);
      view.unmount();
    });
  });

  test("one-at-a-time and different event batch sizes produce the same trace frames", () => {
    const expected = replay(actualV4Events).traceFrames;

    [1, 2, 3, actualV4Events.length].forEach((batchSize) => {
      const actual = makeBatchedReplay(actualV4Events, batchSize);
      expect(actual.frames).toEqual(expected);
      const view = renderTrace(actual.frames, {
        messageId: `batch-${batchSize}`,
      });
      expect(screen.getByText("×2")).toBeInTheDocument();
      view.unmount();
    });
  });

  test("duplicate event replay keeps the original execution count", () => {
    const duplicated = actualV4Events.flatMap((event) => [event, event]);
    const projection = replay(duplicated);
    const eventStore = createRuntimeEventStore();
    eventStore.appendMany(duplicated);
    const toolCalls = projection.traceFrames.filter(
      (frame) => frame.type === "tool_call",
    );

    expect(toolCalls).toHaveLength(2);
    expect(eventStore.getSnapshot().diagnostics.duplicateEvents).toHaveLength(
      actualV4Events.length,
    );
    const view = renderTrace(projection.traceFrames, { messageId: "duplicate" });
    expect(screen.getByText("×2")).toBeInTheDocument();
    view.unmount();
  });

  test("serialized reopen and paused/settled snapshots keep the same grouped calls", () => {
    const projection = replay(actualV4Events);
    const reopenedFrames = JSON.parse(JSON.stringify(projection.traceFrames));

    ["streaming", "waiting", "paused", "stopped", "done", "error"].forEach((status) => {
      const view = renderTrace(reopenedFrames, {
        messageId: `reopen-${status}`,
        status,
      });
      expect(screen.getByText("×2")).toBeInTheDocument();
      view.unmount();
    });
  });

  test("a partial same-tool snapshot stays grouped when paused or stopped", () => {
    const toolStartIndices = actualV4Events.reduce((indices, event, index) => {
      if (event.type === "step.started" && event.payload?.step_type === "tool") {
        indices.push(index);
      }
      return indices;
    }, []);
    expect(toolStartIndices.length).toBeGreaterThanOrEqual(2);
    const partial = replay(actualV4Events.slice(0, toolStartIndices[1] + 1));
    expect(
      partial.traceFrames.filter((frame) => frame.type === "tool_call"),
    ).toHaveLength(2);

    ["streaming", "waiting", "paused", "stopped"].forEach((status) => {
      const view = renderTrace(partial.traceFrames, {
        messageId: `partial-${status}`,
        status,
      });
      expect(screen.getByText("×2")).toBeInTheDocument();
      view.unmount();
    });
  });

  test("same-tool calls in an expanded nested subagent trace remain grouped", () => {
    const frame = (seq, type, payload = {}, runId = "root-run") => ({
      seq,
      ts: seq * 100,
      run_id: runId,
      iteration: 0,
      type,
      payload,
    });
    const rootFrames = [
      frame(1, "stream_started"),
      frame(2, "tool_call", {
        call_id: "delegate-1",
        tool_name: "delegate_to_subagent",
        arguments: { target: "analyzer", task: "Read fixtures" },
      }),
      frame(3, "tool_result", {
        call_id: "delegate-1",
        tool_name: "delegate_to_subagent",
        result: {
          agent_name: "developer.analyzer.1",
          template_name: "analyzer",
          status: "completed",
        },
      }),
    ];
    const childFrames = [
      frame(1, "stream_started", {}, "child-run"),
      frame(
        2,
        "tool_call",
        {
          call_id: "child-a",
          tool_name: "read_file",
          arguments: { path: "a.txt" },
        },
        "child-run",
      ),
      frame(
        3,
        "tool_result",
        { call_id: "child-a", tool_name: "read_file", result: "A" },
        "child-run",
      ),
      frame(
        4,
        "tool_call",
        {
          call_id: "child-b",
          tool_name: "read_file",
          arguments: { path: "b.txt" },
        },
        "child-run",
      ),
      frame(
        5,
        "tool_result",
        { call_id: "child-b", tool_name: "read_file", result: "B" },
        "child-run",
      ),
    ];

    renderTrace(rootFrames, {
      subagentFrames: { "child-run": childFrames },
      subagentMetaByRunId: {
        "child-run": {
          subagentId: "developer.analyzer.1",
          mode: "delegate",
          template: "analyzer",
          status: "completed",
        },
      },
    });

    expect(screen.getByText("×2")).toBeInTheDocument();
  });

  test("expanded observation state does not cross message or chat reuse", () => {
    const firstFrames = [
      {
        seq: 1,
        ts: 100,
        run_id: "run-a",
        type: "tool_call",
        payload: { call_id: "a", tool_name: "read_file" },
      },
      {
        seq: 2,
        ts: 200,
        run_id: "run-a",
        type: "tool_result",
        payload: { call_id: "a", tool_name: "read_file", result: "A" },
      },
      {
        seq: 3,
        ts: 300,
        run_id: "run-a",
        type: "observation",
        payload: { call_id: "a", content: "first message output" },
      },
    ];
    const secondFrames = firstFrames.map((frame) => ({
      ...frame,
      payload:
        frame.type === "observation"
          ? { ...frame.payload, content: "second message output" }
          : frame.payload,
    }));
    const view = renderTrace(firstFrames, { chatId: "chat-a", messageId: "message-a" });
    const detailControls = () =>
      screen
        .getAllByRole("button")
        .map((button) => button.textContent.trim())
        .filter((label) => label === "detail" || label === "hide");
    const detailButtons = screen
      .getAllByRole("button")
      .filter((button) => button.textContent.trim() === "detail");
    fireEvent.click(detailButtons[1]);
    expect(detailControls()).toEqual(["detail", "hide"]);

    view.rerender(
      <ConfigContext.Provider
        value={{
          theme: { color: "#222", font: { fontFamily: "sans-serif" } },
          onThemeMode: "light_mode",
        }}
      >
        <StreamingMessageStoreContext.Provider
          value={{
            chatId: "chat-b",
            store: null,
            notifyStreamingContentCommitted: jest.fn(),
          }}
        >
          <TraceChain
            frames={secondFrames}
            status="done"
            messageId="message-b"
          />
        </StreamingMessageStoreContext.Provider>
      </ConfigContext.Provider>,
    );

    expect(detailControls()).toEqual(["detail", "detail"]);
  });

  test("expanded grouped output state does not cross message or chat reuse", () => {
    const makeFrames = (prefix, outputLabel) => [
      {
        seq: 1,
        ts: 100,
        run_id: `${prefix}-run`,
        type: "tool_call",
        payload: {
          call_id: `${prefix}-a`,
          tool_name: "read_file",
          arguments: { path: `${prefix}-a.txt` },
        },
      },
      {
        seq: 2,
        ts: 200,
        run_id: `${prefix}-run`,
        type: "tool_result",
        payload: {
          call_id: `${prefix}-a`,
          tool_name: "read_file",
          result: "A",
        },
      },
      {
        seq: 3,
        ts: 300,
        run_id: `${prefix}-run`,
        type: "observation",
        payload: { call_id: `${prefix}-a`, content: outputLabel },
      },
      {
        seq: 4,
        ts: 400,
        run_id: `${prefix}-run`,
        type: "tool_call",
        payload: {
          call_id: `${prefix}-b`,
          tool_name: "read_file",
          arguments: { path: `${prefix}-b.txt` },
        },
      },
      {
        seq: 5,
        ts: 500,
        run_id: `${prefix}-run`,
        type: "tool_result",
        payload: {
          call_id: `${prefix}-b`,
          tool_name: "read_file",
          result: "B",
        },
      },
      {
        seq: 6,
        ts: 600,
        run_id: `${prefix}-run`,
        type: "observation",
        payload: { call_id: `${prefix}-b`, content: `${outputLabel} second` },
      },
    ];
    const detailControls = () =>
      screen
        .getAllByRole("button")
        .map((button) => button.textContent.trim())
        .filter((label) => label === "detail" || label === "hide");
    const firstFrames = makeFrames("first", "first grouped output");
    const secondFrames = makeFrames("second", "second grouped output");
    const view = renderTrace(firstFrames, {
      chatId: "chat-a",
      messageId: "message-a",
    });

    expect(screen.getByText("×2")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button").find(
      (button) => button.textContent.trim() === "detail",
    ));
    expect(detailControls()[0]).toBe("hide");
    fireEvent.click(
      screen
        .getAllByRole("button")
        .filter((button) => button.textContent.trim() === "detail")[1],
    );
    expect(detailControls()[2]).toBe("hide");

    view.rerender(
      <ConfigContext.Provider
        value={{
          theme: { color: "#222", font: { fontFamily: "sans-serif" } },
          onThemeMode: "light_mode",
        }}
      >
        <StreamingMessageStoreContext.Provider
          value={{
            chatId: "chat-b",
            store: null,
            notifyStreamingContentCommitted: jest.fn(),
          }}
        >
          <TraceChain
            frames={secondFrames}
            status="done"
            messageId="message-b"
          />
        </StreamingMessageStoreContext.Provider>
      </ConfigContext.Provider>,
    );

    expect(screen.getByText("×2")).toBeInTheDocument();
    fireEvent.click(
      screen
        .getAllByRole("button")
        .find((button) => button.textContent.trim() === "detail"),
    );
    expect(detailControls()[0]).toBe("hide");
    expect(detailControls()[2]).toBe("detail");
  });
});
