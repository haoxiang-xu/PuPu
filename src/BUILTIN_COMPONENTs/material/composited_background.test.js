import { render } from "@testing-library/react";
import CompositedBackground from "./composited_background";

const originalUA = navigator.userAgent;
const originalCSS = window.CSS;

beforeEach(() => {
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Chrome/144.0" });
  window.CSS = { supports: () => true };
  jest.spyOn(window, "getComputedStyle").mockReturnValue({ color: "rgba(18,18,18,0.68)" });
});
afterEach(() => {
  jest.restoreAllMocks();
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: originalUA });
  window.CSS = originalCSS;
});

function Artwork({ strength = 0.32, fade = 0, dither = true }) {
  return <CompositedBackground backgroundColor="#121212" opacity={strength}
    blur={44} dither={dither} overlayStyle={{ opacity: fade, transition: "opacity 500ms ease" }}>
    <canvas style={{ opacity: fade }} />
  </CompositedBackground>;
}

test("fades the artwork once, with constant final tint, without remounting its canvas", () => {
  const { container, rerender } = render(<Artwork />);
  const canvas = container.querySelector("canvas");
  for (const fade of [0, 0.5, 1, 0, 1]) {
    rerender(<Artwork fade={fade} />);
    expect(container.querySelector("canvas")).toBe(canvas);
    expect(canvas.style.opacity).toBe(String(fade));
    expect(canvas.parentElement.style.opacity).toBe("1");
    expect(canvas.parentElement.style.filter).toBe("blur(44px)");
    expect(canvas.parentElement.nextElementSibling.style.opacity).toBe("1");
    expect(canvas.parentElement.nextElementSibling.style.pointerEvents).toBe("none");
  }
  rerender(<Artwork dither={false} fade={1} />);
  expect(container.querySelector("canvas")).toBe(canvas);
  expect(canvas.parentElement.style.opacity).toBe("0.32");
  expect(container.querySelector("filter")).toBeNull();
  rerender(<Artwork fade={1} />);
  expect(container.querySelector("canvas")).toBe(canvas);
  expect(canvas.parentElement.style.opacity).toBe("1");
  expect(container.querySelector("filter")).not.toBeNull();
});

test.each(["Safari/605.1", "Firefox/145.0"])("keeps native blur, alpha and fade in %s", (ua) => {
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: ua });
  const { container } = render(<Artwork fade={0.5} />);
  const source = container.querySelector("canvas").parentElement;
  expect(source.style.opacity).toBe("0.32");
  expect(source.style.filter).toBe("blur(44px)");
  expect(source.nextElementSibling.style.opacity).toBe("0.5");
  expect(container.querySelector("filter")).toBeNull();
});

test("full-strength and hidden backgrounds preserve the canvas and need no tint pass", () => {
  const { container, rerender } = render(<Artwork strength={1} fade={0.5} />);
  const canvas = container.querySelector("canvas");
  expect(canvas.parentElement.style.opacity).toBe("1");
  expect(canvas.parentElement.nextElementSibling.style.opacity).toBe("0.5");
  expect(container.querySelector("filter")).toBeNull();
  rerender(<Artwork strength={0} />);
  expect(container.querySelector("canvas")).toBe(canvas);
  expect(canvas.parentElement.style.opacity).toBe("0");
  expect(canvas.parentElement.nextElementSibling).toBeNull();
});
