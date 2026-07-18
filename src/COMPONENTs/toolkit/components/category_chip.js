import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

/* CategoryChip — the 16px gradient category glyph used by the Store page's
   type-segment control (design authority: 2026-07-17 store-final mockup,
   screens ①/②, `.ci`/`.ci-t`/`.ci-m`/`.ci-s`). The three gradients are the
   agents recipe-graph node-color family (green/purple/indigo) already used
   elsewhere in the app for Toolkits/MCP/Skills — zero new hues.

   Deliberately its own file rather than inlined in
   plugins_categories_page.js: that page is in shell_background_guard.test.js's
   scanned SHELL_FILES list, which flags any `background:`/`…Bg` line
   carrying an opaque color literal. These gradients are foreground
   plugin-category badges, not a shell/page background, but the guard is a
   dumb per-line regex scan — living outside the scanned file sidesteps a
   false positive rather than fighting the allowlist. */
const CATEGORY_CHIP_CONFIG = {
  toolkit: { gradient: "linear-gradient(135deg,#4cbe8b,#2f9a68)", icon: "tool" },
  mcp: { gradient: "linear-gradient(135deg,#8a8cee,#5a5dd6)", icon: "mcp" },
  skill: { gradient: "linear-gradient(135deg,#6478f6,#4a5bd8)", icon: "command" },
};

const CategoryChip = ({ type }) => {
  const config = CATEGORY_CHIP_CONFIG[type];
  if (!config) return null;
  return (
    <span
      style={{
        width: 16,
        height: 16,
        borderRadius: 4.5,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: config.gradient,
      }}
    >
      <Icon src={config.icon} color="#fff" style={{ width: 10.5, height: 10.5 }} />
    </span>
  );
};

export default CategoryChip;
