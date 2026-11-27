import { fireEvent, render, screen } from "@testing-library/react";
import Tooltip from "./tooltip";

// jsdom has no layout: the trigger rect and the bubble's measured size are
// stubbed so the placement maths can be checked against a 1000x700 window.
describe("Tooltip keeps menus inside the window", () => {
  let triggerRect;
  let bubble;
  let rect;
  let originalWidth;
  let originalHeight;
  let innerWidth;
  let innerHeight;

  beforeEach(() => {
    bubble = { width: 280, height: 300 };
    innerWidth = window.innerWidth;
    innerHeight = window.innerHeight;
    window.innerWidth = 1000;
    window.innerHeight = 700;
    rect = jest
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(() => triggerRect);
    originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
    originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    // Only the bubble's content box reports a size.
    // eslint-disable-next-line testing-library/no-node-access
    const isContent = (el) => el.style.position === "absolute" && el.firstElementChild?.dataset?.testid === "menu";
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get() { return isContent(this) ? bubble.width : 0; },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get() {
        if (!isContent(this)) return 0;
        const cap = parseFloat(this.style.maxHeight);
        return Number.isFinite(cap) ? Math.min(bubble.height, cap) : bubble.height;
      },
    });
  });

  afterEach(() => {
    rect.mockRestore();
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalWidth);
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalHeight);
    window.innerWidth = innerWidth;
    window.innerHeight = innerHeight;
  });

  const at = (left, top, width = 84, height = 26) => {
    triggerRect = { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
  };

  function open(extra = {}) {
    render(
      <Tooltip position="bottom" align="start" offset={8} show_arrow={false} trigger={["click"]}
        style={{ padding: 0 }} tooltip_component={<div data-testid="menu">menu</div>} {...extra}>
        <button type="button">Open</button>
      </Tooltip>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    return screen.getByRole("tooltip");
  }

  test("a menu near the right edge is pulled in, keeping the window margin", () => {
    at(900, 100);
    const t = open({ fit_viewport: true });
    expect(t.style.left).toBe(`${1000 - 8 - 280}px`);
    expect(t.style.transform).toBe("translate(0%, 0%)");
  });

  test("a fit_viewport menu is not capped at the plain-tooltip 260px width", () => {
    at(100, 100);
    const t = open({ fit_viewport: true });
    // eslint-disable-next-line testing-library/no-node-access
    const content = screen.getByTestId("menu").parentElement;
    expect(content.style.maxWidth).toBe("calc(100vw - 16px)");
    expect(t.style.width).toBe("280px");
  });

  test("a menu near the bottom opens upward when there is room above", () => {
    at(100, 640);
    const t = open({ fit_viewport: true });
    expect(t.style.top).toBe(`${640 - 8}px`);
    expect(t.style.transform).toBe("translate(0%, -100%)");
  });

  test("with no room either way it takes the bigger side and caps its height", () => {
    window.innerHeight = 260;
    at(100, 150);
    bubble.height = 400;
    const t = open({ fit_viewport: true });
    expect(t.style.transform).toBe("translate(0%, -100%)");
    // eslint-disable-next-line testing-library/no-node-access
    const content = screen.getByTestId("menu").parentElement;
    expect(content.style.maxHeight).toBe(`${150 - 8 - 8}px`);
    expect(content.style.display).toBe("flex");
  });

  test("plain tooltips keep the 260px cap and get no height cap", () => {
    at(100, 100);
    open();
    // eslint-disable-next-line testing-library/no-node-access
    const content = screen.getByTestId("menu").parentElement;
    expect(content.style.maxWidth).toBe("260px");
    expect(content.style.maxHeight).toBe("");
  });
});
