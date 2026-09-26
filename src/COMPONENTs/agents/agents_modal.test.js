import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { AgentsModal } from "./agents_modal";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { TOP_STRIP_CENTER } from "./top_strip";

let mockPlatform = "darwin";
jest.mock("../../BUILTIN_COMPONENTs/mini_react/use_presentation_platform", () => ({
  __esModule: true,
  default: () => mockPlatform,
}));

jest.mock("../../SERVICEs/bridges/window_state_bridge", () => ({
  windowStateBridge: {
    isListenerAvailable: () => false,
    isActionAvailable: () => true,
    onWindowStateChange: () => () => {},
    sendWindowAction: () => {},
  },
}));

jest.mock("./agents_modal_content", () => ({
  __esModule: true,
  AgentsModalContent: () => <div data-testid="agents-content" />,
}));

const cfg = { theme: {}, onThemeMode: "light_mode" };
const wrap = (ui) => (
  <ConfigContext.Provider value={cfg}>{ui}</ConfigContext.Provider>
);

const openModal = async () => {
  render(wrap(<AgentsModal open onClose={() => {}} />));
  await screen.findByTestId("agents-content");
};

beforeEach(() => {
  mockPlatform = "darwin";
});

describe("AgentsModal top strip", () => {
  test("windowed: the modal owns its close button and shows no window controls", async () => {
    await openModal();
    expect(screen.getByLabelText("Enter fullscreen")).toBeTruthy();
    expect(screen.getByLabelText("Close builder")).toBeTruthy();
    expect(screen.queryByLabelText("Minimize")).toBeNull();
  });

  test("its controls sit on the shared centerline, not a hand-tuned top", async () => {
    await openModal();
    const close = screen.getByLabelText("Close builder");
    expect(close.style.top).toBe(`${TOP_STRIP_CENTER}px`);
    expect(close.style.transform).toContain("translateY(-50%)");
  });

  test("fullscreen on Windows: window controls appear and the modal's close goes away", async () => {
    mockPlatform = "win32";
    await openModal();
    fireEvent.click(screen.getByLabelText("Enter fullscreen"));

    expect(screen.getByLabelText("Exit fullscreen")).toBeTruthy();
    expect(screen.getByLabelText("Minimize")).toBeTruthy();
    expect(screen.getByLabelText("Maximize")).toBeTruthy();
    expect(screen.getByLabelText("Close")).toBeTruthy();
    expect(screen.queryByLabelText("Close builder")).toBeNull();
  });

  test("fullscreen on Linux behaves the same way", async () => {
    mockPlatform = "linux";
    await openModal();
    fireEvent.click(screen.getByLabelText("Enter fullscreen"));
    expect(screen.getByLabelText("Minimize")).toBeTruthy();
    expect(screen.queryByLabelText("Close builder")).toBeNull();
  });

  test("fullscreen groups the exit button with the window cluster in one row", async () => {
    mockPlatform = "linux";
    await openModal();
    fireEvent.click(screen.getByLabelText("Enter fullscreen"));

    /* Exit fullscreen and the three window buttons must share one flex row, so
       their spacing comes from a gap rather than an offset tuned to the width
       of one platform's cluster (Linux's is 34px narrower than Windows'). */
    const exit = screen.getByLabelText("Exit fullscreen");
    const minimize = screen.getByLabelText("Minimize");
    const row = exit.parentElement;
    expect(row.style.display).toBe("flex");
    expect(row.style.gap).toBe("8px");
    expect(row.contains(minimize)).toBe(true);
    expect(exit.style.right).toBe("");
  });

  test("fullscreen on macOS keeps the modal's own close and draws no cluster", async () => {
    mockPlatform = "darwin";
    await openModal();
    fireEvent.click(screen.getByLabelText("Enter fullscreen"));
    expect(screen.getByLabelText("Close builder")).toBeTruthy();
    expect(screen.queryByLabelText("Minimize")).toBeNull();
  });
});
