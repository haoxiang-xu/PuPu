import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import api from "../../../SERVICEs/api";
import useChatInputToolkits from "./use_chat_input_toolkits";
import { getMcpStoreEntry } from "../../../SERVICEs/mcp_toolkit_store";
import { ConfigContext } from "../../../CONTAINERs/config/context";

jest.mock("../../../SERVICEs/api", () => ({
  __esModule: true,
  default: {
    unchain: {
      listToolModalCatalog: jest.fn(),
    },
  },
}));

const TOOLKIT_PAYLOAD = {
  toolkits: [
    {
      toolkitId: "core",
      toolkitName: "Core",
      toolkitDescription: "Read, edit, shell, and ask the user questions",
      source: "core",
      hidden: false,
      toolkitIcon: {
        type: "builtin",
        name: "tool",
        color: "#ffffff",
        backgroundColor: "#111827",
      },
      tools: [{ title: "Ask User", name: "ask_user_question" }],
    },
    {
      toolkitId: "workspace_toolkit",
      toolkitName: "Workspace Files",
      toolkitDescription: "Read and write project files",
      source: "builtin",
      hidden: false,
      toolkitIcon: {
        type: "builtin",
        name: "tool",
        color: "#ffffff",
        backgroundColor: "#111827",
      },
      tools: [
        { title: "Read File", name: "read_file" },
        { title: "Write File", name: "write_file" },
      ],
    },
    {
      toolkitId: "builtin_toolkit",
      toolkitName: "Base Toolkit",
      source: "builtin",
      hidden: false,
      tools: [],
    },
    {
      toolkitId: "plugin_toolkit",
      toolkitName: "Plugin Toolkit",
      source: "plugin",
      hidden: false,
      tools: [],
    },
    {
      toolkitId: "hidden_toolkit",
      toolkitName: "Hidden Toolkit",
      source: "local",
      hidden: true,
      tools: [],
    },
  ],
};

const createDeferred = () => {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
};

const HookHarness = () => {
  const { toolkitOptions, toolkitLoading, refreshToolkits } =
    useChatInputToolkits();
  const iconNameFor = (option) =>
    option?.value?.startsWith?.("mcp.")
      ? option.icon?.props?.children?.props?.icon?.name ||
        option.icon?.props?.icon?.name ||
        ""
      : "";
  const summarizedOptions = toolkitOptions.map(({ icon, ...option }) => ({
    ...option,
    hasIcon: Boolean(icon),
    ...(iconNameFor({ ...option, icon })
      ? { iconName: iconNameFor({ ...option, icon }) }
      : {}),
  }));

  return (
    <div>
      <button onClick={() => void refreshToolkits()}>refresh</button>
      <div data-testid="loading">{toolkitLoading ? "true" : "false"}</div>
      <pre data-testid="options">{JSON.stringify(summarizedOptions, null, 2)}</pre>
    </div>
  );
};

const readOptions = () =>
  JSON.parse(screen.getByTestId("options").textContent || "[]");

const RenderedOptionsHarness = () => {
  const { toolkitOptions, refreshToolkits } = useChatInputToolkits();
  return (
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <button onClick={() => void refreshToolkits()}>refresh</button>
      {toolkitOptions.map((option) => (
        <div key={option.value} data-testid={`option-${option.value}`}>
          {option.icon}
          <span>{option.label}</span>
        </div>
      ))}
    </ConfigContext.Provider>
  );
};

const iconPathData = (container) =>
  Array.from(container.querySelectorAll("path"))
    .map((path) => path.getAttribute("d"))
    .join(" ");

describe("use_chat_input_toolkits", () => {
  beforeEach(() => {
    api.unchain.listToolModalCatalog.mockReset();
  });

  test("does not request toolkits on initial render", () => {
    render(<HookHarness />);

    expect(api.unchain.listToolModalCatalog).not.toHaveBeenCalled();
    expect(readOptions()).toEqual([]);
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  test("shows a loading placeholder until the first request resolves", async () => {
    const deferred = createDeferred();
    api.unchain.listToolModalCatalog.mockReturnValueOnce(deferred.promise);

    render(<HookHarness />);
    fireEvent.click(screen.getByText("refresh"));

    expect(api.unchain.listToolModalCatalog).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("loading")).toHaveTextContent("true");
    expect(readOptions()).toEqual([
      {
        value: "__toolkits_loading__",
        label: "Loading toolkits...",
        disabled: true,
        hasIcon: false,
      },
    ]);

    deferred.resolve(TOOLKIT_PAYLOAD);

    await waitFor(() =>
      expect(readOptions()).toEqual([
        {
          value: "core",
          label: "Core",
          description: "Read, edit, shell, and ask the user questions",
          search:
            "Core core Read, edit, shell, and ask the user questions Ask User",
          hasIcon: true,
        },
        {
          value: "workspace_toolkit",
          label: "Workspace Files",
          description: "Read and write project files",
          search:
            "Workspace Files workspace_toolkit Read and write project files Read File Write File",
          hasIcon: true,
        },
      ]),
    );
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  test("uses the mcp icon for attach selector MCP entries with empty backend icons", async () => {
    api.unchain.listToolModalCatalog.mockResolvedValueOnce({
      toolkits: [
        {
          toolkitId: "mcp.custom.empty",
          toolkitName: "Empty MCP",
          toolkitDescription: "Custom MCP",
          source: "mcp",
          status: "available",
          hidden: false,
          toolkitIcon: {},
          tools: [{ title: "Ping", name: "ping" }],
        },
      ],
    });

    render(<HookHarness />);
    fireEvent.click(screen.getByText("refresh"));

    await waitFor(() =>
      expect(readOptions()).toEqual([
        {
          value: "mcp.custom.empty",
          label: "Empty MCP",
          description: "Custom MCP",
          search: "Empty MCP mcp.custom.empty Custom MCP Ping",
          hasIcon: true,
          iconName: "mcp",
        },
      ]),
    );
  });

  test("renders the real mcp glyph in the attach selector when catalog sends a generic tool icon", async () => {
    /* The id MUST stay absent from the store registry, and the reason is
       sharper than it looks. This test proves the icon layer REJECTS a generic
       `name: "tool"` catalog icon and substitutes the real mcp glyph. A
       registry entry that declares no icon resolves to DEFAULT_MCP_ICON, which
       is *also* the mcp glyph on a transparent background — byte-identical DOM
       to what is asserted below. So a registry id would still pass here, but
       for the wrong reason, proving nothing about catalog-icon rejection.
       Since 2026-07-28 registry entries may legally omit their icon, that trap
       is live, hence the explicit premise assertion. */
    expect(getMcpStoreEntry("mcp.custom.doc-converter")).toBeNull();
    api.unchain.listToolModalCatalog.mockResolvedValueOnce({
      toolkits: [
        {
          toolkitId: "mcp.custom.doc-converter",
          toolkitName: "Mark It Down",
          toolkitDescription: "Convert documents",
          source: "mcp",
          status: "available",
          hidden: false,
          toolkitIcon: {
            type: "builtin",
            name: "tool",
            color: "#ffffff",
            backgroundColor: "#111827",
          },
          tools: [{ title: "Convert", name: "convert_to_markdown" }],
        },
      ],
    });

    render(<RenderedOptionsHarness />);
    fireEvent.click(screen.getByText("refresh"));

    await waitFor(() => {
      expect(screen.getByText("Mark It Down")).toBeInTheDocument();
    });

    const option = screen.getByTestId("option-mcp.custom.doc-converter");
    await waitFor(() => {
      expect(option.querySelector("svg")).toBeInTheDocument();
    });

    expect(option.querySelector("[aria-hidden='true']")).toHaveStyle({
      backgroundColor: "transparent",
    });
    expect(iconPathData(option)).toContain("M9.795 1.694");
    expect(iconPathData(option)).not.toContain("M16.3303 13.497");
  });

  test("store registry brand icon beats a generic catalog icon in the attach selector", async () => {
    /* Premise: the sample must be a registry entry that DECLARES a brand icon.
       It was markitdown until 2026-07-28, when the CEO ruled that entries
       without a genuine official logo must fall back to the generic mcp glyph —
       markitdown is a candidate for clearing, which would have turned the
       <img> assertion below into a confusing DOM failure. Playwright ships a
       real Microsoft-official svg. If this premise ever trips, repoint the
       sample at another branded entry; do NOT relax the assertion. */
    expect(getMcpStoreEntry("mcp.browser.playwright").toolkitIcon).toEqual(
      expect.objectContaining({ type: "file", mimeType: "image/svg+xml" }),
    );
    api.unchain.listToolModalCatalog.mockResolvedValueOnce({
      toolkits: [
        {
          toolkitId: "mcp.browser.playwright",
          toolkitName: "Browser Automation",
          toolkitDescription: "Drive a browser",
          source: "mcp",
          status: "available",
          hidden: false,
          toolkitIcon: {
            type: "builtin",
            name: "tool",
            color: "#ffffff",
            backgroundColor: "#111827",
          },
          tools: [{ title: "Navigate", name: "browser_navigate" }],
        },
      ],
    });

    render(<RenderedOptionsHarness />);
    fireEvent.click(screen.getByText("refresh"));

    await waitFor(() => {
      expect(screen.getByText("Browser Automation")).toBeInTheDocument();
    });

    const option = screen.getByTestId("option-mcp.browser.playwright");
    await waitFor(() => {
      expect(option.querySelector("img")).toBeInTheDocument();
    });
    expect(option.querySelector("img").getAttribute("src")).toContain(
      "image/svg+xml",
    );
  });

  test("a no-icon Store entry beats a stale catalog icon in the attach selector", async () => {
    expect(getMcpStoreEntry("mcp.workspace.markitdown").toolkitIcon).toBeUndefined();
    api.unchain.listToolModalCatalog.mockResolvedValueOnce({
      toolkits: [
        {
          toolkitId: "mcp.workspace.markitdown",
          toolkitName: "MarkItDown",
          toolkitDescription: "Convert documents",
          source: "mcp",
          status: "available",
          hidden: false,
          toolkitIcon: {
            type: "file",
            mimeType: "image/png",
            content: "stale-installed-icon",
          },
          tools: [{ title: "Convert", name: "convert_to_markdown" }],
        },
      ],
    });

    render(<RenderedOptionsHarness />);
    fireEvent.click(screen.getByText("refresh"));

    const option = await screen.findByTestId(
      "option-mcp.workspace.markitdown",
    );
    await waitFor(() => expect(option.querySelector("svg")).toBeInTheDocument());
    expect(option.querySelector("img")).not.toBeInTheDocument();
    expect(iconPathData(option)).toContain("M9.795 1.694");
  });

  test("shows a failure placeholder after an initial request error and retries on demand", async () => {
    api.unchain.listToolModalCatalog
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(TOOLKIT_PAYLOAD);

    render(<HookHarness />);
    fireEvent.click(screen.getByText("refresh"));

    await waitFor(() =>
      expect(readOptions()).toEqual([
        {
          value: "__toolkits_failed__",
          label: "Failed to load toolkits",
          disabled: true,
          hasIcon: false,
        },
      ]),
    );
    expect(screen.getByTestId("loading")).toHaveTextContent("false");

    fireEvent.click(screen.getByText("refresh"));

    expect(api.unchain.listToolModalCatalog).toHaveBeenCalledTimes(2);
    expect(readOptions()).toEqual([
      {
        value: "__toolkits_loading__",
        label: "Loading toolkits...",
        disabled: true,
        hasIcon: false,
      },
    ]);

    await waitFor(() =>
      expect(readOptions()).toEqual([
        {
          value: "core",
          label: "Core",
          description: "Read, edit, shell, and ask the user questions",
          search:
            "Core core Read, edit, shell, and ask the user questions Ask User",
          hasIcon: true,
        },
        {
          value: "workspace_toolkit",
          label: "Workspace Files",
          description: "Read and write project files",
          search:
            "Workspace Files workspace_toolkit Read and write project files Read File Write File",
          hasIcon: true,
        },
      ]),
    );
  });

  test("keeps the previous successful toolkit options when a refresh fails", async () => {
    api.unchain.listToolModalCatalog
      .mockResolvedValueOnce(TOOLKIT_PAYLOAD)
      .mockRejectedValueOnce(new Error("timeout"));

    render(<HookHarness />);
    fireEvent.click(screen.getByText("refresh"));

    await waitFor(() =>
      expect(readOptions()).toEqual([
        {
          value: "core",
          label: "Core",
          description: "Read, edit, shell, and ask the user questions",
          search:
            "Core core Read, edit, shell, and ask the user questions Ask User",
          hasIcon: true,
        },
        {
          value: "workspace_toolkit",
          label: "Workspace Files",
          description: "Read and write project files",
          search:
            "Workspace Files workspace_toolkit Read and write project files Read File Write File",
          hasIcon: true,
        },
      ]),
    );

    fireEvent.click(screen.getByText("refresh"));

    expect(api.unchain.listToolModalCatalog).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("loading")).toHaveTextContent("true");
    expect(readOptions()).toEqual([
      {
        value: "core",
        label: "Core",
        description: "Read, edit, shell, and ask the user questions",
        search:
          "Core core Read, edit, shell, and ask the user questions Ask User",
        hasIcon: true,
      },
      {
        value: "workspace_toolkit",
        label: "Workspace Files",
        description: "Read and write project files",
        search:
          "Workspace Files workspace_toolkit Read and write project files Read File Write File",
        hasIcon: true,
      },
    ]);

    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );
    expect(readOptions()).toEqual([
      {
        value: "core",
        label: "Core",
        description: "Read, edit, shell, and ask the user questions",
        search:
          "Core core Read, edit, shell, and ask the user questions Ask User",
        hasIcon: true,
      },
      {
        value: "workspace_toolkit",
        label: "Workspace Files",
        description: "Read and write project files",
        search:
          "Workspace Files workspace_toolkit Read and write project files Read File Write File",
        hasIcon: true,
      },
    ]);
  });
});
