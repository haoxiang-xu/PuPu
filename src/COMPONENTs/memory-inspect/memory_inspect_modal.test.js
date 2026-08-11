import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ConfigContext, LocaleContext } from "../../CONTAINERs/config/context";
import { __mockApi as mockApi } from "../../SERVICEs/api.unchain";
import { MemoryInspectModal } from "./memory_inspect_modal";

jest.mock("../../SERVICEs/api.unchain", () => {
  const api = {
    getLongTermMemoryProjection: jest.fn(),
    getMemoryProjection: jest.fn(),
  };
  return {
    __mockApi: api,
    createUnchainApi: () => api,
  };
});

jest.mock("../../BUILTIN_COMPONENTs/modal/modal", () => {
  return function MockModal({ open, children }) {
    return open ? <div>{children}</div> : null;
  };
});

jest.mock("../../BUILTIN_COMPONENTs/scatter", () => ({
  Scatter: () => <div data-testid="scatter" />,
}));

jest.mock("../../BUILTIN_COMPONENTs/select/select", () => ({
  Select: () => null,
}));

jest.mock("../../BUILTIN_COMPONENTs/input/slider", () => ({
  Slider: () => null,
}));

jest.mock("../../BUILTIN_COMPONENTs/input/button", () => {
  return function MockButton({ label, onClick }) {
    return <button onClick={onClick}>{label || "button"}</button>;
  };
});

jest.mock("../../BUILTIN_COMPONENTs/explorer/explorer", () => {
  return function MockExplorer({ data, root }) {
    return (
      <div data-testid="explorer">
        {root.map((id) => (
          <span key={id}>{data[id]?.label}</span>
        ))}
      </div>
    );
  };
});

describe("MemoryInspectModal long-term profiles", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("shows stored long-term profiles when there are no vectors", async () => {
    mockApi.getLongTermMemoryProjection.mockResolvedValue({
      points: [],
      variance: [0, 0],
      profiles: [
        {
          id: "pupu_default.json",
          storage_key: "pupu_default",
          size_bytes: 64,
          preview: '{"preferences":{"tone":"concise"}}',
          document: {
            preferences: {
              tone: "concise",
            },
          },
        },
      ],
    });

    render(
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
          <MemoryInspectModal open={true} onClose={() => {}} mode="long_term" />
        </LocaleContext.Provider>
      </ConfigContext.Provider>,
    );

    await waitFor(() => {
      expect(mockApi.getLongTermMemoryProjection).toHaveBeenCalledTimes(1);
    });

    /* Auto-switches to Profiles view when no vectors exist */
    expect(screen.getByTestId("explorer")).toBeInTheDocument();
    expect(screen.getByText("preferences")).toBeInTheDocument();
  });
});

/*
 * Fast Track 0000-0010-2026-0810 — the V2 tree view lives beside the vector
 * view, never inside it. These cases pin the two properties the change is
 * allowed to have: the switch works, and the vector view keeps working
 * unchanged (AC-1 / AC-2), including at the settings mount point which
 * supplies no ownerChatId at all.
 */

const renderModal = (props) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <MemoryInspectModal open={true} onClose={() => {}} {...props} />
      </LocaleContext.Provider>
    </ConfigContext.Provider>,
  );

describe("MemoryInspectModal vector / tree switch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.getMemoryProjection.mockResolvedValue({
      points: [{ id: "p1", pc1: 0.1, pc2: 0.2, group: "a" }],
      variance: [0.6, 0.3],
      profiles: [],
    });
    mockApi.getLongTermMemoryProjection.mockResolvedValue({
      points: [],
      variance: [0, 0],
      profiles: [],
    });
  });

  test("the session mount offers both views and starts on vectors", async () => {
    renderModal({ sessionId: "chat-1", ownerChatId: "chat-1" });

    await waitFor(() => {
      expect(mockApi.getMemoryProjection).toHaveBeenCalledWith("chat-1");
    });
    expect(screen.getByTestId("memory-inspect-view-switch")).toBeInTheDocument();
    /* Vector view is the default and is untouched by the addition. */
    expect(screen.getByTestId("scatter")).toBeInTheDocument();
    expect(screen.queryByTestId("memory-v2-tree-view")).not.toBeInTheDocument();
  });

  test("switching to tree mounts the tree view, and back returns to the scatter", async () => {
    renderModal({ sessionId: "chat-1", ownerChatId: "chat-1" });
    await waitFor(() => expect(screen.getByTestId("scatter")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Tree"));
    expect(await screen.findByTestId("memory-v2-tree-view")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Vectors"));
    await waitFor(() => {
      expect(screen.queryByTestId("memory-v2-tree-view")).not.toBeInTheDocument();
    });
    /* AC-2: the vector view is the same component it always was — leaving and
       returning must not have replaced or unmounted it into a new shape. */
    expect(screen.getByTestId("scatter")).toBeInTheDocument();
  });

  test("without an ownerChatId the tree is not offered at all", async () => {
    /* This is the settings/long_term mount (0000-0008 G9, out of scope here).
       It must degrade quietly: no switch, no tree, no error. */
    renderModal({ mode: "long_term" });

    await waitFor(() => {
      expect(mockApi.getLongTermMemoryProjection).toHaveBeenCalled();
    });
    expect(
      screen.queryByTestId("memory-inspect-view-switch"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("memory-v2-tree-view")).not.toBeInTheDocument();
    expect(screen.queryByText("Tree")).not.toBeInTheDocument();
  });

  test("with no bridge in the renderer the tree degrades to `not enabled`", async () => {
    /* jsdom has no window.contextV2API, which is exactly the web-dev case. */
    renderModal({ sessionId: "chat-1", ownerChatId: "chat-1" });
    await waitFor(() => expect(screen.getByTestId("scatter")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Tree"));

    expect(
      await screen.findByText("Memory V2 is not enabled"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The desktop bridge is unavailable in this environment."),
    ).toBeInTheDocument();
  });
});
