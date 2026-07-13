// Legit exceptions to the shell-background guard, owned by pupu-ux-designer.
// Format: "relative/path.js:lineNumber". Keep this list short and justified.
export const SHELL_BACKGROUND_ALLOWLIST = [
  // Decorative status/accent colors, NOT shell surfaces — deliberately kept raw this phase.
  "src/COMPONENTs/toolkit/components/toolkit_detail_panel.js:586", // toggle "on" accent #E5484D
  "src/COMPONENTs/agents/pages/characters_page.js:1185",          // red status badge #ef4444
  "src/COMPONENTs/agents/pages/characters_page.js:1200",          // green status badge #22c55e
  "src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js:347",// dirty-save button #4a5bd8
];
