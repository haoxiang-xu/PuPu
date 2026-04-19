import React from "react";
import { act, render, screen } from "@testing-library/react";
import LazyTraceChain from "./lazy_trace_chain";

jest.mock("./trace_chain", () => ({
  __esModule: true,
  default: ({ frames = [], status = "done" }) => (
    <div data-testid="real-trace-chain">
      real:{frames.length}:{status}
    </div>
  ),
}));

describe("LazyTraceChain", () => {
  const originalIdle = window.requestIdleCallback;
  const originalCancel = window.cancelIdleCallback;
  let idleQueue;

  beforeEach(() => {
    idleQueue = [];
    window.requestIdleCallback = (cb) => {
      idleQueue.push(cb);
      return idleQueue.length;
    };
    window.cancelIdleCallback = () => {};
  });

  afterEach(() => {
    window.requestIdleCallback = originalIdle;
    window.cancelIdleCallback = originalCancel;
  });

  test("renders placeholder before idle and real TraceChain after idle", () => {
    render(
      <LazyTraceChain
        frames={[{ seq: 1, type: "tool_call" }]}
        status="done"
      />,
    );
    expect(screen.getByTestId("lazy-trace-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("real-trace-chain")).toBeNull();

    act(() => {
      idleQueue.forEach((cb) => cb());
    });

    expect(screen.getByTestId("real-trace-chain")).toBeInTheDocument();
    expect(screen.queryByTestId("lazy-trace-placeholder")).toBeNull();
  });

  test("skips lazy gating during streaming — mounts real TraceChain immediately", () => {
    render(<LazyTraceChain frames={[]} status="streaming" />);
    expect(screen.getByTestId("real-trace-chain")).toBeInTheDocument();
    expect(screen.queryByTestId("lazy-trace-placeholder")).toBeNull();
  });
});
