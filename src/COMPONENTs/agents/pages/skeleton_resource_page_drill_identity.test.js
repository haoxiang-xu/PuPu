import React from "react";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import { api } from "../../../SERVICEs/api";
import { drill_layout_key } from "./recipes_page/skeleton_drill";
import {
  CAPTURED_DUPLICATE_ENTRIES,
  CAPTURED_EMBEDDED_SHAPES,
} from "./recipes_page/skeleton_drill_identity_capture";
import {
  ENVELOPE_ROWS,
  REPLACEMENT_CASES,
} from "./recipes_page/skeleton_drill_replacement_capture";
import {
  readSkeletonLayout,
  writeSkeletonNodePositions,
} from "../../../SERVICEs/skeleton_layout";

/* Three of the four acceptance-8 review defects, on the page, against the
 * documents the real store saved.
 *
 * Every parent below came back out of `SkeletonResourceStore` on the fixed
 * pair (`skeleton_drill_identity_capture`): a pool holding two entries one
 * document cannot tell apart, and an embedded graph whose container is not a
 * graph. Both are drafts the store accepts and refuses at Run, which is why
 * they reach the editor at all.
 *
 * FlowEditor is the one double here, because the three questions are about
 * what the page hands it — which graph, which coordinates — and a drag is a
 * mouse gesture its own suite covers. Everything else is the real page: the
 * session, the canvas projection, the pool rows, the Kernel editor, the save
 * payload and the layout service. */

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

let editor = null;
jest.mock("../../../BUILTIN_COMPONENTs/flow_editor", () => ({
  FlowEditor: (props) => {
    editor = props;
    return (
      <div data-testid="flow-editor">
        {(props.nodes || []).map((node) => (
          <div key={node.id} data-testid={`flow-node-${node.id}`} data-x={node.x}>
            {props.render_node(node)}
          </div>
        ))}
      </div>
    );
  },
}));

const cfg = { theme: {}, onThemeMode: "light_mode" };
const copy = (value) => JSON.parse(JSON.stringify(value));

const captured = (name) => {
  const row =
    CAPTURED_DUPLICATE_ENTRIES.find((candidate) => candidate.case === name) ||
    CAPTURED_EMBEDDED_SHAPES.find((candidate) => candidate.case === name);
  if (!row) throw new Error(`no captured row named ${name}`);
  return row;
};

/* The shape rows carry one entry rather than a whole parent, so the parent
   that holds it is the duplicate row's — the same real converted document,
   with its pool's entries replaced by the one being asked about. */
const parent_with_entry = (entry_row) => {
  const document = copy(JSON.parse(captured("duplicate-entry-ids").document));
  const pool = document.nodes.find((node) => node.id === "pool-a");
  pool.config.subagents = [JSON.parse(entry_row.entry)];
  return document;
};

const open_page = async (document, { resources = [] } = {}) => {
  api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources });
  api.unchain.listSkeletonKernelProfiles = jest
    .fn()
    .mockResolvedValue({ profiles: [], unavailable: [] });
  api.unchain.saveSkeletonResource = jest.fn(() => new Promise(() => {}));
  api.unchain.getSkeletonResource = jest.fn(async () => ({
    id: document.id,
    kind: "agent",
    name: document.name,
    document: copy(document),
    edit_token: "edit-1",
    diagnostics: [],
    archived: false,
    description: null,
    draft_digest: null,
    source_identity: null,
  }));
  const view = render(
    <ConfigContext.Provider value={cfg}>
      <SkeletonResourcePage resourceId={document.id} />
    </ConfigContext.Provider>,
  );
  await waitFor(() =>
    expect(screen.getByTestId("skeleton-node-pool-a")).toBeInTheDocument(),
  );
  return view;
};

const pool_rows = () => screen.getByTestId("flow-node-pool-a");
const open_row = (index) =>
  fireEvent.doubleClick(within(pool_rows()).getByTestId(`pool-node-row-${index}`));
const crumbs = () =>
  screen
    .getByTestId("skeleton-drill-crumbs")
    .textContent.split("›")
    .map((part) => part.trim());

beforeEach(() => {
  window.localStorage.clear();
  editor = null;
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
});

describe("two entries the document cannot tell apart, on the page", () => {
  const parent = () => copy(JSON.parse(captured("duplicate-entry-ids").document));

  test("the pool draws both of them, naming each", async () => {
    await open_page(parent());
    expect(within(pool_rows()).getByTestId("pool-node-row-0").textContent).toMatch(
      /First child/,
    );
    expect(within(pool_rows()).getByTestId("pool-node-row-1").textContent).toMatch(
      /Second child/,
    );
  });

  test("the row the author clicked is the graph that opens", async () => {
    await open_page(parent());
    open_row(1);
    await act(async () => {});
    expect(crumbs()).toEqual([
      "Probe duplicate-entry-ids",
      "Subagent Pool",
      "Child Second",
    ]);
    await act(async () => {
      fireEvent.keyDown(window.document, { key: "Escape" });
    });
    open_row(0);
    await act(async () => {});
    expect(crumbs()[2]).toBe("Child First");
  });

  test("and the graph that is written when it is saved", async () => {
    /* The defect: clicking the second row opened the first child, and saving
       then wrote the author's edit into the first entry while the second kept
       what it had. Replayed against the real store in the review, with the
       exact request this page sends. */
    const document = parent();
    await open_page(document);
    open_row(1);
    await act(async () => {});
    fireEvent.click(screen.getByTestId("skeleton-node-agent"));
    const prompt = await screen.findByPlaceholderText("what this Agent is for");
    fireEvent.change(prompt, { target: { value: "Edited after choosing the second" } });
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({
      id: document.id,
      kind: "agent",
      name: document.name,
      document: copy(document),
      edit_token: "edit-2",
      diagnostics: [],
      archived: false,
      description: null,
      draft_digest: null,
      source_identity: null,
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    const payload = api.unchain.saveSkeletonResource.mock.calls[0][0];
    const entries = payload.document.nodes.find((node) => node.id === "pool-a").config
      .subagents;
    const prompt_of = (entry) =>
      entry.source.document.nodes.find((node) => node.id === "agent").config.kernel
        .prompt;
    const before = document.nodes.find((node) => node.id === "pool-a").config.subagents;
    expect(prompt_of(entries[1])).toBe("Edited after choosing the second");
    expect(prompt_of(entries[0])).toBe(prompt_of(before[0]));
    /* The parent is what was written, at the token it was opened at. */
    expect([payload.document.id, payload.expected_edit_token]).toEqual([
      document.id,
      "edit-1",
    ]);
  });

  test("each of them is drawn where IT was left", async () => {
    /* Two different graphs with the same node ids inside one pool. */
    const document = parent();
    const key = (entry_index) =>
      drill_layout_key(document.id, document, [
        { node_id: "pool-a", entry_id: "duplicated-entry", entry_index },
      ]);
    writeSkeletonNodePositions(key(0), { start: { x: 310, y: 311 } });
    writeSkeletonNodePositions(key(1), { start: { x: 420, y: 421 } });
    await open_page(document);
    open_row(1);
    await act(async () => {});
    expect(editor.nodes.find((node) => node.id === "start").x).toBe(420);
    await act(async () => {
      fireEvent.keyDown(window.document, { key: "Escape" });
    });
    open_row(0);
    await act(async () => {});
    expect(editor.nodes.find((node) => node.id === "start").x).toBe(310);
  });
});

describe("an embedded graph the canvas cannot draw, on the page", () => {
  test("its row says why instead of taking the author to a page that throws", async () => {
    /* `nodes: {toString: null}` — saved and read back by the real store, and
       refused at Run with `invalid_type` at that very path. The page offered
       it, and opening it threw `nodes.map is not a function` before anything
       was drawn. */
    const row = captured("embedded-nodes-not-a-list");
    await open_page(parent_with_entry(row));
    expect(within(pool_rows()).getByTestId("pool-node-row-0").textContent).toMatch(
      /The child/,
    );
    open_row(0);
    await act(async () => {});
    expect(screen.getByTestId("skeleton-drill-notice").textContent).toMatch(
      /list of nodes/i,
    );
    expect(screen.queryByTestId("skeleton-drill-breadcrumb")).toBeNull();
    /* Still the parent's graph, and the parent's own nodes. */
    expect(screen.getByTestId("skeleton-node-pool-a")).toBeInTheDocument();
  });

  test("the panel offers no Open for it either, and keeps its diagnostics", async () => {
    const row = captured("embedded-nodes-not-a-list");
    await open_page(parent_with_entry(row));
    fireEvent.click(screen.getByTestId("skeleton-node-pool-a"));
    await act(async () => {});
    expect(screen.queryByLabelText("Open The child")).toBeNull();
    /* The mirror still reports what the store refuses, at the path the store
       names: nothing was emptied to make the row look healthy. */
    expect(
      screen.getByTestId("subagent-entry-0-problem-0").textContent,
    ).toMatch(/nodes must be an array/);
  });

  test("a child that is merely unfinished still opens", async () => {
    const row = captured("embedded-no-end-node");
    await open_page(parent_with_entry(row));
    open_row(0);
    await act(async () => {});
    expect(screen.getByTestId("skeleton-drill-breadcrumb")).toBeInTheDocument();
    expect(screen.queryByTestId("skeleton-drill-notice")).toBeNull();
  });
});

describe("a parent and a child that share node ids", () => {
  /* The pool's own entry, so the child is the one the converter wrote. Both
     graphs carry a node called `start`, which is what made them draw each
     other's positions: the canvas kept the positions it had handed out across
     the change of graph, and the next drag wrote them back under the graph
     that was open then. */
  const parent = () => {
    const document = copy(JSON.parse(captured("duplicate-entry-ids").document));
    const pool = document.nodes.find((node) => node.id === "pool-a");
    pool.config.subagents = [pool.config.subagents[0]];
    return document;
  };

  const child_key = (document) =>
    drill_layout_key(document.id, document, [
      { node_id: "pool-a", entry_id: "duplicated-entry", entry_index: 0 },
    ]);

  test("each one opens where it was left", async () => {
    const document = parent();
    writeSkeletonNodePositions(document.id, { start: { x: 101, y: 111 } });
    writeSkeletonNodePositions(child_key(document), { start: { x: 701, y: 711 } });
    await open_page(document);
    expect(editor.nodes.find((node) => node.id === "start").x).toBe(101);
    open_row(0);
    await act(async () => {});
    expect(editor.nodes.find((node) => node.id === "start").x).toBe(701);
  });

  test("moving a node in the child does not move the parent's", async () => {
    const document = parent();
    writeSkeletonNodePositions(document.id, { start: { x: 101, y: 111 } });
    writeSkeletonNodePositions(child_key(document), { start: { x: 701, y: 711 } });
    await open_page(document);
    open_row(0);
    await act(async () => {});
    act(() => {
      editor.on_nodes_change(
        editor.nodes.map((node) =>
          node.id === "start" ? { ...node, x: 202, y: 212 } : node,
        ),
      );
    });
    await act(async () => {
      fireEvent.keyDown(window.document, { key: "Escape" });
    });
    expect(editor.nodes.find((node) => node.id === "start").x).toBe(101);
    /* And a drag in the parent afterwards writes the parent's own layout,
       not the child's coordinate into it. */
    act(() => {
      editor.on_nodes_change(
        editor.nodes.map((node) => (node.id === "end" ? { ...node, x: 50, y: 60 } : node)),
      );
    });
    const stored = readSkeletonLayout(document.id, document).nodes;
    expect(stored.start).toEqual({ x: 101, y: 111 });
    expect(stored.end).toEqual({ x: 50, y: 60 });
    /* The child kept what the author moved there. */
    expect(
      readSkeletonLayout(child_key(document), document).nodes.start,
    ).toEqual({ x: 202, y: 212 });
  });

  test("the definitions are untouched by any of it", async () => {
    const document = parent();
    const before = JSON.stringify(document);
    await open_page(document);
    open_row(0);
    await act(async () => {});
    act(() => {
      editor.on_nodes_change(
        editor.nodes.map((node) =>
          node.id === "start" ? { ...node, x: 909, y: 909 } : node,
        ),
      );
    });
    expect(JSON.stringify(document)).toBe(before);
    expect(screen.getByTestId("skeleton-save-state").textContent).toMatch(/^Saved$/);
  });
});

describe("the parent replaced from outside while a duplicate is open", () => {
  /* The review's remaining P1, on the page, driven by the sequence the store
     performed: the author opens the SECOND of two entries sharing an id,
     another editor stores a version of the parent at the author's own token,
     the author's save gets the real `edit_conflict`, and they choose to look
     at theirs. The position they clicked describes a document that is gone.

     Measured before the fix, with the page's own emitted payload replayed
     into a real store: the editor silently moved to Child First, accepted
     more typing, and stored it there while Child Second kept what it had. */

  const resource_of = (name, which) => JSON.parse(REPLACEMENT_CASES[name][which]);

  const prompt_of = (entry) =>
    entry.source.document.nodes.find((node) => node.id === "agent").config.kernel
      .prompt;
  const entries_of = (document) =>
    document.nodes.find((node) => node.id === "pool-a").config.subagents;

  /* The page, up to the moment the other version is on screen. Both reads are
     the store's own answers: the author's at `edit-1`, the other editor's at
     `edit-2`. */
  async function take_theirs(name) {
    const before = resource_of(name, "old");
    const after = resource_of(name, "new");
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [] });
    api.unchain.listSkeletonKernelProfiles = jest
      .fn()
      .mockResolvedValue({ profiles: [], unavailable: [] });
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValueOnce(copy(before))
      .mockResolvedValue(copy(after));
    api.unchain.saveSkeletonResource = jest
      .fn()
      .mockResolvedValueOnce({ error: REPLACEMENT_CASES[name].conflict })
      .mockImplementation(() => new Promise(() => {}));
    render(
      <ConfigContext.Provider value={cfg}>
        <SkeletonResourcePage resourceId={before.id} />
      </ConfigContext.Provider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("skeleton-node-pool-a")).toBeInTheDocument(),
    );
    open_row(1);
    await act(async () => {});
    expect(crumbs()[2]).toBe("Child Second");
    fireEvent.click(screen.getByTestId("skeleton-node-agent"));
    const prompt = await screen.findByPlaceholderText("what this Agent is for");
    fireEvent.change(prompt, { target: { value: "Edited in the SECOND child" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    await screen.findByTestId("skeleton-save-conflict");
    await act(async () => {
      fireEvent.click(screen.getByText("Look at theirs"));
    });
    await waitFor(() =>
      expect(screen.queryByTestId("skeleton-save-conflict")).toBeNull(),
    );
    return { before, after };
  }

  test("the chosen entry removed: back to the parent, saying why", async () => {
    const { after } = await take_theirs("removed_chosen");
    /* One entry is left, it still holds the shared id, and it is the child the
       author never opened. */
    expect(entries_of(after.document).map((entry) => entry.source.document.name)).toEqual([
      "Child First",
    ]);
    expect(screen.queryByTestId("skeleton-drill-breadcrumb")).toBeNull();
    expect(screen.getByTestId("skeleton-node-pool-a")).toBeInTheDocument();
    expect(screen.getByTestId("skeleton-drill-notice").textContent).toMatch(
      /share one id/i,
    );
    expect(screen.getByTestId("skeleton-drill-notice").textContent).toMatch(
      /open the one you want/i,
    );
    /* And there is no Kernel editor for another child to type into. */
    expect(screen.queryByPlaceholderText("what this Agent is for")).toBeNull();
    expect(screen.getByTestId("skeleton-save-state").textContent).toMatch(/^Saved$/);
  });

  test("the two reordered: still the child the author opened", async () => {
    const { after } = await take_theirs("reordered");
    expect(entries_of(after.document).map((entry) => entry.source.document.name)).toEqual([
      "Child Second",
      "Child First",
    ]);
    expect(crumbs()[2]).toBe("Child Second");
    /* Theirs is what is on screen — the author's own edit was discarded by
       the choice they made — and typing again saves into THAT child. */
    fireEvent.click(screen.getByTestId("skeleton-node-agent"));
    const prompt = await screen.findByPlaceholderText("what this Agent is for");
    expect(prompt.value).toBe("Child own prompt.");
    fireEvent.change(prompt, { target: { value: "Continued in the SECOND child" } });
    api.unchain.saveSkeletonResource = jest.fn(() => new Promise(() => {}));
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    const payload = api.unchain.saveSkeletonResource.mock.calls[0][0];
    const written = entries_of(payload.document);
    expect(payload.expected_edit_token).toBe(after.edit_token);
    expect(
      written.map((entry) => [entry.source.document.name, prompt_of(entry)]),
    ).toEqual([
      ["Child Second", "Continued in the SECOND child"],
      ["Child First", "Child own prompt."],
    ]);
  });

  test("the other duplicate removed: the step follows the chosen graph", async () => {
    /* The control: the entry the author had open is the one that survives, so
       the editor must stay in it rather than closing. */
    const { after } = await take_theirs("removed_other");
    expect(entries_of(after.document).map((entry) => entry.source.document.name)).toEqual([
      "Child Second",
    ]);
    expect(crumbs()[2]).toBe("Child Second");
    expect(screen.queryByTestId("skeleton-drill-notice")).toBeNull();
    expect(
      (await screen.findByPlaceholderText("what this Agent is for")).value,
    ).toBe("Child own prompt.");
  });
});

describe("a stored node carrying a field a node does not have", () => {
  /* The review's remaining P2. `label: {"toString": null}` on an embedded
     child's Agent node: saved by the real store, read back verbatim, refused
     at Run with `unknown_field` at that key — and the drawing read it, so
     opening the child threw "Objects are not valid as a React child". */

  const stray = (name) => {
    const row = ENVELOPE_ROWS.find((item) => item.case === name);
    const document = copy(JSON.parse(captured("duplicate-entry-ids").document));
    document.nodes.find((node) => node.id === "pool-a").config.subagents = [
      JSON.parse(row.entries)[0],
    ];
    return document;
  };

  test("it opens, draws, and the graph still holds what the store holds", async () => {
    const document = stray("child_node_label_unreadable");
    const before = JSON.stringify(document);
    await open_page(document);
    open_row(0);
    await act(async () => {});
    expect(screen.getByTestId("skeleton-drill-breadcrumb")).toBeInTheDocument();
    expect(screen.queryByTestId("skeleton-drill-notice")).toBeNull();
    /* The child's own nodes are on screen, drawn by their ids. */
    expect(screen.getByTestId("skeleton-node-agent")).toBeInTheDocument();
    expect(screen.getByTestId("flow-node-agent").textContent).not.toMatch(
      /unreadable/,
    );
    /* Selecting it opens the panel rather than taking the page down. */
    fireEvent.click(screen.getByTestId("skeleton-node-agent"));
    await act(async () => {});
    expect(await screen.findByPlaceholderText("what this Agent is for")).toBeInTheDocument();
    expect(JSON.stringify(document)).toBe(before);
  });

  test("and the pool row that offered it says what the store refuses about it", async () => {
    /* Not a sentence this editor invented: the mirror of the pool validator
       reports it at the path the store names. Which is also why the drawing
       does not need to refuse the graph — the author is told, and can still
       work on everything else in it. */
    await open_page(stray("child_node_label_unreadable"));
    fireEvent.click(screen.getByTestId("skeleton-node-pool-a"));
    await act(async () => {});
    const problems = screen
      .getByTestId("subagent-entry-0")
      .textContent;
    expect(problems).toMatch(/unknown field/i);
    expect(problems).toMatch(/label/);
  });
});
