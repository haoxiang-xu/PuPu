import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import api from "../../../SERVICEs/api";
import useChatInputToolkits from "./use_chat_input_toolkits";

jest.mock("../../../SERVICEs/api", () => ({
  __esModule: true,
  default: {
    miso: {
      listToolModalCatalog: jest.fn(),
    },
  },
}));

const TOOLKIT_PAYLOAD = {
  toolkits: [
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
  const summarizedOptions = toolkitOptions.map(({ icon, ...option }) => ({
    ...option,
    hasIcon: Boolean(icon),
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

describe("use_chat_input_toolkits", () => {
  beforeEach(() => {
    api.miso.listToolModalCatalog.mockReset();
  });

  test("does not request toolkits on initial render", () => {
    render(<HookHarness />);

    expect(api.miso.listToolModalCatalog).not.toHaveBeenCalled();
    expect(readOptions()).toEqual([]);
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  test("shows a loading placeholder until the first request resolves", async () => {
    const deferred = createDeferred();
    api.miso.listToolModalCatalog.mockReturnValueOnce(deferred.promise);

    render(<HookHarness />);
    fireEvent.click(screen.getByText("refresh"));

    expect(api.miso.listToolModalCatalog).toHaveBeenCalledTimes(1);
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
          value: "WorkspaceToolkit",
          label: "Workspace Files",
          description: "Read and write project files",
          search:
            "Workspace Files workspace_toolkit WorkspaceToolkit Read and write project files Read File Write File",
          hasIcon: true,
        },
      ]),
    );
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  test("shows a failure placeholder after an initial request error and retries on demand", async () => {
    api.miso.listToolModalCatalog
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

    expect(api.miso.listToolModalCatalog).toHaveBeenCalledTimes(2);
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
          value: "WorkspaceToolkit",
          label: "Workspace Files",
          description: "Read and write project files",
          search:
            "Workspace Files workspace_toolkit WorkspaceToolkit Read and write project files Read File Write File",
          hasIcon: true,
        },
      ]),
    );
  });

  test("keeps the previous successful toolkit options when a refresh fails", async () => {
    api.miso.listToolModalCatalog
      .mockResolvedValueOnce(TOOLKIT_PAYLOAD)
      .mockRejectedValueOnce(new Error("timeout"));

    render(<HookHarness />);
    fireEvent.click(screen.getByText("refresh"));

    await waitFor(() =>
      expect(readOptions()).toEqual([
        {
          value: "WorkspaceToolkit",
          label: "Workspace Files",
          description: "Read and write project files",
          search:
            "Workspace Files workspace_toolkit WorkspaceToolkit Read and write project files Read File Write File",
          hasIcon: true,
        },
      ]),
    );

    fireEvent.click(screen.getByText("refresh"));

    expect(api.miso.listToolModalCatalog).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("loading")).toHaveTextContent("true");
    expect(readOptions()).toEqual([
      {
        value: "WorkspaceToolkit",
        label: "Workspace Files",
        description: "Read and write project files",
        search:
          "Workspace Files workspace_toolkit WorkspaceToolkit Read and write project files Read File Write File",
        hasIcon: true,
      },
    ]);

    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );
    expect(readOptions()).toEqual([
      {
        value: "WorkspaceToolkit",
        label: "Workspace Files",
        description: "Read and write project files",
        search:
          "Workspace Files workspace_toolkit WorkspaceToolkit Read and write project files Read File Write File",
        hasIcon: true,
      },
    ]);
  });
});
