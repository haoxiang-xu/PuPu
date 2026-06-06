import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import McpToolkitsSection from "./mcp_toolkits_section";
import api from "../../../../SERVICEs/api";
import { deleteMcpEntry } from "../../../../SERVICEs/mcp_install";

jest.mock("../../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (key) => key, locale: "en", setLocale: () => {} }),
}));

jest.mock("../../../../SERVICEs/api", () => ({
  __esModule: true,
  default: {
    unchain: {
      listMcpToolkits: jest.fn(),
      reloadMcpToolkits: jest.fn(() => Promise.resolve({ toolkits: [], count: 0 })),
    },
  },
}));

jest.mock("../../../../SERVICEs/mcp_install", () => ({
  __esModule: true,
  deleteMcpEntry: jest.fn(() => Promise.resolve({ ok: true })),
}));

jest.mock("../../runtime", () => ({
  __esModule: true,
  readWorkspaceRoot: () => "",
}));

jest.mock("../../appearance", () => ({
  __esModule: true,
  SettingsSection: ({ title, children }) => (
    <div>
      <span>{title}</span>
      {children}
    </div>
  ),
}));

jest.mock("../../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: () => <span data-testid="icon" />,
}));

jest.mock("../../../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ label, prefix_icon, onClick }) => (
    <button
      data-testid={label ? `btn-${label}` : `btn-${prefix_icon}`}
      onClick={onClick}
    >
      {label || prefix_icon}
    </button>
  ),
}));

jest.mock("./confirm_delete_modal", () => ({
  __esModule: true,
  default: ({ open, onConfirm }) =>
    open ? (
      <button data-testid="confirm-delete" onClick={onConfirm}>
        confirm
      </button>
    ) : null,
}));

const oneToolkit = {
  toolkits: [
    {
      toolkitId: "mcp.memory.memory",
      toolkitName: "Memory",
      status: "available",
      tools: [{ name: "a" }],
      toolCount: 1,
      toolkitIcon: { type: "builtin", name: "server" },
    },
  ],
};

describe("McpToolkitsSection", () => {
  beforeEach(() => {
    api.unchain.listMcpToolkits.mockReset();
    api.unchain.listMcpToolkits.mockResolvedValue(oneToolkit);
    api.unchain.reloadMcpToolkits.mockClear();
    deleteMcpEntry.mockClear();
  });

  test("renders installed mcp toolkits with status", async () => {
    render(<McpToolkitsSection isDark={false} />);

    await screen.findByText("Memory");
    expect(
      screen.getByText("toolkit.store_status_available"),
    ).toBeInTheDocument();
  });

  test("Reload all calls reloadMcpToolkits", async () => {
    render(<McpToolkitsSection isDark={false} />);
    await screen.findByText("Memory");

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-local_storage.mcp_reload_all"));
    });

    expect(api.unchain.reloadMcpToolkits).toHaveBeenCalled();
  });

  test("delete confirms and calls deleteMcpEntry", async () => {
    render(<McpToolkitsSection isDark={false} />);
    await screen.findByText("Memory");

    fireEvent.click(screen.getByTestId("btn-delete"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-delete"));
    });

    expect(deleteMcpEntry).toHaveBeenCalledWith("mcp.memory.memory");
  });

  test("empty state shows no installed message", async () => {
    api.unchain.listMcpToolkits.mockResolvedValue({ toolkits: [], count: 0 });
    render(<McpToolkitsSection isDark={false} />);

    await waitFor(() =>
      expect(
        screen.getByText("local_storage.mcp_no_installed"),
      ).toBeInTheDocument(),
    );
  });
});
