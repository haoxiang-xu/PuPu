import { fireEvent, render, screen } from "@testing-library/react";
import CustomMcpPage from "./custom_mcp_page";

jest.mock("../../../BUILTIN_COMPONENTs/mini_react/use_translation", () => ({
  __esModule: true,
  useTranslation: () => ({ t: (key) => key, locale: "en", setLocale: () => {} }),
}));

jest.mock("../../../BUILTIN_COMPONENTs/input/button", () => ({
  __esModule: true,
  default: ({ label, onClick, disabled }) => (
    <button disabled={disabled} onClick={onClick}>
      {label}
    </button>
  ),
}));

describe("CustomMcpPage", () => {
  test("builds a typed stdio custom MCP recipe with env secret values", () => {
    const onInstall = jest.fn();
    render(<CustomMcpPage isDark={false} onInstall={onInstall} />);

    fireEvent.change(screen.getByPlaceholderText("toolkit.custom_name_placeholder"), {
      target: { value: "Local Browser" },
    });
    fireEvent.change(screen.getByPlaceholderText("toolkit.custom_command_placeholder"), {
      target: { value: "npx" },
    });
    fireEvent.change(screen.getByPlaceholderText("toolkit.custom_args_placeholder"), {
      target: { value: '-y "@scope/server"' },
    });
    fireEvent.change(screen.getByPlaceholderText("toolkit.custom_env_secrets_placeholder"), {
      target: { value: "LOCAL_TOKEN=secret-value" },
    });

    fireEvent.click(screen.getByRole("button", { name: "toolkit.custom_install" }));

    expect(onInstall).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "custom",
        toolkitId: "mcp.custom.local-browser",
        status: "available",
      }),
      {
        customRecipe: {
          toolkit_id: "mcp.custom.local-browser",
          toolkit_name: "Local Browser",
          toolkit_description: "",
          secrets: [{ key: "LOCAL_TOKEN", label: "LOCAL_TOKEN" }],
          mcp: {
            transport: "stdio",
            command: "npx",
            args: ["-y", "@scope/server"],
          },
        },
        secrets: { LOCAL_TOKEN: "secret-value" },
      },
    );
  });

  test("builds a typed http custom MCP recipe without adding env secrets", () => {
    const onInstall = jest.fn();
    render(<CustomMcpPage isDark={false} onInstall={onInstall} />);

    fireEvent.click(screen.getByRole("button", { name: "toolkit.custom_transport_http" }));
    fireEvent.change(screen.getByPlaceholderText("toolkit.custom_name_placeholder"), {
      target: { value: "Remote MCP" },
    });
    fireEvent.change(screen.getByPlaceholderText("toolkit.custom_url_placeholder"), {
      target: { value: "https://example.test/mcp" },
    });

    fireEvent.click(screen.getByRole("button", { name: "toolkit.custom_install" }));

    expect(onInstall).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "custom",
        toolkitId: "mcp.custom.remote-mcp",
      }),
      {
        customRecipe: {
          toolkit_id: "mcp.custom.remote-mcp",
          toolkit_name: "Remote MCP",
          toolkit_description: "",
          mcp: {
            transport: "http",
            url: "https://example.test/mcp",
          },
        },
        secrets: {},
      },
    );
  });
});
