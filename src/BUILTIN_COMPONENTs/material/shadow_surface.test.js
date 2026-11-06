import { createRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import ShadowSurface, { parseResolvedShadows } from "./shadow_surface";

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
