import { catalog_entry, ports_for_type } from "./recipe_node_catalog";

/* One builder per right-click target.
 *
 * The groups are fixed and the items inside them vary by node kind: group 1 is
 * this node, group 2 is its identity, group 3 is wiring, group 4 is Delete
 * alone behind its own separator so nothing destructive sits under the pointer.
 * A kind that cannot do something keeps the row and greys it — a menu whose
 * shape moves between nodes costs more than two dim rows — and the trailing
 * slot carries the reason. */

const SEPARATOR = { type: "separator" };

/* A shortcut renders as the command glyph plus its key on macOS, and as plain
 * text elsewhere — hence a pair rather than a string. */
export function shortcut(key, is_mac) {
  return is_mac
    ? { trail_icon: "command", trail: key }
    : { trail: `Ctrl+${key}` };
}

/* A row that opens another surface instead of acting straight away. */
const OPENS_ANOTHER_SURFACE = { trail_icon: "arrow_right_s" };

/* An attach node hangs off a flow node rather than sitting in the chain. */
function is_attach_only(node_type) {
  const ports = ports_for_type(node_type);
  return ports.length > 0 && ports.every((p) => p.kind === "attach");
}

function has_out_port(node_type) {
  return ports_for_type(node_type).some((p) => p.kind === "out");
}

export function buildRecipeCanvasContextMenuItems({
  onAddNode,
  onPaste,
  canPaste = false,
  onSelectAll,
  onFitToView,
  onResetZoom,
  isMac = false,
}) {
  return [
    {
      id: "add_node",
      label: "Add node…",
      prefix_icon: "add",
      ...OPENS_ANOTHER_SURFACE,
      onClick: onAddNode,
    },
    SEPARATOR,
    {
      id: "paste",
      label: "Paste",
      icon: "paste",
      ...shortcut("V", isMac),
      disabled: !canPaste,
      onClick: onPaste,
    },
    {
      id: "select_all",
      label: "Select all",
      ...shortcut("A", isMac),
      onClick: onSelectAll,
    },
    SEPARATOR,
    /* Fit to view and Reset zoom carry no shortcut: nothing binds one, and a
     * menu that advertises a key that does nothing is worse than a quiet row. */
    {
      id: "fit_to_view",
      label: "Fit to view",
      icon: "fullscreen",
      onClick: onFitToView,
    },
    {
      id: "reset_zoom",
      label: "Reset zoom",
      onClick: onResetZoom,
    },
  ];
}

export function buildRecipeNodeContextMenuItems({
  node,
  onOpenDetail,
  onEditGraph,
  onViewCode,
  onRename,
  onCopy,
  onInsertAfter,
  onDisconnect,
  onDelete,
  isMac = false,
}) {
  if (!node) return [];
  const type = node.type;
  const attach_only = is_attach_only(type);

  /* Group 1 — this node. Kind-specific rows appear only when the surface that
   * owns them has supplied a handler, so nothing dead ships here. */
  const items = [
    {
      id: "open_detail",
      label: "Open detail",
      icon: "eye_open",
      trail: "⏎",
      onClick: onOpenDetail,
    },
  ];
  if (onEditGraph) {
    items.push({
      id: "edit_graph",
      label: "Edit graph",
      icon: "enter_key",
      onClick: onEditGraph,
    });
  }
  if (onViewCode) {
    items.push({ id: "view_code", label: "View code", icon: "code", onClick: onViewCode });
  }

  /* Group 2 — identity. Renaming needs a name the node actually renders, and
   * only the agent node renders one today; the rest draw a fixed title until
   * the per-type identity table arrives. So the row appears when a handler is
   * supplied, the same rule group 1 uses, rather than sitting greyed out. */
  const can_copy = Boolean(catalog_entry(type));
  items.push(SEPARATOR);
  if (onRename) {
    items.push({
      id: "rename",
      label: "Rename",
      icon: "rename",
      trail: type === "agent" ? "F2" : "fixed",
      disabled: type !== "agent",
      onClick: onRename,
    });
  }
  items.push({
    id: "copy",
    label: "Copy",
    icon: "copy",
    ...(can_copy ? shortcut("C", isMac) : { trail: "one only" }),
    disabled: !can_copy,
    onClick: onCopy,
  });

  /* Group 3 — wiring. An attach node has nothing downstream to insert after. */
  items.push(SEPARATOR);
  if (has_out_port(type)) {
    items.push({
      id: "insert_after",
      label: "Insert node after…",
      prefix_icon: "add",
      ...OPENS_ANOTHER_SURFACE,
      onClick: onInsertAfter,
    });
  }
  items.push({
    id: "disconnect",
    label: attach_only ? "Detach" : "Disconnect",
    icon: "unlink",
    onClick: onDisconnect,
  });

  /* Group 4 — Delete, alone. `deletable` is the same flag the delete key reads
   * (flow_editor.js), so the two can never disagree. */
  const can_delete = node.deletable !== false;
  items.push(SEPARATOR, {
    id: "delete",
    label: "Delete",
    icon: "delete",
    danger: true,
    trail: can_delete ? "⌫" : "required",
    disabled: !can_delete,
    onClick: onDelete,
  });

  return items;
}

export function buildRecipeEdgeContextMenuItems({
  edgeIsAttach = false,
  onInsertNodeHere,
  onDeleteConnection,
}) {
  /* Splicing a step into attach wiring means nothing — an attachment carries
   * configuration, not flow — so that row simply is not offered there. */
  const items = [];
  if (!edgeIsAttach) {
    items.push(
      {
        id: "insert_node_here",
        label: "Insert node here…",
        prefix_icon: "add",
        ...OPENS_ANOTHER_SURFACE,
        onClick: onInsertNodeHere,
      },
      SEPARATOR,
    );
  }
  items.push({
    id: "delete_connection",
    label: "Delete connection",
    icon: "delete",
    danger: true,
    trail: "⌫",
    onClick: onDeleteConnection,
  });
  return items;
}

export function buildRecipeContextMenuItems(target, handlers) {
  if (target?.kind === "node") return buildRecipeNodeContextMenuItems(handlers);
  if (target?.kind === "edge") return buildRecipeEdgeContextMenuItems(handlers);
  return buildRecipeCanvasContextMenuItems(handlers);
}
