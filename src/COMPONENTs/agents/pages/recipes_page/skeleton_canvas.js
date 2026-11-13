import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { agentEnglishText } from "./agents_i18n";
import { palette_entry_caption } from "./node_catalog_captions";
import { FlowEditor } from "../../../../BUILTIN_COMPONENTs/flow_editor";
import usePresentationPlatform from "../../../../BUILTIN_COMPONENTs/mini_react/use_presentation_platform";
import ContextMenu from "../../../../BUILTIN_COMPONENTs/context_menu/context_menu";
import RecipeNodePalette from "./recipe_node_palette";
import { addable_node_types } from "./skeleton_graph_edits";
import { node_toolkit_refs } from "./toolkit_pool_config";
import { branch_ports, branch_summary, is_branch_type } from "./skeleton_branch_config";
import { NATIVE_PALETTE_ENTRIES, native_pool_ports, native_step_ports } from "./skeleton_node_catalog";
import BranchNode from "./nodes/branch_node";
import ToolCallNode from "./nodes/tool_call_node";
import WorkflowCallNode from "./nodes/workflow_call_node";
import HooksPoolNode from "./nodes/hooks_pool_node";
import SkillReadNode from "./nodes/skill_read_node";
import CodeNode from "./nodes/code_node";
import AgentNode from "./nodes/agent_node";
import EndNode from "./nodes/end_node";
import StartNode from "./nodes/start_node";
import SubagentPoolNode from "./nodes/subagent_pool_node";
import ToolPoolNode from "./nodes/tool_pool_node";
import { ports_for_type } from "./recipe_node_catalog";
import { own } from "./document_values";
import { NODE_TYPES, document_layout_positions, drawn_node } from "./skeleton_document";
import { is_valid_node_label, node_display_title } from "./node_display_labels";
import { useNodeLabelCapability } from "./node_label_capability";
import RunNodeStatus from "./nodes/run_node_status";
import { agentMessage, renderAgentMessage, agentProblemMessage, agentReasonPayload } from "./agents_i18n";
import { pool_entry_rows } from "./skeleton_drill";
import {
  readSkeletonLayout,
  writeSkeletonNodePositions,
  writeSkeletonViewport,
} from "../../../../SERVICEs/skeleton_layout";

/* The graph, drawn.
 *
 * A Skeleton node carries no coordinate and the store refuses one, so the
 * picture comes from two places that are deliberately kept apart: the document
 * says what the graph IS, and `skeleton_layout` says where it is drawn. The
 * projection below is the only place they meet, and it only reads.
 *
 * Dragging a node still cannot change execution. Where the runtime stores a
 * drawing (skeleton_execution 1.10, `document_layout_v1`), a drop is sent as
 * a `move_nodes` command into the document's display-only `layout`, which
 * every prepared plan drops: it marks the draft unsaved, Save keeps it, and
 * it travels with the Agent. Without that runtime, positions stay on this
 * machine in the layout service, as before. Either way no drawing array
 * becomes a document.
 *
 * Which node is open is the page's business, not the canvas's: FlowEditor
 * keeps its own highlight, and `on_select` is what tells the page to open the
 * detail panel.
 *
 * Double-clicking a row on a Subagent Pool opens that subagent's graph. It is
 * reported to the page, which owns the drill stack; a row that cannot be
 * opened is reported too, with the reason, because an inert row reads as the
 * app being broken. Escape belongs to the page for the same reason, and
 * because it has to keep working while this canvas is not on screen — a
 * drilled-in resource whose re-read failed still has a breadcrumb. */

/* A table whose keys are node ids. Without a prototype, for the reason in
   `SERVICEs/skeleton_layout`: every id the envelope allows is then an own key
   of its own, and nothing can be read out of `Object.prototype` instead. */
const node_table = (from) => Object.assign(Object.create(null), from || undefined);

/* `view.rename` is this node's in-place rename (see `renameFor` below), or
   nothing where the node cannot be renamed. */
function renderNode(node, isDark, onOpenSubagent, view = {}) {
  const rename = view.rename;
  if (node.type === "agent") return <AgentNode node={node} isDark={isDark} rename={rename} />;
  if (node.type === "toolkit_pool") return <ToolPoolNode node={node} isDark={isDark} native toolkits={node_toolkit_refs(node)} rename={rename} />;
  if (node.type === "subagent_pool") {
    return (
      <SubagentPoolNode
        node={node}
        isDark={isDark}
        rename={rename}
        /* A Skeleton pool carries its entries in `config`, and a legacy one in
           `config.legacy_fields`; the legacy recipe canvas passes a node whose
           entries sit on `node.subagents`. The rows are resolved here rather
           than inside the node so the two shapes stay one drawing. */
        rows={pool_entry_rows(node, agentMessage)}
        onOpenRow={
          typeof onOpenSubagent === "function"
            ? (row) =>
                onOpenSubagent(agentReasonPayload({
                  pool_node_id: node.id,
                  entry_id: row.entry_id,
                  /* Which row it was, as well as which entry it names: a
                     draft the store accepts can hold two entries with one
                     id, and the row the author clicked is the graph that
                     opens. */
                  entry_index: row.index,
                  reason: row.reason,
                }))
            : undefined
        }
      />
    );
  }
  if (is_branch_type(node.type) && node.branch) {
    return <BranchNode node={node} rows={node.branch.rows} summary={node.branch.summary} isDark={isDark} rename={rename} />;
  }
  if (node.type === "tool_call") return <ToolCallNode node={node} isDark={isDark} rename={rename} />;
  if (node.type === "workflow_call") return <WorkflowCallNode node={node} isDark={isDark} rename={rename} />;
  if (node.type === "hooks_pool") return <HooksPoolNode node={node} isDark={isDark} rename={rename} />;
  if (node.type === "skill_read") return <SkillReadNode node={node} isDark={isDark} rename={rename} />;
  /* A Code node (#357) is a plain header node; its code is read in the panel. */
  if (node.type === "code") return <CodeNode node={node} isDark={isDark} rename={rename} />;
  if (node.type === "start") return <StartNode node={node} isDark={isDark} rename={rename} />;
  if (node.type === "end") return <EndNode node={node} isDark={isDark} rename={rename} />;
  /* A type this build has no drawing for still has to appear: a graph that
     silently omitted a node would read as a graph that does not have it. */
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 8,
        fontSize: 11.5,
        fontFamily: "ui-monospace, Menlo, monospace",
        border: isDark ? "1px dashed rgba(255,255,255,0.25)" : "1px dashed rgba(0,0,0,0.2)",
      }}
    >
      {node.type}
    </div>
  );
}

/* One drawing per graph.
 *
 * Everything below holds state for the graph it is drawing: the positions it
 * has handed out, the viewport it was left at, the editor's own panning and
 * selection inside FlowEditor. The page keeps this component in place and
 * changes which graph it draws — drilling in and out — so that state has to
 * belong to the graph's identity rather than to the component's lifetime.
 *
 * It did not, and a parent and an embedded child with a node id in common
 * drew each other's positions: the child opened at the parent's coordinates,
 * dragging it moved the parent's node too, and the next drag in the parent
 * wrote the child's coordinate into the parent's layout. Nothing about either
 * Agent changed — a position never reaches the document — but two graphs lost
 * their own drawings.
 *
 * Being a separate component keyed by that identity is what makes this true
 * of FlowEditor's own state as well, which no prop of ours can reset; and the
 * viewport is written back on the way out by the instance that was panned, so
 * it lands under the graph it belonged to rather than the one now open. */
export default function SkeletonCanvas(props) {
  return <GraphDrawing key={JSON.stringify([props.resourceId, props.commandScope])} {...props} />;
}

/* The palette's entries for finding a node already on the canvas: by id,
   with its type's name and icon. */
const TYPE_ENTRIES = Object.assign(
  Object.create(null),
  Object.fromEntries(NATIVE_PALETTE_ENTRIES.map((entry) => [entry.type, entry])),
);
const FIXED_TYPES = Object.assign(Object.create(null), {
  start: { label: "Start", icon: "flag" },
  end: { label: "End", icon: "target" },
});
function finder_entries(graph, t = agentEnglishText) {
  return ((graph && graph.nodes) || [])
    .filter((node) => node && typeof node.id === "string")
    .map((node) => {
      const known = (typeof node.type === "string" && (TYPE_ENTRIES[node.type] || FIXED_TYPES[node.type])) || null;
      return {
        key: node.id,
        type: typeof node.type === "string" ? node.type : "",
        label: node_display_title(node, node.id),
        description: `${node.id} · ${known ? palette_entry_caption({ ...known, type: node.type }, t).label : typeof node.type === "string" ? node.type : t("agents.canvas.unknown_node")}`,
        icon: known ? known.icon : "circle",
      };
    });
}

function GraphDrawing({
  resourceId,
  commandScope,
  document: graph,
  readOnly = false,
  observation = null,
  onSelectNode,
  onOpenSubagent,
  onGraphCommand,
  /* Bumped by the page's Home control; Home centers this graph's own Start. */
  homeToken,
  /* Where a refused edit is said. Without it the canvas says it itself. */
  onProblem,
  isDark,
}) {
  const { t } = useTranslation();
  const canEdit = !readOnly && typeof onGraphCommand === "function" && (graph?.kind === "agent" || graph?.kind === "workflow") &&
    graph?.schema_version === 1;
  const renameScope = JSON.stringify([resourceId, commandScope, graph?.id]);
  const labelCapability = useNodeLabelCapability(canEdit, renameScope);
  const layoutInDocument = canEdit && labelCapability.layout === true;
  const [rename, setRename] = useState(null);
  const [selection, setSelection] = useState({ node_ids: [], edge_id: null });
  const observeSelection = useCallback((next) => setSelection(next), []);
  useEffect(() => { setRename(null); }, [renameScope, canEdit]);
  /* A Workflow is offered only what it can hold (#357 G7). */
  const addableTypes = useMemo(() => addable_node_types(graph?.kind), [graph?.kind]);
  const paletteEntries = useMemo(() => NATIVE_PALETTE_ENTRIES.map((entry) => palette_entry_caption(entry, t)), [t]);
  const containerRef = useRef(null);
  /* Back to the canvas after Enter or Escape, so its keys work again; a
     commit by leaving the field leaves focus wherever it went. */
  const closeRename = useCallback((options) => {
    setRename(null);
    if (!options || options.refocus !== false) containerRef.current?.focus({ preventScroll: true });
  }, []);
  const [palette, setPalette] = useState(null);
  /* Finding a node by name: the palette in its find mode, which is also the
     keyboard's way to a node (⌘F / Ctrl+F). */
  const [finder, setFinder] = useState(null);
  const [focusNodeId, setFocusNodeId] = useState(null);
  const isMac = usePresentationPlatform() === "darwin";
  const [menu, setMenu] = useState(null);
  const [problem, setProblem] = useState(null);
  const [fitToken, setFitToken] = useState(undefined);
  const [zoomToken, setZoomToken] = useState(undefined);
  const [selectToken, setSelectToken] = useState(undefined);
  /* Read once per document identity: re-reading on every render would undo a
     drag the moment anything else re-rendered. The graph's identity is this
     component's, so what is read here is only ever this graph's. */
  const [layoutKey] = useState(() => ({}));
  const stored = useMemo(
    () => readSkeletonLayout(resourceId, graph),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resourceId, graph, layoutKey],
  );
  /* Kept in a table with no prototype, because its keys are node ids and a
     node id is data: `__proto__` is a legal id the real store runs, and on a
     plain object the read answered with an inherited member and the write set
     a prototype instead of storing the drag. The layout service's own note
     has the measurements. */
  /* What the document places wins over this machine's record and the auto
     layout; a live drag wins over both only while the drawing is kept here. */
  const documentPositions = useMemo(() => document_layout_positions(graph), [graph]);
  const positions = useRef(node_table({ ...stored.nodes, ...documentPositions }));
  positions.current = node_table({ ...stored.nodes, ...documentPositions, ...positions.current });
  /* Where each node was drawn when this graph opened. `stored` is re-read
     whenever the graph object changes, and by then this machine's record
     already holds the drop, so undo needs its own copy. */
  const openedAt = useRef(null);
  if (openedAt.current === null) openedAt.current = node_table(stored.nodes);
  /* Bumped when a node is dropped. Without it the projection below would keep
     returning the positions it was memoized with, and the next re-render for
     any other reason would snap the node back to where it was dragged from. */
  const [moveTick, setMoveTick] = useState(0);
  /* Bumped by the Home control, which centers this graph's own Start. */
  const [resetToken, setResetToken] = useState(0);

  const nodes = useMemo(
    () =>
      ((graph && graph.nodes) || []).map((node) => {
        /* With the drawing in the document, undo moves a node back: the
           document's place, else where it was when this graph opened, else
           (a node added since) where it was put. */
        const at = (layoutInDocument
          ? own(documentPositions, node.id) || own(openedAt.current, node.id) || own(positions.current, node.id)
          : own(positions.current, node.id)) || { x: 0, y: 0 };
        /* A branch's ports are its outlets, read from its own config (and from
           any edge still leaving through an outlet it no longer declares), so
           they cannot come from the per-type catalog. The rows travel with the
           drawing only; nothing here reaches the document. */
        const branch = is_branch_type(node && node.type) ? branch_ports(graph, node, t) : null;
        return {
          /* Only the common envelope, including a validated optional label.
             Other metadata never leaks into a drawing through a spread.
             Coordinates and ports below belong only to this canvas. */
          ...drawn_node(node),
          x: at.x,
          y: at.y,
          /* Asked only about a type the schema names.
             `ports_for_type` reads a plain table with it, and a draft can
             hold `type: "__proto__"` — the real store saves that and reads it
             back verbatim, and refuses it at Run with `unknown_variant` — for
             which the table answers `Object.prototype`: an object, so it is
             handed over as the port list, and the editor's `ports.forEach`
             then throws. A type this build has no drawing for has no ports
             here either way, and it is still drawn by its own type.
             The catalog's own read is shared with the legacy canvas and is
             not this slice's to change. */
          /* A deterministic step (#352) has one way in and one way out; the
             legacy catalog has no entry for it, so its ports come from the
             native catalog. */
          ports: branch ? branch.ports : native_step_ports(node.type) || native_pool_ports(node.type) || (NODE_TYPES.includes(node.type) ? ports_for_type(node.type) : []),
          ...(branch ? { branch: { rows: branch.rows, readable: branch.readable, summary: branch_summary(node, t) } } : {}),
          deletable: canEdit && node.type !== "start" && node.type !== "end",
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graph, moveTick, canEdit, t, layoutInDocument, documentPositions],
  );

  /* Run A must never paint the editor's draft B. Only the frozen document
     object supplied by the read-only run view carries this projection. */
  const observed = readOnly && observation?.document === graph ? observation : null;
  const runNodes = useMemo(() => new Map((observed?.nodes || []).map((node) => [node.node_id, node])), [observed]);
  const edges = useMemo(() => {
    const list = (graph && graph.edges) || [];
    const skipped = new Set(observed?.skipped_edges || []);
    return skipped.size ? list.map((edge) => skipped.has(edge.id) ? { ...edge, style: "dashed" } : edge) : list;
  }, [graph, observed]);

  /* A drop. The editor reports every node with the dropped one moved, so the
     command carries the whole drawing and the stored layout is complete from
     the first move. This machine's record is written too: it is what the
     canvas falls back to with an older runtime. */
  const moveRef = useRef(null);
  const handleNodesChange = useCallback(
    (next) => {
      const moved = node_table();
      (next || []).forEach((node) => {
        if (!node || !node.id) return;
        moved[node.id] = { x: node.x, y: node.y };
      });
      positions.current = node_table({ ...positions.current, ...moved });
      writeSkeletonNodePositions(resourceId, moved);
      if (moveRef.current) moveRef.current({ ...moved });
      setMoveTick((tick) => tick + 1);
    },
    [resourceId],
  );

  const viewportRef = useRef(stored.viewport || { x: 0, y: 0, zoom: 1 });
  const rememberViewport = useCallback(() => {
    writeSkeletonViewport(resourceId, viewportRef.current);
  }, [resourceId]);

  const say = useCallback((message) => {
    if (typeof onProblem === "function") onProblem(message);
    else setProblem(message);
  }, [onProblem]);
  const perform = useCallback((command) => {
    const result = onGraphCommand(command);
    say(result.ok ? null : agentProblemMessage(result.problem, agentMessage) || agentMessage("agents.runtime.edit_refused"));
    if (result.ok && command.type === "delete" && command.node_ids.length) onSelectNode?.(null);
    return result;
  }, [onGraphCommand, onSelectNode, say]);
  moveRef.current = layoutInDocument && canEdit ? (moved) => perform({ type: "move_nodes", positions: moved }) : null;
  const renameTarget = useCallback((id) => {
    const matches = (graph.nodes || []).filter((node) => node && node.id === id);
    return matches.length === 1 && NODE_TYPES.includes(matches[0].type) ? matches[0] : null;
  }, [graph]);
  /* Rename happens on the node itself: its title becomes a field (NodeHeader).
     Where the runtime cannot keep a name the canvas offers no Rename at all —
     no menu entry, no double-click — and says nothing about it. */
  const openRename = useCallback((id) => {
    if (!canEdit || !labelCapability.allowed) return;
    const target = renameTarget(id);
    if (!target) { say(agentMessage("agents.runtime.rename_missing")); return; }
    setMenu(null); setPalette(null); setFinder(null);
    setRename({ node_id: id, scope: renameScope, problem: null,
      unchangedIsNoop: !Object.prototype.hasOwnProperty.call(target, "label") || is_valid_node_label(target.label) });
  }, [canEdit, labelCapability, renameScope, renameTarget, say]);
  /* One commit is one command, so one undo step. A blank name is the node's
     own default again (its label goes); an unchanged name writes nothing. A
     refused name stays in the field with the reason under it. */
  const refuseRename = useCallback((result) => {
    const message = agentProblemMessage(result.problem, agentMessage) || agentMessage("agents.runtime.edit_refused");
    setRename((open) => (open ? { ...open, problem: message } : open));
    return result;
  }, []);
  const confirmRename = useCallback((value, initialValue, options) => {
    if (!canEdit || !labelCapability.allowed || rename?.scope !== renameScope) {
      closeRename(options);
      return { ok: true };
    }
    const target = renameTarget(rename.node_id);
    if (!target) return refuseRename({ ok: false, problem: { message: agentMessage("agents.runtime.rename_missing") } });
    const command = is_valid_node_label(value)
      ? (rename.unchangedIsNoop && value === initialValue ? null : { type: "rename_node", node_id: rename.node_id, label: value })
      : (Object.prototype.hasOwnProperty.call(target, "label") ? { type: "reset_node_label", node_id: rename.node_id } : null);
    if (!command) { closeRename(options); return { ok: true }; }
    const result = onGraphCommand(command);
    if (!result.ok) return refuseRename(result);
    say(null);
    closeRename(options);
    return result;
  }, [canEdit, labelCapability, rename, renameScope, renameTarget, onGraphCommand, say, refuseRename, closeRename]);
  /* The node's side of it, handed to its header. */
  const renameFor = (node) => {
    if (!canEdit || !labelCapability.allowed || !node || !NODE_TYPES.includes(node.type)) return undefined;
    const editing = !!rename && rename.scope === renameScope && rename.node_id === node.id;
    return {
      enabled: true,
      editing,
      problem: editing && rename.problem ? renderAgentMessage(rename.problem, t) : null,
      begin: () => openRename(node.id),
      commit: confirmRename,
      cancel: closeRename,
    };
  };

  const openPalette = useCallback((point) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const clientX = point?.client_x ?? (rect?.left || 0) + 180;
    const clientY = point?.client_y ?? (rect?.top || 0) + 100;
    const vp = viewportRef.current;
    setMenu(null);
    setPalette({ x: clientX, y: clientY,
      canvas_x: point?.canvas_x ?? (clientX - (rect?.left || 0) - vp.x) / vp.zoom,
      canvas_y: point?.canvas_y ?? (clientY - (rect?.top || 0) - vp.y) / vp.zoom });
  }, []);
  const pickNode = useCallback((type) => {
    const result = perform({ type: "add_node", node_type: type });
    if (result.ok) {
      const node = result.document.nodes[result.document.nodes.length - 1];
      const at = { x: palette.canvas_x, y: palette.canvas_y };
      positions.current[node.id] = at;
      writeSkeletonNodePositions(resourceId, { [node.id]: at });
      /* Same gesture, so the add and its place undo as one step. */
      if (moveRef.current) moveRef.current({ [node.id]: at });
      setMoveTick((tick) => tick + 1);
      onSelectNode?.(node.id);
      setPalette(null);
    }
  }, [onSelectNode, palette, perform, resourceId]);

  const openFinder = useCallback((point) => {
    const rect = containerRef.current?.getBoundingClientRect();
    setMenu(null);
    setPalette(null);
    setFinder({
      x: point?.client_x ?? (rect?.left || 0) + 180,
      y: point?.client_y ?? (rect?.top || 0) + 100,
    });
  }, []);
  /* Opening a found node is what a click does — the page opens its detail
     panel — and the canvas centers it, the way Home centers Start. */
  const findNode = useCallback((nodeId) => {
    setFinder(null);
    setFocusNodeId(nodeId);
    setResetToken((token) => token + 1);
    onSelectNode?.(nodeId);
  }, [onSelectNode]);

  const contextItems = useMemo(() => {
    if (!menu) return [];
    const target = menu.target;
    if (target.kind === "node") {
      const node = nodes.find((entry) => entry.id === target.id);
      const attached = edges.some((edge) => edge.source_node_id === target.id || edge.target_node_id === target.id);
      return [
        { id: "open", label: t("agents.canvas.menu.open_details"), onClick: () => onSelectNode?.(target.id) },
        ...(labelCapability.allowed ? [{ id: "rename", label: t("agents.explorer.menu.rename"),
          disabled: !renameTarget(target.id) || selection.node_ids.length !== 1 || selection.edge_id !== null,
          trail: "F2", onClick: () => openRename(target.id) }] : []),
        { id: "disconnect", label: t("agents.canvas.menu.disconnect_node"), disabled: !attached, onClick: () => perform({ type: "disconnect", node_id: target.id }) },
        { type: "separator" },
        { id: "delete", label: node?.deletable ? t("agents.canvas.menu.delete_node") : t("agents.canvas.menu.required_node"), disabled: !node?.deletable, danger: true,
          onClick: () => perform({ type: "delete", node_ids: [target.id], edge_ids: [] }) },
      ];
    }
    if (target.kind === "edge") return [{ id: "delete", label: t("agents.canvas.menu.delete_connection"), danger: true,
      onClick: () => perform({ type: "delete", node_ids: [], edge_ids: [target.id] }) }];
    return [
      { id: "add", label: t("agents.canvas.menu.add_node"), onClick: () => openPalette(menu) },
      { id: "find", label: t("agents.canvas.menu.find_node"), onClick: () => openFinder(menu),
        ...(isMac ? { trail_icon: "command", trail: "F" } : { trail: "Ctrl+F" }) },
      { type: "separator" },
      { id: "select", label: t("agents.canvas.menu.select_all"), onClick: () => setSelectToken((t) => (t || 0) + 1) },
      { id: "fit", label: t("agents.canvas.menu.fit_graph"), onClick: () => setFitToken((t) => (t || 0) + 1) },
      { id: "zoom", label: t("agents.canvas.menu.reset_zoom"), onClick: () => setZoomToken((t) => (t || 0) + 1) },
    ];
  }, [edges, menu, nodes, onSelectNode, openPalette, openFinder, perform, isMac, labelCapability, renameTarget, selection, openRename, t]);

  /* A zoom is a wheel gesture and produces no mouseup, so remembering on
     mouseup alone kept every pan and lost every zoom. Both gestures are
     watched, and leaving is the last chance for whatever the final one was. */
  const resourceRef = useRef(resourceId);
  resourceRef.current = resourceId;
  useEffect(
    () => () => {
      writeSkeletonViewport(resourceRef.current, viewportRef.current);
    },
    [],
  );

  /* Home centers this graph's own Start — a sub-graph opened by drilling in
     need not name its start node `start`, so it is found by type. The key is
     bound here as well as the control: the acceptance names Home, and the
     legacy canvas's Home has only ever been a button. */
  const startNodeId = useMemo(
    () => ((graph && graph.nodes) || []).find((node) => node.type === "start")?.id,
    [graph],
  );
  const center = useCallback(() => {
    setFocusNodeId(null);
    setResetToken((token) => token + 1);
  }, []);
  /* The page's Home. Skipped on mount, where the editor restores the
     remembered viewport instead. */
  const lastHome = useRef(homeToken);
  useEffect(() => {
    if (homeToken === lastHome.current) return;
    lastHome.current = homeToken;
    center();
  }, [homeToken, center]);
  useEffect(() => {
    const onKey = (event) => {
      const tag = window.document.activeElement?.tagName;
      const active = window.document.activeElement;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || active?.isContentEditable || active?.closest?.('[contenteditable]:not([contenteditable="false"])')) return;
      if (event.key === "F2") {
        const hosts = window.document.querySelectorAll("[data-pupu-modal-overlay-host]");
        const top = hosts[hosts.length - 1];
        if (event.defaultPrevented || rename || !canEdit || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey ||
            (top && !top.contains(containerRef.current)) || !containerRef.current?.contains(active) ||
            selection.node_ids.length !== 1 || selection.edge_id !== null) return;
        event.preventDefault(); openRename(selection.node_ids[0]); return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        center();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey && (event.key === "f" || event.key === "F")) {
        event.preventDefault();
        openFinder();
      }
    };
    window.document.addEventListener("keydown", onKey);
    return () => window.document.removeEventListener("keydown", onKey);
  }, [center, openFinder, canEdit, rename, selection, openRename]);

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      data-testid="skeleton-canvas"
      style={{ position: "relative", flex: 1, minHeight: 0 }}
      onMouseUp={rememberViewport}
      onWheel={rememberViewport}
      onMouseDownCapture={(event) => {
        if (!event.target.closest?.("input, textarea, select, button, [contenteditable]")) containerRef.current?.focus({ preventScroll: true });
      }}
      onDoubleClick={canEdit ? (event) => {
        if (event.target.closest?.("[data-flow-node-id], [data-flow-edge-id], button")) return;
        openPalette({ client_x: event.clientX, client_y: event.clientY });
      } : undefined}
    >
      <FlowEditor
        style={{ width: "100%", height: "100%", borderRadius: 0 }}
        theme={{
          canvasBackground: "var(--pupu-background)",
          gridColor: "var(--pupu-overlay-ghost)",
          nodeBackground: "transparent",
          nodeShadow: "none",
          nodeShadowHover: "none",
          nodeSelectedBorder: "transparent",
          portShape: "puzzle",
          portHoverColor: "var(--pupu-accent)",
          portColor: "var(--pupu-border-strong)",
          edgeColor: "var(--pupu-border-mid)",
          edgeActiveColor: "var(--pupu-accent)",
          edgeWidth: 1.6,
        }}
        nodes={nodes}
        edges={edges}
        on_select={onSelectNode}
        on_selection_change={observeSelection}
        on_nodes_change={handleNodesChange}
        on_connect={canEdit ? (connection) => perform({ type: "connect", connection }) : undefined}
        on_delete={canEdit ? (selection) => perform({ type: "delete", ...selection }) : undefined}
        on_reconnect={canEdit ? (selection) => perform({ type: "reconnect", ...selection }) : undefined}
        on_context_menu={canEdit ? (info) => { setPalette(null); setMenu(info); } : undefined}
        /* Each drawn node answers to its id. `display: contents`, so the hook
           adds no box and the editor measures the node exactly as before. */
        render_node={(node) => (
          <div data-testid={`skeleton-node-${node.id}`} style={{ display: "contents" }}>
            <RunNodeStatus projection={["toolkit_pool", "subagent_pool", "hooks_pool"].includes(node.type) ? null : runNodes.get(node.id)} isDark={isDark}>
              {renderNode(node, isDark, onOpenSubagent, { rename: renameFor(node) })}
            </RunNodeStatus>
          </div>
        )}
        viewport_out_ref={viewportRef}
        restore_viewport={
          stored.viewport ? { ...stored.viewport, token: resourceId } : undefined
        }
        reset_token={resetToken}
        reset_focus_node_id={focusNodeId || startNodeId}
        fit_token={fitToken}
        zoom_reset_token={zoomToken}
        select_all_token={selectToken}
      />
      {problem && <div data-testid="skeleton-graph-problem" role="alert" style={{ position: "absolute", bottom: 8, left: 8, right: 8, padding: "8px 12px", borderRadius: 8, background: "var(--pupu-surface)", fontSize: 12 }}>{renderAgentMessage(problem, t)}</div>}
      <RecipeNodePalette visible={canEdit && !!palette} x={palette?.x || 0} y={palette?.y || 0}
        allowedTypes={addableTypes} entries={paletteEntries} onPick={pickNode} onClose={() => setPalette(null)} isDark={isDark} />
      <ContextMenu visible={canEdit && !!menu} x={menu?.client_x || 0} y={menu?.client_y || 0}
        items={contextItems} onClose={() => setMenu(null)} isDark={isDark} />
      <RecipeNodePalette visible={!!finder} x={finder?.x || 0} y={finder?.y || 0} mode="find"
        entries={finder ? finder_entries(graph, t) : undefined} onPick={findNode} onClose={() => setFinder(null)} isDark={isDark} />
    </div>
  );
}
