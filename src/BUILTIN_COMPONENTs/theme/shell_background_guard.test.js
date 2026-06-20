// src/BUILTIN_COMPONENTs/theme/shell_background_guard.test.js
import fs from "fs";
import path from "path";
import { SHELL_BACKGROUND_ALLOWLIST } from "./shell_background_allowlist";

const SHELL_FILES = [
  "src/COMPONENTs/side-menu/side_menu.js",
  "src/COMPONENTs/side-menu/side_menu_components.js",
  "src/COMPONENTs/chat-input/chat_input.js",
  "src/COMPONENTs/chat-input/components/attach_panel.js",
  // P1 — verified real paths (2026-06-20)
  "src/COMPONENTs/toolkit/components/toolkit_detail_panel.js",
  "src/COMPONENTs/agents/pages/characters_page.js",
  "src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js",
  "src/COMPONENTs/agents/pages/recipes_page/recipe_list.js",
];

// A line is a candidate if it BOTH mentions a background sink (a `background:` /
// `backgroundColor:` style key OR a `…Background…` / `…Bg` variable) AND carries
// an OPAQUE color literal. This catches both inline JSX styles and the
// `const xBackground = isDark ? "#…" : "#…"` indirection. Semi-transparent
// overlays (rgba alpha < 1) and any line already using a --pupu-* var are allowed.
const BG_HINT = /background|[A-Za-z]Bg\b|\bbg\b/i;
const OPAQUE_LITERAL =
  /#[0-9a-fA-F]{3,6}\b|rgb\([^)]*\)|rgba\([^)]*,\s*1(\.0+)?\s*\)/;

const scan = (rel) => {
  const abs = path.join(process.cwd(), rel);
  const lines = fs.readFileSync(abs, "utf8").split("\n");
  const hits = [];
  lines.forEach((line, i) => {
    if (!BG_HINT.test(line)) return;
    if (line.includes("var(--pupu-")) return;
    if (!OPAQUE_LITERAL.test(line)) return;
    const key = `${rel}:${i + 1}`;
    if (SHELL_BACKGROUND_ALLOWLIST.includes(key)) return;
    hits.push(`${key}  ${line.trim()}`);
  });
  return hits;
};

test("no raw opaque background literals in shell files", () => {
  const violations = SHELL_FILES.flatMap(scan);
  expect(violations).toEqual([]);
});
