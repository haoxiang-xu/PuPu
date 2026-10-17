/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  skeleton_layout                                                               */
/*                                                                                */
/*  Where a Skeleton graph is drawn, kept apart from what it does.                */
/*                                                                                */
/*  A Skeleton node is closed to {id, type, config}: the execution document has   */
/*  no room for a coordinate and the store refuses one. That is not a gap to      */
/*  work around — a position is not part of what the graph means, and two         */
/*  machines that lay the same Agent out differently are still running the same   */
/*  Agent. So the drawing lives here, keyed by resource, and never travels.       */
/*                                                                                */
/*  The consequence worth stating: moving a node CANNOT change execution, by      */
/*  construction rather than by discipline. There is no path from this module     */
/*  into the saved document.                                                      */
/*                                                                                */
/*  A graph opened somewhere that has no record is laid out from its own edges,   */
/*  deterministically, so the same graph always opens the same way instead of     */
/*  piling its nodes on one another.                                             */
/*                                                                                */
/*  Shape: { version: 1, resources: { <id>: { nodes: {<nodeId>: {x, y}},          */
/*                                            viewport: {x, y, zoom} } } }        */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const STORAGE_KEY = "skeleton_layout";
const LAYOUT_VERSION = 1;

/* Enough room for the widest node plus its ports, and for a pool to sit under
   the agent it attaches to without touching it. */
export const COLUMN_WIDTH = 260;
export const ROW_HEIGHT = 150;
export const ATTACH_OFFSET_Y = 170;
export const ORIGIN = Object.freeze({ x: 80, y: 80 });

const hasLocalStorage = () =>
  typeof window !== "undefined" && !!window.localStorage;

const is_object = (value) =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/* ── Tables keyed by something the document chose ───────────────────────────
 *
 * A node id and a resource id are data. The envelope asks only that they be
 * non-empty strings, so `__proto__`, `constructor` and `toString` are all
 * legal — measured on the fixed pair, in
 * `recipes_page/skeleton_node_id_capture`: a whole Workflow whose Start is
 * named `__proto__` saves, reads back byte for byte, passes the store's own
 * preflight and EXECUTES, completing both its nodes and returning the same
 * output as the ordinary one. Nothing is wrong with that graph.
 *
 * What was wrong was here. A plain object inherits from `Object.prototype`,
 * so `table[id]` answered with an inherited member — an object, so every
 * guard testing for one passed — and `table[id] = point` invoked the
 * `__proto__` setter instead of storing anything. Measured: the node was
 * drawn at `x: undefined`, a drag to (501, 502) changed nothing, and the
 * stored layout held every other node and not that one.
 *
 * So every table here that is keyed by an id the document chose is made
 * without a prototype, which fixes both halves at once: there is no
 * inherited member to read and no setter to invoke. The same rule as
 * `recipes_page/document_values`' `own`, stated here because a service does
 * not import from a component tree. JSON is unaffected — `JSON.stringify`
 * writes own keys and `JSON.parse` defines them rather than assigning, so
 * such an id survives a round trip through storage. */
const table = (from) => Object.assign(Object.create(null), from || undefined);

const own = (from, key) =>
  from && Object.prototype.hasOwnProperty.call(from, key) ? from[key] : undefined;

function read_all() {
  if (!hasLocalStorage()) return table();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return table();
    const parsed = JSON.parse(raw);
    if (!is_object(parsed) || parsed.version !== LAYOUT_VERSION) return table();
    return is_object(parsed.resources) ? table(parsed.resources) : table();
  } catch (error) {
    /* A hand-edited or half-written record is a drawing, not data: losing it
       costs one auto-layout, so it is discarded rather than repaired. */
    return table();
  }
}

function write_all(resources) {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: LAYOUT_VERSION, resources }),
    );
  } catch (error) {
    /* Out of quota or blocked: the graph still draws, it just will not be
       remembered. Nothing about the Agent is lost. */
  }
}

const finite = (value) => typeof value === "number" && Number.isFinite(value);

function clean_positions(stored) {
  const nodes = table();
  if (!is_object(stored)) return nodes;
  Object.entries(stored).forEach(([id, point]) => {
    if (is_object(point) && finite(point.x) && finite(point.y)) {
      nodes[id] = { x: point.x, y: point.y };
    }
  });
  return nodes;
}

/* ── Laying a graph out from its own edges ──────────────────────────────── */

/* Rank along flow edges: a node sits one column right of the furthest node
   that reaches it. A cycle cannot push a node past the number of nodes there
   are, which is what stops the walk. */
function flow_ranks(document) {
  const nodes = (document && document.nodes) || [];
  const edges = (document && document.edges) || [];
  const rank = new Map(nodes.map((node) => [node.id, 0]));
  const flow = edges.filter((edge) => edge && edge.kind === "flow");
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let moved = false;
    flow.forEach((edge) => {
      if (!rank.has(edge.source_node_id) || !rank.has(edge.target_node_id)) return;
      const next = rank.get(edge.source_node_id) + 1;
      if (next > rank.get(edge.target_node_id)) {
        rank.set(edge.target_node_id, next);
        moved = true;
      }
    });
    if (!moved) break;
  }
  return rank;
}

/* A pool does not run in the flow; it hangs off the agent it attaches to, so
   it is placed under that agent rather than given a column of its own. */
function attachment_hosts(document) {
  const hosts = new Map();
  ((document && document.edges) || []).forEach((edge) => {
    if (!edge || edge.kind !== "attach") return;
    const nodes = (document && document.nodes) || [];
    const by_id = new Map(nodes.map((node) => [node.id, node]));
    const source = by_id.get(edge.source_node_id);
    const target = by_id.get(edge.target_node_id);
    if (!source || !target) return;
    if (source.type === "agent") hosts.set(target.id, source.id);
    else if (target.type === "agent") hosts.set(source.id, target.id);
  });
  return hosts;
}

export function auto_layout(document) {
  const nodes = (document && document.nodes) || [];
  const rank = flow_ranks(document);
  const hosts = attachment_hosts(document);
  const placed = table();
  const column_counts = new Map();

  nodes
    .filter((node) => node && !hosts.has(node.id))
    .forEach((node) => {
      const column = rank.get(node.id) || 0;
      const row = column_counts.get(column) || 0;
      column_counts.set(column, row + 1);
      placed[node.id] = {
        x: ORIGIN.x + column * COLUMN_WIDTH,
        y: ORIGIN.y + row * ROW_HEIGHT,
      };
    });

  /* Attached nodes last, so their host already has a place. Two pools on one
     agent stack rather than overlap. */
  const stacked = new Map();
  nodes
    .filter((node) => node && hosts.has(node.id))
    .forEach((node) => {
      const host = own(placed, hosts.get(node.id));
      const depth = stacked.get(hosts.get(node.id)) || 0;
      stacked.set(hosts.get(node.id), depth + 1);
      placed[node.id] = host
        ? { x: host.x, y: host.y + ATTACH_OFFSET_Y * (depth + 1) }
        : { x: ORIGIN.x, y: ORIGIN.y };
    });

  return placed;
}

/* ── What the canvas reads and writes ───────────────────────────────────── */

/* Every node gets a place: a stored one where there is one, and an auto one
   where there is not, so a node added since the last visit appears instead of
   landing on the origin with everything else. */
export function readSkeletonLayout(resource_id, document) {
  const record = own(read_all(), resource_id);
  const stored = clean_positions(record && record.nodes);
  const auto = auto_layout(document);
  const nodes = table();
  Object.keys(auto).forEach((id) => {
    nodes[id] = own(stored, id) || own(auto, id);
  });
  const viewport = is_object(record && record.viewport) ? record.viewport : null;
  return {
    nodes,
    viewport:
      viewport && finite(viewport.x) && finite(viewport.y) && finite(viewport.zoom)
        ? { x: viewport.x, y: viewport.y, zoom: viewport.zoom }
        : null,
  };
}

export function writeSkeletonNodePositions(resource_id, positions) {
  if (!resource_id) return;
  const resources = read_all();
  const current = is_object(own(resources, resource_id))
    ? own(resources, resource_id)
    : {};
  resources[resource_id] = {
    ...current,
    nodes: table({
      ...clean_positions(current.nodes),
      ...clean_positions(positions),
    }),
  };
  write_all(resources);
}

export function writeSkeletonViewport(resource_id, viewport) {
  if (!resource_id || !is_object(viewport)) return;
  if (!finite(viewport.x) || !finite(viewport.y) || !finite(viewport.zoom)) return;
  const resources = read_all();
  const current = is_object(own(resources, resource_id))
    ? own(resources, resource_id)
    : {};
  resources[resource_id] = {
    ...current,
    viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
  };
  write_all(resources);
}

export function forgetSkeletonLayout(resource_id) {
  const resources = read_all();
  /* Its own record or nothing: `in` answers for the whole prototype chain, so
     on a plain object `forgetSkeletonLayout("constructor")` reported a record
     it then could not delete. */
  if (own(resources, resource_id) === undefined) return;
  delete resources[resource_id];
  write_all(resources);
}
