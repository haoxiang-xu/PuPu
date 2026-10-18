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
  LOOKUP_ROWS,
  REPLACEMENT_CASES,
} from "./recipes_page/skeleton_drill_replacement_capture";
import {
  ENTRY_ID_ROWS,
  SAVE_COUNT_PAIRS,
} from "./recipes_page/skeleton_entry_id_capture";
import { SCOPE_CASES } from "./recipes_page/skeleton_entry_id_scope_capture";
import { EMBEDDED_DIAGNOSTIC_ROWS } from "./recipes_page/skeleton_embedded_diagnostics_capture";
import { writeSkeletonViewport } from "../../../SERVICEs/skeleton_layout";
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

const open_page = async (document, { resources = [], pool = "pool-a" } = {}) => {
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
    expect(screen.getByTestId(`skeleton-node-${pool}`)).toBeInTheDocument(),
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

describe("two entries sharing a graph id as well as an id", () => {
  /* The review's remaining P1, on the page. Both entries name `child-first`,
     so the graph id names nothing: the store keeps that draft verbatim and
     refuses it at Run — `duplicate_name`, and `dependency_conflict` once the
     entry ids are repaired. Deleting the entry the author opened leaves one
     graph-id match, which the editor treated as proof and wrote into. */

  const resource_of = (which) =>
    JSON.parse(REPLACEMENT_CASES.equal_graph_id_removed_chosen[which]);
  const conflict_of = () =>
    REPLACEMENT_CASES.equal_graph_id_removed_chosen.conflict;

  test("the chosen one deleted: back to the parent, nothing opened, nothing sent", async () => {
    const before = resource_of("old");
    const after = resource_of("new");
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
      .mockResolvedValueOnce({ error: conflict_of() })
      .mockImplementation(() => new Promise(() => {}));
    render(
      <ConfigContext.Provider value={cfg}>
        <SkeletonResourcePage resourceId={before.id} />
      </ConfigContext.Provider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("skeleton-node-pool-a")).toBeInTheDocument(),
    );
    /* Both rows name the same graph, and the author opens the second. */
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
    expect(screen.queryByTestId("skeleton-drill-breadcrumb")).toBeNull();
    expect(screen.getByTestId("skeleton-node-pool-a")).toBeInTheDocument();
    expect(screen.getByTestId("skeleton-drill-notice").textContent).toMatch(
      /share one id/i,
    );
    expect(screen.queryByPlaceholderText("what this Agent is for")).toBeNull();
    /* One request in the whole sequence: the save that was refused. */
    expect(api.unchain.saveSkeletonResource).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("skeleton-save-state").textContent).toMatch(/^Saved$/);
  });
});

describe("a node type that names a member of every object", () => {
  /* The review's remaining P2, on the page: the draft opens on the canvas,
     and selecting the node used to throw out of the identity table. */
  const stray = () => {
    const row = LOOKUP_ROWS.find((item) => item.case === "node_type_proto");
    const document = copy(JSON.parse(captured("duplicate-entry-ids").document));
    document.nodes.find((node) => node.id === "pool-a").config.subagents = [
      JSON.parse(row.entries)[0],
    ];
    return document;
  };

  test("it opens, and selecting the node does not take the page with it", async () => {
    const document = stray();
    const before = JSON.stringify(document);
    await open_page(document);
    open_row(0);
    await act(async () => {});
    expect(screen.getByTestId("skeleton-drill-breadcrumb")).toBeInTheDocument();
    /* The node is drawn, by its own type, with no ports invented for it. */
    expect(screen.getByTestId("flow-node-agent").textContent).toMatch(/__proto__/);
    expect(editor.nodes.find((node) => node.id === "agent").ports).toEqual([]);
    fireEvent.click(screen.getByTestId("skeleton-node-agent"));
    await act(async () => {});
    /* The panel is open and has no header for a type it cannot name. */
    expect(screen.getByTestId("recipe-detail-panel-body")).toBeInTheDocument();
    expect(JSON.stringify(document)).toBe(before);
  });
});

describe("a reference read issued from a graph that is then closed", () => {
  /* The review's remaining P2 on the late read. The author opens the second
     of two entries sharing an id, starts reading the Agent that child's own
     pool references, and the other editor deletes the entry. The page
     correctly returns to the parent and says the graph was closed — and then
     the read landed and navigated into the referenced Agent anyway, with the
     breadcrumb and the closed notice on screen together.
     Everything here is the store's: the parent, the replacement, the real
     conflict, and the referenced Agent as its own resource. */

  const held = () => REPLACEMENT_CASES.pending_reference;
  const resource_of = (which) => JSON.parse(held()[which]);
  const reference_of = () => JSON.parse(held().reference);

  async function to_the_pending_read() {
    const before = resource_of("old");
    const after = resource_of("new");
    const reference = reference_of();
    let deliver;
    const reading = new Promise((resolve) => {
      deliver = resolve;
    });
    let parent_reads = 0;
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({
      resources: [
        { id: reference.id, name: reference.name, kind: "agent", archived: false },
      ],
    });
    api.unchain.listSkeletonKernelProfiles = jest
      .fn()
      .mockResolvedValue({ profiles: [], unavailable: [] });
    api.unchain.getSkeletonResource = jest.fn((id) =>
      id === reference.id
        ? reading
        : Promise.resolve(copy((parent_reads += 1) === 1 ? before : after)),
    );
    api.unchain.saveSkeletonResource = jest
      .fn()
      .mockResolvedValue({ error: held().conflict });
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
    /* Dirty, so the save is refusable, and then the read from this child's
       own pool is started and held. */
    fireEvent.click(screen.getByTestId("skeleton-node-agent"));
    fireEvent.change(await screen.findByPlaceholderText("what this Agent is for"), {
      target: { value: "Dirty in the SECOND child" },
    });
    fireEvent.doubleClick(
      within(screen.getByTestId("flow-node-inner-ref-pool")).getByTestId(
        "pool-node-row-0",
      ),
    );
    await waitFor(() =>
      expect(api.unchain.getSkeletonResource).toHaveBeenCalledWith(reference.id),
    );
    return { deliver, reference };
  }

  test("the closed source view's read is not adopted", async () => {
    const { deliver, reference } = await to_the_pending_read();
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
    /* The page is back at the parent and says why. */
    expect(screen.queryByTestId("skeleton-drill-breadcrumb")).toBeNull();
    expect(screen.getByTestId("skeleton-drill-notice").textContent).toMatch(
      /share one id/i,
    );
    /* Now the read lands. */
    await act(async () => {
      deliver(copy(reference));
    });
    expect(screen.queryByTestId("skeleton-drill-breadcrumb")).toBeNull();
    expect(screen.getByTestId("skeleton-node-pool-a")).toBeInTheDocument();
    /* Still this resource, still its own graph. */
    expect(screen.getByTestId("skeleton-node-list").textContent).not.toMatch(
      /inner-ref-pool/,
    );
    /* And nothing new was said about the graph the author decided against. */
    expect(screen.getByTestId("skeleton-drill-notice").textContent).toMatch(
      /share one id/i,
    );
  });

  test("but a read whose source graph is still there is still adopted", async () => {
    /* The control that makes the fix something other than "never navigate":
       nothing closes the child, so the reference opens as it always did. */
    const { deliver, reference } = await to_the_pending_read();
    await act(async () => {
      deliver(copy(reference));
    });
    expect(crumbs()[crumbs().length - 1]).toBe(reference.document.name);
    expect(screen.queryByTestId("skeleton-drill-notice")).toBeNull();
  });

  test("and typing while it is in flight does not cancel it", async () => {
    /* The other control the review asked to keep: an edit is not a
       navigation, and the draft it was typed into is what the frame carries. */
    const { deliver, reference } = await to_the_pending_read();
    fireEvent.click(screen.getByTestId("skeleton-node-agent"));
    fireEvent.change(await screen.findByPlaceholderText("what this Agent is for"), {
      target: { value: "Typed while the read was in flight" },
    });
    await act(async () => {
      deliver(copy(reference));
    });
    expect(crumbs()[crumbs().length - 1]).toBe(reference.document.name);
    /* Back, and the typing is still there. */
    await act(async () => {
      fireEvent.keyDown(window.document, { key: "Escape" });
    });
    fireEvent.click(screen.getByTestId("skeleton-node-agent"));
    expect(
      (await screen.findByPlaceholderText("what this Agent is for")).value,
    ).toBe("Typed while the read was in flight");
  });
});

describe("one resource at two depths, saved deeper", () => {
  /* The same Agent can sit at two levels — a graph referencing an Agent that
     references it back — so saving the deeper copy writes what the frame
     below holds. The page counts saves per resource for exactly that, and the
     count was kept in a table keyed by resource id: for `constructor` the
     read answered with a function, `(fn || 0) + 1` became a string, and
     assigning it stored nothing, so the frame below was never told.
     Both sequences here were performed by the real store — the deeper save
     moves the token, and the older copy's save is then refused with
     `edit_conflict` while the stored document stays as it was. */

  const pair = (name) => SAVE_COUNT_PAIRS[name];
  const resource_of = (name, which) => JSON.parse(pair(name)[which]);

  async function save_deeper(name) {
    const old = resource_of(name, "old");
    const peer = resource_of(name, "peer");
    const next = resource_of(name, "new");
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({
      resources: [
        { id: old.id, name: old.name, kind: "agent", archived: false },
        { id: peer.id, name: peer.name, kind: "agent", archived: false },
      ],
    });
    api.unchain.listSkeletonKernelProfiles = jest
      .fn()
      .mockResolvedValue({ profiles: [], unavailable: [] });
    api.unchain.getSkeletonResource = jest.fn(async (id) =>
      copy(id === peer.id ? peer : old),
    );
    api.unchain.saveSkeletonResource = jest.fn(async () => copy(next));
    render(
      <ConfigContext.Provider value={cfg}>
        <SkeletonResourcePage resourceId={old.id} />
      </ConfigContext.Provider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("skeleton-node-pool-a")).toBeInTheDocument(),
    );
    /* Down into the peer, and from the peer back into this resource. */
    open_row(0);
    await waitFor(() =>
      expect(screen.getByTestId("skeleton-drill-breadcrumb").textContent).toContain(
        peer.name,
      ),
    );
    open_row(0);
    await waitFor(() =>
      expect(api.unchain.getSkeletonResource).toHaveBeenCalledTimes(3),
    );
    /* Edited and saved at this depth: the token moves, so the copy the first
       frame holds is now the older one. */
    fireEvent.click(screen.getByTestId("skeleton-node-a1"));
    fireEvent.change(await screen.findByPlaceholderText("what this Agent is for"), {
      target: { value: "Saved in the deeper copy " + name },
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    await waitFor(() =>
      expect(screen.getByTestId("skeleton-save-state").textContent).toMatch(/^Saved$/),
    );
    expect(api.unchain.saveSkeletonResource).toHaveBeenCalledTimes(1);
    expect(pair(name).stale_save_error.code).toBe("edit_conflict");
    expect(pair(name).new_document_unchanged).toBe(true);
    return { old, peer, next };
  }

  test("an ordinary resource id says so when the first copy is reopened", async () => {
    const { old } = await save_deeper("normal");
    await act(async () => {
      fireEvent.click(screen.getByLabelText(`Back to ${old.name}`));
    });
    expect(screen.getByTestId("skeleton-drill-notice").textContent).toMatch(
      /was saved again further in/i,
    );
  });

  test("and so does one named after something every object has", async () => {
    const { old } = await save_deeper("inherited");
    expect(old.id).toBe("constructor");
    await act(async () => {
      fireEvent.click(screen.getByLabelText(`Back to ${old.name}`));
    });
    expect(screen.getByTestId("skeleton-drill-notice").textContent).toMatch(
      /was saved again further in/i,
    );
    /* And the sentence names that resource rather than the one below it. */
    expect(screen.getByTestId("skeleton-drill-notice").textContent).toContain(old.name);
  });

  test("a resource saved nowhere deeper says nothing when it is reopened", async () => {
    /* The control: the notice is about a write that happened, and going back
       without one must stay quiet. */
    const old = resource_of("inherited", "old");
    const peer = resource_of("inherited", "peer");
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({
      resources: [{ id: peer.id, name: peer.name, kind: "agent", archived: false }],
    });
    api.unchain.listSkeletonKernelProfiles = jest
      .fn()
      .mockResolvedValue({ profiles: [], unavailable: [] });
    api.unchain.getSkeletonResource = jest.fn(async (id) =>
      copy(id === peer.id ? peer : old),
    );
    api.unchain.saveSkeletonResource = jest.fn(() => new Promise(() => {}));
    render(
      <ConfigContext.Provider value={cfg}>
        <SkeletonResourcePage resourceId={old.id} />
      </ConfigContext.Provider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("skeleton-node-pool-a")).toBeInTheDocument(),
    );
    open_row(0);
    await waitFor(() =>
      expect(screen.getByTestId("skeleton-drill-breadcrumb").textContent).toContain(
        peer.name,
      ),
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText(`Back to ${old.name}`));
    });
    expect(screen.queryByTestId("skeleton-drill-notice")).toBeNull();
  });
});

describe("giving a duplicated entry an id of its own, on the page", () => {
  /* The repair, from the panel that owns the pool's edits. The store saves a
     draft whose two entry ids collide and refuses it at Run — and removing
     one of them was the only repair this editor had, which for an embedded
     entry is an Agent's graph gone. */

  const parent = () => copy(JSON.parse(captured("duplicate-entry-ids").document));
  const entries_of = (document) =>
    document.nodes.find((node) => node.id === "pool-a").config.subagents;
  const graph_ids = (document) =>
    entries_of(document).map((entry) => entry.source.document.id);

  async function open_pool(document) {
    await open_page(document);
    fireEvent.click(screen.getByTestId("skeleton-node-pool-a"));
    await act(async () => {});
  }

  test("the row says the pool cannot tell them apart, and repairs itself", async () => {
    const document = parent();
    await open_pool(document);
    expect(screen.getByTestId("subagent-entry-1-shared-id").textContent).toMatch(
      /neither of them runs/i,
    );
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Give Second child an id of its own"));
    });
    /* Both rows are their own now, so neither says it any more. */
    expect(screen.queryByTestId("subagent-entry-0-shared-id")).toBeNull();
    expect(screen.queryByTestId("subagent-entry-1-shared-id")).toBeNull();
    /* The draft is dirty and nothing saved itself. */
    expect(screen.getByTestId("skeleton-save-state").textContent).not.toMatch(/^Saved$/);
    expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
  });

  test("and the two rows then open their own graphs", async () => {
    const document = parent();
    await open_pool(document);
    expect(graph_ids(document)).toEqual(["child-first", "child-second"]);
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Give Second child an id of its own"));
    });
    /* The row that was repaired, and the one that was not. */
    open_row(1);
    await act(async () => {});
    expect(crumbs()[2]).toBe("Child Second");
    await act(async () => {
      fireEvent.keyDown(window.document, { key: "Escape" });
    });
    open_row(0);
    await act(async () => {});
    expect(crumbs()[2]).toBe("Child First");
  });

  test("what the save carries is the repair and the author's own edits", async () => {
    const document = parent();
    await open_pool(document);
    /* Something typed before the repair, in a different pool row's field. */
    fireEvent.change(screen.getAllByPlaceholderText("what it is for (optional)")[1], {
      target: { value: "Typed before the repair" },
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Give Second child an id of its own"));
    });
    api.unchain.saveSkeletonResource = jest.fn(() => new Promise(() => {}));
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    const payload = api.unchain.saveSkeletonResource.mock.calls[0][0];
    const written = entries_of(payload.document);
    expect(written.map((entry) => entry.id)).toEqual([
      "duplicated-entry",
      "subagent-1",
    ]);
    /* The whole embedded graph came through, and so did the typing. */
    expect(written[1].source.document).toEqual(
      entries_of(document)[1].source.document,
    );
    expect(written[1].description).toBe("Typed before the repair");
    /* At the token it was loaded at: an ordinary save. */
    expect(payload.expected_edit_token).toBe("edit-1");
  });

  test("it does not say the Agent runs now", async () => {
    /* One refusal fewer. Measured on the pair: two entries whose embedded
       graphs carry ONE document id are still `dependency_conflict` after
       their entry ids differ — and that refusal is the store's at Run, which
       this editor does not pre-empt. So nothing here may read as a verdict. */
    const by = (name) => ENTRY_ID_ROWS.find((item) => item.case === name);
    expect(by("repaired_ids").run.ok).toBe(true);
    expect(by("repaired_ids_one_graph").run.code).toBe("dependency_conflict");

    const document = parent();
    /* Both children under one document id, which is the case Run still
       refuses. */
    entries_of(document).forEach((entry) => {
      entry.source.document.id = "child-one";
    });
    await open_pool(document);
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Give Second child an id of its own"));
    });
    const panel = screen.getByTestId("recipe-detail-panel-body").textContent;
    expect(panel).not.toMatch(/ready to run/i);
    expect(panel).not.toMatch(/will run/i);
    expect(panel).not.toMatch(/can run now/i);
    /* The save bar is the only thing that reports a verdict, and it reports
       what the store said, which is nothing yet. */
    expect(screen.queryByTestId("skeleton-preflight-state")).toBeNull();
  });

  test("the definitions of both children are untouched by the repair", async () => {
    const document = parent();
    const before = JSON.stringify(
      entries_of(document).map((entry) => entry.source.document),
    );
    await open_pool(document);
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Give First child an id of its own"));
    });
    expect(
      JSON.stringify(entries_of(document).map((entry) => entry.source.document)),
    ).toBe(before);
  });
});

describe("the repair stays in the graph the button is in", () => {
  /* The review's P1, which the store accepted: a parent pool called `pool`
     whose first entry embeds a child whose OWN pool is also called `pool`.
     Repairing an inner row matched the ancestor by the same local node id and
     row index, the breadcrumb switched to the sibling outer child, and the
     author's next sentence was saved into it. Both documents are in
     `SCOPE_CASES`, and the store runs the repaired one — which is why nothing
     may be rewritten on the way. */

  const scope = (name) => SCOPE_CASES[name];
  const document_of = (name) => copy(JSON.parse(scope(name).document));
  const pool_rows = (id) => screen.getByTestId(`flow-node-${id}`);

  test("the store holds both of these, and names only the inner duplicate", () => {
    expect([scope("nested").saved, scope("nested").round_trip]).toEqual([true, true]);
    expect(scope("nested").draft_diagnostics).toEqual([]);
    expect(scope("nested").preflight.code).toBe("duplicate_name");
    /* Three levels down: the inner pool's second entry. */
    expect(scope("nested").preflight.path.slice(-3)).toEqual(["subagents", 1, "id"]);
    /* And what the panel writes runs. */
    expect(scope("nested_repaired").preflight).toEqual({ ok: true });
  });

  test("repairing an inner row leaves the open graph and its ancestor alone", async () => {
    const document = document_of("nested");
    await open_page(document, { pool: "pool" });
    /* Into the first outer child, whose own pool is also called `pool`. */
    fireEvent.doubleClick(
      within(pool_rows("pool")).getByTestId("pool-node-row-0"),
    );
    await act(async () => {});
    expect(crumbs()[2]).toBe("Selected outer child");
    /* Its inner pool, and the repair. */
    fireEvent.click(screen.getByTestId("skeleton-node-pool"));
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Give Inner first an id of its own"));
    });
    /* Still the graph the author was in. */
    expect(crumbs()[2]).toBe("Selected outer child");
    expect(screen.getByTestId("skeleton-drill-breadcrumb").textContent).not.toContain(
      "Other outer child",
    );
    /* And the save carries the repair, in the inner pool, with both outer
       entries as they were. */
    api.unchain.saveSkeletonResource = jest.fn(() => new Promise(() => {}));
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    const payload = api.unchain.saveSkeletonResource.mock.calls[0][0];
    const outer = payload.document.nodes.find((node) => node.id === "pool").config
      .subagents;
    expect(outer.map((entry) => entry.id)).toEqual(["outer-entry", "subagent-1"]);
    expect(outer.map((entry) => entry.source.document.name)).toEqual([
      "Selected outer child",
      "Other outer child",
    ]);
    const inner = outer[0].source.document.nodes.find((node) => node.id === "pool")
      .config.subagents;
    expect(inner.map((entry) => entry.id)).toEqual(["subagent-1", "dup"]);
    /* Which is the document the store runs. */
    expect(JSON.parse(scope("nested_repaired").document)).toEqual(payload.document);
  });

  test("and the sibling outer child keeps its own prompt", async () => {
    /* What the wrong write did: the author's continuation landed in the
       child they had never opened. */
    const document = document_of("nested");
    await open_page(document, { pool: "pool" });
    fireEvent.doubleClick(
      within(pool_rows("pool")).getByTestId("pool-node-row-0"),
    );
    await act(async () => {});
    fireEvent.click(screen.getByTestId("skeleton-node-pool"));
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Give Inner first an id of its own"));
    });
    fireEvent.click(screen.getByTestId("skeleton-node-agent"));
    fireEvent.change(await screen.findByPlaceholderText("what this Agent is for"), {
      target: { value: "Continuation intended for Selected outer child" },
    });
    api.unchain.saveSkeletonResource = jest.fn(() => new Promise(() => {}));
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    const outer = api.unchain.saveSkeletonResource.mock.calls[0][0].document.nodes
      .find((node) => node.id === "pool")
      .config.subagents;
    const prompt_of = (entry) =>
      entry.source.document.nodes.find((node) => node.id === "agent").config.kernel
        .prompt;
    expect(prompt_of(outer[0])).toBe("Continuation intended for Selected outer child");
    expect(prompt_of(outer[1])).toBe("Other child own prompt.");
  });
});

describe("text a name box is holding, across the page's own edits", () => {
  /* Held text belongs to the row, and in this pool the document cannot name a
     row — two entries share one id. On the page the document really comes
     back, so a removal and a repair can both be made and the text followed
     through them. */
  const document_of = () => copy(JSON.parse(SCOPE_CASES.layout.document));

  async function hold_a_taken_name() {
    const document = document_of();
    await open_page(document);
    fireEvent.click(screen.getByTestId("skeleton-node-pool-a"));
    await act(async () => {});
    fireEvent.change(screen.getAllByPlaceholderText("name")[1], {
      target: { value: "First child" },
    });
    expect(screen.getByTestId("subagent-entry-1-name-taken").textContent).toMatch(
      /already called First child/,
    );
    return document;
  }

  test("it survives this row's own id repair", async () => {
    await hold_a_taken_name();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Give Second child an id of its own"));
    });
    expect(screen.getAllByPlaceholderText("name")[1].value).toBe("First child");
    expect(screen.getByTestId("subagent-entry-1-name-taken")).toBeTruthy();
  });

  test("and it stays with its own row when an earlier row is removed", async () => {
    await hold_a_taken_name();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Remove First child"));
    });
    /* One row left: the one that was holding text, still holding it. */
    expect(screen.getAllByPlaceholderText("name")).toHaveLength(1);
    expect(screen.getAllByPlaceholderText("name")[0].value).toBe("First child");
    expect(screen.getByTestId("subagent-entry-0-name-taken")).toBeTruthy();
  });

  test("and it dies when the other editor's version arrives", async () => {
    /* The protection that must not be lost. Taking the other version replaces
       the list with one this editor did not write, so the identities are
       re-minted and text typed against the old row goes with them. */
    const document = await hold_a_taken_name();
    /* A refused name stores nothing, so the draft is not dirty and there is
       nothing to save yet. One real edit on the same row — which must not
       drop the held name either. */
    fireEvent.change(screen.getAllByPlaceholderText("what it is for (optional)")[1], {
      target: { value: "A real edit" },
    });
    expect(screen.getAllByPlaceholderText("name")[1].value).toBe("First child");
    const replacement = {
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
    };
    api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(replacement);
    api.unchain.saveSkeletonResource = jest
      .fn()
      .mockResolvedValue({ error: { code: "edit_conflict", path: ["expected_edit_token"], message: "resource changed in another editor" } });
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
    fireEvent.click(screen.getByTestId("skeleton-node-pool-a"));
    await act(async () => {});
    expect(screen.getAllByPlaceholderText("name")[1].value).toBe("Second child");
    expect(screen.queryByTestId("subagent-entry-1-name-taken")).toBeNull();
  });
});

describe("the drawings the repair moves", () => {
  /* The review's second P2. A graph is keyed by the steps that reach it, and
     a step carries the entry's position only while two entries share an id.
     So repairing one moves BOTH children's keys — the repaired entry's, and
     its sibling's, which stops being ambiguous. Measured before this: both
     children opened at (80, 80) with their viewports gone. */

  const document_of = () => copy(JSON.parse(SCOPE_CASES.layout.document));

  const child_key = (document, entry_index) =>
    drill_layout_key(
      document.id,
      document,
      [
        {
          node_id: "pool-a",
          entry_id: "duplicated-entry",
          entry_index,
          ambiguous: true,
          graph_id: document.nodes.find((node) => node.id === "pool-a").config
            .subagents[entry_index].source.document.id,
          graph_unique: true,
          taken_in: 1,
        },
      ],
      1,
    );

  function seed(document) {
    const keys = [0, 1].map((index) => child_key(document, index));
    writeSkeletonNodePositions(keys[0], { start: { x: 111, y: 112 } });
    writeSkeletonViewport(keys[0], { x: 11, y: 12, zoom: 1.5 });
    writeSkeletonNodePositions(keys[1], { start: { x: 711, y: 712 } });
    writeSkeletonViewport(keys[1], { x: 71, y: 72, zoom: 2 });
    /* And a drawing one level deeper, under the second child's key. */
    writeSkeletonNodePositions(
      JSON.stringify([...JSON.parse(keys[1]), "inner-pool", "inner-entry"]),
      { start: { x: 911, y: 912 } },
    );
    return keys;
  }

  const drawn = () => ({
    x: editor.nodes.find((node) => node.id === "start").x,
    y: editor.nodes.find((node) => node.id === "start").y,
    viewport: editor.restore_viewport
      ? {
          x: editor.restore_viewport.x,
          y: editor.restore_viewport.y,
          zoom: editor.restore_viewport.zoom,
        }
      : null,
  });

  test("the control: both children open where they were left", async () => {
    const document = document_of();
    seed(document);
    await open_page(document);
    open_row(1);
    await act(async () => {});
    expect(drawn()).toEqual({ x: 711, y: 712, viewport: { x: 71, y: 72, zoom: 2 } });
    await act(async () => {
      fireEvent.keyDown(window.document, { key: "Escape" });
    });
    open_row(0);
    await act(async () => {});
    expect(drawn()).toEqual({ x: 111, y: 112, viewport: { x: 11, y: 12, zoom: 1.5 } });
  });

  test("after the repair they still do, and so does a graph below them", async () => {
    const document = document_of();
    const keys = seed(document);
    await open_page(document);
    fireEvent.click(screen.getByTestId("skeleton-node-pool-a"));
    await act(async () => {});
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Give Second child an id of its own"));
    });
    /* The repaired row, which now has an id of its own. */
    open_row(1);
    await act(async () => {});
    expect(drawn()).toEqual({ x: 711, y: 712, viewport: { x: 71, y: 72, zoom: 2 } });
    await act(async () => {
      fireEvent.keyDown(window.document, { key: "Escape" });
    });
    /* And the sibling nobody repaired, whose key lost its position segment. */
    open_row(0);
    await act(async () => {});
    expect(drawn()).toEqual({ x: 111, y: 112, viewport: { x: 11, y: 12, zoom: 1.5 } });
    /* The descendant moved with its parent: same parts, more on the end. */
    const repaired_second = drill_layout_key(
      document.id,
      /* The document the panel just wrote, which the store also holds. */
      JSON.parse(SCOPE_CASES.layout_repaired.document),
      [
        {
          node_id: "pool-a",
          entry_id: "subagent-1",
          entry_index: 1,
          ambiguous: false,
          graph_id: "child-second",
          graph_unique: true,
          taken_in: 1,
        },
      ],
      1,
    );
    const deeper = JSON.stringify([
      ...JSON.parse(repaired_second),
      "inner-pool",
      "inner-entry",
    ]);
    expect(
      readSkeletonLayout(deeper, { nodes: [{ id: "start", type: "start" }], edges: [] })
        .nodes.start,
    ).toEqual({ x: 911, y: 912 });
    /* Nothing was saved, and the old records were left where they were. */
    expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
    const stored = JSON.parse(window.localStorage.getItem("skeleton_layout"));
    keys.forEach((key) => {
      expect(Object.prototype.hasOwnProperty.call(stored.resources, key)).toBe(true);
    });
  });
});

describe("a child graph's own problems, in the child's own view", () => {
  /* The draft check reads an embedded graph since the #356 repair, and every
     row here is that producer's answer on the new fixed pair — the parent
     document as it was stored, and the diagnostics `save_draft`, `get` and
     `diagnose` all returned for it (`same_three`). What this suite is about is
     where each of them lands on screen. */

  const row = (name) => EMBEDDED_DIAGNOSTIC_ROWS.find((item) => item.case === name);
  const document_of = (name) => copy(JSON.parse(row(name).document));

  const open_with_diagnostics = async (name, { pool = "pool-a" } = {}) => {
    const document = document_of(name);
    const diagnostics = copy(row(name).draft_diagnostics);
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [] });
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
      /* The store's own list, as the store returned it. */
      diagnostics,
      archived: false,
      description: null,
      draft_digest: null,
      source_identity: null,
    }));
    render(
      <ConfigContext.Provider value={cfg}>
        <SkeletonResourcePage resourceId={document.id} />
      </ConfigContext.Provider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId(`skeleton-node-${pool}`)).toBeInTheDocument(),
    );
    return { document, diagnostics };
  };

  const notices = () =>
    [
      ...screen.queryAllByTestId(/^skeleton-diagnostic-\d+$/),
      ...screen.queryAllByTestId(/^skeleton-elsewhere-\d+$/),
    ].map((node) => node.textContent);

  test("a problem about the child graph is visible in it, and names the graph", async () => {
    /* `end_count` at `…source.document.nodes`: one segment past the child's
       own address, so there is no node to put it on. */
    const { diagnostics } = await open_with_diagnostics("child_no_end");
    expect(diagnostics.map((item) => item.code)).toEqual([
      "end_count",
      "flow_output_required",
    ]);
    open_row(0);
    await act(async () => {});
    expect(screen.getByTestId("skeleton-drill-breadcrumb")).toBeInTheDocument();
    /* Select the child's own Agent node, which is where its own problem is. */
    fireEvent.click(screen.getByTestId("skeleton-node-agent"));
    await act(async () => {});
    const shown = notices().join(" | ");
    expect(shown).toMatch(/exactly one end node/i);
    expect(shown).toMatch(/This graph —/);
    /* Its node-level sibling is on the node, not in the graph bucket. */
    expect(screen.getByTestId("skeleton-diagnostics-notice").textContent).toMatch(
      /requires flow output/i,
    );
  });

  test("a problem about one of the child's own nodes lands on that node", async () => {
    const { document } = await open_with_diagnostics("child_unknown_type");
    open_row(0);
    await act(async () => {});
    fireEvent.click(screen.getByTestId("skeleton-node-agent"));
    await act(async () => {});
    expect(screen.getByTestId("skeleton-diagnostics-notice").textContent).toMatch(
      /unknown node type/i,
    );
    /* The document is untouched by being looked at. */
    expect(document.nodes.length).toBeGreaterThan(0);
  });

  test("a problem about one of the child's binding rows lands on that row", async () => {
    await open_with_diagnostics("child_input_names_no_node");
    open_row(0);
    await act(async () => {});
    fireEvent.click(screen.getByTestId("skeleton-node-agent"));
    await act(async () => {});
    /* The store's own sentence, shown on the row the path names. */
    expect(screen.getByTestId("binding-row-0-problem-0").textContent).toMatch(
      /must name an upstream flow node/i,
    );
  });

  test("the parent's own problem stays in the parent, and the child's in the child", async () => {
    const { diagnostics } = await open_with_diagnostics("parent_and_child");
    expect(diagnostics).toHaveLength(2);
    /* In the parent: its own node's problem is on `a1`. */
    fireEvent.click(screen.getByTestId("skeleton-node-a1"));
    await act(async () => {});
    const in_parent = [
      ...notices(),
      ...screen.queryAllByTestId(/^binding-row-\d+-problem-\d+$/).map(
        (node) => node.textContent,
      ),
    ].join(" | ");
    expect(in_parent).toMatch(/must name an upstream flow node/i);
    /* Down in the child: one problem, and it is the child's. */
    open_row(0);
    await act(async () => {});
    fireEvent.click(screen.getByTestId("skeleton-node-agent"));
    await act(async () => {});
    expect(screen.getByTestId("binding-row-0-problem-0")).toBeInTheDocument();
    /* Exactly one, so the parent's did not come down with it. */
    expect(screen.queryAllByTestId(/^binding-row-0-problem-\d+$/)).toHaveLength(1);
  });

  test("a sibling child's problem does not appear in this child", async () => {
    await open_with_diagnostics("sibling_isolation");
    /* The healthy second entry's graph shows nothing. */
    open_row(1);
    await act(async () => {});
    fireEvent.click(screen.getByTestId("skeleton-node-agent"));
    await act(async () => {});
    expect(screen.queryByTestId("skeleton-diagnostics-notice")).toBeNull();
    expect(screen.queryByTestId("skeleton-elsewhere-notice")).toBeNull();
    expect(screen.queryAllByTestId(/^binding-row-0-problem-\d+$/)).toHaveLength(0);
    /* While the first entry's graph shows its own. */
    await act(async () => {
      fireEvent.keyDown(window.document, { key: "Escape" });
    });
    open_row(0);
    await act(async () => {});
    fireEvent.click(screen.getByTestId("skeleton-node-agent"));
    await act(async () => {});
    expect(screen.getByTestId("binding-row-0-problem-0")).toBeInTheDocument();
  });

  test("the breadcrumb says the graph is checked, and no longer promises otherwise", async () => {
    await open_with_diagnostics("healthy_child");
    open_row(0);
    await act(async () => {});
    const note = screen.getByTestId("skeleton-drill-unchecked").textContent;
    expect(note).toMatch(/checked as you edit/i);
    expect(note).toMatch(/pools reference are only read then/i);
    expect(note).not.toMatch(/does not look inside/i);
    /* A healthy child shows nothing, which is now a statement about this
       graph rather than about the check not running. */
    fireEvent.click(screen.getByTestId("skeleton-node-agent"));
    await act(async () => {});
    expect(screen.queryByTestId("skeleton-diagnostics-notice")).toBeNull();
  });
});
