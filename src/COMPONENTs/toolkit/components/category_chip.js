import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";

/* CategoryChip — the colored category glyph used by the Store page's
   type-segment control (design authority: 2026-07-17 store-final mockup,
   revised same day: CEO dropped the gradient background squares — the glyph
   itself is now tinted with the category color, no backdrop). The three hues
   are the agents recipe-graph node-color family (green/purple/indigo)
   already used elsewhere in the app for Toolkits/MCP/Skills. */
const CATEGORY_CHIP_CONFIG = {
  toolkit: { color: "#4cbe8b", icon: "tool" },
  mcp: { color: "#8a8cee", icon: "mcp" },
  skill: { color: "#6478f6", icon: "command" },
};

const CategoryChip = ({ type }) => {
  const config = CATEGORY_CHIP_CONFIG[type];
  if (!config) return null;
  return (
    <Icon
      src={config.icon}
      color={config.color}
      style={{ width: 13, height: 13, flexShrink: 0 }}
    />
  );
};

export default CategoryChip;
