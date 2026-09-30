import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlowEditor } from "../../../../BUILTIN_COMPONENTs/flow_editor";
import usePresentationPlatform from "../../../../BUILTIN_COMPONENTs/mini_react/use_presentation_platform";
import AgentNode from "./nodes/agent_node";
import ToolPoolNode from "./nodes/tool_pool_node";
import SubagentPoolNode from "./nodes/subagent_pool_node";
import StartNode from "./nodes/start_node";
import EndNode from "./nodes/end_node";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import ContextMenu from "../../../../BUILTIN_COMPONENTs/context_menu/context_menu";
import { buildRecipeContextMenuItems } from "./recipe_canvas_context_menu_items";
import RecipeNodePalette from "./recipe_node_palette";
import {
  edge_is_attach,
  insert_node_after,
  insert_node_into_edge,
} from "./recipe_graph_edits";
import { migrate_recipe, is_legacy_recipe } from "./recipe_migration";
import { validate_recipe_connection } from "./recipe_connection_rules";
import { is_toolkit_pool_type } from "./recipe_graph";
import {
  build_node,
  catalog_entry,
  next_node_id,
  ports_for_type,
} from "./recipe_node_catalog";

/* Node ids come from the catalog; edge ids are the canvas's own. */
function next_edge_id(existing_ids) {
  let i = 1;
  while (existing_ids.has(`e_${i}`)) i += 1;
  return `e_${i}`;
}

export default function RecipeCanvas({
  recipe,
  selectedNodeId,
  onSelectNode,
  onRecipeChange,
  onRecipeChangeSilent,
  onSave,
  dirty,
  isDark,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}) {
  const [resetToken, setResetToken] = useState(0);
  const [palette, setPalette] = useState({
    visible: false,
    x: 0,
    y: 0,
    mode: "add",
    refId: null,
  });
  /* undefined = never asked, so the editor's token effects stay inert on
   * mount — 0 would fire them once (and select-all on mount would arm the
   * Delete key against the whole graph). */
  const [fitToken, setFitToken] = useState(undefined);
  const [zoomResetToken, setZoomResetToken] = useState(undefined);
  const [selectAllToken, setSelectAllToken] = useState(undefined);
  /* A copied node lives for the life of the canvas, not the OS clipboard: a
   * recipe node is not something another application can paste. */
  const clipboardRef = useRef(null);
  const [canPaste, setCanPaste] = useState(false);
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
  });
  // Canvas coords of the last right-click, used to place newly added nodes.
  const menuPosRef = useRef(null);

  useEffect(() => {
    if (recipe && is_legacy_recipe(recipe)) {
      onRecipeChangeSilent(migrate_recipe(recipe));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.name]);

  const recipeRef = useRef(recipe);
  useEffect(() => {
    recipeRef.current = recipe;
  }, [recipe]);

  const nodes = useMemo(() => {
    if (!recipe?.nodes) return [];
    return recipe.nodes.map((n) => ({
      ...n,
      ports: ports_for_type(n.type),
    }));
  }, [recipe]);

  const edges = useMemo(() => recipe?.edges || [], [recipe]);

  /* A detail page pinned to a node that no longer exists would keep editing a
   * ghost, so closing it is part of deleting. Watching the node list covers
   * every route — the menu's Delete, the Delete key, and undo/redo. */
  useEffect(() => {
    if (!selectedNodeId) return;
    if (recipe?.nodes?.some((n) => n.id === selectedNodeId)) return;
    onSelectNode?.(null);
  }, [recipe, selectedNodeId, onSelectNode]);

  const handleNodesChange = useCallback(
    (nextNodes) => {
      const r = recipeRef.current;
      if (!r) return;
      const nextById = new Map(nextNodes.map((n) => [n.id, n]));
      const kept_ids = new Set(nextNodes.map((n) => n.id));
      const next_recipe_nodes = r.nodes
        .filter((n) => kept_ids.has(n.id))
        .map((n) => {
          const live = nextById.get(n.id);
          if (!live) return n;
          return { ...n, x: live.x, y: live.y };
        });
      const next = { ...r, nodes: next_recipe_nodes };
      recipeRef.current = next;
      onRecipeChange(next);
    },
    [onRecipeChange],
  );

  const handleEdgesChange = useCallback(
    (nextEdges) => {
      const r = recipeRef.current;
      if (!r) return;
      const next = { ...r, edges: nextEdges };
      recipeRef.current = next;
      onRecipeChange(next);
    },
    [onRecipeChange],
  );

  const handleConnect = useCallback(
    (edge) => {
      if (!recipe) return;
      const existing_ids = new Set(recipe.edges.map((e) => e.id));
      const id = next_edge_id(existing_ids);
      const src = recipe.nodes.find((n) => n.id === edge.source_node_id);
      const tgt = recipe.nodes.find((n) => n.id === edge.target_node_id);
      const kind =
        src?.kind === "plugin" || tgt?.kind === "plugin" ? "attach" : "flow";
      onRecipeChange({
        ...recipe,
        edges: [...recipe.edges, { id, ...edge, kind }],
      });
    },
    [recipe, onRecipeChange],
  );

  const validate = useCallback(
    ({ source, target }) =>
      validate_recipe_connection(source, target, { edges }),
    [edges],
  );

  function add_node(type) {
    if (!recipe) return;
    const existing_ids = new Set(recipe.nodes.map((n) => n.id));
    const id = next_node_id(type, existing_ids);
    const pos = menuPosRef.current;
    const node = build_node(type, { id, x: pos?.x, y: pos?.y });
    if (!node) return;
    onRecipeChange({
      ...recipe,
      nodes: [...recipe.nodes, node],
    });
  }

  /* The palette's pick lands differently depending on why it was opened: a
   * plain add drops the node at the right-click, the two insert modes also
   * wire it into the flow — that is the promise their menu rows make. */
  function place_from_palette(type) {
    if (!recipe) return;
    const { mode, refId } = palette;
    if (mode === "add" || !refId) {
      add_node(type);
      return;
    }
    const id = next_node_id(type, new Set(recipe.nodes.map((n) => n.id)));
    if (mode === "insert_after") {
      const anchor = recipe.nodes.find((n) => n.id === refId);
      if (!anchor) return;
      const node = build_node(type, {
        id,
        x: (anchor.x || 0) + 240,
        y: anchor.y || 0,
      });
      const next = node && insert_node_after(recipe, refId, node);
      if (next) {
        onRecipeChange(next);
        onSelectNode?.(id);
      }
      return;
    }
    if (mode === "insert_edge") {
      const pos = menuPosRef.current;
      const node = build_node(type, { id, x: pos?.x, y: pos?.y });
      const next = node && insert_node_into_edge(recipe, refId, node);
      if (next) {
        onRecipeChange(next);
        onSelectNode?.(id);
      }
    }
  }

  const isMac = usePresentationPlatform() === "darwin";

  /* Actions the menus drive. Deleting a node or an edge already lives in the
   * editor's Delete key, so these reuse the same recipe-level changes rather
   * than a second removal path. */

  const remove_node = useCallback(
    (node_id) => {
      const r = recipeRef.current;
      const node = r?.nodes.find((n) => n.id === node_id);
      if (!r || !node || node.deletable === false) return;
      onRecipeChange({
        ...r,
        nodes: r.nodes.filter((n) => n.id !== node_id),
        edges: r.edges.filter(
          (e) => e.source_node_id !== node_id && e.target_node_id !== node_id,
        ),
      });
    },
    [onRecipeChange],
  );

  const disconnect_node = useCallback(
    (node_id) => {
      const r = recipeRef.current;
      if (!r) return;
      const next_edges = r.edges.filter(
        (e) => e.source_node_id !== node_id && e.target_node_id !== node_id,
      );
      if (next_edges.length === r.edges.length) return;
      onRecipeChange({ ...r, edges: next_edges });
    },
    [onRecipeChange],
  );

  const remove_edge = useCallback(
    (edge_id) => {
      const r = recipeRef.current;
      if (!r) return;
      onRecipeChange({ ...r, edges: r.edges.filter((e) => e.id !== edge_id) });
    },
    [onRecipeChange],
  );

  const copy_node = useCallback((node_id) => {
    const r = recipeRef.current;
    const node = r?.nodes.find((n) => n.id === node_id);
    if (!node || !catalog_entry(node.type)) return;
    clipboardRef.current = node;
    setCanPaste(true);
  }, []);

  const paste_node = useCallback(() => {
    const r = recipeRef.current;
    const source = clipboardRef.current;
    if (!r || !source) return;
    const id = next_node_id(source.type, new Set(r.nodes.map((n) => n.id)));
    const pos = menuPosRef.current;
    const at = pos
      ? { x: Math.round(pos.x), y: Math.round(pos.y) }
      : { x: (source.x || 0) + 40, y: (source.y || 0) + 40 };
    onRecipeChange({ ...r, nodes: [...r.nodes, { ...source, id, ...at }] });
    onSelectNode?.(id);
  }, [onRecipeChange, onSelectNode]);

  const open_palette = useCallback((client_x, client_y, mode = "add", refId = null) => {
    setPalette({ visible: true, x: client_x, y: client_y, mode, refId });
  }, []);

  const contextMenuItems = useMemo(() => {
    const target = contextMenu.target || { kind: "canvas", id: null };
    const node =
      target.kind === "node"
        ? recipe?.nodes.find((n) => n.id === target.id) || null
        : null;
    const edge =
      target.kind === "edge"
        ? recipe?.edges.find((e) => e.id === target.id) || null
        : null;
    return buildRecipeContextMenuItems(target, {
      isMac,
      node,
      /* Canvas */
      onAddNode: () => open_palette(contextMenu.x, contextMenu.y),
      canPaste,
      onPaste: paste_node,
      onSelectAll: () => setSelectAllToken((t) => (t || 0) + 1),
      onFitToView: () => setFitToken((t) => (t || 0) + 1),
      onResetZoom: () => setZoomResetToken((t) => (t || 0) + 1),
      /* Node */
      onOpenDetail: () => onSelectNode?.(target.id),
      onCopy: () => copy_node(target.id),
      onInsertAfter: () =>
        open_palette(contextMenu.x, contextMenu.y, "insert_after", target.id),
      onDisconnect: () => disconnect_node(target.id),
      onDelete: () => remove_node(target.id),
      /* Edge */
      edgeIsAttach: edge ? edge_is_attach(recipe, edge) : false,
      onInsertNodeHere: () =>
        open_palette(contextMenu.x, contextMenu.y, "insert_edge", target.id),
      onDeleteConnection: () => remove_edge(target.id),
    });
  }, [
    contextMenu,
    recipe,
    isMac,
    open_palette,
    onSelectNode,
    copy_node,
    paste_node,
    canPaste,
    disconnect_node,
    remove_node,
    remove_edge,
  ]);

  const renderNode = (node) => {
    if (node.type === "agent") return <AgentNode node={node} isDark={isDark} />;
    if (is_toolkit_pool_type(node.type))
      return <ToolPoolNode node={node} isDark={isDark} />;
    if (node.type === "subagent_pool")
      return <SubagentPoolNode node={node} isDark={isDark} />;
    if (node.type === "start") return <StartNode isDark={isDark} />;
    if (node.type === "end") return <EndNode isDark={isDark} />;
    return null;
  };

  const undoHint = isMac ? "Undo (⌘Z)" : "Undo (Ctrl+Z)";
  const redoHint = isMac ? "Redo (⌘⇧Z)" : "Redo (Ctrl+Y)";

  const overlayBg = isDark
    ? "rgba(20, 20, 20, 0.72)"
    : "rgba(255, 255, 255, 0.78)";
  const overlayBorder = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.08)";
  const overlayBackdrop = "blur(16px) saturate(1.4)";

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <FlowEditor
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 0,
          }}
          theme={{
            canvasBackground: isDark ? "var(--pupu-background, #1a1a1a)" : "var(--pupu-background, #fafafb)",
            gridColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)",
            nodeBackground: "transparent",
            nodeShadow: "none",
            nodeShadowHover: "none",
            nodeSelectedBorder: "transparent",
            portShape: "puzzle",
            portColor: isDark ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.22)",
            portHoverColor: "#4a5bd8",
            edgeColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.14)",
            edgeActiveColor: "#4a5bd8",
            edgeWidth: 1.6,
          }}
          nodes={nodes}
          edges={edges}
          on_select={onSelectNode}
          on_connect={handleConnect}
          on_nodes_change={handleNodesChange}
          on_edges_change={handleEdgesChange}
          validate_connection={validate}
          render_node={renderNode}
          on_context_menu={({ target, canvas_x, canvas_y, client_x, client_y }) => {
            menuPosRef.current = { x: canvas_x, y: canvas_y };
            setContextMenu({
              visible: true,
              x: client_x,
              y: client_y,
              target: target || { kind: "canvas", id: null },
            });
          }}
          reset_token={resetToken}
          fit_token={fitToken}
          zoom_reset_token={zoomResetToken}
          select_all_token={selectAllToken}
          reset_focus_node_id="start"
        />

        <div
          style={{
            position: "absolute",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 3,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: 6,
            borderRadius: 12,
            backgroundColor: overlayBg,
            border: overlayBorder,
            backdropFilter: overlayBackdrop,
            WebkitBackdropFilter: overlayBackdrop,
            boxShadow: isDark
              ? "0 4px 24px rgba(0,0,0,0.4)"
              : "0 4px 24px rgba(0,0,0,0.08)",
          }}
        >
          <span title={undoHint} style={{ display: "inline-flex" }}>
            <Button
              prefix_icon="arrow_left"
              onClick={onUndo}
              disabled={!canUndo}
              style={{
                fontSize: 12,
                paddingVertical: 5,
                paddingHorizontal: 8,
                borderRadius: 7,
                opacity: canUndo ? 0.85 : 0.35,
                content: { icon: { width: 13, height: 13 } },
              }}
            />
          </span>
          <span title={redoHint} style={{ display: "inline-flex" }}>
            <Button
              prefix_icon="arrow_right"
              onClick={onRedo}
              disabled={!canRedo}
              style={{
                fontSize: 12,
                paddingVertical: 5,
                paddingHorizontal: 8,
                borderRadius: 7,
                opacity: canRedo ? 0.85 : 0.35,
                content: { icon: { width: 13, height: 13 } },
              }}
            />
          </span>
          <span title="Center" style={{ display: "inline-flex" }}>
            <Button
              prefix_icon="home"
              onClick={() => setResetToken((t) => t + 1)}
              style={{
                fontSize: 12,
                paddingVertical: 5,
                paddingHorizontal: 8,
                borderRadius: 7,
                opacity: 0.7,
                content: { icon: { width: 13, height: 13 } },
              }}
            />
          </span>
          <Button
            label="Save"
            onClick={onSave}
            disabled={!dirty}
            style={{
              fontSize: 12,
              paddingVertical: 5,
              paddingHorizontal: 14,
              borderRadius: 7,
              backgroundColor: dirty ? "#4a5bd8" : "transparent",
              color: dirty ? "#fff" : isDark ? "#ddd" : "#333",
              opacity: dirty ? 1 : 0.5,
            }}
          />
        </div>

        <RecipeNodePalette
          visible={palette.visible}
          x={palette.x}
          y={palette.y}
          graphKind={recipe?.kind}
          isDark={isDark}
          flowOnly={palette.mode !== "add"}
          onPick={(type) => {
            place_from_palette(type);
            setPalette((p) => ({ ...p, visible: false }));
          }}
          onClose={() => setPalette((p) => ({ ...p, visible: false }))}
        />

        <ContextMenu
          visible={contextMenu.visible}
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu((c) => ({ ...c, visible: false }))}
          isDark={isDark}
        />
      </div>

    </div>
  );
}
