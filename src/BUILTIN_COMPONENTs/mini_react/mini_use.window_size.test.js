import { act, renderHook } from "@testing-library/react";
import {
  detectDeviceType,
  detectWebBrowser,
  useDeviceType,
  useWebBrowser,
  useWindowSize,
} from "./mini_use";

describe("useWindowSize", () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;
  let frameQueue;

  beforeEach(() => {
    frameQueue = [];
    window.requestAnimationFrame = jest.fn((callback) => {
      frameQueue.push(callback);
      return frameQueue.length;
    });
    window.cancelAnimationFrame = jest.fn();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1440,
      writable: true,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 900,
      writable: true,
    });
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  test("coalesces resize bursts to one frame and ignores identical dimensions", () => {
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return useWindowSize();
    });

    act(() => {
      frameQueue.splice(0).forEach((callback) => callback());
    });
    const rendersAfterMount = renderCount;

    window.innerWidth = 1200;
    window.innerHeight = 800;
    act(() => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("resize"));
    });
    expect(frameQueue).toHaveLength(1);

    act(() => {
      frameQueue.splice(0).forEach((callback) => callback());
    });
    expect(result.current).toEqual({ width: 1200, height: 800 });
    expect(renderCount).toBe(rendersAfterMount + 1);
    const sizeAfterResize = result.current;

    act(() => {
      window.dispatchEvent(new Event("resize"));
      frameQueue.splice(0).forEach((callback) => callback());
    });
    expect(result.current).toBe(sizeAfterResize);
  });

  test("cancels a pending resize frame on unmount", () => {
    const { unmount } = renderHook(() => useWindowSize());
    expect(frameQueue).toHaveLength(1);

    unmount();

    expect(window.cancelAnimationFrame).toHaveBeenCalledWith(1);
  });

  test("does not reread the viewport while rendering a committed resize", () => {
    let width = 1440;
    let height = 900;
    const readWidth = jest.fn(() => width);
    const readHeight = jest.fn(() => height);
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      get: readWidth,
      set: (value) => {
        width = value;
      },
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      get: readHeight,
      set: (value) => {
        height = value;
      },
    });
    const { result } = renderHook(() => useWindowSize());

    act(() => {
      frameQueue.splice(0).forEach((callback) => callback());
    });
    width = 1200;
    height = 800;
    const widthReadsBeforeResize = readWidth.mock.calls.length;
    const heightReadsBeforeResize = readHeight.mock.calls.length;

    act(() => {
      window.dispatchEvent(new Event("resize"));
      frameQueue.splice(0).forEach((callback) => callback());
    });

    expect(result.current).toEqual({ width: 1200, height: 800 });
    expect(readWidth.mock.calls.length - widthReadsBeforeResize).toBe(1);
    expect(readHeight.mock.calls.length - heightReadsBeforeResize).toBe(1);
  });

  test("caches browser and device detection after the first hook render", () => {
    const originalUserAgent = Object.getOwnPropertyDescriptor(
      window.navigator,
      "userAgent",
    );
    const readUserAgent = jest.fn(() => "Mozilla/5.0 Chrome/120.0");
    Object.defineProperty(window.navigator, "userAgent", {
      configurable: true,
      get: readUserAgent,
    });
    const { rerender, result } = renderHook(() => ({
      browser: useWebBrowser(),
      device: useDeviceType(),
    }));

    expect(result.current).toEqual({ browser: "Chrome", device: "desktop" });
    expect(readUserAgent).toHaveBeenCalledTimes(2);
    rerender();
    expect(readUserAgent).toHaveBeenCalledTimes(2);

    if (originalUserAgent) {
      Object.defineProperty(window.navigator, "userAgent", originalUserAgent);
    } else {
      delete window.navigator.userAgent;
    }
  });

  test("browser and device detection are available on the first render", () => {
    expect(detectWebBrowser()).not.toBeNull();
    expect(["desktop", "mobile"]).toContain(detectDeviceType());
  });
});
