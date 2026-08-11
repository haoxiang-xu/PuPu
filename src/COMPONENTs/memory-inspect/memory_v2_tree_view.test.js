/* eslint-env jest */

/*
 * The view is a dumb switch over two frozen state enums, so what is worth
 * testing is that each switch is TOTAL and that its arms actually tell the
 * states apart. AC-5 asks for three tree states a user can distinguish, so the
 * assertions look at what distinguishes them on screen — different copy,
 * different icon, different border treatment, different affordances.
 *
 * REVISION 1 adds a second thing worth pinning: the two floating panels show
 * and hide by OPACITY, staying mounted and click-through when hidden. That is
 * not a stylistic detail — the right-hand panel sits exactly on top of the
 * vector view's own detail card, and `display:none` or a slide off-canvas
 * would take that card's usability with it. So the hidden state is asserted
 * on the real style properties, not on absence from the DOM.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ConfigContext, LocaleContext } from "../../CONTAINERs/config/context";
import {
  MEMORY_V2_TREE_STATES,
  MEMORY_V2_TREE_DISABLED_REASONS,
  MEMORY_V2_TREE_MAX_VISIBLE_ROWS,
  MEMORY_V2_PREVIEW_STATES,
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

const BASE_PREVIEW = {
  state: MEMORY_V2_PREVIEW_STATES.IDLE,
  text: "",
  totalBytes: 0,
  shownBytes: 0,
  truncated: false,
  errorCode: "",
  errorMessage: "",
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

const renderView = (result, props = {}, previewResult = null) => {
  const load = jest.fn().mockResolvedValue({ ...BASE, ...result });
  const loadPreview = jest
    .fn()
    .mockResolvedValue({ ...BASE_PREVIEW, ...(previewResult || {}) });
  const utils = render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
        <MemoryV2TreeView
          open
          ownerChatId="chat-1"
          load={load}
          loadPreview={loadPreview}
          {...props}
        />
      </LocaleContext.Provider>
    </ConfigContext.Provider>,
  );
  return { ...utils, load, loadPreview };
};

const stateCard = () => screen.getByTestId("memory-v2-tree-state-card").firstChild;
const sideMenu = () => screen.getByTestId("memory-v2-tree-view");
const detailPanel = () => screen.getByTestId("memory-v2-entry-detail");

/* Rows must be addressed as rows: the detail panel repeats the selected
   entry's name, so a bare getByText would become ambiguous the moment the
   panel opens — and would then match whichever one happened to be first. */
const row = (name) =>
  screen
    .getAllByTestId("memory-v2-tree-row")
    .find((element) => element.textContent === name);
const selectedRows = () =>
  screen
    .getAllByTestId("memory-v2-tree-row")
    .filter((element) => element.dataset.selected === "true");

const FILE_A = node("notes/a.md", "file", [], {
  content_bytes: 2048,
  content_ref: "pupu://memory/space-1/id-a@3",
  mime_type: "text/markdown",
  updated_at_ms: 1754000000000,
  description: "the running notes",
});

const READY = {
  state: MEMORY_V2_TREE_STATES.READY,
  spaces: [{ spaceId: "space-1", name: "workspace", description: "" }],
  spaceId: "space-1",
  spaceName: "workspace",
  entryCount: 3,
  roots: [
    node("notes", "folder", [
      FILE_A,
      node("notes/b.md", "file", [], {
        content_bytes: 512,
        content_ref: "pupu://memory/space-1/id-b@1",
        mime_type: "text/markdown",
      }),
    ]),
    node("spec", "link", [], { link_url: "https://example.com/spec" }),
  ],
};

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
       state from "empty". (The header's icon-only refresh renders as the
       lowercase icon name, so it cannot be confused with this label.) */
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
       into one blank column. */
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
       an empty panel. */
    expect(await screen.findByText("Unrecognized response")).toBeInTheDocument();
  });

  test("every non-tree state stays inside the 236px side menu", async () => {
    /* The states are cramped by design now. If one of them ever grows back
       into a full-bleed card it would cover the scatter, which REVISION 1
       makes the permanent background. */
    renderView({ state: MEMORY_V2_TREE_STATES.EMPTY });
    await screen.findByText("No memory entries yet");
    expect(sideMenu().contains(screen.getByTestId("memory-v2-tree-state-card"))).toBe(
      true,
    );
    expect(sideMenu().style.width).toBe("236px");
  });
});

describe("MemoryV2TreeView — the tree itself", () => {
  test("renders one level open by default and toggles the rest", async () => {
    renderView(READY);

    /* Root folder expanded by default → its children are rows. */
    expect(await screen.findByText("notes")).toBeInTheDocument();
    expect(screen.getByText("a.md")).toBeInTheDocument();

    fireEvent.click(row("notes"));
    await waitFor(() => {
      expect(screen.queryByText("a.md")).not.toBeInTheDocument();
    });

    fireEvent.click(row("notes"));
    expect(await screen.findByText("a.md")).toBeInTheDocument();
  });

  test("kind drives the icon", async () => {
    renderView(READY);

    await screen.findByText("notes");
    expect(screen.getByTestId("icon-folder_open")).toBeInTheDocument();
    expect(screen.getAllByTestId("icon-draft")).toHaveLength(2);
    expect(screen.getByTestId("icon-link")).toBeInTheDocument();
  });

  test("the header carries the space name and a refresh that re-loads", async () => {
    const { load } = renderView(READY);

    expect(await screen.findByText("workspace")).toBeInTheDocument();
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

    /* act() so the stale promise's continuation actually runs before the
       assertion. Resolving and then polling with waitFor would let the very
       first poll succeed before the microtask fires, which would pass whether
       or not anything guards the write. */
    await act(async () => {
      resolveFirst({
        ...BASE,
        state: MEMORY_V2_TREE_STATES.ERROR,
        errorMessage: "stale",
      });
    });

    expect(screen.getByText("notes")).toBeInTheDocument();
    expect(
      screen.queryByText("Memory tree could not be loaded"),
    ).not.toBeInTheDocument();
  });
});

describe("MemoryV2TreeView — the side menu floats and collapses", () => {
  test("it is a 236px panel inset 6px from the left, not a full-bleed overlay", async () => {
    renderView(READY);
    await screen.findByText("notes");

    const style = sideMenu().style;
    expect(style.left).toBe("6px");
    expect(style.width).toBe("236px");
    /* Clear of the inspector's own title, and clear of the scatter's bottom
       control bar — the background view has to stay usable. */
    expect(style.top).toBe("72px");
    expect(style.bottom).toBe("96px");
  });

  test("collapsing fades and slides it, and never unmounts it", async () => {
    renderView(READY);
    await screen.findByText("notes");
    expect(sideMenu().style.opacity).toBe("1");
    expect(screen.queryByTestId("memory-v2-tree-expand")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("side_menu_close"));

    await waitFor(() => expect(sideMenu().style.opacity).toBe("0"));
    const style = sideMenu().style;
    expect(style.transform).toBe("translateX(-12px)");
    expect(style.pointerEvents).toBe("none");
    /* Still mounted, still laid out — display:none would drop the scroll
       position and kill the transition. */
    expect(style.display).toBe("flex");
    expect(screen.getByText("notes")).toBeInTheDocument();
  });

  test("the expand handle appears only while collapsed and brings it back", async () => {
    renderView(READY);
    await screen.findByText("notes");

    fireEvent.click(screen.getByText("side_menu_close"));
    const handle = await screen.findByTestId("memory-v2-tree-expand");
    expect(handle.style.left).toBe("14px");

    fireEvent.click(screen.getByText("side_menu_left"));
    await waitFor(() => expect(sideMenu().style.opacity).toBe("1"));
    expect(screen.queryByTestId("memory-v2-tree-expand")).not.toBeInTheDocument();
  });
});

describe("MemoryV2TreeView — the entry detail panel", () => {
  test("it is mounted and transparent before anything is selected", async () => {
    renderView(READY);
    await screen.findByText("notes");

    const style = detailPanel().style;
    expect(style.opacity).toBe("0");
    expect(style.transform).toBe("translateX(12px)");
    /* THE property that matters: the vector view's own detail card lives at
       the same coordinates underneath. A pane that swallowed clicks, or one
       that used display:none and so could not animate, would each break a
       different half of that. */
    expect(style.pointerEvents).toBe("none");
    expect(style.display).toBe("flex");
    expect(style.width).toBe("320px");
    expect(style.right).toBe("6px");
  });

  test("clicking a file opens it and shows the entry's facts", async () => {
    renderView(READY, {}, { state: MEMORY_V2_PREVIEW_STATES.READY, text: "# notes" });
    await screen.findByText("a.md");

    fireEvent.click(row("a.md"));

    await waitFor(() => expect(detailPanel().style.opacity).toBe("1"));
    expect(detailPanel().style.pointerEvents).toBe("auto");
    expect(screen.getByText("Entry Detail")).toBeInTheDocument();
    expect(screen.getByText("notes/a.md")).toBeInTheDocument();
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
    expect(screen.getByText("the running notes")).toBeInTheDocument();
    expect(await screen.findByTestId("memory-v2-entry-preview")).toHaveTextContent(
      "# notes",
    );
  });

  test("clicking a link shows its URL and skips the content round trip", async () => {
    const { loadPreview } = renderView(READY);
    await screen.findByText("spec");

    fireEvent.click(row("spec"));

    await waitFor(() => expect(detailPanel().style.opacity).toBe("1"));
    expect(screen.getByText("https://example.com/spec")).toBeInTheDocument();
    expect(
      screen.getByText("This entry has no text content to preview."),
    ).toBeInTheDocument();
    /* A link has no content_ref. Asking anyway would be a round trip per
       click for an answer the payload already gave us. */
    expect(loadPreview).not.toHaveBeenCalled();
  });

  test("clicking a folder toggles it and never opens the panel", async () => {
    renderView(READY);
    await screen.findByText("notes");

    fireEvent.click(row("notes"));

    await waitFor(() => {
      expect(screen.queryByText("a.md")).not.toBeInTheDocument();
    });
    expect(detailPanel().style.opacity).toBe("0");
    expect(detailPanel().style.pointerEvents).toBe("none");
  });

  test("the open row is marked selected, and re-clicking it closes the panel", async () => {
    renderView(READY, {}, { state: MEMORY_V2_PREVIEW_STATES.READY, text: "x" });
    await screen.findByText("a.md");

    fireEvent.click(row("a.md"));
    await waitFor(() => expect(detailPanel().style.opacity).toBe("1"));
    expect(selectedRows()).toHaveLength(1);

    fireEvent.click(row("a.md"));
    await waitFor(() => expect(detailPanel().style.opacity).toBe("0"));
    expect(selectedRows()).toHaveLength(0);
  });

  test("a failed content read is told apart from an entry with no content", async () => {
    renderView(
      READY,
      {},
      { state: MEMORY_V2_PREVIEW_STATES.ERROR, errorCode: "context_v2_unavailable" },
    );
    await screen.findByText("a.md");

    fireEvent.click(row("a.md"));

    expect(
      await screen.findByText("Content could not be read."),
    ).toBeInTheDocument();
    expect(screen.getByText("context_v2_unavailable")).toBeInTheDocument();
    expect(
      screen.queryByText("This entry has no text content to preview."),
    ).not.toBeInTheDocument();
  });

  test("a truncated preview says how much it is withholding", async () => {
    renderView(
      READY,
      {},
      {
        state: MEMORY_V2_PREVIEW_STATES.READY,
        text: "partial",
        shownBytes: 4096,
        totalBytes: 99000,
        truncated: true,
      },
    );
    await screen.findByText("a.md");

    fireEvent.click(row("a.md"));

    expect(
      await screen.findByText("Preview truncated at 4096 of 99000 bytes"),
    ).toBeInTheDocument();
  });

  test("a superseded content read cannot land in a newer selection's panel", async () => {
    /* Click down a list fast enough and the first answer arrives after the
       second selection. What must hold is the observable property — the panel
       keeps describing what is selected NOW — regardless of which of the
       hook's two guards happens to catch it. */
    let resolveFirst;
    const load = jest.fn().mockResolvedValue({ ...BASE, ...READY });
    const loadPreview = jest
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => { resolveFirst = resolve; }),
      )
      .mockResolvedValue({
        ...BASE_PREVIEW,
        state: MEMORY_V2_PREVIEW_STATES.READY,
        text: "second entry",
      });

    render(
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <LocaleContext.Provider value={{ locale: "en", setLocale: jest.fn() }}>
          <MemoryV2TreeView
            open
            ownerChatId="chat-1"
            load={load}
            loadPreview={loadPreview}
          />
        </LocaleContext.Provider>
      </ConfigContext.Provider>,
    );

    await screen.findByText("a.md");
    fireEvent.click(row("a.md"));
    fireEvent.click(row("b.md"));
    expect(await screen.findByTestId("memory-v2-entry-preview")).toHaveTextContent(
      "second entry",
    );

    await act(async () => {
      resolveFirst({
        ...BASE_PREVIEW,
        state: MEMORY_V2_PREVIEW_STATES.READY,
        text: "first entry",
      });
    });

    expect(screen.getByTestId("memory-v2-entry-preview")).toHaveTextContent(
      "second entry",
    );
    expect(screen.queryByText("first entry")).not.toBeInTheDocument();
  });

  test("a reload clears the selection rather than describing a stale entry", async () => {
    const { load } = renderView(
      READY,
      {},
      { state: MEMORY_V2_PREVIEW_STATES.READY, text: "x" },
    );
    await screen.findByText("a.md");
    fireEvent.click(row("a.md"));
    await waitFor(() => expect(detailPanel().style.opacity).toBe("1"));

    fireEvent.click(screen.getByText("refresh"));

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(detailPanel().style.opacity).toBe("0"));
  });
});
