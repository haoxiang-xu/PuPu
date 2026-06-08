import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import McpRegistriesModal from "./mcp_registries_modal";
import api from "../../../../SERVICEs/api";

jest.mock("../../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (key) => key, locale: "en", setLocale: () => {} }),
}));

jest.mock("../../../../SERVICEs/api", () => ({
  __esModule: true,
  default: {
    unchain: {
      listMcpStoreRegistries: jest.fn(),
      validateMcpStoreRegistry: jest.fn(),
      importMcpStoreRegistry: jest.fn(),
      refreshMcpStoreRegistry: jest.fn(),
      deleteMcpStoreRegistry: jest.fn(),
    },
  },
}));

jest.mock("../../../../BUILTIN_COMPONENTs/modal/modal", () => ({
  __esModule: true,
  default: ({ open, children }) => (open ? <div role="dialog">{children}</div> : null),
}));

jest.mock("../../../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle", () => ({
  __esModule: true,
  useModalLifecycle: jest.fn(),
}));

jest.mock("../../../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ label, prefix_icon, onClick, disabled }) => (
    <button
      data-testid={`btn-${label || prefix_icon}`}
      onClick={onClick}
      disabled={disabled}
    >
      {label || prefix_icon}
    </button>
  ),
}));

describe("McpRegistriesModal", () => {
  beforeEach(() => {
    api.unchain.listMcpStoreRegistries.mockReset();
    api.unchain.listMcpStoreRegistries.mockResolvedValue({
      registries: [
        {
          registryId: "registry.url.test",
          name: "External Registry",
          sourceType: "url",
          entryCount: 2,
          approvedCount: 1,
          staleApprovalCount: 1,
          riskCounts: { low: 1, medium: 0, high: 1, critical: 0 },
        },
      ],
      count: 1,
    });
    api.unchain.validateMcpStoreRegistry.mockReset();
    api.unchain.validateMcpStoreRegistry.mockResolvedValue({
      valid: false,
      status: "invalid",
      diagnostics: [
        {
          code: "mcp_registry_url_invalid",
          path: "$.entries[0]",
          entryId: "external.sample",
          severity: "error",
        },
      ],
      entries: [],
      count: 0,
    });
    api.unchain.importMcpStoreRegistry.mockReset();
    api.unchain.importMcpStoreRegistry.mockResolvedValue({
      registry: { registryId: "registry.inline.test" },
    });
    api.unchain.refreshMcpStoreRegistry.mockReset();
    api.unchain.refreshMcpStoreRegistry.mockResolvedValue({
      registry: { registryId: "registry.url.test" },
    });
    api.unchain.deleteMcpStoreRegistry.mockReset();
    api.unchain.deleteMcpStoreRegistry.mockResolvedValue({
      ok: true,
      registryId: "registry.url.test",
    });
  });

  test("validates pasted registry json without importing it", async () => {
    render(<McpRegistriesModal open isDark={false} onClose={() => {}} />);

    await screen.findByText("External Registry");
    fireEvent.change(
      screen.getByPlaceholderText("dev.mcp_registry_json_placeholder"),
      { target: { value: "{\"version\":1,\"entries\":[]}" } },
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-dev.mcp_registry_validate"));
    });

    expect(api.unchain.validateMcpStoreRegistry).toHaveBeenCalledWith({
      registry: "{\"version\":1,\"entries\":[]}",
    });
    expect(api.unchain.importMcpStoreRegistry).not.toHaveBeenCalled();
    expect(
      await screen.findByText((text) =>
        text.includes("mcp_registry_url_invalid") &&
        text.includes("$.entries[0]"),
      ),
    ).toBeInTheDocument();
  });

  test("imports a registry and refreshes source list", async () => {
    render(<McpRegistriesModal open isDark={false} onClose={() => {}} />);

    await screen.findByText("External Registry");
    fireEvent.change(
      screen.getByPlaceholderText("dev.mcp_registry_name_placeholder"),
      { target: { value: "Team Registry" } },
    );
    fireEvent.change(
      screen.getByPlaceholderText("dev.mcp_registry_url_placeholder"),
      { target: { value: "https://example.com/mcp-registry.json" } },
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-dev.mcp_registry_import"));
    });

    expect(api.unchain.importMcpStoreRegistry).toHaveBeenCalledWith({
      name: "Team Registry",
      url: "https://example.com/mcp-registry.json",
    });
    expect(api.unchain.listMcpStoreRegistries).toHaveBeenCalledTimes(2);
  });

  test("renders registry source counts and supports refresh and delete", async () => {
    render(<McpRegistriesModal open isDark={false} onClose={() => {}} />);

    await screen.findByText("External Registry");
    expect(
      screen.getByText((text) =>
        text.includes("1 dev.mcp_registry_approved") &&
        text.includes("1 dev.mcp_registry_stale") &&
        text.includes("1 dev.mcp_registry_risk_low") &&
        text.includes("1 dev.mcp_registry_risk_high"),
      ),
    ).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-dev.mcp_registry_refresh"));
    });
    expect(api.unchain.refreshMcpStoreRegistry).toHaveBeenCalledWith(
      "registry.url.test",
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("btn-dev.mcp_registry_delete"));
    });
    expect(api.unchain.deleteMcpStoreRegistry).toHaveBeenCalledWith(
      "registry.url.test",
    );
    await waitFor(() =>
      expect(api.unchain.listMcpStoreRegistries).toHaveBeenCalledTimes(3),
    );
  });

  test("does not render registry controls until the modal is open", () => {
    render(<McpRegistriesModal open={false} isDark={false} onClose={() => {}} />);

    expect(screen.queryByText("dev.mcp_registries")).toBeNull();
    expect(
      screen.queryByPlaceholderText("dev.mcp_registry_json_placeholder"),
    ).toBeNull();
  });

  test("close button calls onClose", async () => {
    const onClose = jest.fn();
    render(<McpRegistriesModal open isDark={false} onClose={onClose} />);

    await screen.findByText("External Registry");
    fireEvent.click(screen.getByTestId("btn-close"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
