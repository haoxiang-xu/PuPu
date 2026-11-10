import { act, fireEvent, render, screen } from "@testing-library/react";
import SideMenuBreadcrumb, { crumbPath } from "./side_menu_breadcrumb";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => <span />);

const vertices = (path) =>
  [...path.matchAll(/Q([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);

test("a crumb that opens the trail is square on the left and pointed on the right", () => {
  const v = vertices(crumbPath(40, { notch: false, point: true }));
  expect(v).toEqual([[0, 0], [30.9, 0], [40, 13], [30.9, 26], [0, 26]]);
});

test("one that ends the trail is notched on the left and square on the right", () => {
  const v = vertices(crumbPath(40, { notch: true, point: false }));
  expect(v).toEqual([[0, 0], [40, 0], [40, 26], [0, 26], [9.1, 13]]);
});

test("halfway through growing, the tip sits halfway out", () => {
  const v = vertices(crumbPath(40, { notch: false, point: 0.5 }));
  expect(v).toEqual([[0, 0], [35.45, 0], [40, 13], [35.45, 26], [0, 26]]);
  expect(vertices(crumbPath(40, { notch: false, point: 0 }))).toHaveLength(4);
});

test("every corner is rounded, the sharp notch edges by less than the square ones", () => {
  const path = crumbPath(40, { notch: true, point: true });
  expect((path.match(/Q/g) || []).length).toBe(6);
  /* the curve into the top-left (sharp) corner starts closer to it than the
     one into the top-right (square) corner does */
  const start = path.match(/^M([\d.]+) ([\d.]+)/);
  const sharpCut = Math.hypot(Number(start[1]), Number(start[2]));
  expect(sharpCut).toBeGreaterThan(0);
  expect(sharpCut).toBeLessThan(4.5);
});

test("the tip is a little blunter than a right angle, about 110 degrees", () => {
  const [, shoulder, tip, lower] = vertices(crumbPath(40, { notch: false, point: true }));
  const a = [shoulder[0] - tip[0], shoulder[1] - tip[1]];
  const b = [lower[0] - tip[0], lower[1] - tip[1]];
  const angle =
    (Math.acos((a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b))) * 180) /
    Math.PI;
  expect(angle).toBeCloseTo(110, 0);
});

test("like a button: no block at rest, it shows on hover and goes on leave; where you are has none", () => {
  render(
    <SideMenuBreadcrumb
      crumbs={[
        { key: "home", icon: "home_door", label: "Home", onClick: jest.fn() },
        { key: "agents", icon: "bot", label: "Agents" },
      ]}
    />,
  );
  const home = screen.getByTestId("side-menu-crumb-home");
  const shape = screen.getByTestId("side-menu-crumb-home-shape");
  expect(shape.dataset.shown).toBe("false");
  expect(shape.style.opacity).toBe("0");
  fireEvent.mouseEnter(home);
  expect(shape.dataset.shown).toBe("true");
  expect(shape.style.transform).toBe("scale(1)");
  fireEvent.mouseDown(home);
  /* 2px in on every side, like a Button's block */
  const w = Number(shape.getAttribute("width"));
  expect(shape.style.transform).toBe(`scale(${1 - 4 / w}, ${1 - 4 / 26})`);
  fireEvent.mouseUp(home);
  fireEvent.mouseLeave(home);
  expect(shape.dataset.shown).toBe("false");
  expect(screen.queryByTestId("side-menu-crumb-agents-shape")).toBeNull();
});

test("every crumb sits on a resting block; where you are on the fainter one", () => {
  render(
    <SideMenuBreadcrumb
      isDark
      crumbs={[
        { key: "home", icon: "home_door", label: "Home", onClick: jest.fn() },
        { key: "agents", icon: "bot", label: "Agents" },
      ]}
    />,
  );
  const fill = (key) =>
    screen.getByTestId(`side-menu-crumb-${key}-rest`).querySelector("path").getAttribute("fill");
  expect(fill("home")).toBe("rgba(255,255,255,0.08)");
  expect(fill("agents")).toBe("rgba(255,255,255,0.035)");
});

describe("a crumb joining or leaving the trail", () => {
  const home = { key: "home", icon: "home_door", label: "Home", onClick: () => {} };
  const agents = { key: "agents", icon: "bot", label: "Agents" };
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test("what is there on first paint does not animate", () => {
    render(<SideMenuBreadcrumb crumbs={[home, agents]} />);
    expect(screen.getByTestId("side-menu-crumb-agents-slot").dataset.phase).toBe("idle");
  });

  test("a new one starts off to the right and faded, then snaps on with an overshooting curve", () => {
    const { rerender } = render(<SideMenuBreadcrumb crumbs={[home]} />);
    rerender(<SideMenuBreadcrumb crumbs={[home, agents]} />);
    const slot = screen.getByTestId("side-menu-crumb-agents-slot");
    expect(slot.dataset.phase).toBe("enter");
    expect(slot.style.opacity).toBe("0");
    expect(slot.style.transform).toBe("translateX(18px)");
    expect(screen.getByTestId("side-menu-crumb-home").dataset.point).toBe("true");
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(slot.dataset.phase).toBe("idle");
    expect(slot.style.opacity).toBe("1");
    expect(slot.style.transform).toBe("translateX(0)");
    expect(slot.style.transition).toContain("cubic-bezier(0.34, 1.56, 0.64, 1)");
  });

  test("one that leaves slides back out, then is gone and the trail closes", () => {
    const { rerender } = render(<SideMenuBreadcrumb crumbs={[home, agents]} />);
    rerender(<SideMenuBreadcrumb crumbs={[home]} />);
    const slot = screen.getByTestId("side-menu-crumb-agents-slot");
    expect(slot.dataset.phase).toBe("exit");
    expect(slot.style.opacity).toBe("0");
    expect(slot).toHaveAttribute("aria-hidden", "true");
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(screen.queryByTestId("side-menu-crumb-agents-slot")).toBeNull();
    expect(screen.getByTestId("side-menu-crumb-home").dataset.point).toBe("false");
  });

  test("the crumb before grows its point out of its square end, and squares off again", () => {
    const { rerender } = render(<SideMenuBreadcrumb crumbs={[home]} />);
    const homeButton = screen.getByTestId("side-menu-crumb-home");
    const square = homeButton.style.width;
    rerender(<SideMenuBreadcrumb crumbs={[home, agents]} />);
    expect(homeButton.dataset.point).toBe("true");
    /* not there yet: it grows over a few frames */
    expect(homeButton.style.width).toBe(square);
    act(() => {
      jest.advanceTimersByTime(100);
    });
    const mid = parseFloat(homeButton.style.width);
    expect(mid).toBeGreaterThan(parseFloat(square));
    act(() => {
      jest.advanceTimersByTime(400);
    });
    const full = parseFloat(homeButton.style.width);
    expect(full).toBeGreaterThan(mid);
    /* and back, together with the leaving crumb */
    rerender(<SideMenuBreadcrumb crumbs={[home]} />);
    expect(homeButton.dataset.point).toBe("false");
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(homeButton.style.width).toBe(square);
  });

  test("a fresh array with the same crumbs changes nothing", () => {
    const { rerender } = render(<SideMenuBreadcrumb crumbs={[home, agents]} />);
    rerender(<SideMenuBreadcrumb crumbs={[{ ...home }, { ...agents }]} />);
    expect(screen.getByTestId("side-menu-crumb-agents-slot").dataset.phase).toBe("idle");
  });
});
