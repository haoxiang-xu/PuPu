// Legit exceptions to the shell-background guard, owned by pupu-ux-designer.
// Format: { file, anchor } — anchor is a distinctive substring of the allowed
// line. Content-anchored, immune to line-number drift (P0 2026-08-01; the old
// "path:line" form rotted silently — 3 dead entries were removed that day).
// Keep this list short and justified.
export const SHELL_BACKGROUND_ALLOWLIST = [
  // Decorative status/accent colors, NOT shell surfaces — deliberately kept raw this phase.
  {
    file: "src/COMPONENTs/agents/pages/characters_page.js",
    anchor: 'background: "#ef4444"',
  }, // red status badge
  {
    file: "src/COMPONENTs/agents/pages/characters_page.js",
    anchor: 'background: "#22c55e"',
  }, // green status badge
  {
    file: "src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js",
    anchor: 'dirty ? "#4a5bd8"',
  }, // dirty-save button
  {
    file: "src/COMPONENTs/agents/pages/recipes_page/subagent_picker.js",
    anchor: 'inlineName.trim() ? "#4a5bd8"',
  }, // brand "Add" button, same accent as recipe_canvas
  // Asymmetric input-surface overlay, NOT the modal card — textarea highlight
  // (translucent dark tint / solid light backing), left for a future
  // input-surface pass.
  {
    file: "src/COMPONENTs/settings/dev/components/mcp_registries_modal.js",
    anchor: '"rgba(255,255,255,0.04)" : "#fff"',
  },
];
