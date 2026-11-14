import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import AttachPanel from "./attach_panel";
import useChatInputToolkits from "../hooks/use_chat_input_toolkits";
import useChatInputWorkspaces from "../hooks/use_chat_input_workspaces";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { writeFeatureFlags } from "../../../SERVICEs/feature_flags";
import { resetSettingsRepositoryForTests } from "../../../SERVICEs/settings_repository";
import { getFolderState, resetAgentFolderStorageForTests, setFolderState } from "../../../SERVICEs/agent_folder_storage";

jest.mock("../hooks/use_chat_input_toolkits", () => ({ __esModule: true, default: jest.fn() }));
jest.mock("../hooks/use_chat_input_workspaces", () => ({
  __esModule: true,
  default: jest.fn(),
}));

/* The Agent picker draws the Agents page's folders, in the slash palette's
   explorer, and leaves arranging them to the Agents page. */
describe("AttachPanel Agent picker as a tree", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetSettingsRepositoryForTests();
    resetAgentFolderStorageForTests();
    writeFeatureFlags({ enable_user_access_to_agents: true });
    useChatInputWorkspaces.mockReturnValue({ workspaceOptions: [] });
    useChatInputToolkits.mockReturnValue({ toolkitOptions: [], toolkitLoading: false, refreshToolkits: jest.fn() });
    setFolderState({
      ...getFolderState(),
      folders: { work: { id: "work", name: "Work", parentId: null, childFolderIds: [], expanded: true } },
      folderOrder: ["work"],
      resourceFolder: { b: "work" },
    });
  });

  const renderPanel = (props = {}) => {
    const setAppMode = jest.fn();
    const onSelectSkeletonAgent = jest.fn();
    render(
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode", setAppMode }}>
        <AttachPanel
          color="#222"
          active={false}
          focused={false}
          onAttachFile={() => {}}
          isDark={false}
          attachments={[]}
          modelOptions={[{ value: "gpt-5.5", label: "GPT-5.5" }]}
          selectedToolkits={[]}
          onToolkitsChange={() => {}}
          selectedWorkspaceIds={[]}
          onWorkspaceIdsChange={() => {}}
          skeletonAgentOptions={[
            { id: "a", name: "Alpha" },
            { id: "b", name: "Beta" },
          ]}
          selectedSkeletonAgentId=""
          onSelectSkeletonAgent={onSelectSkeletonAgent}
          onSelectRecipe={() => {}}
          {...props}
        />
      </ConfigContext.Provider>,
    );
    return { setAppMode, onSelectSkeletonAgent };
  };

  const openPicker = async () => {
    fireEvent.click(screen.getByTestId("attach-agent-trigger"));
    await waitFor(() => expect(screen.getByRole("listbox", { hidden: true })).toBeInTheDocument());
    return screen.getByRole("listbox", { hidden: true });
  };

  test("an Agent filed in a folder shows under that folder, and picks", async () => {
    const { onSelectSkeletonAgent } = renderPanel();
    const list = await openPicker();
    expect(within(list).getByText("Work")).toBeInTheDocument();
    const options = within(list).getAllByRole("option", { hidden: true }).map((el) => el.textContent);
    expect(options).toEqual(["Agent: Default", "Beta", "Alpha"]);
    fireEvent.click(within(list).getByText("Beta"));
    expect(onSelectSkeletonAgent).toHaveBeenCalledWith("b");
  });

  test("the keyboard skips an Agent in a folded folder", async () => {
    const { onSelectSkeletonAgent } = renderPanel();
    const list = await openPicker();
    fireEvent.click(within(list).getByText("Work"));
    await waitFor(() => expect(within(list).queryByText("Beta")).toBeNull());
    const panel = list.parentElement;
    /* Default is highlighted on open; one step down is Alpha, not the hidden Beta. */
    act(() => {
      fireEvent.keyDown(panel, { key: "ArrowDown" });
    });
    act(() => {
      fireEvent.keyDown(panel, { key: "Enter" });
    });
    expect(onSelectSkeletonAgent).toHaveBeenCalledWith("a");
  });

  test("Organize goes to the Agents page and closes the picker", async () => {
    const { setAppMode } = renderPanel();
    await openPicker();
    fireEvent.mouseDown(screen.getByText("Organize"));
    expect(setAppMode).toHaveBeenCalledWith("agents");
  });
});
