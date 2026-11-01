/* The Agents explorer's right-click menu, by target.
 *
 * Same shape as the legacy recipe list's menu (recipe_list_context_menu_items)
 * so the author sees the same groups, with the native store's verbs: an Agent
 * is archived, not deleted — the store keeps a migrated or referenced Agent
 * and refuses to delete it — and it comes back with Restore. An item that
 * cannot be used stays in place, disabled, with the reason in its trailing
 * slot, so the menu never changes shape. */

export function buildAgentExplorerMenuItems({
  node,
  activeDirty,
  onNewAgent,
  onNewWorkflow,
  onNewFolder,
  onImport,
  onStartRename,
  onDuplicate,
  onArchive,
  onRestore,
  onDeleteFolder,
  onOpenLegacy,
}) {
  if (!node) {
    return [
      { icon: "add", label: "New Agent", onClick: () => onNewAgent(null) },
      ...(onNewWorkflow ? [{ icon: "flow_chart", label: "New Workflow", onClick: () => onNewWorkflow(null) }] : []),
      { icon: "folder_new", label: "New Folder", onClick: () => onNewFolder(null) },
      ...(onImport ? [{ type: "separator" }, { icon: "upload", label: "Import…", onClick: () => onImport() }] : []),
    ];
  }

  if (node.kind === "folder") {
    return [
      { icon: "add", label: "New Agent", onClick: () => onNewAgent(node.folder_id) },
      ...(onNewWorkflow ? [{ icon: "flow_chart", label: "New Workflow", onClick: () => onNewWorkflow(node.folder_id) }] : []),
      { icon: "folder_new", label: "New Folder", onClick: () => onNewFolder(node.folder_id) },
      { type: "separator" },
      { icon: "rename", label: "Rename", onClick: () => onStartRename(node) },
      { type: "separator" },
      { icon: "delete", label: "Delete folder", danger: true, onClick: () => onDeleteFolder(node) },
    ];
  }

  if (node.kind === "resource") {
    const unsaved = Boolean(node.active && activeDirty);
    const isDefault = node.is_default === true;
    return [
      { icon: "rename", label: "Rename", disabled: unsaved, trail: unsaved ? "save first" : undefined, onClick: () => onStartRename(node) },
      { icon: "copy", label: "Duplicate", onClick: () => onDuplicate(node) },
      { type: "separator" },
      {
        label: "Archive",
        danger: true,
        disabled: unsaved || isDefault,
        trail: isDefault ? "chat default" : unsaved ? "save first" : undefined,
        onClick: () => onArchive(node),
      },
    ];
  }

  if (node.kind === "archived") {
    return [{ icon: "undo", label: "Restore", onClick: () => onRestore(node) }];
  }

  if (node.kind === "legacy") {
    return [{ icon: "eye_open", label: "Open in the old editor", onClick: () => onOpenLegacy(node) }];
  }

  return [];
}
