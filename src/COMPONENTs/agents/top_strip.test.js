import { renderHook, act } from "@testing-library/react";
import { TOP_BAR_HEIGHT } from "../../BUILTIN_COMPONENTs/electron/title_bar";
import {
  AGENTS_MODAL_Z,
  TOP_STRIP_CENTER,
  TOP_STRIP_LEFT,
  TOP_STRIP_LEFT_TRAFFIC_LIGHTS,
  useTopStripCenter,
} from "./top_strip";

let mockPlatform = "darwin";
jest.mock("../../BUILTIN_COMPONENTs/mini_react/use_presentation_platform", () => ({
  __esModule: true,
  default: () => mockPlatform,
}));

let mockListener = null;
let mockListenerAvailable = true;
jest.mock("../../SERVICEs/bridges/window_state_bridge", () => ({
  windowStateBridge: {
    isListenerAvailable: () => mockListenerAvailable,
    onWindowStateChange: (cb) => {
      mockListener = cb;
      return () => {
        mockListener = null;
      };
    },
  },
}));

beforeEach(() => {
  mockPlatform = "darwin";
  mockListener = null;
  mockListenerAvailable = true;
});

describe("useTopStripCenter", () => {
  test("the plain centerline matches the app title bar's, so window controls do not jump", () => {
    /* A fullscreen modal covers the title bar and redraws the window controls
       on this strip; sharing the bar's centerline keeps them in place across
       the fullscreen toggle. */
    expect(TOP_STRIP_CENTER).toBe(TOP_BAR_HEIGHT / 2);
    expect(TOP_STRIP_CENTER).toBe(25);
  });

  test("the section switch stacks behind the floating panels", () => {
    /* Widening the workflow list or the detail panel must cover the switch,
       not leave it floating over the panel it overlaps. */
    expect(AGENTS_MODAL_Z.SECTION_SWITCH).toBeLessThan(AGENTS_MODAL_Z.PANEL);
    expect(AGENTS_MODAL_Z.PANEL).toBeLessThan(AGENTS_MODAL_Z.PANEL_CONTROL);
  });

  test("a windowed modal uses the plain geometry on every platform", () => {
    const { result, rerender } = renderHook(() => useTopStripCenter(false));
    expect(result.current.center).toBe(TOP_STRIP_CENTER);
    expect(result.current.left).toBe(TOP_STRIP_LEFT);
    expect(result.current.clearsTrafficLights).toBe(false);

    mockPlatform = "win32";
    rerender();
    expect(result.current.center).toBe(TOP_STRIP_CENTER);
  });

  test("a fullscreen modal on macOS steps the leading control aside, keeping the centerline", () => {
    const { result } = renderHook(() => useTopStripCenter(true));
    /* The traffic lights sit in the corner: only the leading control collides
       with them, so the strip must not drop as a whole. */
    expect(result.current.center).toBe(TOP_STRIP_CENTER);
    expect(result.current.left).toBe(TOP_STRIP_LEFT_TRAFFIC_LIGHTS);
    expect(result.current.clearsTrafficLights).toBe(true);
  });

  test("a maximized window has no floating traffic lights to clear", () => {
    const { result } = renderHook(() => useTopStripCenter(true));
    expect(result.current.left).toBe(TOP_STRIP_LEFT_TRAFFIC_LIGHTS);

    act(() => {
      mockListener({ isMaximized: true });
    });
    expect(result.current.center).toBe(TOP_STRIP_CENTER);
    expect(result.current.left).toBe(TOP_STRIP_LEFT);
    expect(result.current.clearsTrafficLights).toBe(false);
  });

  test("Windows and Linux never clear traffic lights, fullscreen or not", () => {
    mockPlatform = "win32";
    const { result: win } = renderHook(() => useTopStripCenter(true));
    expect(win.current.center).toBe(TOP_STRIP_CENTER);

    mockPlatform = "linux";
    const { result: linux } = renderHook(() => useTopStripCenter(true));
    expect(linux.current.center).toBe(TOP_STRIP_CENTER);
  });

  test("survives a build with no window-state mockListener", () => {
    mockListenerAvailable = false;
    const { result } = renderHook(() => useTopStripCenter(true));
    expect(result.current.center).toBe(TOP_STRIP_CENTER);
    expect(result.current.left).toBe(TOP_STRIP_LEFT_TRAFFIC_LIGHTS);
  });
});
