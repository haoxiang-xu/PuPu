import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { parseSurfaceColor, parseSurfaceFilter, useSurfaceComposite } from "./surface_composite";
import { SURFACE_DITHER_STYLE } from "./surface_dither";

function Surface({ color = "var(--test-surface)", filter = "blur(20px) saturate(130%)", onClick }) {
  const surface = useSurfaceComposite({ backgroundColor: color, backdropFilter: filter });
  return <div data-testid="surface" style={{ backgroundColor: color, backdropFilter: filter, ...SURFACE_DITHER_STYLE, ...surface.style }}>
    {surface.definition}<button onClick={onClick}>Action</button>
  </div>;
}

const originalUA = navigator.userAgent;
const originalCSS = window.CSS;
const originalMatchMedia = window.matchMedia;
const originalRatio = window.devicePixelRatio;
let computedColor;
beforeEach(() => {
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Chrome/144.0 Electron/40.8" });
  window.CSS = { supports: () => true };
  computedColor = "color(srgb 0.12 0.2 0.3 / 0.6)";
  const nativeStyle = window.getComputedStyle.bind(window);
  jest.spyOn(window, "getComputedStyle").mockImplementation((element) => element.tagName.toLowerCase() === "svg" ? { color: computedColor } : nativeStyle(element));
});
afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: originalUA });
  window.CSS = originalCSS;
  window.matchMedia = originalMatchMedia;
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: originalRatio });
  document.documentElement.style.removeProperty("--test-surface");
});

test.each([
  ["rgb(30, 60, 90)", [30 / 255, 60 / 255, 90 / 255, 1]],
  ["rgba(30, 60, 90, 0.6)", [30 / 255, 60 / 255, 90 / 255, 0.6]],
  ["rgb(10% 20% 30% / 60%)", [0.1, 0.2, 0.3, 0.6]],
  ["color(srgb 0.1 0.2 0.3 / 0.6)", [0.1, 0.2, 0.3, 0.6]],
])("admits browser-resolved sRGB colour %s without quantizing alpha", (value, expected) => {
  expect(parseSurfaceColor(value)).toEqual(expected);
});
test.each([undefined, "rgba(1, 2, 3,)", "rgb(300, 2, 3)", "color(display-p3 1 0 0)", "oklch(50% 0.2 30)", "currentColor"])("rejects unsupported colour %s to preserve native rendering", (value) => {
  expect(parseSurfaceColor(value)).toBeNull();
});
test.each(["brightness(2)", "blur(2em)", "url(#custom)", "blur(20px) contrast(2)", 20])("keeps unknown filter chain %s out of the new pipeline", (value) => {
  expect(parseSurfaceFilter(value)).toBeNull();
});
test("preserves the native blur and saturation values", () => {
  expect(parseSurfaceFilter("blur(20px) saturate(130%)")).toEqual({ blur: 20, saturation: 1.3 });
  expect(parseSurfaceFilter("blur(18px) saturate(1.4)")).toEqual({ blur: 18, saturation: 1.4 });
  expect(parseSurfaceFilter(null)).toEqual({ blur: 0, saturation: 1 });
});
test("updates live CSS previews, falls back for solid/unknown colours and recovers", async () => {
  const onClick = jest.fn();
  const { container } = render(<Surface onClick={onClick} />);
  const panel = screen.getByTestId("surface");
  expect(panel.style.backdropFilter).toContain("url(#surface-composite-");
  expect(panel.style.backgroundColor).toBe("transparent");
  expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(container.querySelector("svg").style.pointerEvents).toBe("none");
  fireEvent.click(screen.getByRole("button", { name: "Action" }));
  expect(onClick).toHaveBeenCalledTimes(1);

  for (const color of ["rgb(20, 30, 40)", "color(display-p3 0.5 0.2 0.1 / 0.6)"]) {
    computedColor = color;
    await act(async () => { document.documentElement.style.setProperty("--test-surface", color); });
    await waitFor(() => expect(panel.style.backdropFilter).toBe("blur(20px) saturate(130%)"));
    expect(container.querySelector("filter")).toBeNull();
  }
  computedColor = "rgba(20, 30, 40, 0.4)";
  await act(async () => { document.documentElement.style.setProperty("--test-surface", computedColor); });
  await waitFor(() => expect(panel.style.backdropFilter).toContain("url(#surface-composite-"));
  expect(container.querySelector("filter")).not.toBeNull();
});
test.each(["Safari/605.1", "Firefox/145.0"])("retains the previous surface in %s", (ua) => {
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: ua });
  const { container } = render(<Surface color="rgba(30,30,30,.6)" />);
  expect(screen.getByTestId("surface").style.backgroundColor).toBe("rgba(30, 30, 30, 0.6)");
  expect(container.querySelector("svg")).toBeNull();
});
test("releases theme and scale observers when the surface unmounts", () => {
  const disconnect = jest.spyOn(MutationObserver.prototype, "disconnect");
  const remove = jest.spyOn(window, "removeEventListener");
  const { unmount } = render(<Surface />);
  unmount();
  expect(disconnect).toHaveBeenCalled();
  expect(remove).toHaveBeenCalledWith("resize", expect.any(Function));
});

test("keeps threshold texels at device-pixel scale when moving between displays", async () => {
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1 });
  const queries = [];
  window.matchMedia = jest.fn(() => {
    const query = { addEventListener: jest.fn((event, callback) => { query.notify = callback; }), removeEventListener: jest.fn() };
    queries.push(query);
    return query;
  });
  const { container, unmount } = render(<Surface />);
  expect(container.querySelector("feImage").getAttribute("width")).toBe("64");
  Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 2 });
  await act(async () => queries[0].notify());
  expect(container.querySelector("feImage").getAttribute("width")).toBe("32");
  expect(queries[0].removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  unmount();
  expect(queries[1].removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
});
