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
  return function MockButton({ label, prefix_icon, onClick }) {
    /* `data-icon` is what lets a test name the button it means. Without it the
       only handle is child index, which silently re-points at a different
       control the moment a header is reordered (REVISION 4 did exactly that). */
    return (
      <button onClick={onClick} data-icon={prefix_icon || ""}>
        {label || "button"}
      </button>
    );
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
 * Fast Track 0000-0010-2026-0810 REVISION 1 — the V2 tree floats OVER the
 * vector view and never replaces it. These cases pin the properties the
 * change is allowed to have: the scatter is permanently mounted with nothing
 * conditioned on the tree (AC-1 / AC-2), and the settings mount point, which
 * supplies no ownerChatId at all, gets no overlay whatsoever.
 */

const renderModal = (props) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <MemoryInspectModal open={true} onClose={() => {}} {...props} />
      </LocaleContext.Provider>
    </ConfigContext.Provider>,
  );

describe("MemoryInspectModal V2 tree overlay", () => {
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

  test("the session mount shows the scatter and the tree side menu together", async () => {
    renderModal({ sessionId: "chat-1", ownerChatId: "chat-1" });

    await waitFor(() => {
      expect(mockApi.getMemoryProjection).toHaveBeenCalledWith("chat-1");
    });
    /* REVISION 1: not "one or the other". The scatter is the background and
       the tree floats on it, so both are in the tree at the same time. */
    expect(screen.getByTestId("scatter")).toBeInTheDocument();
    expect(await screen.findByTestId("memory-v2-tree-view")).toBeInTheDocument();
    expect(screen.getByTestId("memory-v2-entry-detail")).toBeInTheDocument();
  });

  test("nothing the overlay does can unmount the scatter", async () => {
    /* AC-2 in behavioural form: there is no longer any control that takes the
       vector view off screen, so collapsing the side menu — the one thing that
       hides part of the overlay — must leave the scatter exactly where it was. */
    renderModal({ sessionId: "chat-1", ownerChatId: "chat-1" });
    await screen.findByTestId("memory-v2-tree-view");
    const before = screen.getByTestId("scatter");

    fireEvent.click(
      screen
        .getByTestId("memory-v2-tree-view")
        .querySelector('button[data-icon="side_menu_close"]'),
    );

    await waitFor(() =>
      expect(screen.getByTestId("memory-v2-tree-view").style.opacity).toBe("0"),
    );
    expect(screen.getByTestId("scatter")).toBe(before);
  });

  test("the tree overlay paints after the vector detail card, never before", async () => {
    /* Both right-hand panels sit at z-index 3 at the same coordinates, so the
       ONLY thing that decides which one the user sees is DOM order. Assert it,
       because a well-meaning tidy-up that hoists the overlay would silently
       put the tree's detail behind the scatter's. */
    renderModal({ sessionId: "chat-1", ownerChatId: "chat-1" });
    const treePanel = await screen.findByTestId("memory-v2-tree-view");
    const detail = screen.getByTestId("memory-v2-entry-detail");
    const scatter = screen.getByTestId("scatter");

    const position = treePanel.compareDocumentPosition(scatter);
    // eslint-disable-next-line no-bitwise
    expect(position & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    // eslint-disable-next-line no-bitwise
    expect(
      treePanel.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("without an ownerChatId the overlay is not mounted at all", async () => {
    /* This is the settings/long_term mount (0000-0008 G9, out of scope here).
       It must degrade quietly: no side menu, no detail panel, no error. */
    renderModal({ mode: "long_term" });

    await waitFor(() => {
      expect(mockApi.getLongTermMemoryProjection).toHaveBeenCalled();
    });
    expect(screen.queryByTestId("memory-v2-tree-view")).not.toBeInTheDocument();
    expect(screen.queryByTestId("memory-v2-entry-detail")).not.toBeInTheDocument();
  });

  test("the modal paints no Memory title and no chat-title subtitle", async () => {
    /* REVISION 2 removed both. This is the one AC-2 exception the CEO granted,
       so it is asserted rather than left to the eye — and `chatTitle` is still
       passed in on purpose, to prove the caller's prop is now inert instead of
       quietly reappearing somewhere. */
    renderModal({
      sessionId: "chat-1",
      ownerChatId: "chat-1",
      chatTitle: "Tuesday planning",
    });
    await screen.findByTestId("memory-v2-tree-view");

    expect(screen.queryByText("Memory")).not.toBeInTheDocument();
    expect(screen.queryByText("Long-Term Memory")).not.toBeInTheDocument();
    expect(screen.queryByText("Tuesday planning")).not.toBeInTheDocument();
  });

  test("removing the header leaves the long-term Profiles toggle intact", async () => {
    /* The title block also held the Profiles button, which is functional.
       Deleting the block and the button together would have been a silent
       feature removal in a case that never asked for one. */
    mockApi.getLongTermMemoryProjection.mockResolvedValue({
      points: [],
      variance: [0, 0],
      profiles: [
        {
          id: "pupu_default.json",
          storage_key: "pupu_default",
          size_bytes: 64,
          preview: "{}",
          document: { preferences: { tone: "concise" } },
        },
      ],
    });

    renderModal({ mode: "long_term" });

    expect(await screen.findByText("Profiles")).toBeInTheDocument();
  });

  test("with no bridge in the renderer the tree degrades to `not enabled`", async () => {
    /* jsdom has no window.contextV2API, which is exactly the web-dev case.
       The tree now loads on mount rather than on a click, so this is also the
       assertion that mounting it cannot throw in a browser-only environment. */
    renderModal({ sessionId: "chat-1", ownerChatId: "chat-1" });

    expect(
      await screen.findByText("Memory V2 is not enabled"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The desktop bridge is unavailable in this environment."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("scatter")).toBeInTheDocument();
  });
});
