import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import AgentsWorkspace from "./agents_workspace";
import { NavigationContext } from "../../CONTAINERs/config/context";
import { writeFeatureFlags } from "../../SERVICEs/feature_flags";

let lastProps;
jest.mock("./agents_modal_content", () => ({
  __esModule: true,
  AgentsModalContent: (props) => {
    lastProps = props;
    return <div data-testid="agents-content" />;
  },
}));

const show = (nav = {}, active = true) =>
  render(
    <NavigationContext.Provider value={{ onFragment: "side_menu", ...nav }}>
      <AgentsWorkspace active={active} />
    </NavigationContext.Provider>,
  );

beforeEach(() => {
  localStorage.clear();
  lastProps = null;
  writeFeatureFlags({ enable_user_access_to_agents: true });
});

test("docks the agent list into the side menu's slot", () => {
  const slot = document.createElement("div");
  show({ agentsSidebarSlot: slot });
  expect(lastProps.explorerDocked).toBe(true);
  expect(lastProps.explorerSlot).toBe(slot);
  expect(lastProps.fullscreen).toBe(false);
});

test("extends to the window top while keeping controls below the title-bar drag region", () => {
  show();
  const root = screen.getByTestId("agents-workspace");
  expect(root.style.left).toBe("0px");
  expect(root.style.top).toBe("-18px");
  expect(lastProps.topStripCenter).toBeGreaterThan(50);
});

test("fills the window when the side menu is closed", () => {
  show({ onFragment: "main" });
  expect(screen.getByTestId("agents-workspace").style.left).toBe("0px");
});

test("stays mounted but hidden while the chat is showing", () => {
  show({}, false);
  const root = screen.getByTestId("agents-workspace");
  expect(root.style.visibility).toBe("hidden");
  expect(root).toHaveAttribute("aria-hidden", "true");
});

test("opening a chat from Characters goes back to the chat", () => {
  const setAppMode = jest.fn();
  show({ setAppMode });
  act(() => lastProps.onClose());
  expect(setAppMode).toHaveBeenCalledWith("chat");
});

test("Escape steps out of a selected node and does not leave the workspace", () => {
  const setAppMode = jest.fn();
  show({ setAppMode });
  act(() => lastProps.onSelectNode("node-1"));
  expect(lastProps.selectedNodeId).toBe("node-1");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(lastProps.selectedNodeId).toBe(null);
  expect(setAppMode).not.toHaveBeenCalled();
});

test("with only Characters enabled it opens on Characters", () => {
  writeFeatureFlags({
    enable_user_access_to_agents: false,
    enable_user_access_to_characters: true,
  });
  show();
  expect(lastProps.selectedSection).toBe("characters");
});
