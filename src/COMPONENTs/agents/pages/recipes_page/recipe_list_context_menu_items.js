export function buildRecipeListContextMenuItems({
  node,
  onNewAgent,
  onNewFolder,
  onStartRename,
  onDelete,
  onDuplicate,
}) {
  if (!node) {
    return [
      { icon: "chat_new", label: "New Agent", onClick: () => onNewAgent(null) },
      { icon: "folder_new", label: "New Folder", onClick: () => onNewFolder(null) },
    ];
  }

  if (node.kind === "folder") {
    return [
      { icon: "chat_new", label: "New Agent", onClick: () => onNewAgent(node.id) },
      { icon: "folder_new", label: "New Folder", onClick: () => onNewFolder(node.id) },
      { type: "separator" },
      { icon: "rename", label: "Rename", onClick: () => onStartRename(node) },
      { type: "separator" },
      { icon: "delete", label: "Delete", danger: true, onClick: () => onDelete(node) },
    ];
  }

  if (node.kind === "recipe") {
    const isDefault = node.name === "Default";
    return [
      { icon: "rename", label: "Rename", onClick: () => onStartRename(node) },
      { icon: "copy", label: "Duplicate", onClick: () => onDuplicate(node.id) },
      { type: "separator" },
      {
        icon: "delete",
        label: "Delete",
        danger: true,
        disabled: isDefault,
        onClick: () => onDelete(node),
      },
    ];
  }

  return [];
}
