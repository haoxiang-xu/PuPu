// Legit exceptions to the shell-background guard, owned by pupu-ux-designer.
// Format: "relative/path.js:lineNumber". Keep this list short and justified.
export const SHELL_BACKGROUND_ALLOWLIST = [
  // Decorative status/accent colors, NOT shell surfaces — deliberately kept raw this phase.
  "src/COMPONENTs/agents/pages/characters_page.js:1185",          // red status badge #ef4444
  "src/COMPONENTs/agents/pages/characters_page.js:1200",          // green status badge #22c55e
  "src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js:347",// dirty-save button #4a5bd8
  "src/COMPONENTs/agents/pages/recipes_page/subagent_picker.js:161",// brand "Add" button #4a5bd8, same accent as recipe_canvas
  // Asymmetric input-surface overlay, NOT the modal card — textarea highlight
  // (translucent dark tint / solid light backing), left for a future input-surface pass.
  "src/COMPONENTs/settings/dev/components/mcp_registries_modal.js:374",
];
