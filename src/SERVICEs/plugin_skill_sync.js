/* plugin_skill_sync — registers toolkit-declared skills (from the toolkit
 * catalog) as slash-commands in command_registry.
 *
 * A skill row looks like:
 *   { name, title, description, body, tools: string[], phase }
 *
 * Each row becomes a command:
 *   name:        "/" + skill.name
 *   source:      "plugin:" + toolkitId   (lowest registration priority —
 *                a builtin or interject command with the same name always
 *                wins; see command_registry's sourceRank)
 *   sourceLabel: the toolkit's display name (attribution in the command menu)
 *   expandsTo:   skill.body with every "{tools}" occurrence baked to the
 *                joined tool list at registration time — the registry
 *                itself knows nothing about placeholders.
 *   availability: gated on the skill's declared phase AND the toolkit being
 *                selected in the current chat.
 */
import { api } from "./api";
import { createLogger } from "./console_logger";
import { registerCommand, unregisterBySource } from "./command_registry";
import { normalizeToolkitIdAlias } from "./toolkit_id_aliases";
import { subscribeToolkitCatalogRefresh } from "./toolkit_catalog_refresh";

const logger = createLogger("COMMANDS", "src/SERVICEs/plugin_skill_sync.js");

const bakeExpandsTo = (body, tools) => {
  const toolsJoined = (Array.isArray(tools) ? tools : []).join(", ");
  return body.split("{tools}").join(toolsJoined);
};

/* Toolkit ids registered by the last syncPluginSkills call — tracked so a
 * toolkit that drops out of the catalog entirely (not merely re-sent with
 * different skills) still gets its stale commands unregistered. */
let previouslySyncedToolkitIds = new Set();

/**
 * Register every toolkit's skills as slash-commands, replacing whatever was
 * previously registered under that toolkit's source. Tolerates null/garbage
 * input (treated as no toolkits).
 */
export const syncPluginSkills = (toolkits) => {
  const list = Array.isArray(toolkits) ? toolkits : [];
  const currentToolkitIds = new Set();

  for (const entry of list) {
    const toolkitId = entry && typeof entry.toolkitId === "string" ? entry.toolkitId : "";
    if (!toolkitId) continue;
    currentToolkitIds.add(toolkitId);

    const source = `plugin:${toolkitId}`;
    unregisterBySource(source);

    const skills = Array.isArray(entry.skills) ? entry.skills : [];
    if (skills.length === 0) continue;

    const normalizedToolkitId = normalizeToolkitIdAlias(toolkitId) || toolkitId;
    const sourceLabel = entry.toolkitName || toolkitId;

    for (const skill of skills) {
      if (!skill || typeof skill !== "object") continue;
      const skillName = typeof skill.name === "string" ? skill.name.trim() : "";
      const body = typeof skill.body === "string" ? skill.body : "";
      if (!skillName || !body) continue;

      // No send path expands streaming/always plugin skills yet — only
      // composer-phase skills are safe to surface as commands this
      // iteration. Backend still accepts the other phases for forward
      // compat; we just don't register them here.
      if (skill.phase !== "composer") {
        logger.debug(
          "skill_phase_deferred",
          `Skipping skill "${skillName}" with unsupported phase "${skill.phase}" (only "composer" registers this iteration)`,
        );
        continue;
      }

      registerCommand({
        name: `/${skillName}`,
        description: skill.description || skill.title || skillName,
        icon: "",
        source,
        sourceLabel,
        expandsTo: bakeExpandsTo(body, skill.tools),
        // skill.phase is guaranteed "composer" here — non-composer phases
        // are filtered out above before reaching registerCommand.
        availability: (ctx) =>
          ctx.phase === skill.phase &&
          ctx.selectedToolkits.includes(normalizedToolkitId),
      });
    }
  }

  // toolkits that were registered last time but dropped out of this catalog
  // entirely (not merely re-sent) still need their stale commands cleared
  for (const staleToolkitId of previouslySyncedToolkitIds) {
    if (!currentToolkitIds.has(staleToolkitId)) {
      unregisterBySource(`plugin:${staleToolkitId}`);
    }
  }
  previouslySyncedToolkitIds = currentToolkitIds;
};

/* Monotonic sequence counter shared by every fetch-and-sync call (initial
 * mount, catalog-refresh broadcasts, and manual resyncs). mcp_install can
 * emit the refresh bus 2-3x per install, so overlapping requests are
 * expected — only the response for the most recently issued fetch is
 * allowed to apply, so a slow older response can never clobber a newer one
 * that already resolved. */
let fetchSequence = 0;

/**
 * Fetch the toolkit catalog once and sync skills from it, guarded so a
 * stale (older) response can never overwrite a newer one that already
 * resolved. A failed fetch logs and leaves the existing registrations
 * untouched — it does NOT clear commands to an empty sync.
 *
 * @param {() => boolean} [isCancelled] — when provided and true after the
 *   fetch resolves, the response is discarded even if it is still the
 *   latest in sequence (used by startPluginSkillSync's cleanup).
 */
const fetchAndSyncPluginSkills = async (isCancelled) => {
  const sequence = ++fetchSequence;
  let payload;
  try {
    payload = await api.unchain.getToolkitCatalog();
  } catch (error) {
    logger.warn(
      "catalog_fetch_failed",
      "Failed to fetch toolkit catalog for plugin skill sync",
      error,
    );
    return;
  }
  if (typeof isCancelled === "function" && isCancelled()) return;
  if (sequence !== fetchSequence) {
    // a newer fetch was issued and already applied (or is about to) —
    // this response is stale, do not let it win the race
    logger.debug(
      "catalog_response_stale",
      "Discarding stale toolkit catalog response superseded by a newer fetch",
    );
    return;
  }
  syncPluginSkills(payload && payload.toolkits);
};

/**
 * Re-fetch the toolkit catalog and re-sync skills from it, sharing the same
 * in-flight/sequence machinery as startPluginSkillSync. Exposed so callers
 * can force a resync outside of the mount + catalog-refresh-bus lifecycle —
 * e.g. once the Flask sidecar transitions from "starting" to "ready" after a
 * cold app start, when the very first catalog fetch may have raced the
 * sidecar and returned an empty/partial catalog.
 */
export const resyncPluginSkills = () => fetchAndSyncPluginSkills();

/**
 * Fetch the toolkit catalog, sync skills from it, and keep syncing on every
 * catalog-refresh broadcast (MCP install/remove, etc). Returns a cleanup
 * function that unsubscribes. A failed fetch logs and leaves the existing
 * registrations untouched — it does NOT clear commands to an empty sync.
 */
export const startPluginSkillSync = () => {
  let cancelled = false;

  const refresh = () => fetchAndSyncPluginSkills(() => cancelled);

  refresh();

  const unsubscribe = subscribeToolkitCatalogRefresh(() => {
    refresh();
  });

  return () => {
    cancelled = true;
    unsubscribe();
  };
};
