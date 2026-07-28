import { SOURCE_CONFIG } from "../COMPONENTs/toolkit/constants";
import curation from "./plugin_store_curation.json";

/**
 * Converts snake_case to Sentence case
 * e.g., "plan_start" -> "Plan start"
 */
function snakeToCaseTitle(text) {
  return text
    .split("_")
    .join(" ")
    .replace(/^\w/, (c) => c.toUpperCase());
}

/* Taglines render on tiles at fixed width — an uncapped first sentence can
   run long enough to blow past the two-line clamp plugin_tile.js applies,
   so the source text itself is capped here (word-boundary aware, no
   mid-word cuts) rather than relying on CSS alone. */
const TAGLINE_MAX_LENGTH = 64;

function capTagline(text) {
  if (text.length <= TAGLINE_MAX_LENGTH) return text;
  const truncated = text.slice(0, TAGLINE_MAX_LENGTH);
  const lastSpace = truncated.lastIndexOf(" ");
  const base = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return `${base.trimEnd()}…`;
}

/**
 * Extracts the first sentence from text
 * Splits on . ! ? 或 （Chinese）。
 */
function extractFirstSentence(text) {
  if (!text) return "";
  const match = text.match(/^[^.!?。]*[.!?。]/);
  const sentence = match ? match[0] : text;
  return capTagline(sentence);
}

/**
 * Converts catalog entry to plugin presentation shape
 */
export function toPluginPresentation(entry) {
  const {
    toolkitId = "",
    toolkitName = "",
    toolkitDescription = "",
    source = "builtin",
    tools = [],
    skills = [],
    tags = [],
  } = entry;

  // Convert skills to commands
  const commands = (skills || []).map((skill) => ({
    name: "/" + (skill.name || ""),
    title: skill.title || "",
    description: skill.description || "",
  }));

  // Convert tools to canDo, avoiding function names. Each item is
  // {label, confirm} — `confirm` is the structured successor to the old
  // inline "label ⚠" string suffix: the settings-isomorphic About section
  // (plugin_detail_page.js) renders these as a tag cloud and needs the
  // confirm flag separately from the label to style the ⚠ marker on its
  // own (color, spacing) rather than baking it into the text.
  const canDo = (tools || [])
    .map((tool) => {
      const title = tool.title || tool.name || "";
      if (!title) return null;
      // If title is already set, capitalize first letter; if using name, convert snake_case
      const label = tool.title
        ? tool.title.charAt(0).toUpperCase() + tool.title.slice(1)
        : snakeToCaseTitle(tool.name);
      return { label, confirm: Boolean(tool.requiresConfirmation) };
    })
    .filter((item) => item !== null);

  // Extract tagline
  const tagline = extractFirstSentence(toolkitDescription);

  // Map source to provider label
  const sourceMapping = {
    builtin: "PuPu built-in",
    mcp: "MCP server",
    local: "Local",
  };
  const providerLabel = sourceMapping[source] || source;

  // Build information rows
  const information = [{ k: "Provider", v: providerLabel }];

  // Add confirmation requirement row if any tool requires confirmation
  const confirmationTools = (tools || [])
    .filter((tool) => tool.requiresConfirmation)
    .map((tool) => {
      const titleOrName = tool.title || tool.name;
      if (!titleOrName) return null;
      // If we're using title, capitalize first letter; if using name, convert snake_case
      if (tool.title) {
        return tool.title.charAt(0).toUpperCase() + tool.title.slice(1);
      }
      return snakeToCaseTitle(tool.name);
    })
    .filter(Boolean);

  if (confirmationTools.length > 0) {
    information.push({
      k: "Requires confirmation",
      v: confirmationTools.join(", "),
    });
  }

  // Get SOURCE_CONFIG for badge (map 'source' value to config key)
  let sourceConfig = SOURCE_CONFIG[source];
  if (!sourceConfig && String(source || "").startsWith("mcp")) {
    sourceConfig = SOURCE_CONFIG.mcp;
  }

  const sourceBadge = sourceConfig
    ? {
        label: source === "builtin" ? "PuPu Built-in" : source.toUpperCase(),
        color: sourceConfig.color,
        bg: sourceConfig.bg,
      }
    : {
        label: source,
        color: "#999",
        bg: "rgba(153,153,153,0.12)",
      };

  return {
    id: toolkitId,
    name: toolkitName,
    tagline,
    category: tags?.[0] || "general",
    sourceBadge,
    icon: entry.toolkitIcon,
    commands,
    canDo,
    information,
    commandCount: commands.length,
  };
}

/**
 * Loads store curation data with safe fallbacks
 */
export function loadStoreCuration() {
  try {
    // Validate curation structure
    if (!curation || typeof curation !== "object") {
      return { featured: null, essentials: [], collections: [] };
    }

    const { featured, essentials = [], collections = [] } = curation;

    // Validate featured
    const validatedFeatured =
      featured &&
      featured.pluginId &&
      featured.gradient &&
      Array.isArray(featured.gradient) &&
      featured.gradient.length === 2
        ? featured
        : null;

    // Validate essentials
    const validatedEssentials = Array.isArray(essentials)
      ? essentials.filter((id) => typeof id === "string")
      : [];

    // Validate collections
    const validatedCollections = Array.isArray(collections)
      ? collections.filter(
          (col) =>
            col &&
            typeof col === "object" &&
            col.id &&
            col.title &&
            Array.isArray(col.pluginIds) &&
            Array.isArray(col.gradient) &&
            col.gradient.length === 2,
        )
      : [];

    return {
      featured: validatedFeatured,
      essentials: validatedEssentials,
      collections: validatedCollections,
    };
  } catch (e) {
    // Return safe shape on any error
    return { featured: null, essentials: [], collections: [] };
  }
}
