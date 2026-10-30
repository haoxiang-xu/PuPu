import { act, renderHook } from "@testing-library/react";

import useWindowFullscreen from "./use_window_fullscreen";

let mockListener;
let mockActions;
let mockUnsubscribe;
let mockAvailable;
let mockEventOrder;

jest.mock("../../SERVICEs/bridges/window_state_bridge", () => ({
  windowStateBridge: {
    isAvailable: () => mockAvailable,
    onWindowStateChange: (listener) => {
      mockListener = listener;
      mockEventOrder.push("subscribe");
      return mockUnsubscribe;
    },
    sendWindowAction: (action) => {
      mockActions.push(action);
      mockEventOrder.push(action);
    },
  },
}));

describe("useWindowFullscreen", () => {
  beforeEach(() => {
    mockListener = null;
    mockActions = [];
    mockUnsubscribe = jest.fn();
    mockAvailable = true;
    mockEventOrder = [];
  });

  test("subscribes before requesting a snapshot and follows repeated fullscreen transitions only", () => {
    const { result } = renderHook(() => useWindowFullscreen());

    expect(result.current).toBe(false);
    expect(mockListener).toEqual(expect.any(Function));
    expect(mockActions).toEqual(["get-state"]);
    expect(mockEventOrder).toEqual(["subscribe", "get-state"]);

    act(() => mockListener({ isMaximized: true, isFullScreen: false }));
    expect(result.current).toBe(false);

    act(() => mockListener({ isMaximized: true, isFullScreen: true }));
    expect(result.current).toBe(true);
    act(() => mockListener({ isMaximized: false, isFullScreen: false }));
    expect(result.current).toBe(false);
    act(() => mockListener({ isFullScreen: true }));
    expect(result.current).toBe(true);
    act(() => mockListener({ isFullScreen: false }));
    expect(result.current).toBe(false);
  });

  test.each([undefined, null, {}, { isFullScreen: 1 }, { isFullScreen: "true" }])(
    "missing or malformed fullscreen state defaults to windowed (%p)",
    (payload) => {
      const { result } = renderHook(() => useWindowFullscreen());

      act(() => mockListener({ isFullScreen: true }));
      expect(result.current).toBe(true);
      act(() => mockListener(payload));
      expect(result.current).toBe(false);
    },
  );

  test("does not subscribe or request a snapshot when the bridge is unavailable", () => {
    mockAvailable = false;

    const { result } = renderHook(() => useWindowFullscreen());

    expect(result.current).toBe(false);
    expect(mockListener).toBeNull();
    expect(mockActions).toEqual([]);
  });

  test("unsubscribes when the hook unmounts", () => {
    const { unmount } = renderHook(() => useWindowFullscreen());

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
