import ToolkitIcon, {
  isBuiltinToolkitIcon,
  isFileToolkitIcon,
} from "../../toolkit/components/toolkit_icon";

const TOOLKIT_SELECTOR_ICON_BOX_SIZE = 24;
const TOOLKIT_SELECTOR_BUILTIN_ICON_SIZE = 16;
const TOOLKIT_SELECTOR_FILE_ICON_SIZE = 22;

const toDisplayName = (toolkit) => {
  const raw =
    toolkit?.toolkitName ||
    toolkit?.class_name ||
    toolkit?.name ||
    toolkit?.toolkitId ||
    "Unknown Toolkit";

  return String(raw)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
};

const toSelectionValue = (toolkit) => {
  const toolkitId =
    typeof toolkit?.toolkitId === "string" ? toolkit.toolkitId.trim() : "";
  if (toolkitId) {
    return toolkitId;
  }

  const className =
    typeof toolkit?.class_name === "string" ? toolkit.class_name.trim() : "";
  if (className) {
    return className;
  }

  const name = typeof toolkit?.name === "string" ? toolkit.name.trim() : "";
  return name;
};

const summarizeTools = (tools) => {
  const shown = tools
    .slice(0, 5)
    .map((tool) => tool?.title || tool?.name || "")
    .filter(Boolean);
  const overflow = tools.length > 5 ? ` +${tools.length - 5}` : "";
  return shown.length > 0 ? shown.join(", ") + overflow : undefined;
};

const buildToolkitOptionIcon = (toolkitIcon) => {
  const fallbackColor = "#64748b";

  if (isFileToolkitIcon(toolkitIcon)) {
    return (
      <ToolkitIcon
        icon={toolkitIcon}
        size={TOOLKIT_SELECTOR_FILE_ICON_SIZE}
        fallbackColor={fallbackColor}
        style={{ borderRadius: 6 }}
      />
    );
  }

  const backgroundColor = isBuiltinToolkitIcon(toolkitIcon)
    ? toolkitIcon?.backgroundColor || "rgba(148,163,184,0.14)"
    : "rgba(148,163,184,0.14)";

  return (
    <span
      aria-hidden="true"
      style={{
        width: TOOLKIT_SELECTOR_ICON_BOX_SIZE,
        height: TOOLKIT_SELECTOR_ICON_BOX_SIZE,
        borderRadius: 6,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor,
        flexShrink: 0,
      }}
    >
      <ToolkitIcon
        icon={toolkitIcon}
        size={TOOLKIT_SELECTOR_BUILTIN_ICON_SIZE}
        fallbackColor={fallbackColor}
      />
    </span>
  );
};

/**
 * Converts toolkit catalog entries into Select-compatible options.
 *
 * Each toolkit becomes a flat option with:
 *   - value: selection ID compatible with persisted chat state
 *   - label: toolkitName from toolkit.toml when available
 *   - description: toolkit description, falling back to summarized tools
 *   - search: display name + id + description + tool names
 *   - icon: toolkit icon payload rendered for the selector row
 *
 * @param {Array<object>} toolkits — filtered toolkit list
 * @returns {Array<object>}
 */
export const build_toolkit_options = (toolkits) => {
  if (!Array.isArray(toolkits)) return [];

  return toolkits.map((tk) => {
    const tools = Array.isArray(tk.tools) ? tk.tools : [];
    const label = toDisplayName(tk);
    const value = toSelectionValue(tk);
    const toolkitDescription =
      typeof tk?.toolkitDescription === "string"
        ? tk.toolkitDescription.trim()
        : "";
    const toolSummary = summarizeTools(tools);
    const search = [...new Set(
      [
        label,
        tk?.toolkitId,
        tk?.class_name,
        value,
        toolkitDescription,
        ...tools.map((tool) => tool?.title || tool?.name || ""),
      ].filter(Boolean),
    )].join(" ");

    return {
      value,
      label,
      description: toolkitDescription || toolSummary,
      search,
      icon: buildToolkitOptionIcon(tk?.toolkitIcon),
    };
  });
};

export default build_toolkit_options;
