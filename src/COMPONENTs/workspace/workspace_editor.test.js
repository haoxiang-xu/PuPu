import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import WorkspaceEditor from "./workspace_editor";
import { ConfigContext } from "../../CONTAINERs/config/context";
import {
  readWorkspaces,
  writeWorkspaces,
  readWorkspaceRoot,
  writeWorkspaceRoot,
  validateWorkspaceRoot,
} from "../settings/runtime";

jest.mock("../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({
    t: (key, vars) => (vars?.name ? `${key}:${vars.name}` : key),
    locale: "en",
    setLocale: () => {},
  }),
}));

jest.mock("../settings/runtime", () => ({
  __esModule: true,
  readWorkspaces: jest.fn(() => []),
  writeWorkspaces: jest.fn(),
  readWorkspaceRoot: jest.fn(() => "/saved/root"),
  writeWorkspaceRoot: jest.fn(),
  makeWorkspaceId: jest.fn(() => "new-id"),
  validateWorkspaceRoot: jest.fn(async (p) => ({
    valid: true,
    resolvedPath: `${p}-resolved`,
  })),
}));

jest.mock("../../SERVICEs/bridges/unchain_bridge", () => ({
  __esModule: true,
  runtimeBridge: {
    isWorkspacePickerAvailable: () => false,
    isOpenRuntimeFolderAvailable: () => false,
    pickWorkspaceRoot: jest.fn(),
    openRuntimeFolder: jest.fn(),
  },
}));

jest.mock("../../CONTAINERs/config/theme_highlight", () => ({
  __esModule: true,
  themeHighlightColor: () => "#7c8cf8",
}));

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: () => <span data-testid="icon" />,
}));

jest.mock("../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ label, prefix_icon, onClick, disabled }) => (
    <button
      data-testid={`btn-${prefix_icon || label}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {label || prefix_icon}
    </button>
  ),
}));

const WORKSPACES = [
  { id: "w1", name: "PuPu", path: "/repo/PuPu" },
  { id: "w2", name: "mini_ui", path: "/repo/mini_ui" },
];

const renderEditor = () =>
  render(
    <ConfigContext.Provider value={{ theme: {} }}>
      <WorkspaceEditor isDark={false} />
    </ConfigContext.Provider>,
  );

beforeEach(() => {
  jest.clearAllMocks();
  readWorkspaces.mockReturnValue([...WORKSPACES]);
  readWorkspaceRoot.mockReturnValue("/saved/root");
  /* CRA jest sets resetMocks:true, wiping factory implementations */
  validateWorkspaceRoot.mockImplementation(async (p) => ({
    valid: true,
    resolvedPath: `${p}-resolved`,
  }));
});

describe("workspace list delete confirm", () => {
  test("delete asks for inline confirmation before writing", () => {
    renderEditor();
    fireEvent.click(screen.getAllByTestId("btn-delete")[0]);
    expect(writeWorkspaces).not.toHaveBeenCalled();
    expect(screen.getByTestId("delete-confirm-row")).toBeInTheDocument();
    expect(
      screen.getByText(/workspace\.delete_confirm_inline:PuPu/),
    ).toBeInTheDocument();
  });

  test("confirming deletes the row", () => {
    renderEditor();
    fireEvent.click(screen.getAllByTestId("btn-delete")[0]);
    fireEvent.click(screen.getByTestId("btn-common.delete"));
    expect(writeWorkspaces).toHaveBeenCalledWith([WORKSPACES[1]]);
  });

  test("escape cancels the confirmation without deleting", () => {
    renderEditor();
    fireEvent.click(screen.getAllByTestId("btn-delete")[0]);
    fireEvent.keyDown(screen.getByTestId("delete-confirm-row"), {
      key: "Escape",
    });
    expect(screen.queryByTestId("delete-confirm-row")).not.toBeInTheDocument();
    expect(writeWorkspaces).not.toHaveBeenCalled();
  });
});

describe("escape containment (modal must not close mid-edit)", () => {
  test("escape during row edit is stopped before the window listener", () => {
    const windowSpy = jest.fn();
    window.addEventListener("keydown", windowSpy);
    renderEditor();
    fireEvent.click(screen.getAllByTestId("btn-edit_pen")[0]);
    const nameField = screen.getByLabelText("workspace-name");
    fireEvent.keyDown(nameField, { key: "Escape" });
    expect(windowSpy).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("workspace-name")).not.toBeInTheDocument();
    window.removeEventListener("keydown", windowSpy);
  });

  test("escape on a dirty root field is contained; clean field lets it bubble", () => {
    const windowSpy = jest.fn();
    window.addEventListener("keydown", windowSpy);
    renderEditor();
    const input = screen.getByPlaceholderText("workspace.enter_path");
    fireEvent.change(input, { target: { value: "/typo" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(windowSpy).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(windowSpy).toHaveBeenCalledTimes(1);
    window.removeEventListener("keydown", windowSpy);
  });
});

describe("default root keyboard flow", () => {
  test("enter validates and saves the edited path", async () => {
    renderEditor();
    const input = screen.getByPlaceholderText("workspace.enter_path");
    fireEvent.change(input, { target: { value: "/new/root" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(writeWorkspaceRoot).toHaveBeenCalledWith("/new/root-resolved"),
    );
    expect(validateWorkspaceRoot).toHaveBeenCalledWith("/new/root");
  });

  test("escape reverts the edited path", () => {
    renderEditor();
    const input = screen.getByPlaceholderText("workspace.enter_path");
    fireEvent.change(input, { target: { value: "/typo" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("/saved/root");
    expect(writeWorkspaceRoot).not.toHaveBeenCalled();
  });
});
