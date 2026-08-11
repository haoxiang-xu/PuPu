/* eslint-env jest */

/*
 * The view is a dumb switch over the frozen state enum, so what is worth
 * testing is that the switch is TOTAL and that its arms are actually telling
 * the states apart. AC-5 asks for three states that a user can tell apart, so
 * the assertions look at what distinguishes them on screen — different copy,
 * different icon, different border treatment, different affordances — not just
 * that each one rendered something.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ConfigContext, LocaleContext } from "../../CONTAINERs/config/context";
import {
  MEMORY_V2_TREE_STATES,
  MEMORY_V2_TREE_DISABLED_REASONS,
  MEMORY_V2_TREE_MAX_VISIBLE_ROWS,
} from "../../SERVICEs/memory_v2_tree_state";
import { MemoryV2TreeView } from "./memory_v2_tree_view";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => {
  return function MockIcon({ src }) {
    return <i data-testid={`icon-${src}`} />;
  };
});

jest.mock("../../BUILTIN_COMPONENTs/input/button", () => {
  return function MockButton({ label, prefix_icon, onClick }) {
    return (
      <button onClick={onClick} data-icon={prefix_icon || ""}>
        {label || prefix_icon || "button"}
      </button>
    );
  };
});

const BASE = {
  state: MEMORY_V2_TREE_STATES.LOADING,
  reason: "",
  errorCode: "",
  errorMessage: "",
  spaces: [],
  spaceId: "",
  spaceName: "",
  roots: [],
  entryCount: 0,
};

const node = (path, kind, children = [], extra = {}) => ({
  entry_id: `id-${path}`,
  path,
  parent_path: path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "",
  name: path.slice(path.lastIndexOf("/") + 1),
  kind,
  description: "",
  children,
  ...extra,
});

const renderView = (result, props = {}) => {
  const load = jest.fn().mockResolvedValue({ ...BASE, ...result });
  const utils = render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <MemoryV2TreeView open ownerChatId="chat-1" load={load} {...props} />
      </LocaleContext.Provider>
    </ConfigContext.Provider>,
  );
  return { ...utils, load };
};

const stateCard = () => screen.getByTestId("memory-v2-tree-state-card").firstChild;

describe("MemoryV2TreeView — the three states are told apart", () => {
  test("DISABLED says not-enabled, names the reason, and offers no retry", async () => {
    renderView({
      state: MEMORY_V2_TREE_STATES.DISABLED,
      reason: MEMORY_V2_TREE_DISABLED_REASONS.ROLLOUT_OFF,
    });

    expect(
      await screen.findByText("Memory V2 is not enabled"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Memory V2 is switched off in this build."),
    ).toBeInTheDocument();
    /* Retrying a switched-off feature cannot help, so the affordance is
       absent — that absence is itself one of the signals separating this
       state from "empty". */
    expect(screen.queryByText("Refresh")).not.toBeInTheDocument();
    expect(screen.getByTestId("icon-information")).toBeInTheDocument();
  });

  test("every disabled reason renders its own explanation", async () => {
    const expected = {
      [MEMORY_V2_TREE_DISABLED_REASONS.NO_OWNER]:
        "Open the inspector from a chat to browse its memory tree.",
      [MEMORY_V2_TREE_DISABLED_REASONS.NO_BRIDGE]:
        "The desktop bridge is unavailable in this environment.",
      [MEMORY_V2_TREE_DISABLED_REASONS.SIDECAR_UNAVAILABLE]:
        "The local memory service is not running.",
      [MEMORY_V2_TREE_DISABLED_REASONS.ROLLOUT_OFF]:
        "Memory V2 is switched off in this build.",
      [MEMORY_V2_TREE_DISABLED_REASONS.STORE_DISABLED]:
        "Memory V2 storage is switched off while stored data still exists.",
    };

    for (const [reason, detail] of Object.entries(expected)) {
      const { unmount } = renderView({
        state: MEMORY_V2_TREE_STATES.DISABLED,
        reason,
      });
      expect(await screen.findByText(detail)).toBeInTheDocument();
      unmount();
    }
  });

  test("EMPTY says empty, explains V2 IS on, and does offer a refresh", async () => {
    renderView({ state: MEMORY_V2_TREE_STATES.EMPTY });

    expect(await screen.findByText("No memory entries yet")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Memory V2 is enabled for this chat, but nothing has been written to it yet.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Refresh")).toBeInTheDocument();
    expect(screen.getByTestId("icon-folder")).toBeInTheDocument();
    /* Not the disabled copy — the two zero-row states must never collapse
       into one blank panel. */
    expect(
      screen.queryByText("Memory V2 is not enabled"),
    ).not.toBeInTheDocument();
  });

  test("ERROR shows the failure, the stable code, and a retry", async () => {
    renderView({
      state: MEMORY_V2_TREE_STATES.ERROR,
      errorCode: "context_v2_unavailable",
      errorMessage: "[context_v2_unavailable] bridge is unavailable",
    });

    expect(
      await screen.findByText("Memory tree could not be loaded"),
    ).toBeInTheDocument();
    expect(screen.getByText("context_v2_unavailable")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
    expect(screen.getByTestId("icon-warning")).toBeInTheDocument();
  });

  test("disabled and empty differ in border treatment, not only in words", async () => {
    const { unmount } = renderView({
      state: MEMORY_V2_TREE_STATES.DISABLED,
      reason: MEMORY_V2_TREE_DISABLED_REASONS.ROLLOUT_OFF,
    });
    await screen.findByText("Memory V2 is not enabled");
    const disabledBorder = stateCard().style.borderStyle;
    unmount();

    renderView({ state: MEMORY_V2_TREE_STATES.EMPTY });
    await screen.findByText("No memory entries yet");
    const emptyBorder = stateCard().style.borderStyle;

    expect(disabledBorder).toBe("dashed");
    expect(emptyBorder).toBe("solid");
  });

  test("UNKNOWN gets its own arm rather than being rounded into empty", async () => {
    renderView({ state: MEMORY_V2_TREE_STATES.UNKNOWN });

    expect(await screen.findByText("Unrecognized response")).toBeInTheDocument();
    expect(screen.getByTestId("icon-question_mark")).toBeInTheDocument();
  });

  test("a state string the producer has not defined still renders something", async () => {
    renderView({ state: "a_state_from_the_future" });
    /* The switch default is the safety net: an unhandled state must never be
       an empty modal. */
    expect(await screen.findByText("Unrecognized response")).toBeInTheDocument();
  });
});

describe("MemoryV2TreeView — the tree itself", () => {
  const READY = {
    state: MEMORY_V2_TREE_STATES.READY,
    spaces: [{ spaceId: "space-1", name: "workspace", description: "" }],
    spaceId: "space-1",
    spaceName: "workspace",
    entryCount: 3,
    roots: [
      node("notes", "folder", [
        node("notes/a.md", "file", [], { content_bytes: 2048 }),
        node("notes/b.md", "file", [], { content_bytes: 512 }),
      ]),
      node("spec", "link", [], { link_url: "https://example.com/spec" }),
    ],
  };

  test("renders one level open by default and toggles the rest", async () => {
    renderView(READY);

    /* Root folder expanded by default → its children are rows. */
    expect(await screen.findByText("notes")).toBeInTheDocument();
    expect(screen.getByText("a.md")).toBeInTheDocument();

    fireEvent.click(screen.getByText("notes"));
    await waitFor(() => {
      expect(screen.queryByText("a.md")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("notes"));
    expect(await screen.findByText("a.md")).toBeInTheDocument();
  });

  test("kind drives the icon and the trailing metadata", async () => {
    renderView(READY);

    await screen.findByText("notes");
    expect(screen.getByTestId("icon-folder_open")).toBeInTheDocument();
    expect(screen.getAllByTestId("icon-draft")).toHaveLength(2);
    expect(screen.getByTestId("icon-link")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
    expect(screen.getByText("512 B")).toBeInTheDocument();
    expect(screen.getByText("https://example.com/spec")).toBeInTheDocument();
  });

  test("the space bar shows the entry count and a refresh that re-loads", async () => {
    const { load } = renderView(READY);

    expect(await screen.findByText("3 entries")).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("refresh"));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });

  test("selecting a space re-loads scoped to that space", async () => {
    const { load } = renderView({
      ...READY,
      spaces: [
        { spaceId: "space-1", name: "workspace", description: "" },
        { spaceId: "space-2", name: "scratch", description: "" },
      ],
    });

    await screen.findByText("notes");
    fireEvent.click(screen.getByText("scratch"));

    await waitFor(() =>
      expect(load).toHaveBeenLastCalledWith({
        ownerChatId: "chat-1",
        spaceId: "space-2",
      }),
    );
  });

  test("a tree past the render cap is truncated and says so", async () => {
    const children = Array.from({ length: MEMORY_V2_TREE_MAX_VISIBLE_ROWS + 40 }, (_, i) =>
      node(`big/${i}`, "file"),
    );
    renderView({
      ...READY,
      entryCount: children.length + 1,
      roots: [node("big", "folder", children)],
    });

    expect(
      await screen.findByText(
        `Showing ${MEMORY_V2_TREE_MAX_VISIBLE_ROWS} of ${children.length + 1} rows`,
      ),
    ).toBeInTheDocument();
    /* The cap is real, not just announced. */
    expect(screen.queryByText(`${MEMORY_V2_TREE_MAX_VISIBLE_ROWS + 39}`)).not.toBeInTheDocument();
  });

  test("an in-flight load for a superseded chat cannot overwrite the newer one", async () => {
    /* Guards the classic inspector bug: reopen on chat B while chat A is
       still resolving, and A's tree lands in B's modal. */
    let resolveFirst;
    const load = jest
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => { resolveFirst = resolve; }),
      )
      .mockResolvedValue({ ...READY, spaceName: "second" });

    const view = (ownerChatId) => (
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
          <MemoryV2TreeView open ownerChatId={ownerChatId} load={load} />
        </LocaleContext.Provider>
      </ConfigContext.Provider>
    );

    const { rerender } = render(view("chat-1"));
    rerender(view("chat-2"));
    await screen.findByText("notes");

    resolveFirst({
      ...BASE,
      state: MEMORY_V2_TREE_STATES.ERROR,
      errorMessage: "stale",
    });

    await waitFor(() => expect(screen.getByText("notes")).toBeInTheDocument());
    expect(
      screen.queryByText("Memory tree could not be loaded"),
    ).not.toBeInTheDocument();
  });
});
