export function buildRecipeCanvasContextMenuItems({
  onAddAgent,
  onAddToolPool,
  onAddSubagentPool,
}) {
  return [
    {
      id: "add_agent",
      label: "Add Blank Agent",
      prefix_icon: "add",
      icon: "bot",
      onClick: onAddAgent,
    },
    {
      id: "add_toolkit_pool",
      label: "Add ToolkitPool",
      prefix_icon: "add",
      icon: "tool",
      onClick: onAddToolPool,
    },
    {
      id: "add_subagent_pool",
      label: "Add SubagentPool",
      prefix_icon: "add",
      icon: "shapes",
      onClick: onAddSubagentPool,
    },
  ];
}
