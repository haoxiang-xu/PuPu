import { agentEnglishText } from "./agents_i18n";
/* The Agents explorer's right-click menu, by target.
 *
 * Same shape as the legacy recipe list's menu (recipe_list_context_menu_items)
 * so the author sees the same groups. Resources use permanent deletion,
 * including items left archived by an earlier build. */

export function buildAgentExplorerMenuItems({
  node,
  activeDirty,
  onNewAgent,
  onNewWorkflow,
  onNewFolder,
  onImport,
  onStartRename,
  onDuplicate,
  onDeleteResource,
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
    return [
      { icon: "rename", label: t("agents.explorer.menu.rename"), disabled: unsaved, trail: unsaved ? t("agents.explorer.menu.save_first") : undefined, onClick: () => onStartRename(node) },
      { icon: "copy", label: t("agents.explorer.menu.duplicate"), onClick: () => onDuplicate(node) },
      { type: "separator" },
      {
        icon: "delete",
        label: t("agents.explorer.menu.delete"),
        danger: true,
        onClick: () => onDeleteResource(node),
      },
    ];
  }

  if (node.kind === "archived") {
    return [{ icon: "delete", label: t("agents.explorer.menu.delete"), danger: true, onClick: () => onDeleteResource(node) }];
  }

  if (node.kind === "legacy") {
    return [{ icon: "eye_open", label: t("agents.explorer.menu.open_legacy"), onClick: () => onOpenLegacy(node) }];
  }

  return [];
}
