/* eslint-disable testing-library/no-container, testing-library/no-node-access -- The shadow is a sibling SVG and a host style; both are inspected directly. */
import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import ShadowSurface, { parseResolvedShadows, transitionMovesShadow } from "./shadow_surface";

test("parses resolved colours, multiple layers, negative spreads and inset borders", () => {
  const layers = parseResolvedShadows("rgba(0, 0, 0, 0.5) 0px 8px 32px 0px, rgb(30, 60, 90) -1px 2px 8px -2px, rgb(0, 0, 0) 0px 0px 0px 1px inset");
  expect(layers).toHaveLength(3);
  expect(layers[0]).toMatchObject({ x: 0, y: 8, blur: 32, spread: 0, rgba: [0, 0, 0, .5], inset: false });
  expect(layers[1]).toMatchObject({ x: -1, y: 2, blur: 8, spread: -2 });
  expect(layers[2].inset).toBe(true);
  expect(parseResolvedShadows("none")).toEqual([]);
});

test.each(["var(--shadow)", "0px 0px 20px color(display-p3 1 0 0)", "rgb(0,0,0) 0px 0px -2px", "rgb(0,0,0) 0px calc(2px + 1vw) 10px"])("retains unsupported native shadow %s", value => {
  expect(parseResolvedShadows(value)).toBeNull();
});

test("forwards the original native element, focus, attributes and click handler in the fallback", () => {
  const ref = createRef(), click = jest.fn();
  const { container, rerender } = render(<ShadowSurface as="button" ref={ref} onClick={click} aria-label="Action" style={{ boxShadow: "0 8px 32px rgba(0,0,0,.5)", borderRadius: 12 }}>Action</ShadowSurface>);
  const button = screen.getByRole("button");
  expect(ref.current).toBe(button);
  expect(container.children).toHaveLength(1);
  button.focus(); fireEvent.click(button);
  expect(document.activeElement).toBe(button);
  expect(click).toHaveBeenCalledTimes(1);
  expect(button.style.boxShadow).toBe("0 8px 32px rgba(0,0,0,.5)");
  rerender(<ShadowSurface as="button" ref={ref} style={{ boxShadow: "none" }}>Action</ShadowSurface>);
  expect(ref.current).toBe(button);
  expect(button.style.boxShadow).toBe("none");
});

test("preserves controlled text input and its ref without a layout wrapper", () => {
  const ref = createRef(), change = jest.fn();
  const { container } = render(<ShadowSurface as="input" ref={ref} value="text" onChange={change} style={{ boxShadow: "none" }} />);
  expect(container.firstElementChild).toBe(ref.current);
  expect(ref.current.tagName).toBe("INPUT");
  fireEvent.change(ref.current, { target: { value: "edited" } });
  expect(change).toHaveBeenCalledTimes(1);
});


test("active composition keeps the host/ref and releases observers when disabled", async () => {
  const ua = navigator.userAgent, css = window.CSS, Resize = window.ResizeObserver;
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Chrome/144.0" });
  window.CSS = { supports: () => true };
  const disconnect = jest.fn();
  window.ResizeObserver = class { observe() {} disconnect() { disconnect(); } };
  const mutationDisconnect = jest.spyOn(MutationObserver.prototype, "disconnect");
  const remove = jest.spyOn(window, "removeEventListener");
  jest.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 50, top: 50, right: 150, bottom: 150, width: 100, height: 100 });
  jest.spyOn(window, "getComputedStyle").mockImplementation(node => ({
    boxShadow: "rgba(0, 0, 0, 0.5) 0px 8px 32px 0px", opacity: node.style.opacity || "1", transform: "none",
    overflowX: "visible", overflowY: "visible", borderTopLeftRadius: "50%",
    borderTopRightRadius: "50%", borderBottomRightRadius: "50%", borderBottomLeftRadius: "50%",
  }));
  try {
    const ref = createRef();
    const { container, rerender, unmount } = render(<ShadowSurface as="button" ref={ref} style={{ boxShadow: "0 8px 32px rgba(0,0,0,.5)" }}>Action</ShadowSurface>);
    const button = ref.current;
    expect(button.tagName).toBe("BUTTON");
    expect(button.style.boxShadow).toBe("none");
    expect(container.querySelector("filter")).not.toBeNull();
    button.focus(); expect(document.activeElement).toBe(button);
    // Imperative animation libraries change the host style outside React.
    await act(async () => { button.style.opacity = "0.5"; });
    expect(container.querySelector("filter")).toBeNull();
    await act(async () => { button.style.opacity = "1"; });
    expect(container.querySelector("filter")).not.toBeNull();
    rerender(<ShadowSurface as="button" ref={ref} style={{ boxShadow: "none" }}>Action</ShadowSurface>);
    expect(ref.current).toBe(button);
    expect(container.children).toHaveLength(1);
    expect(disconnect).toHaveBeenCalled();
    expect(mutationDisconnect).toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    unmount();
  } finally {
    jest.restoreAllMocks();
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: ua });
    window.CSS = css; window.ResizeObserver = Resize;
  }
});


test("updates object refs when the native host type changes", () => {
  const ref = createRef();
  const { rerender, unmount } = render(<ShadowSurface as="button" ref={ref}>Action</ShadowSurface>);
  expect(ref.current).toBe(screen.getByRole("button"));
  rerender(<ShadowSurface as="a" href="#action" ref={ref}>Action</ShadowSurface>);
  expect(ref.current).toBe(screen.getByRole("link"));
  unmount();
  expect(ref.current).toBeNull();
});

test("keeps callback refs stable on rerender and honors their cleanup on host replacement", () => {
  const cleanup = jest.fn();
  const ref = jest.fn(() => cleanup);
  const { rerender, unmount } = render(<ShadowSurface as="button" ref={ref}>Action</ShadowSurface>);
  expect(ref).toHaveBeenCalledTimes(1);
  expect(ref).toHaveBeenLastCalledWith(screen.getByRole("button"));
  rerender(<ShadowSurface as="button" ref={ref} style={{ color: "red" }}>Action</ShadowSurface>);
  expect(ref).toHaveBeenCalledTimes(1);
  expect(cleanup).not.toHaveBeenCalled();
  rerender(<ShadowSurface as="a" href="#action" ref={ref}>Action</ShadowSurface>);
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(ref).toHaveBeenLastCalledWith(screen.getByRole("link"));
  unmount();
  expect(cleanup).toHaveBeenCalledTimes(2);
});

/* The follower SVG cannot move in the same frame as an animating host: it was
   re-easing the host's transition on top of anchor() values and redrawing its
   shape a frame late, so the shadow trailed buttons, segmented indicators and
   slider thumbs. Anything that moves the shadow's box keeps the native shadow. */
function withFollowerEngine(run, { transform = () => "none" } = {}) {
  return async () => {
    const ua = navigator.userAgent, css = window.CSS, Resize = window.ResizeObserver;
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Chrome/144.0" });
    window.CSS = { supports: () => true };
    window.ResizeObserver = class { observe() {} disconnect() {} };
    jest.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ left: 50, top: 50, right: 150, bottom: 150, width: 100, height: 100 });
    jest.spyOn(window, "getComputedStyle").mockImplementation(node => ({
      boxShadow: "rgba(0, 0, 0, 0.5) 0px 8px 32px 0px", opacity: "1", transform: transform(node),
      overflowX: "visible", overflowY: "visible", borderTopLeftRadius: "12px",
      borderTopRightRadius: "12px", borderBottomRightRadius: "12px", borderBottomLeftRadius: "12px",
      transitionProperty: "all", transitionDuration: "0s", transitionDelay: "0s", animationName: "none",
    }));
    try { await run(); } finally {
      jest.restoreAllMocks();
      Object.defineProperty(navigator, "userAgent", { configurable: true, value: ua });
      window.CSS = css; window.ResizeObserver = Resize;
    }
  };
}

const SHADOW = "0 8px 32px rgba(0,0,0,.5)";
const flush = () => act(() => Promise.resolve());

test("classifies which transitions can move a shadow", () => {
  expect(transitionMovesShadow("left 0.3s cubic-bezier(0.32, 1, 0.32, 1), width 0.3s cubic-bezier(0.32, 1, 0.32, 1)")).toBe(true);
  expect(transitionMovesShadow("all 0.2s ease")).toBe(true);
  expect(transitionMovesShadow("0.2s")).toBe(true);
  expect(transitionMovesShadow("transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1)")).toBe(true);
  expect(transitionMovesShadow("opacity 0.18s ease")).toBe(true);
  expect(transitionMovesShadow("box-shadow 0.32s ease")).toBe(true);
  expect(transitionMovesShadow("background-color 0.2s ease, color 0.2s ease, border-color 0.15s")).toBe(false);
  expect(transitionMovesShadow("none")).toBe(false);
  expect(transitionMovesShadow("all 0s")).toBe(false);
  expect(transitionMovesShadow(undefined)).toBe(false);
});

test.each([
  ["a sliding indicator", { transition: "left 0.3s cubic-bezier(0.32, 1, 0.32, 1), width 0.3s cubic-bezier(0.32, 1, 0.32, 1)" }],
  ["a springing thumb", { transition: "transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1)" }],
  ["a host that animates everything", { transition: "all 0.2s ease" }],
  ["a keyframed host", { animation: "pulse 1s infinite" }],
])("%s keeps its native shadow and mounts no follower", (_, motion) => withFollowerEngine(async () => {
  const { container } = render(<ShadowSurface style={{ boxShadow: SHADOW, borderRadius: 12, ...motion }}>x</ShadowSurface>);
  await flush();
  expect(container.querySelector("svg")).toBeNull();
  expect(container.firstElementChild.style.boxShadow).toBe(SHADOW);
})());

test("a follower never re-runs the host's transition on its own box", withFollowerEngine(async () => {
  const { container } = render(<ShadowSurface style={{ boxShadow: SHADOW, borderRadius: 12, transition: "background-color 0.2s ease" }}>x</ShadowSurface>);
  await flush();
  const svg = container.querySelector("svg");
  expect(svg).not.toBeNull();
  expect(svg.style.transition).toBe("");
}));

test("a translated host keeps its native shadow (anchor() ignores the host's own transform)", withFollowerEngine(async () => {
  // A pure translate: the old stability test let this through, leaving the
  // follower at the untransformed box.
  window.DOMMatrix = class { constructor() { Object.assign(this, { is2D: true, a: 1, b: 0, c: 0, d: 1, e: 4, f: 0 }); } };
  const { container } = render(<ShadowSurface style={{ boxShadow: SHADOW, borderRadius: 12, transform: "translateX(4px)" }}>x</ShadowSurface>);
  await flush();
  expect(container.querySelector("svg")).toBeNull();
  expect(container.firstElementChild.style.boxShadow).toBe(SHADOW);
  delete window.DOMMatrix;
}, { transform: node => node.style?.transform ? "matrix(1, 0, 0, 1, 4, 0)" : "none" }));

test("a moving ancestor hands the shadow to the host in the same frame, and back when it settles", withFollowerEngine(async () => {
  const { container } = render(<div data-testid="parent"><ShadowSurface style={{ boxShadow: SHADOW, borderRadius: 12 }}>x</ShadowSurface></div>);
  await flush();
  const parent = screen.getByTestId("parent");
  const host = parent.firstElementChild;
  expect(host.style.boxShadow).toBe("none");
  expect(container.querySelector("svg")).not.toBeNull();

  // A colour fade on the parent cannot move the host: the follower stays.
  const fade = new Event("transitionrun", { bubbles: true });
  fade.propertyName = "background-color";
  parent.dispatchEvent(fade);
  expect(host.style.boxShadow).toBe("none");

  // Before React re-renders, the native shadow is already back on the host
  // and the follower is hidden — the swap happens inside the event, not a
  // frame later.
  const run = new Event("transitionrun", { bubbles: true });
  run.propertyName = "height";
  parent.dispatchEvent(run);
  expect(host.style.boxShadow).toBe(SHADOW);
  await flush();
  expect(container.querySelector("svg")).toBeNull();

  const end = new Event("transitionend", { bubbles: true });
  end.propertyName = "height";
  await act(async () => { parent.dispatchEvent(end); });
  expect(container.querySelector("svg")).not.toBeNull();
  expect(host.style.boxShadow).toBe("none");
}));
