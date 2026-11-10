import { agentEnglishText } from "./agents_i18n";
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
}, t = agentEnglishText) {
  if (!node) {
    return [
      { icon: "add", label: t("agents.explorer.menu.new_agent"), onClick: () => onNewAgent(null) },
      ...(onNewWorkflow ? [{ icon: "flow_chart", label: t("agents.explorer.menu.new_workflow"), onClick: () => onNewWorkflow(null) }] : []),
      { icon: "folder_new", label: t("agents.explorer.menu.new_folder"), onClick: () => onNewFolder(null) },
      ...(onImport ? [{ type: "separator" }, { icon: "upload", label: t("agents.explorer.menu.import"), onClick: () => onImport() }] : []),
    ];
  }

  if (node.kind === "folder") {
    return [
      { icon: "add", label: t("agents.explorer.menu.new_agent"), onClick: () => onNewAgent(node.folder_id) },
      ...(onNewWorkflow ? [{ icon: "flow_chart", label: t("agents.explorer.menu.new_workflow"), onClick: () => onNewWorkflow(node.folder_id) }] : []),
      { icon: "folder_new", label: t("agents.explorer.menu.new_folder"), onClick: () => onNewFolder(node.folder_id) },
      { type: "separator" },
      { icon: "rename", label: t("agents.explorer.menu.rename"), onClick: () => onStartRename(node) },
      { type: "separator" },
      { icon: "delete", label: t("agents.explorer.menu.delete_folder"), danger: true, onClick: () => onDeleteFolder(node) },
    ];
  }

  if (node.kind === "resource") {
    const unsaved = Boolean(node.active && activeDirty);
    const isDefault = node.is_default === true;
    return [
      { icon: "rename", label: t("agents.explorer.menu.rename"), disabled: unsaved, trail: unsaved ? t("agents.explorer.menu.save_first") : undefined, onClick: () => onStartRename(node) },
      { icon: "copy", label: t("agents.explorer.menu.duplicate"), onClick: () => onDuplicate(node) },
      { type: "separator" },
      {
        label: t("agents.explorer.menu.archive"),
        danger: true,
        disabled: unsaved || isDefault,
        trail: isDefault ? t("agents.explorer.menu.chat_default") : unsaved ? t("agents.explorer.menu.save_first") : undefined,
        onClick: () => onArchive(node),
      },
    ];
  }

  if (node.kind === "archived") {
    return [{ icon: "undo", label: t("agents.explorer.menu.restore"), onClick: () => onRestore(node) }];
  }

  if (node.kind === "legacy") {
    return [{ icon: "eye_open", label: t("agents.explorer.menu.open_legacy"), onClick: () => onOpenLegacy(node) }];
  }

  return [];
}
