/* eslint-env jest */
import { act, render } from "@testing-library/react";
import DotMatrix from "./dot_matrix";

const mockMatchMedia = (matches) => {
  window.matchMedia = jest.fn(() => ({
    matches,
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  }));
};

const stubElementSize = (width = 320, height = 160) => {
  Object.defineProperty(window.HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    value: height,
  });
};

describe("DotMatrix", () => {
  let originalGetContext;
  let originalMatchMedia;
  let originalRAF;
  let originalCAF;
  let originalOffsetWidth;
  let originalOffsetHeight;
  let rafCallbacks;

  beforeEach(() => {
    originalGetContext = window.HTMLCanvasElement.prototype.getContext;
    originalMatchMedia = window.matchMedia;
    originalRAF = window.requestAnimationFrame;
    originalCAF = window.cancelAnimationFrame;
    originalOffsetWidth = Object.getOwnPropertyDescriptor(
      window.HTMLElement.prototype,
      "offsetWidth",
    );
    originalOffsetHeight = Object.getOwnPropertyDescriptor(
      window.HTMLElement.prototype,
      "offsetHeight",
    );

    rafCallbacks = [];
    window.requestAnimationFrame = jest.fn((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    window.cancelAnimationFrame = jest.fn();
    mockMatchMedia(false);
  });

  afterEach(() => {
    window.HTMLCanvasElement.prototype.getContext = originalGetContext;
    window.matchMedia = originalMatchMedia;
    window.requestAnimationFrame = originalRAF;
    window.cancelAnimationFrame = originalCAF;
    if (originalOffsetWidth) {
      Object.defineProperty(window.HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
    }
    if (originalOffsetHeight) {
      Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
    }
  });

  test("renders a canvas and gracefully no-ops when 2d context is unavailable", () => {
    window.HTMLCanvasElement.prototype.getContext = jest.fn(() => null);
    const { container, unmount } = render(<DotMatrix />);
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(() => unmount()).not.toThrow();
  });

  test("renders, runs a render frame, and cleans up (RAF/ResizeObserver/listeners) without throwing on unmount", () => {
    const ctx = {
      clearRect: jest.fn(),
      beginPath: jest.fn(),
      arc: jest.fn(),
      fill: jest.fn(),
      setTransform: jest.fn(),
      scale: jest.fn(),
    };
    window.HTMLCanvasElement.prototype.getContext = jest.fn(() => ctx);
    stubElementSize();

    const { container, unmount } = render(
      <DotMatrix particleColor="rgba(10,20,30,0.10)" />,
    );
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();

    expect(rafCallbacks.length).toBeGreaterThan(0);
    act(() => {
      rafCallbacks[0]();
    });
    expect(ctx.arc).toHaveBeenCalled();
    expect(ctx.fill).toHaveBeenCalled();

    expect(() => unmount()).not.toThrow();
    expect(window.cancelAnimationFrame).toHaveBeenCalled();
  });

  test("reduced motion: disables the canvas (opacity 0) and skips the render effect entirely", () => {
    mockMatchMedia(true);
    const getContextSpy = jest.fn(() => null);
    window.HTMLCanvasElement.prototype.getContext = getContextSpy;

    const { container, unmount } = render(<DotMatrix />);
    const canvas = container.querySelector("canvas");
    expect(canvas).not.toBeNull();
    expect(canvas.style.opacity).toBe("0");
    expect(getContextSpy).not.toHaveBeenCalled();
    expect(() => unmount()).not.toThrow();
  });
});
