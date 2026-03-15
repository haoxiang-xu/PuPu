import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import api from "../../../SERVICEs/api";
import useChatInputToolkits from "./use_chat_input_toolkits";

jest.mock("../../../SERVICEs/api", () => ({
  __esModule: true,
  default: {
    miso: {
      getToolkitCatalog: jest.fn(),
    },
  },
}));

const TOOLKIT_PAYLOAD = {
  toolkits: [
    {
      name: "workspace_toolkit",
      class_name: "workspace_toolkit",
      kind: "builtin",
      tools: [
        { name: "read_file" },
        { name: "write_file" },
      ],
    },
    {
      name: "builtin_toolkit",
      class_name: "builtin_toolkit",
      kind: "builtin",
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

  return (
    <div>
      <button onClick={() => void refreshToolkits()}>refresh</button>
      <div data-testid="loading">{toolkitLoading ? "true" : "false"}</div>
      <pre data-testid="options">{JSON.stringify(toolkitOptions, null, 2)}</pre>
    </div>
  );
};

const readOptions = () =>
  JSON.parse(screen.getByTestId("options").textContent || "[]");

describe("use_chat_input_toolkits", () => {
  beforeEach(() => {
    api.miso.getToolkitCatalog.mockReset();
  });

  test("does not request toolkits on initial render", () => {
    render(<HookHarness />);

    expect(api.miso.getToolkitCatalog).not.toHaveBeenCalled();
    expect(readOptions()).toEqual([]);
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  test("shows a loading placeholder until the first request resolves", async () => {
    const deferred = createDeferred();
    api.miso.getToolkitCatalog.mockReturnValueOnce(deferred.promise);

    render(<HookHarness />);
    fireEvent.click(screen.getByText("refresh"));

    expect(api.miso.getToolkitCatalog).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("loading")).toHaveTextContent("true");
    expect(readOptions()).toEqual([
      {
        value: "__toolkits_loading__",
        label: "Loading toolkits...",
        disabled: true,
      },
    ]);

    deferred.resolve(TOOLKIT_PAYLOAD);

    await waitFor(() =>
      expect(readOptions()).toEqual([
        {
          value: "workspace_toolkit",
          label: "workspace_toolkit",
          description: "read_file, write_file",
          search: "workspace_toolkit",
        },
      ]),
    );
    expect(screen.getByTestId("loading")).toHaveTextContent("false");
  });

  test("shows a failure placeholder after an initial request error and retries on demand", async () => {
    api.miso.getToolkitCatalog
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
        },
      ]),
    );
    expect(screen.getByTestId("loading")).toHaveTextContent("false");

    fireEvent.click(screen.getByText("refresh"));

    expect(api.miso.getToolkitCatalog).toHaveBeenCalledTimes(2);
    expect(readOptions()).toEqual([
      {
        value: "__toolkits_loading__",
        label: "Loading toolkits...",
        disabled: true,
      },
    ]);

    await waitFor(() =>
      expect(readOptions()).toEqual([
        {
          value: "workspace_toolkit",
          label: "workspace_toolkit",
          description: "read_file, write_file",
          search: "workspace_toolkit",
        },
      ]),
    );
  });

  test("keeps the previous successful toolkit options when a refresh fails", async () => {
    api.miso.getToolkitCatalog
      .mockResolvedValueOnce(TOOLKIT_PAYLOAD)
      .mockRejectedValueOnce(new Error("timeout"));

    render(<HookHarness />);
    fireEvent.click(screen.getByText("refresh"));

    await waitFor(() =>
      expect(readOptions()).toEqual([
        {
          value: "workspace_toolkit",
          label: "workspace_toolkit",
          description: "read_file, write_file",
          search: "workspace_toolkit",
        },
      ]),
    );

    fireEvent.click(screen.getByText("refresh"));

    expect(api.miso.getToolkitCatalog).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("loading")).toHaveTextContent("true");
    expect(readOptions()).toEqual([
      {
        value: "workspace_toolkit",
        label: "workspace_toolkit",
        description: "read_file, write_file",
        search: "workspace_toolkit",
      },
    ]);

    await waitFor(() =>
      expect(screen.getByTestId("loading")).toHaveTextContent("false"),
    );
    expect(readOptions()).toEqual([
      {
        value: "workspace_toolkit",
        label: "workspace_toolkit",
        description: "read_file, write_file",
        search: "workspace_toolkit",
      },
    ]);
  });
});
