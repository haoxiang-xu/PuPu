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
  "src/COMPONENTs/agents/pages/characters_page.js",
  "src/COMPONENTs/agents/pages/recipes_page/recipe_canvas.js",
  "src/COMPONENTs/agents/pages/recipes_page/recipe_list.js",
  // P3 — settings + init-setup shells (2026-07-13)
  "src/COMPONENTs/settings/settings_modal.js",
  "src/COMPONENTs/settings/local_storage/components/confirm_delete_modal.js",
  "src/COMPONENTs/settings/local_storage/components/confirm_reset_settings_modal.js",
  "src/COMPONENTs/init-setup/init_setup_modal.js",
  "src/COMPONENTs/init-setup/steps/welcoming.js",
  "src/COMPONENTs/init-setup/steps/select_providers.js",
  "src/COMPONENTs/init-setup/steps/configure_providers.js",
  "src/COMPONENTs/init-setup/steps/workspace.js",
  "src/COMPONENTs/init-setup/steps/completion.js",
  // P4 Task 1 — modal card background migration (2026-07-14)
  "src/COMPONENTs/workspace/workspace_modal.js",
  "src/COMPONENTs/agents/pages/recipes_page/subagent_picker.js",
  "src/COMPONENTs/settings/dev/components/mcp_registries_modal.js",
  "src/COMPONENTs/settings/model_providers/components/confirm_delete_api_key_modal.js",
  "src/COMPONENTs/settings/settings_modal_content.js",
  "src/COMPONENTs/ui-testing/ui_testing_modal.js",
  "src/COMPONENTs/memory-inspect/memory_inspect_modal.js",
  // F1 — agents modal card, missed in the P4 Task 1 sweep (2026-07-14)
  "src/COMPONENTs/agents/agents_modal.js",
  // P5 — plugins/toolkit UI (was an exclusion zone during the theme waves;
  // concurrent owner shipped, now enrolled) (2026-07-17)
  "src/COMPONENTs/toolkit/toolkit_modal.js",
  "src/COMPONENTs/toolkit/plugins_shell.js",
  "src/COMPONENTs/toolkit/pages/plugin_detail_page.js",
  "src/COMPONENTs/toolkit/pages/plugins_installed_page.js",
  "src/COMPONENTs/toolkit/pages/plugins_categories_page.js",
  "src/COMPONENTs/toolkit/pages/plugins_discover_page.js",
  "src/COMPONENTs/toolkit/pages/custom_mcp_page.js",
];

// A line is a candidate if it BOTH mentions a background sink (a `background:` /
// `backgroundColor:` style key OR a `…Background…` / `…Bg` variable) AND carries
// an OPAQUE color literal. This catches both inline JSX styles and the
// `const xBackground = isDark ? "#…" : "#…"` indirection. Semi-transparent
// overlays (rgba alpha < 1) and any line already using a --pupu-* var are allowed.
const BG_HINT = /background|[A-Za-z]Bg\b|\bbg\b/i;
const OPAQUE_LITERAL =
  /#[0-9a-fA-F]{3,6}\b|rgb\([^)]*\)|rgba\([^)]*,\s*1(\.0+)?\s*\)/;

const anchorMatchCount = (lines, anchor) =>
  lines.filter((l) => l.includes(anchor)).length;

const scan = (rel) => {
  const abs = path.join(process.cwd(), rel);
  const lines = fs.readFileSync(abs, "utf8").split("\n");
  /* An anchor exempts a line only if it matches EXACTLY ONE line in the file.
     Both failure directions are then closed: a rotted anchor (0 matches) and a
     copy-pasted twin of an exempted site (2+ matches) each stop exempting
     anything, so the new violation surfaces. The "path:line" form this
     replaced was fail-OPEN on drift — a stale number silently exempted
     whatever text later occupied that line. */
  const uniqueAnchors = SHELL_BACKGROUND_ALLOWLIST.filter(
    (e) => e.file === rel && anchorMatchCount(lines, e.anchor) === 1,
  );
  const hits = [];
  lines.forEach((line, i) => {
    if (!BG_HINT.test(line)) return;
    if (line.includes("var(--pupu-")) return;
    if (!OPAQUE_LITERAL.test(line)) return;
    if (uniqueAnchors.some((e) => line.includes(e.anchor))) return;
    const key = `${rel}:${i + 1}`;
    hits.push(`${key}  ${line.trim()}`);
  });
  return hits;
};

test("no raw opaque background literals in shell files", () => {
  const violations = SHELL_FILES.flatMap(scan);
  expect(violations).toEqual([]);
});

// Exactly one, not at-least-one: 0 means the anchor rotted (the site moved or
// was migrated — delete the entry), 2+ means the exempted idiom got copied to
// a second site that nobody adjudicated (tighten the anchor, or justify and
// split the entry). Either way the exemption stops applying until a human
// looks, which is what keeps the allowlist honest.
test("every allowlist entry anchors exactly one line in its file", () => {
  const bad = SHELL_BACKGROUND_ALLOWLIST.map((e) => {
    const abs = path.join(process.cwd(), e.file);
    const n = anchorMatchCount(fs.readFileSync(abs, "utf8").split("\n"), e.anchor);
    return n === 1 ? null : `${e.file} :: ${e.anchor} → ${n} matches`;
  }).filter(Boolean);
  expect(bad).toEqual([]);
});
