import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import WindowControls from "./window_controls";
import { ConfigContext } from "../../CONTAINERs/config/context";

let mockPlatform = "win32";
jest.mock("../mini_react/use_presentation_platform", () => ({
  __esModule: true,
  default: () => mockPlatform,
}));

const mockActions = [];
let mockListener = null;
jest.mock("../../SERVICEs/bridges/window_state_bridge", () => ({
  windowStateBridge: {
    isListenerAvailable: () => true,
    onWindowStateChange: (cb) => {
      mockListener = cb;
      return () => {
        mockListener = null;
      };
    },
    sendWindowAction: (action) => mockActions.push(action),
  },
}));

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => (
  <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>
);

beforeEach(() => {
  mockPlatform = "win32";
  mockActions.length = 0;
  mockListener = null;
});

describe("WindowControls", () => {
  test("renders minimize, maximize and close", () => {
    render(wrap(<WindowControls />));
    expect(screen.getByLabelText("Minimize")).toBeTruthy();
    expect(screen.getByLabelText("Maximize")).toBeTruthy();
    expect(screen.getByLabelText("Close")).toBeTruthy();
  });

  test("each button sends its own window action", () => {
    render(wrap(<WindowControls />));
    fireEvent.click(screen.getByLabelText("Minimize"));
    fireEvent.click(screen.getByLabelText("Maximize"));
    fireEvent.click(screen.getByLabelText("Close"));
    expect(mockActions).toEqual(["minimize", "maximize", "close"]);
  });

  test("the maximize button becomes Restore once the window reports maximized", () => {
    render(wrap(<WindowControls />));
    act(() => {
      mockListener({ isMaximized: true });
    });
    expect(screen.queryByLabelText("Maximize")).toBeNull();
    expect(screen.getByLabelText("Restore")).toBeTruthy();
  });

  test("the Linux presentation keeps the same three actions", () => {
    mockPlatform = "linux";
    render(wrap(<WindowControls />));
    fireEvent.click(screen.getByLabelText("Close"));
    expect(mockActions).toEqual(["close"]);
  });
});

