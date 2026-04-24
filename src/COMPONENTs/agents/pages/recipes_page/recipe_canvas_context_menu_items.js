export function buildRecipeCanvasContextMenuItems({
  recipe,
  hasToolPool,
  hasSubagentPool,
  onAddToolPool,
  onAddSubagentPool,
}) {
  if (!recipe) return [];
  return [
    {
      icon: "tool",
      label: "Add Tool Pool",
      disabled: hasToolPool,
      onClick: () => {
        if (!hasToolPool) onAddToolPool();
      },
    },
    {
      icon: "bot",
      label: "Add Subagent Pool",
      disabled: hasSubagentPool,
      onClick: () => {
        if (!hasSubagentPool) onAddSubagentPool();
      },
    },
  ];
}
