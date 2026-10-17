import {
  DRILL,
  FRAME,
  can_drill,
  closed_embedded_frames,
  diagnostics_for_embedded,
  drill_blocked_reason,
  drill_crumbs,
  drill_obsolete_reason,
  drill_layout_key,
  drill_target,
  embedded_document,
  embedded_path,
  embedded_step_indices,
  frame_for_embedded_step,
  frame_for_resource_step,
  frame_is_stale,
  left_behind_message,
  notices_still_true,
  pool_entry_rows,
  push_drill_frame,
  unwind_drill_stack,
  with_embedded_document,
} from "./skeleton_drill";
import {
  CAPTURED_DUPLICATE_ENTRIES,
  CAPTURED_EMBEDDED_SHAPES,
} from "./skeleton_drill_identity_capture";
import {
  CAPTURED_EMBEDDED_DIAGNOSTICS,
  CAPTURED_EMBEDDED_LOCATION,
  CAPTURED_EMBEDDED_WRITE_BACK,
  CAPTURED_ENTRY_SOURCES,
} from "./skeleton_drill_capture";

/* The editor's half of drilling in, checked against the store's own answers.
 *
 * Every row below came out of `SkeletonResourceStore` against the installed
 * wheel; the capture's header says how. The entries are the whole stored
 * objects, so the question asked here is the question the store answered. */

const entry_of = (row) => JSON.parse(row.entry);

/* The tail of a refusal path, after the entry it is about. The store addresses
   one entry as `document.nodes[i].config.subagents[j]`, and what follows is
   what the refusal is ABOUT: the source's own shape, or the thing it points
   at, or something inside that. */
function refusal_tail(row) {
  const path = row.preflight.path;
  if (!Array.isArray(path)) return null;
  const at = path.indexOf("subagents");
  return at < 0 ? path : path.slice(at + 2);
}

const RESOURCE_CODES = new Set([
  "resource_missing",
  "resource_archived",
  "recursive_reference",
]);

/* Which refusals are about the source's own shape — the ones that mean there
   is no graph to open at all — and which are about the Agent it points at or
   something inside it, which is exactly what the author opens it to fix. */
function refuses_the_shape(row) {
  if (row.preflight.ok) return false;
  const tail = refusal_tail(row);
  const code = row.preflight.code;
  if (tail.length === 1) return !RESOURCE_CODES.has(code) && code !== "wrong_kind";
  if (tail.length === 2 && tail[1] === "kind") return true;
  if (tail.length === 2 && tail[1] === "document") return true;
  if (tail.length === 3 && tail[1] === "document" && tail[2] === "kind") return true;
  return false;
}

describe("what a pool entry points at, against the store's own verdicts", () => {
  test("the capture is the whole set of shapes, each with the store's answer", () => {
    expect(CAPTURED_ENTRY_SOURCES).toHaveLength(12);
    /* Every one of them SAVED: a pool's configuration is invisible to the
       format check, so none of this is caught before Run. */
    expect(CAPTURED_ENTRY_SOURCES.every((row) => row.saved)).toBe(true);
  });

  test("a shape the store refuses as a source cannot be opened, and nothing else is withheld", () => {
    const seen = { openable: 0, refused: 0 };
    CAPTURED_ENTRY_SOURCES.forEach((row) => {
      const target = drill_target(entry_of(row));
      const openable = target.kind !== DRILL.UNREADABLE;
      expect([openable, row.case]).toEqual([!refuses_the_shape(row), row.case]);
      if (openable) {
        seen.openable += 1;
        expect([DRILL.REFERENCE, DRILL.EMBEDDED]).toContain(target.kind);
      } else {
        seen.refused += 1;
        expect(typeof target.reason).toBe("string");
        expect(target.reason.length).toBeGreaterThan(0);
      }
    });
    /* Bounded, so a mapping that collapsed to one answer cannot pass. */
    expect(seen).toEqual({ openable: 8, refused: 4 });
  });

  test("a reference the store accepted resolves to the resource id it names", () => {
    const row = CAPTURED_ENTRY_SOURCES.find(
      (candidate) => candidate.case === "agent_ref to an Agent",
    );
    const entry = entry_of(row);
    expect(drill_target(entry)).toEqual({
      kind: DRILL.REFERENCE,
      agent_id: entry.source.agent_id,
    });
  });

  test("the four it refuses say which refusal it is", () => {
    const reason = (name) =>
      drill_target(entry_of(CAPTURED_ENTRY_SOURCES.find((row) => row.case === name)))
        .reason;
    expect(reason("an entry with no source at all")).toMatch(/does not say where/i);
    expect(reason("an unknown source kind")).toMatch(/agent_ref and embedded/);
    expect(reason("embedded that is not a document")).toMatch(/not a document/i);
    expect(reason("embedded Workflow")).toMatch(/Workflow, and a Subagent Pool holds Agents/);
  });

  test("a fault INSIDE the Agent an entry points at is opened, not withheld", () => {
    /* The author opens it to fix it. Both of these are refused at Run, at a
       path inside the embedded document. */
    ["embedded Agent with a faulty Kernel", "embedded Agent with no End"].forEach(
      (name) => {
        const row = CAPTURED_ENTRY_SOURCES.find((candidate) => candidate.case === name);
        expect(row.preflight.ok).toBe(false);
        expect(row.preflight.path).toContain("document");
        expect(can_drill(entry_of(row))).toBe(true);
      },
    );
  });

  test("a reference whose resource is gone, archived, a Workflow or itself is still opened", () => {
    /* The store's refusal is about the resource, which is read before
       anything navigates; the page then says which one it was. Refusing the
       gesture here would leave the author with a row they cannot look at. */
    [
      "agent_ref to nothing",
      "agent_ref to an archived Agent",
      "agent_ref to a Workflow",
      "agent_ref to itself",
    ].forEach((name) => {
      const row = CAPTURED_ENTRY_SOURCES.find((candidate) => candidate.case === name);
      expect(row.preflight.ok).toBe(false);
      expect(can_drill(entry_of(row))).toBe(true);
    });
  });
});

describe("where an embedded graph lives, after the real conversion put one there", () => {
  const parent = JSON.parse(CAPTURED_EMBEDDED_LOCATION.parent_document);
  const embedded = CAPTURED_EMBEDDED_LOCATION.entries.find(
    (entry) => entry.source_kind === "embedded",
  );
  const step = {
    node_id: CAPTURED_EMBEDDED_LOCATION.pool_node_id,
    entry_id: embedded.entry_id,
  };

  test("the conversion left the pool holding entries and nothing else", () => {
    expect(CAPTURED_EMBEDDED_LOCATION.pool_config_keys).toEqual(["subagents"]);
    /* One of each kind, from one real conversion: a named recipe became a
       reference, an inline entry became a whole Agent document. */
    expect(
      CAPTURED_EMBEDDED_LOCATION.entries.map((entry) => entry.source_kind),
    ).toEqual(["agent_ref", "embedded"]);
  });

  test("reaching it by ids finds the same document the store's own path does", () => {
    /* Two independent walks of the real parent: this module's, by pool node id
       and entry id, and the store's recorded path, by position. */
    const by_ids = embedded_document(parent, [step]);
    const by_path = embedded.path.reduce(
      (value, part) => (part === "document" && value === parent ? parent : value[part]),
      parent,
    );
    expect(by_ids).toBe(by_path);
    expect(Object.keys(by_ids).sort()).toEqual(embedded.document_keys);
    expect(by_ids.kind).toBe("agent");
  });

  test("and the path it is addressed by is the one every problem inside it is reported at", () => {
    expect(embedded_path(parent, [step])).toEqual(embedded.path);
  });

  test("a referenced entry is not an embedded one, by the only thing that decides it", () => {
    const reference = CAPTURED_EMBEDDED_LOCATION.entries.find(
      (entry) => entry.source_kind === "agent_ref",
    );
    expect(
      embedded_step_indices(parent, {
        node_id: CAPTURED_EMBEDDED_LOCATION.pool_node_id,
        entry_id: reference.entry_id,
      }),
    ).toBeNull();
    expect(typeof reference.agent_id).toBe("string");
  });

  test("a step naming a pool or an entry that is not there resolves to nothing", () => {
    expect(embedded_document(parent, [{ ...step, entry_id: "gone" }])).toBeNull();
    expect(embedded_document(parent, [{ ...step, node_id: "gone" }])).toBeNull();
  });
});

describe("writing a child back into its parent", () => {
  const { step, parent_before, child_after, parent_stored } =
    CAPTURED_EMBEDDED_WRITE_BACK;

  test("the result is the document the store really stored", () => {
    /* The strongest statement this module can make: the parent produced here
       from the edited child is byte-for-byte the document that came back out
       of the store after saving it. */
    const written = with_embedded_document(
      JSON.parse(parent_before),
      [step],
      JSON.parse(child_after),
    );
    expect(written).toEqual(JSON.parse(parent_stored));
  });

  test("the save was the parent's own, and made no new resource", () => {
    expect(CAPTURED_EMBEDDED_WRITE_BACK.saved).toBe(true);
    expect(CAPTURED_EMBEDDED_WRITE_BACK.resources_after).toBe(
      CAPTURED_EMBEDDED_WRITE_BACK.resources_before,
    );
    /* The Agent the other entry references was not touched by it. */
    expect(CAPTURED_EMBEDDED_WRITE_BACK.referenced_untouched).toBe(true);
  });

  test("nothing else in the parent moves", () => {
    const before = JSON.parse(parent_before);
    const written = with_embedded_document(before, [step], { kind: "agent" });
    expect(written.nodes).toHaveLength(before.nodes.length);
    expect(written.edges).toBe(before.edges);
    written.nodes.forEach((node, index) => {
      if (node.type !== "subagent_pool") expect(node).toBe(before.nodes[index]);
    });
  });

  test("a step that no longer resolves writes nothing at all", () => {
    const before = JSON.parse(parent_before);
    expect(with_embedded_document(before, [{ ...step, entry_id: "gone" }], {})).toBe(
      before,
    );
  });

  test("an empty path is the graph itself", () => {
    const child = { kind: "agent" };
    expect(with_embedded_document(JSON.parse(parent_before), [], child)).toBe(child);
  });
});

describe("whose problems a child view may show", () => {
  const parent = JSON.parse(CAPTURED_EMBEDDED_LOCATION.parent_document);
  const embedded = CAPTURED_EMBEDDED_LOCATION.entries.find(
    (entry) => entry.source_kind === "embedded",
  );
  const prefix = embedded.path;

  test("the draft check says nothing about a problem inside an embedded graph", () => {
    /* Frozen: a child with no End and a child with an unknown binding field
       both answer the same `[]` as a healthy one. */
    const inside = CAPTURED_EMBEDDED_DIAGNOSTICS.filter((row) =>
      row.case.includes("embedded child"),
    );
    expect(inside).toHaveLength(3);
    inside.forEach((row) => expect(row.draft_diagnostics).toEqual([]));
  });

  test("while the identical fault in the parent IS reported — at a path that would land on this graph's node", () => {
    const row = CAPTURED_EMBEDDED_DIAGNOSTICS.find((candidate) =>
      candidate.case.includes("the parent carries"),
    );
    expect(row.draft_diagnostics).toHaveLength(1);
    const reported = row.draft_diagnostics[0];
    expect(reported.path.slice(0, 3)).toEqual(["document", "nodes", 1]);
    /* So it must not be handed to the child view: `nodes[1]` there is the
       child's own Kernel. */
    expect(diagnostics_for_embedded(row.draft_diagnostics, prefix)).toEqual([]);
  });

  test("one reported at the embedded graph's own path is re-rooted to it", () => {
    /* The prefix is the store's own address for this graph, and the tail is
       the store's own shape for this fault; the two halves are measured. */
    const tail = CAPTURED_EMBEDDED_DIAGNOSTICS.find((candidate) =>
      candidate.case.includes("the parent carries"),
    ).draft_diagnostics[0];
    const nested = { ...tail, path: [...prefix, ...tail.path.slice(1)] };
    expect(diagnostics_for_embedded([nested], prefix)).toEqual([
      { ...tail, path: tail.path },
    ]);
  });

  test("the prefix itself is not a problem about anything inside it", () => {
    expect(diagnostics_for_embedded([{ code: "x", path: prefix }], prefix)).toEqual([]);
    expect(diagnostics_for_embedded(null, prefix)).toEqual([]);
    expect(diagnostics_for_embedded([{ code: "x" }], prefix)).toEqual([]);
  });
});

describe("the rows a pool node draws", () => {
  const skeleton_pool = (subagents) => ({
    id: "pool",
    type: "subagent_pool",
    config: { subagents },
  });

  test("one row per entry, named, with where its Agent comes from", () => {
    const rows = pool_entry_rows(
      skeleton_pool([
        { id: "a", name: "Summarizer", source: { kind: "agent_ref", agent_id: "sum" } },
        /* A whole document, because that is what an embedded entry holds: a
           stub with no `nodes` is not a graph the store would take, and a
           fixture that cannot be opened would stop testing that this row
           offers to open it. */
        { id: "b", name: "Inline", source: { kind: "embedded", document: { schema_version: 1, kind: "agent", id: "e", name: "Inline", nodes: [], edges: [] } } },
        { id: "c", name: "Broken", source: { kind: "graph" } },
      ]),
    );
    expect(rows.map((row) => [row.name, row.note, row.openable])).toEqual([
      ["Summarizer", "Referenced", true],
      ["Inline", "Embedded", true],
      ["Broken", "Unreadable source", false],
    ]);
    expect(rows[2].reason).toMatch(/agent_ref and embedded/);
  });

  test("a legacy pool draws the subagents it has, and none of them open yet", () => {
    const node = {
      id: "pool",
      type: "subagent_pool",
      config: {
        legacy_fields: {
          subagents: [
            { kind: "recipe_ref", recipe_name: "Summarizer" },
            { kind: "inline", name: "Shortener" },
            { kind: "inline" },
          ],
        },
      },
    };
    const rows = pool_entry_rows(node);
    expect(rows.map((row) => row.name)).toEqual([
      "Summarizer",
      "Shortener",
      "an entry with no name",
    ]);
    expect(rows.every((row) => row.openable === false)).toBe(true);
    /* One reason, about the pool: its entries are not graphs until they are
       converted, and the panel's own Convert control is what does that. */
    expect(rows.map((row) => row.reason)).toEqual(rows.map(() => rows[0].reason));
    expect(rows[0].reason).toMatch(/Convert it first/);
  });

  test("entries that are not a list draw nothing rather than throwing", () => {
    expect(pool_entry_rows(skeleton_pool("two"))).toEqual([]);
    expect(pool_entry_rows({ id: "p", type: "subagent_pool", config: {} })).toEqual([]);
    expect(pool_entry_rows(null)).toEqual([]);
  });

  test("a name the document holds but a box cannot is shown as what it is", () => {
    const rows = pool_entry_rows(
      skeleton_pool([{ id: "a", name: { toString: null }, source: { kind: "embedded", document: { kind: "agent" } } }]),
    );
    expect(rows[0].name).toBe("an unreadable value");
  });
});

describe("the stack, and what each frame holds", () => {
  const resource_frame = frame_for_resource_step({
    label: "Reviewer",
    steps: [],
    selected_node_id: "a1",
    session: { resource_id: "reviewer", document: { name: "Reviewer" }, dirty: true },
    saved_version: 0,
  });
  const embedded_frame = frame_for_embedded_step({
    label: "Reviewer",
    steps: [],
    selected_node_id: null,
  });

  test("a reference frame carries the whole sitting; an embedded one carries none", () => {
    expect(resource_frame.kind).toBe(FRAME.RESOURCE);
    expect(resource_frame.session.dirty).toBe(true);
    expect(embedded_frame.kind).toBe(FRAME.EMBEDDED);
    expect(embedded_frame.session).toBeUndefined();
  });

  test("the breadcrumb names the graphs left behind and the step between them", () => {
    const stack = push_drill_frame(push_drill_frame([], resource_frame), embedded_frame);
    expect(drill_crumbs(stack, "Shortener")).toEqual([
      { label: "Reviewer", depth: 0, navigable: true },
      { label: "Subagent Pool", depth: null, navigable: false },
      { label: "Reviewer", depth: 1, navigable: true },
      { label: "Subagent Pool", depth: null, navigable: false },
      { label: "Shortener", depth: null, navigable: false },
    ]);
  });

  test("unwinding to a depth returns that frame and keeps only what is above it", () => {
    const stack = [resource_frame, embedded_frame];
    expect(unwind_drill_stack(stack, 0)).toEqual({ frame: resource_frame, stack: [] });
    expect(unwind_drill_stack(stack, 1)).toEqual({
      frame: embedded_frame,
      stack: [resource_frame],
    });
    expect(unwind_drill_stack(stack, 2).frame).toBeNull();
  });

  test("only a reference frame can go stale, and only when its resource was written again", () => {
    expect(frame_is_stale(resource_frame, { reviewer: 1 })).toBe(true);
    expect(frame_is_stale(resource_frame, { reviewer: 0 })).toBe(false);
    expect(frame_is_stale(embedded_frame, { reviewer: 9 })).toBe(false);
  });

  test("a document replaced wholesale closes the embedded frames above it", () => {
    expect(closed_embedded_frames([resource_frame, embedded_frame, embedded_frame])).toEqual([
      resource_frame,
    ]);
    expect(closed_embedded_frames([])).toEqual([]);
  });

  test("a write in flight is not a moment to open a subagent", () => {
    expect(drill_blocked_reason({ saving: true })).toMatch(/has not landed yet/);
    expect(drill_blocked_reason({ converting: true })).toMatch(/still being written/);
    expect(drill_blocked_reason({})).toBeNull();
    expect(drill_blocked_reason(null)).toBeNull();
  });
});

describe("where a sub-graph's drawing is remembered", () => {
  test("the resource's own graph is keyed by the resource", () => {
    expect(drill_layout_key("life", null, [])).toBe("life");
  });

  test("two different paths are two different keys, including ones a delimiter would join", () => {
    /* About the encoding of the parts, so no document is involved: `pool:a` is
       a legal node id and the real store saves and reloads it. */
    const first = drill_layout_key("life", null, [{ node_id: "pool:a", entry_id: "b" }]);
    const second = drill_layout_key("life", null, [{ node_id: "pool", entry_id: "a:b" }]);
    expect(first).not.toBe(second);
    expect(drill_layout_key("life", null, [{ node_id: "pool", entry_id: "b" }])).not.toBe(
      drill_layout_key("life", null, [
        { node_id: "pool", entry_id: "b" },
        { node_id: "inner", entry_id: "c" },
      ]),
    );
  });
});

/* ── Which child the author clicked, and whether it can be drawn ─────────────
 *
 * Both halves came back from the acceptance-8 review as defects, and both are
 * about drafts the real store accepts: a pool holding two entries one document
 * cannot tell apart, and an embedded graph whose container is not a graph at
 * all. The rows are in `skeleton_drill_identity_capture`. */

const parent_of = (row) => JSON.parse(row.document);
const shape_entry_of = (row) => JSON.parse(row.entry);
const duplicate_row = (name) =>
  CAPTURED_DUPLICATE_ENTRIES.find((row) => row.case === name);
const shape_row = (name) =>
  CAPTURED_EMBEDDED_SHAPES.find((row) => row.case === name);

/* The names the drawing reads as text and the lists it walks. A graph whose
   container is not that shape is not a graph this canvas can draw — and the
   store refuses every one of them at Run with `invalid_type`, which is what
   makes refusing to open one a subset of what the store already refuses
   rather than this editor's own extra rule. What the store ALSO refuses at
   `invalid_type` and the drawing never reads — a node's `config` — stays
   openable, because that is the author's to fix on the canvas. */
const DRAWN_NAMES = new Set([
  "nodes",
  "edges",
  "id",
  "type",
  "source_node_id",
  "source_port_id",
  "target_node_id",
  "target_port_id",
]);

function store_refuses_the_drawing(row) {
  if (row.run.ok || row.run.code !== "invalid_type") return false;
  const path = row.run.path;
  const inside = path.indexOf("document", path.indexOf("subagents"));
  const tail = inside < 0 ? [] : path.slice(inside + 1);
  if (tail.length === 0) return false;
  const last = tail[tail.length - 1];
  return typeof last === "number" || DRAWN_NAMES.has(last);
}

function pool_of(document) {
  return document.nodes.find((node) => node.type === "subagent_pool");
}

describe("an embedded graph the canvas could not draw", () => {
  test("the capture is every shape, and the store saved all of them unchecked", () => {
    expect(CAPTURED_EMBEDDED_SHAPES).toHaveLength(17);
    CAPTURED_EMBEDDED_SHAPES.forEach((row) => {
      expect([row.case, row.saved, row.round_trip, row.draft_diagnostics]).toEqual([
        row.case,
        true,
        true,
        [],
      ]);
    });
  });

  test("one is offered for opening exactly when the drawing can read its container", () => {
    const seen = { openable: 0, refused: 0 };
    CAPTURED_EMBEDDED_SHAPES.forEach((row) => {
      const target = drill_target(shape_entry_of(row));
      const openable = target.kind !== DRILL.UNREADABLE;
      expect([openable, row.case]).toEqual([!store_refuses_the_drawing(row), row.case]);
      if (openable) {
        seen.openable += 1;
        expect(target.kind).toBe(DRILL.EMBEDDED);
      } else {
        seen.refused += 1;
        expect(typeof target.reason).toBe("string");
        expect(target.reason.length).toBeGreaterThan(0);
      }
    });
    /* Bounded, so a gate that refused everything — or nothing — cannot pass. */
    expect(seen).toEqual({ openable: 7, refused: 10 });
  });

  test("the one the page crashed on is named, and its own data is untouched", () => {
    const row = shape_row("embedded-nodes-not-a-list");
    const entry = shape_entry_of(row);
    const before = JSON.stringify(entry);
    const target = drill_target(entry);
    expect(target.kind).toBe(DRILL.UNREADABLE);
    expect(target.reason).toMatch(/list of nodes/i);
    /* Nothing is repaired, emptied or rewritten on the way past: the row says
       what is wrong and the draft still holds exactly what the store holds. */
    expect(JSON.stringify(entry)).toBe(before);
  });

  test("an incomplete graph still opens — that is what the author opens it for", () => {
    ["embedded-no-end-node", "embedded-no-nodes-at-all", "embedded-node-type-unknown"].forEach(
      (name) => {
        const row = shape_row(name);
        expect(row.run.ok).toBe(false);
        expect(can_drill(shape_entry_of(row))).toBe(true);
      },
    );
  });

  test("a step into one of them resolves to nothing, so no view can be opened on it", () => {
    const row = shape_row("embedded-nodes-not-a-list");
    const parent = parent_of(duplicate_row("duplicate-entry-ids"));
    /* The same rule serves navigation and path resolution, so a graph that
       cannot be opened also cannot be written back into. */
    const pool = pool_of(parent);
    pool.config.subagents = [shape_entry_of(row)];
    const step = { node_id: pool.id, entry_id: shape_entry_of(row).id, entry_index: 0 };
    expect(embedded_step_indices(parent, step)).toBeNull();
    expect(embedded_document(parent, [step])).toBeNull();
    expect(embedded_path(parent, [step])).toBeNull();
  });
});

describe("two entries one document cannot tell apart", () => {
  test("the capture is what the store accepted, and what it refuses at Run", () => {
    expect(CAPTURED_DUPLICATE_ENTRIES).toHaveLength(5);
    CAPTURED_DUPLICATE_ENTRIES.forEach((row) => {
      expect([row.case, row.saved, row.round_trip, row.draft_diagnostics]).toEqual([
        row.case,
        true,
        true,
        [],
      ]);
    });
    /* The store names the SECOND entry, at the field that collides. */
    const ids = duplicate_row("duplicate-entry-ids").run;
    expect([ids.code, ids.path.slice(-3)]).toEqual([
      "duplicate_name",
      ["subagents", 1, "id"],
    ]);
    const names = duplicate_row("duplicate-entry-names").run;
    expect([names.code, names.path.slice(-3)]).toEqual([
      "duplicate_name",
      ["subagents", 1, "name"],
    ]);
  });

  test("the position the author clicked decides, and it must still hold that id", () => {
    const parent = parent_of(duplicate_row("duplicate-entry-ids"));
    const pool = pool_of(parent);
    const entries = pool.config.subagents;
    expect(entries.map((entry) => entry.id)).toEqual([
      "duplicated-entry",
      "duplicated-entry",
    ]);
    const step = (entry_index) => ({
      node_id: pool.id,
      entry_id: "duplicated-entry",
      entry_index,
    });
    expect(embedded_step_indices(parent, step(0)).entry_index).toBe(0);
    expect(embedded_step_indices(parent, step(1)).entry_index).toBe(1);
    /* Each one reaches its own graph, which is the whole defect: clicking the
       second opened and saved the first. */
    expect(embedded_document(parent, [step(0)]).id).toBe(
      entries[0].source.document.id,
    );
    expect(embedded_document(parent, [step(1)]).id).toBe(
      entries[1].source.document.id,
    );
    expect(embedded_document(parent, [step(0)]).id).not.toBe(
      embedded_document(parent, [step(1)]).id,
    );
  });

  test("the id alone resolves to nothing while it names two entries", () => {
    const parent = parent_of(duplicate_row("duplicate-entry-ids"));
    const pool = pool_of(parent);
    const step = { node_id: pool.id, entry_id: "duplicated-entry" };
    /* Not the first, not the last: nothing. A step that cannot say which
       graph it means has no graph. */
    expect(embedded_step_indices(parent, step)).toBeNull();
    expect(embedded_document(parent, [step])).toBeNull();
    /* A position out of range is the same answer: nothing says which. */
    expect(
      embedded_step_indices(parent, { ...step, entry_index: 2 }),
    ).toBeNull();
  });

  test("an id that has become unambiguous resolves to the entry that holds it", () => {
    /* The position only ever breaks a tie, so once the tie is gone the id is
       the identity again. That is what lets a step survive its entry moving —
       a sibling before it removed, which is the one way this list moves from
       the editor.
       The case it cannot tell apart from that one: a document replaced from
       elsewhere that rewrote the OTHER entry's id, leaving this id on the
       entry the author was not in. The step then follows the id. Reachable
       only by taking another editor's version, and refusing instead would
       mean refusing every step whose entry simply moved. */
    const parent = parent_of(duplicate_row("duplicate-entry-ids"));
    const pool = pool_of(parent);
    pool.config.subagents[1].id = "its-own-id";
    const found = embedded_step_indices(parent, {
      node_id: pool.id,
      entry_id: "duplicated-entry",
      entry_index: 1,
    });
    expect([found.entry_index, found.ambiguous]).toEqual([0, false]);
  });

  test("where an id names one entry it is the identity, whatever position it is at", () => {
    /* The position is only ever a tie-break. An entry whose id is unique
       keeps its graph when a sibling before it is removed — the id is what
       identifies it, and a step that followed the position alone would then
       be pointing at the wrong one. */
    const parent = parent_of(duplicate_row("duplicate-entry-names"));
    const pool = pool_of(parent);
    const entries = pool.config.subagents;
    const wanted = entries[1].source.document.id;
    const step = { node_id: pool.id, entry_id: entries[1].id, entry_index: 1 };
    expect(embedded_document(parent, [step]).id).toBe(wanted);
    pool.config.subagents = [entries[1]];
    expect(embedded_document(parent, [step]).id).toBe(wanted);
    expect(embedded_step_indices(parent, step).entry_index).toBe(0);
  });

  test("a write goes to the entry the step named and leaves the other alone", () => {
    const parent = parent_of(duplicate_row("duplicate-entry-ids"));
    const pool_id = pool_of(parent).id;
    const step = { node_id: pool_id, entry_id: "duplicated-entry", entry_index: 1 };
    const edited = { ...embedded_document(parent, [step]), name: "Edited second" };
    const written = with_embedded_document(parent, [step], edited);
    const after = pool_of(written).config.subagents;
    const before = pool_of(parent).config.subagents;
    expect(after[1].source.document.name).toBe("Edited second");
    expect(after[0]).toBe(before[0]);
    expect(after[0].source.document).toEqual(before[0].source.document);
  });

  test("each of them draws its own row, with its own identity", () => {
    const parent = parent_of(duplicate_row("duplicate-entry-ids"));
    const pool = pool_of(parent);
    const rows = pool_entry_rows(pool);
    expect(rows.map((row) => row.index)).toEqual([0, 1]);
    expect(rows.map((row) => row.name)).toEqual(["First child", "Second child"]);
    /* Two rows drawn under one key is a list React is free to draw once. */
    expect(new Set(rows.map((row) => row.key)).size).toBe(2);
    expect(rows.every((row) => row.openable)).toBe(true);
  });

  test("and its own drawing, because they are two different graphs", () => {
    const parent = parent_of(duplicate_row("duplicate-entry-ids"));
    const pool_id = pool_of(parent).id;
    const step = (entry_index) => ({
      node_id: pool_id,
      entry_id: "duplicated-entry",
      entry_index,
    });
    const first = drill_layout_key("parent", parent, [step(0)]);
    const second = drill_layout_key("parent", parent, [step(1)]);
    expect(first).not.toBe(second);
  });

  test("an unambiguous child's drawing does not depend on its siblings", () => {
    /* The key names the graph. An id that names one entry names it however
       many siblings sit before it, so removing one must not move a child's
       drawing — which is what putting the position in every key would do. */
    const parent = parent_of(duplicate_row("duplicate-entry-names"));
    const pool = pool_of(parent);
    const entries = pool.config.subagents;
    const step = { node_id: pool.id, entry_id: entries[1].id, entry_index: 1 };
    const before = drill_layout_key("parent", parent, [step]);
    pool.config.subagents = [entries[1]];
    expect(drill_layout_key("parent", parent, [step])).toBe(before);
  });
});

describe("one child document id, two definitions", () => {
  test("the store accepts the pair only while they resolve to the same definition", () => {
    /* Measured on the pair: identical copies under one child id are accepted,
       and two that differ are `dependency_conflict` at the second entry's
       source. Nothing in this editor pre-empts it — it is a Run refusal the
       save bar reports — and it is recorded here so the layout key's choice
       not to use the child's own id is on the record. */
    expect(duplicate_row("duplicate-child-document-ids").run.ok).toBe(true);
    const differing = duplicate_row("duplicate-child-document-ids-differing").run;
    expect([differing.code, differing.path.slice(-2)]).toEqual([
      "dependency_conflict",
      [1, "source"],
    ]);
  });
});

describe("a read that outlived the navigation it was made for", () => {
  test("a write in flight is said in the same words, wherever it is noticed", () => {
    /* The page checks before asking and the hook checks again at the moment
       of the swap — the save can start while the read is in flight. One
       sentence for one situation, or the second check would be a different
       app. */
    expect(drill_obsolete_reason("saving")).toBe(
      drill_blocked_reason({ saving: true }),
    );
    expect(drill_obsolete_reason("converting")).toBe(
      drill_blocked_reason({ converting: true }),
    );
    expect(drill_obsolete_reason("navigated")).toBeNull();
    expect(drill_obsolete_reason(null)).toBeNull();
  });

  test("and it stops being said once the write has landed", () => {
    /* The save bar one line above says Saved as soon as the write lands, and a
       line below it saying the save has not landed is a contradiction on one
       screen. Every other notice stays until the author's next gesture,
       because each is a statement about something that happened. */
    const saving = drill_blocked_reason({ saving: true });
    const left = left_behind_message("Reviewer");
    expect(notices_still_true([saving, left], { saving: true })).toEqual([saving, left]);
    expect(notices_still_true([saving, left], { saving: false })).toEqual([left]);
    expect(notices_still_true([saving], { converting: true })).toEqual([saving]);
    expect(notices_still_true(null, {})).toEqual([]);
  });
});
