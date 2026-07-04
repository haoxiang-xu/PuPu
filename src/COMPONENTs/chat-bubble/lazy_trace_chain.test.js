import React from "react";
import { act, render, screen } from "@testing-library/react";
import LazyTraceChain from "./lazy_trace_chain";

jest.mock("./trace_chain", () => ({
  __esModule: true,
  // Test double for the DISPLAY_FRAME_TYPES set that lazy_trace_chain reuses
  // for its no-cache estimate. Mirrors the real set (incl. tool_result, which
  // the estimate deliberately excludes from the row count).
  DISPLAY_FRAME_TYPES: new Set([
    "reasoning",
    "observation",
    "tool_call",
    "tool_result",
    "final_message",
    "error",
  ]),
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

  test("mounted real TraceChain is wrapped in a full-width flex item", () => {
    // The wrapper must carry width:100% so it fills the assistant bubble's
    // flex-start column instead of shrink-to-fitting the trace chain.
    render(
      <LazyTraceChain
        frames={[{ seq: 1, type: "tool_call" }]}
        status="done"
      />,
    );
    act(() => {
      idleQueue.forEach((cb) => cb());
    });
    const real = screen.getByTestId("real-trace-chain");
    const wrapper = real.parentElement;
    expect(wrapper.style.width).toBe("100%");
  });

  test("no cache + frames present → placeholder height estimated from display-frame count", () => {
    // 3 rendered rows (reasoning + tool_call + final_message); tool_result is
    // NOT its own row so it must be excluded from the count.
    // estimate = clamp(24, 24 + 3 * 26, 400) = 102
    render(
      <LazyTraceChain
        messageId="est-count"
        frames={[
          { seq: 1, type: "reasoning" },
          { seq: 2, type: "tool_call" },
          { seq: 3, type: "tool_result" },
          { seq: 4, type: "final_message" },
        ]}
        status="done"
      />,
    );
    const placeholder = screen.getByTestId("lazy-trace-placeholder");
    expect(placeholder.style.minHeight).toBe("102px");
  });

  test("no frames → placeholder keeps the 24px baseline", () => {
    render(<LazyTraceChain messageId="est-empty" frames={[]} status="done" />);
    const placeholder = screen.getByTestId("lazy-trace-placeholder");
    expect(placeholder.style.minHeight).toBe("24px");
  });

  test("estimate is clamped to the 400px ceiling", () => {
    // 50 rendered rows → 24 + 50 * 26 = 1324 → clamped to 400
    const manyFrames = Array.from({ length: 50 }, (_, i) => ({
      seq: i + 1,
      type: "tool_call",
    }));
    render(
      <LazyTraceChain
        messageId="est-clamp"
        frames={manyFrames}
        status="done"
      />,
    );
    const placeholder = screen.getByTestId("lazy-trace-placeholder");
    expect(placeholder.style.minHeight).toBe("400px");
  });

  test("remount reuses the measured real height from cache, not the estimate", () => {
    const heightSpy = jest
      .spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockReturnValue(300);

    try {
      // First mount: flush idle so the real TraceChain mounts and its height is
      // measured + cached under messageId "cache-real".
      const first = render(
        <LazyTraceChain
          messageId="cache-real"
          frames={[
            { seq: 1, type: "reasoning" },
            { seq: 2, type: "tool_call" },
          ]}
          status="done"
        />,
      );
      act(() => {
        idleQueue.forEach((cb) => cb());
      });
      expect(screen.getByTestId("real-trace-chain")).toBeInTheDocument();
      first.unmount();

      // Remount fresh (mounted starts false) WITHOUT flushing idle. The
      // placeholder must use the cached 300px, not the 2-frame estimate (76px).
      idleQueue = [];
      render(
        <LazyTraceChain
          messageId="cache-real"
          frames={[
            { seq: 1, type: "reasoning" },
            { seq: 2, type: "tool_call" },
          ]}
          status="done"
        />,
      );
      const placeholder = screen.getByTestId("lazy-trace-placeholder");
      expect(placeholder.style.minHeight).toBe("300px");
    } finally {
      heightSpy.mockRestore();
    }
  });

  describe("streaming measurement gating (perf regression guard)", () => {
    // Reading offsetHeight forces a synchronous reflow. During streaming, a
    // trace_chain frame is appended frequently; if the measurement effect
    // fires on every frameCount change it reads offsetHeight on a hot path
    // that is already full of streaming-store DOM writes. The measurement
    // must be skipped entirely while status === "streaming", and only run
    // once when the message settles (done/error).

    test("does not read offsetHeight while streaming, even as frames keep arriving", () => {
      const heightSpy = jest
        .spyOn(HTMLElement.prototype, "offsetHeight", "get")
        .mockReturnValue(150);

      try {
        const { rerender } = render(
          <LazyTraceChain
            messageId="stream-perf"
            frames={[{ seq: 1, type: "reasoning" }]}
            status="streaming"
          />,
        );
        expect(screen.getByTestId("real-trace-chain")).toBeInTheDocument();

        for (let i = 2; i <= 5; i += 1) {
          const frames = Array.from({ length: i }, (_, idx) => ({
            seq: idx + 1,
            type: "reasoning",
          }));
          act(() => {
            rerender(
              <LazyTraceChain
                messageId="stream-perf"
                frames={frames}
                status="streaming"
              />,
            );
          });
        }

        expect(heightSpy).not.toHaveBeenCalled();
      } finally {
        heightSpy.mockRestore();
      }
    });

    test("measures exactly once when status flips from streaming to done, and caches the result", () => {
      const heightSpy = jest
        .spyOn(HTMLElement.prototype, "offsetHeight", "get")
        .mockReturnValue(222);

      try {
        const { rerender } = render(
          <LazyTraceChain
            messageId="stream-to-done"
            frames={[{ seq: 1, type: "reasoning" }]}
            status="streaming"
          />,
        );
        expect(heightSpy).not.toHaveBeenCalled();

        act(() => {
          rerender(
            <LazyTraceChain
              messageId="stream-to-done"
              frames={[
                { seq: 1, type: "reasoning" },
                { seq: 2, type: "final_message" },
              ]}
              status="done"
            />,
          );
        });

        expect(heightSpy).toHaveBeenCalledTimes(1);

        // The cached height (not the 2-frame estimate of 76px) must be reused
        // on a fresh remount that hasn't flushed idle yet.
        idleQueue = [];
        render(
          <LazyTraceChain
            messageId="stream-to-done"
            frames={[
              { seq: 1, type: "reasoning" },
              { seq: 2, type: "final_message" },
            ]}
            status="done"
          />,
        );
        const placeholder = screen.getByTestId("lazy-trace-placeholder");
        expect(placeholder.style.minHeight).toBe("222px");
      } finally {
        heightSpy.mockRestore();
      }
    });
  });
});
