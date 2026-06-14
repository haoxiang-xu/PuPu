import { act, fireEvent, renderHook } from "@testing-library/react";
import useSmoothResizeFrame from "./use_smooth_resize_frame";

describe("useSmoothResizeFrame", () => {
  let frameSize;
  let frameNode;

  beforeEach(() => {
    jest.useFakeTimers();
    frameSize = { width: 900, height: 640 };
    frameNode = {
      getBoundingClientRect: () => ({
        width: frameSize.width,
        height: frameSize.height,
      }),
    };
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("samples resize movement and commits a fresh final size after resize settles", () => {
    const { result, unmount } = renderHook(() =>
      useSmoothResizeFrame({
        sampleIntervalMs: 50,
        settleDelayMs: 120,
        transitionMs: 180,
      }),
    );

    act(() => {
      result.current.containerRef.current = frameNode;
      result.current.refreshFrame();
    });

    expect(result.current.frame).toEqual({ width: 900, height: 640 });

    act(() => {
      frameSize = { width: 760, height: 560 };
      fireEvent.resize(window);
      jest.advanceTimersByTime(49);
    });

    expect(result.current.frame).toEqual({ width: 900, height: 640 });

    act(() => {
      jest.advanceTimersByTime(1);
    });

    expect(result.current.frame).toEqual({ width: 760, height: 560 });

    act(() => {
      frameSize = { width: 720, height: 530 };
      fireEvent.resize(window);
      frameSize = { width: 700, height: 520 };
      jest.advanceTimersByTime(120);
    });

    expect(result.current.frame).toEqual({ width: 700, height: 520 });
    expect(result.current.frameStyle.transition).toContain("180ms");

    unmount();
  });

  test("uses parent-driven live sizing during keyed layout changes", () => {
    const { result, rerender, unmount } = renderHook(
      ({ resizeKey }) =>
        useSmoothResizeFrame({
          instantResizeKey: resizeKey,
          sampleIntervalMs: 50,
          settleDelayMs: 120,
          transitionMs: 180,
          keyedTransitionMs: 300,
        }),
      {
        initialProps: { resizeKey: "main" },
      },
    );

    act(() => {
      result.current.containerRef.current = frameNode;
      result.current.refreshFrame();
    });

    expect(result.current.frame).toEqual({ width: 900, height: 640 });

    act(() => {
      frameSize = { width: 720, height: 530 };
      rerender({ resizeKey: "side_menu" });
    });

    expect(result.current.frame).toEqual({ width: 720, height: 530 });
    expect(result.current.frameStyle.inset).toBe(0);
    expect(result.current.frameStyle.width).toBeUndefined();
    expect(result.current.frameStyle.height).toBeUndefined();

    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(result.current.frameStyle.width).toBe("720px");
    expect(result.current.frameStyle.height).toBe("530px");
    expect(result.current.frameStyle.transition).toContain("180ms");

    act(() => {
      frameSize = { width: 700, height: 520 };
      fireEvent.resize(window);
      jest.advanceTimersByTime(50);
    });

    expect(result.current.frame).toEqual({ width: 700, height: 520 });
    expect(result.current.frameStyle.transition).toContain("180ms");

    unmount();
  });
});
