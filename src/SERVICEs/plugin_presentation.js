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

/**
 * Extracts the first sentence from text
 * Splits on . ! ? 或 （Chinese）。
 */
function extractFirstSentence(text) {
  if (!text) return "";
  const match = text.match(/^[^.!?。]*[.!?。]/);
  const sentence = match ? match[0] : text;
  return sentence;
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

  // Convert tools to canDo, avoiding function names
  const canDo = (tools || [])
    .map((tool) => {
      const title = tool.title || tool.name || "";
      if (!title) return null;
      // If title is already set, capitalize first letter; if using name, convert snake_case
      if (tool.title) {
        return tool.title.charAt(0).toUpperCase() + tool.title.slice(1);
      }
      return snakeToCaseTitle(tool.name);
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
  if (!sourceConfig && source.startsWith("mcp")) {
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
    icon: entry.icon,
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
