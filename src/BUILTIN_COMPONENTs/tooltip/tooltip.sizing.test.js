import { act, fireEvent, render, screen } from "@testing-library/react";
import Tooltip from "./tooltip";

// jsdom has no layout. This models the browser's absolute shrink-to-fit box:
// auto width is constrained by its containing block, while max-content is
// independent of it. The real-browser trace is recorded separately and shows
// the old left tooltip widening by exactly its arrow's 8px on each RO cycle.
describe("Tooltip intrinsic content measurement", () => {
  let intrinsicWidth;
  let observer;
  let originalWidth;
  let originalHeight;
  let originalObserver;
  let raf;
  let caf;
  let rect;
  let styleWidth;

  beforeEach(() => {
    intrinsicWidth = 320;
    observer = null;
    jest.useFakeTimers();
    raf = jest.spyOn(window, "requestAnimationFrame").mockImplementation(cb => setTimeout(() => cb(0), 16));
    caf = jest.spyOn(window, "cancelAnimationFrame").mockImplementation(clearTimeout);
    rect = jest.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => ({
      x: 600, y: 300, left: 600, right: 680, top: 300, bottom: 330, width: 80, height: 30,
    }));
    originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
    originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    originalObserver = global.ResizeObserver;
    // This jsdom version discards max-content before layout. Preserve the
    // CSS keyword; the geometry stub below models its browser semantics.
    styleWidth = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, "width");
    const intrinsicDeclarations = new WeakMap();
    Object.defineProperty(CSSStyleDeclaration.prototype, "width", {
      configurable: true,
      get() { return intrinsicDeclarations.get(this) ?? styleWidth.get.call(this); },
      set(value) {
        if (value === "max-content") intrinsicDeclarations.set(this, value);
        else { intrinsicDeclarations.delete(this); styleWidth.set.call(this, value); }
      },
    });
    global.ResizeObserver = class {
      constructor(callback) { this.callback = callback; observer = this; }
      observe() {}
      disconnect() {}
    };
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get() {
        // Layout stubs must inspect their own DOM box rather than query as a user.
        // eslint-disable-next-line testing-library/no-node-access
        if (!this.querySelector('[data-testid="sizing-content"]') || !this.style.padding) return 0;
        const padding = (parseFloat(this.style.padding) || 0) * 2;
        const cap = parseFloat(this.style.maxWidth) || Infinity;
        const natural = Math.min(intrinsicWidth, cap) + padding;
        if (this.style.width === "max-content") return natural;
        if (/^\d+px$/.test(this.style.width)) return parseFloat(this.style.width) + padding;
        // eslint-disable-next-line testing-library/no-node-access
        const containingWidth = parseFloat(this.parentElement.style.width) || 0;
        return Math.min(natural, Math.max(57, containingWidth));
      },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        // eslint-disable-next-line testing-library/no-node-access
        return this.querySelector('[data-testid="sizing-content"]') && this.style.padding ? 80 : 0;
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalWidth);
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalHeight);
    global.ResizeObserver = originalObserver;
    Object.defineProperty(CSSStyleDeclaration.prototype, "width", styleWidth);
    raf.mockRestore();
    caf.mockRestore();
    rect.mockRestore();
    jest.useRealTimers();
  });

  function show(extra = {}) {
    const view = render(
      <Tooltip position="left" trigger={["click"]}
        tooltip_component={<span data-testid="sizing-content">Natural tooltip content</span>}
        style={{ maxWidth: 320 }} {...extra}>
        <button type="button">Open</button>
      </Tooltip>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    return view;
  }

  const tooltip = () => screen.getByRole("tooltip");
  function resize() {
    act(() => {
      observer.callback([]);
      jest.advanceTimersByTime(16);
    });
  }

  test("the first visible left bubble already has its natural width, including the arrow", () => {
    show();
    expect(tooltip().style.visibility).toBe("visible");
    expect(tooltip().style.width).toBe("340px");
    resize();
    resize();
    expect(tooltip().style.width).toBe("340px");
  });

  test("a larger arrow adds its extent once", () => {
    show({ arrow_size: 16 });
    expect(tooltip().style.width).toBe("348px");
    resize();
    expect(tooltip().style.width).toBe("348px");
  });

  test.each(["top", "bottom", "right"])("natural width is also used at %s", position => {
    show({ position });
    expect(tooltip().style.width).toBe(position === "right" ? "340px" : "332px");
  });

  test("the maximum width still bounds long content", () => {
    intrinsicWidth = 900;
    show();
    expect(tooltip().style.width).toBe("340px");
  });

  test("explicit caller width and padding retain their existing meaning", () => {
    show({ style: { width: 240, padding: 10, maxWidth: 320 } });
    expect(tooltip().style.width).toBe("268px");
  });

  test("content can still shrink and expand after opening", () => {
    show();
    intrinsicWidth = 150;
    resize();
    expect(tooltip().style.width).toBe("170px");
    intrinsicWidth = 400;
    resize();
    expect(tooltip().style.width).toBe("340px");
    expect(screen.getByTestId("sizing-content")).toHaveTextContent("Natural tooltip content");
  });
});
