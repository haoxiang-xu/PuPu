export function buildRecipeCanvasContextMenuItems({
  onAddAgent,
  onAddToolPool,
  onAddSubagentPool,
}) {
  return [
    { id: "add_agent", label: "+ Add Blank Agent", onClick: onAddAgent },
    { id: "add_toolkit_pool", label: "+ Add ToolkitPool", onClick: onAddToolPool },
    {
      id: "add_subagent_pool",
      label: "+ Add SubagentPool",
      onClick: onAddSubagentPool,
    },
  ];
}
