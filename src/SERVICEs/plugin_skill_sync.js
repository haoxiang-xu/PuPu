/* plugin_skill_sync — registers skills as slash-commands in command_registry.
 *
 * Ticket #291 P1 audit fix: the toolkit catalog USED to be a second,
 * competing registration authority for skill commands — both `plugin:*` and
 * `skill-inventory` sources carry the same command_registry rank, so
 * whichever fetch (catalog vs inventory) resolved first "won" a duplicate
 * command name, and the outcome depended on request completion order. The
 * backend-authoritative skill inventory (`GET /skills/inventory`) is now the
 * SINGLE authority for skill commands:
 *
 *   - syncPluginSkills: NO LONGER registers any commands from the toolkit
 *     catalog. It only unregisters stale `plugin:<toolkitId>` sources so
 *     any older registration (from before this fix, or a stray caller)
 *     vanishes. Kept (not removed) because startPluginSkillSync still needs
 *     it to track which toolkits are currently installed for that cleanup.
 *   - syncSkillInventory: turns the inventory response into commands
 *     (source "skill-inventory"). Toolkit-embedded `[[skills]]` of
 *     *selected* executable toolkits arrive as inventory entries with
 *     `source: "toolkit"`, `source_id: <toolkit id>`; shadowed/ambiguous
 *     items are reported only in `diagnostics` and therefore never reach
 *     `skills[]` — they never become a command.
 *
 * A skill inventory entry (`pupu.skill_inventory.v1`) looks like:
 *   { id, name, description, source, source_id, aliases: string[],
 *     model_invocable, user_invocable, reserved }
 * See syncSkillInventory for how those become commands.
 */
import { api } from "./api";
import { createLogger } from "./console_logger";
import { isKnownBuiltinIcon } from "./mcp_toolkit_store";
import {
  getCommand,
  registerCommand,
  unregisterBySource,
} from "./command_registry";
import { normalizeToolkitIdAlias } from "./toolkit_id_aliases";
import { subscribeToolkitCatalogRefresh } from "./toolkit_catalog_refresh";
import { applySkillInventory } from "./skill_inventory_store";
import { readWorkspaceRoot } from "../COMPONENTs/settings/runtime";
import { readNamespace, subscribeSettings } from "./settings_repository";
import { getChatsStore, subscribeChatsStore } from "./chat_storage/chat_storage_store";

const logger = createLogger("COMMANDS", "src/SERVICEs/plugin_skill_sync.js");

/**
 * The icon a skill shows in the command menu, chosen by its AUTHOR.
 *
 * Accepted, in precedence order:
 *   skill.icon           — a builtin icon name, bare or as { type, name },
 *                          the same descriptor shape a toolkit already uses
 *   the toolkit's icon    — so a pack that names one icon for itself does not
 *                          have to repeat it on every skill
 *   ""                    — no icon; the row renders without one
 *
 * Admission is CLOSED against the shipped icon manifest. Icons come from a
 * downloaded pack, so an unrecognized name is either a typo or an author
 * expecting an icon PuPu does not have; either way it falls back rather than
 * rendering an empty box, and no author-supplied string ever reaches the DOM
 * as a URL.
 */
const resolveDeclaredIcon = (declared) => {
  if (typeof declared === "string") {
    return isKnownBuiltinIcon(declared) ? declared : "";
  }
  if (declared && typeof declared === "object" && declared.type === "builtin") {
    return isKnownBuiltinIcon(declared.name) ? declared.name : "";
  }
  return "";
};

export const resolveSkillIcon = (skill, toolkitIcon) =>
  resolveDeclaredIcon(skill?.icon) || resolveDeclaredIcon(toolkitIcon);

/* Toolkit ids seen in the last syncPluginSkills call — tracked so a toolkit
 * that drops out of the catalog entirely (not merely re-sent with a
 * different skill set) still gets its stale `plugin:<id>` source cleared. */
let previouslySyncedToolkitIds = new Set();

/**
 * Ticket #291 P1: the toolkit catalog is NO LONGER a registration authority
 * for skill commands — the backend skill inventory (syncSkillInventory) is
 * the single source of truth, so two competing fetches can no longer race
 * to register a duplicate command depending on which resolves first.
 *
 * This function is kept (not removed — callers still invoke it on every
 * catalog fetch/refresh) purely as a cleanup pass: it unregisters every
 * `plugin:<toolkitId>` source for a toolkit present in `toolkits`, and for
 * any toolkit that was tracked from a previous call but has since dropped
 * out of the catalog — so any pre-fix registration (or one made by a caller
 * that has not migrated) is guaranteed to vanish. It never calls
 * registerCommand. Tolerates null/garbage input (treated as no toolkits).
 */
export const syncPluginSkills = (toolkits) => {
  const list = Array.isArray(toolkits) ? toolkits : [];
  const currentToolkitIds = new Set();

  for (const entry of list) {
    const toolkitId = entry && typeof entry.toolkitId === "string" ? entry.toolkitId : "";
    if (!toolkitId) continue;
    currentToolkitIds.add(toolkitId);
    unregisterBySource(`plugin:${toolkitId}`);
  }

  // toolkits that were tracked last time but dropped out of this catalog
  // entirely (not merely re-sent) still need their stale source cleared
  for (const staleToolkitId of previouslySyncedToolkitIds) {
    if (!currentToolkitIds.has(staleToolkitId)) {
      unregisterBySource(`plugin:${staleToolkitId}`);
    }
  }
  previouslySyncedToolkitIds = currentToolkitIds;
};

const SKILL_INVENTORY_SOURCE = "skill-inventory";
// "command" is the same builtin icon category_chip.js and
// skill_pack_detail_page.js already use for the "skill" category — no
// per-entry icon field exists on a `pupu.skill_inventory.v1` row.
const SKILL_INVENTORY_ICON = "command";

/**
 * True when `name` is already registered by a source OTHER than
 * "skill-inventory" or a "plugin:*" toolkit — i.e. a builtin ("/btw") or
 * interject command. Those win on name collision; skill-inventory entries
 * defer to them rather than logging a registerCommand rejection warning for
 * every sync. The "plugin:*" exemption is defensive only since ticket #291
 * P1: syncPluginSkills no longer registers commands, so no live "plugin:*"
 * registration should exist by the time this runs — but if one somehow
 * does (a stray caller, a race during the fix's rollout), it still defers
 * to the inventory rather than silently winning.
 */
const isReservedByHigherPrecedenceSource = (name) => {
  const existing = getCommand(name);
  if (!existing) return false;
  if (existing.source === SKILL_INVENTORY_SOURCE) return false;
  if (typeof existing.source === "string" && existing.source.startsWith("plugin:")) {
    return false;
  }
  return true;
};

/**
 * Register every user-invocable, non-reserved entry of a
 * `pupu.skill_inventory.v1` payload as a slash-command (source
 * "skill-inventory"), replacing whatever skill-inventory registered last
 * time. Each of `entry.aliases` registers too, so a legacy `/name` spelling
 * keeps resolving. `expandsTo` is always "" — the runtime expands `/name`
 * tokens itself; this registry entry exists so the command menu can surface
 * and route it. Tolerates null/garbage input (treated as no skills).
 */
export const syncSkillInventory = (payload) => {
  unregisterBySource(SKILL_INVENTORY_SOURCE);

  const skills = Array.isArray(payload?.skills) ? payload.skills : [];

  const registerOne = (commandName, entry, sourceLabel, sourceToolkitId) => {
    if (isReservedByHigherPrecedenceSource(commandName)) {
      logger.debug(
        "skill_inventory_command_reserved",
        `Skipping "${commandName}" — already owned by a builtin/interject command`,
      );
      return;
    }
    registerCommand({
      name: commandName,
      description: typeof entry.description === "string" ? entry.description : "",
      icon: SKILL_INVENTORY_ICON,
      source: SKILL_INVENTORY_SOURCE,
      sourceLabel,
      sourceToolkitId,
      expandsTo: "",
      availability: (ctx) => ctx.phase === "composer",
    });
  };

  for (const entry of skills) {
    if (!entry || typeof entry !== "object") continue;
    if (entry.user_invocable !== true || entry.reserved === true) continue;

    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    if (!name) continue;

    // Ticket #291 P1: a "toolkit" entry is a selected executable toolkit's
    // embedded [[skills]] surfaced through the inventory (the toolkit
    // catalog no longer registers these itself); "skillpack" is a pure-skill
    // pack. Both are toolkit-identified, so both derive sourceToolkitId from
    // source_id the same way. Any other source (workspace/user skill
    // directories) carries no toolkit identity.
    const isToolkitSourced = entry.source === "toolkit" || entry.source === "skillpack";
    const sourceId = typeof entry.source_id === "string" ? entry.source_id : "";
    const sourceLabel = isToolkitSourced ? sourceId : typeof entry.source === "string" ? entry.source : "";
    const sourceToolkitId = isToolkitSourced
      ? normalizeToolkitIdAlias(sourceId) || sourceId
      : "";

    registerOne(`/${name}`, entry, sourceLabel, sourceToolkitId);

    const aliases = Array.isArray(entry.aliases) ? entry.aliases : [];
    for (const alias of aliases) {
      const aliasName = typeof alias === "string" ? alias.trim() : "";
      if (!aliasName) continue;
      registerOne(`/${aliasName}`, entry, sourceLabel, sourceToolkitId);
    }
  }
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
    // MUST be the v2 catalog (LIST_TOOL_MODAL_CATALOG → /toolkits/catalog/v2).
    // The v1 getToolkitCatalog endpoint returns raw registry rows
    // (name/module/class_name) with no toolkitId and no skills[] — syncing
    // from it silently registers nothing (#/plan-missing root cause).
    payload = await api.unchain.listToolModalCatalog();
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

// The workspace root source every other renderer read reuses (api.unchain.js
// keeps its own private copy of this same read; see getStoredWorkspaceRoot
// there) — never invent a second one.
const readCurrentWorkspaceRoot = () => readWorkspaceRoot();

// P-D7 (ticket #291): `skills.include_user_dirs` in the runtime settings
// namespace, default true.
const readSkillsIncludeUserDirsSetting = () => {
  const runtime = readNamespace("runtime", {});
  const skillsSettings =
    runtime && typeof runtime === "object" && !Array.isArray(runtime)
      ? runtime.skills
      : null;
  return !(
    skillsSettings &&
    typeof skillsSettings === "object" &&
    skillsSettings.include_user_dirs === false
  );
};

// Ticket #291 P1: fetchAndSyncSkillInventory sends the active chat's
// selected EXECUTABLE toolkit ids so the backend's inventory response can
// include their embedded [[skills]] (entries with source: "toolkit"). Reads
// the chats store fresh every call — never cached — mirroring every other
// read in this module.
const readActiveChatSelection = () => {
  const store = getChatsStore();
  const activeChatId =
    store && typeof store.activeChatId === "string" ? store.activeChatId : "";
  const activeChat =
    activeChatId && store.chatsById ? store.chatsById[activeChatId] : null;
  const selectedToolkitIds = Array.isArray(activeChat?.selectedToolkits)
    ? activeChat.selectedToolkits.filter((id) => typeof id === "string" && id)
    : [];
  return { activeChatId, selectedToolkitIds };
};

const readActiveChatSelectedToolkitIds = () =>
  readActiveChatSelection().selectedToolkitIds;

/* Separate sequence counter from fetchSequence above — the toolkit catalog
 * and the skill inventory are fetched independently and must not race each
 * other's staleness check. */
let skillInventoryFetchSequence = 0;

/* Snapshot of the request context used by the most recently ISSUED
 * fetchAndSyncSkillInventory call (updated whether or not it eventually
 * succeeds) — startSkillInventorySync's settings/chats-store listeners
 * compare their fresh reads against this to decide whether anything that
 * would change the inventory response actually changed. `null` before the
 * first call. */
let lastSkillInventoryFetchContext = null;

const sortedIds = (ids) => [...ids].sort();
const sortedIdsEqual = (a, b) => {
  const left = sortedIds(a || []);
  const right = sortedIds(b || []);
  return left.length === right.length && left.every((id, i) => id === right[i]);
};

/**
 * Fetch `GET /skills/inventory` once and sync `/name` commands from it,
 * guarded the same way fetchAndSyncPluginSkills is: a stale (older) response
 * can never clobber a newer one that already resolved, and a failed fetch —
 * or a payload that fails skill_inventory_store's schema validation — logs
 * and leaves the existing registrations untouched.
 *
 * @param {{workspaceRoot?: string, includeUserDirs?: boolean, toolkits?: string[], isCancelled?: () => boolean}} [params] —
 *   workspaceRoot/includeUserDirs default to the current renderer state
 *   (readWorkspaceRoot / skills.include_user_dirs) read fresh on each call;
 *   toolkits (ticket #291 P1) defaults to the active chat's selected
 *   executable toolkit ids (empty array when there is no active chat or no
 *   selection); isCancelled mirrors fetchAndSyncPluginSkills's parameter.
 */
export const fetchAndSyncSkillInventory = async ({
  workspaceRoot = readCurrentWorkspaceRoot(),
  includeUserDirs = readSkillsIncludeUserDirsSetting(),
  toolkits = readActiveChatSelectedToolkitIds(),
  isCancelled,
} = {}) => {
  const sequence = ++skillInventoryFetchSequence;
  const requestToolkits = Array.isArray(toolkits)
    ? toolkits.filter((id) => typeof id === "string" && id)
    : [];
  // Record the context for THIS fetch attempt immediately (not only on
  // success) so a refresh-gap listener never keeps re-triggering for the
  // same unchanged values while a fetch is in flight or has just failed.
  lastSkillInventoryFetchContext = {
    workspaceRoot,
    includeUserDirs,
    activeChatId: readActiveChatSelection().activeChatId,
    selectedToolkitIds: sortedIds(requestToolkits),
  };
  let payload;
  try {
    payload = await api.unchain.getSkillInventory({
      workspaceRoot,
      includeUserDirs,
      toolkits: requestToolkits,
    });
  } catch (error) {
    logger.warn(
      "skill_inventory_fetch_failed",
      "Failed to fetch skill inventory for skill-inventory command sync",
      error,
    );
    return;
  }
  if (typeof isCancelled === "function" && isCancelled()) return;
  if (sequence !== skillInventoryFetchSequence) {
    logger.debug(
      "skill_inventory_response_stale",
      "Discarding stale skill inventory response superseded by a newer fetch",
    );
    return;
  }
  if (!applySkillInventory(payload, { workspaceRoot, includeUserDirs })) {
    logger.warn(
      "skill_inventory_invalid_payload",
      "Skill inventory response failed schema validation; keeping existing registrations",
    );
    return;
  }
  syncSkillInventory(payload);
};

/**
 * Re-fetch the skill inventory and re-sync commands from it, sharing the
 * same sequence machinery as startPluginSkillSync. Exposed for the same
 * cold-start-race reason as resyncPluginSkills.
 */
export const resyncSkillInventory = () => fetchAndSyncSkillInventory();

/**
 * Fetch the toolkit catalog, sync skills from it, and keep syncing on every
 * catalog-refresh broadcast (MCP install/remove, etc). Returns a cleanup
 * function that unsubscribes. A failed fetch logs and leaves the existing
 * registrations untouched — it does NOT clear commands to an empty sync.
 *
 * Ticket #291 P1: this no longer also fetches/syncs the skill inventory —
 * see startSkillInventorySync, which owns that lifecycle exclusively so the
 * two backend sources can never race each other for a command name again.
 */
export const startPluginSkillSync = () => {
  let cancelled = false;

  const refresh = () => {
    fetchAndSyncPluginSkills(() => cancelled);
  };

  refresh();

  const unsubscribe = subscribeToolkitCatalogRefresh(() => {
    refresh();
  });

  return () => {
    cancelled = true;
    unsubscribe();
  };
};

// Ticket #291 "refresh gap": debounce window shared by every trigger below,
// so a burst of settings/chats-store/catalog events collapses into one
// fetch rather than one per event.
const SKILL_INVENTORY_REFRESH_DEBOUNCE_MS = 150;

/* Module-singleton stop function — startSkillInventorySync is idempotent:
 * calling it again while already running returns the SAME stop function
 * instead of creating a second set of subscriptions. */
let activeSkillInventorySyncStop = null;

/**
 * Keep the skill inventory (and the `/name` commands it produces) fresh
 * across everything that can change its result, not only "the next send
 * fails with a stale-revision 409" (the previous safety net). Idempotent —
 * a second call while already running returns the existing stop function.
 *
 * Fetches once immediately, then re-fetches (debounced 150ms so a burst of
 * events collapses into one request) whenever:
 *   (a) a `runtime` settings change alters `readWorkspaceRoot()` or
 *       `runtime.skills.include_user_dirs` since the last fetch;
 *   (b) the chats store reports a different active chat id or a different
 *       (order-independent) set of the active chat's `selectedToolkits`
 *       since the last fetch;
 *   (c) the existing toolkit-catalog-refresh broadcast fires (MCP
 *       install/remove, etc — the trigger startPluginSkillSync used to own).
 *
 * fetchAndSyncSkillInventory's own sequence guard still discards any
 * response superseded by a newer fetch before it can apply.
 *
 * @returns {() => void} stop — tears down every subscription and cancels
 *   any pending debounced fetch. Safe to call multiple times.
 */
export const startSkillInventorySync = () => {
  if (activeSkillInventorySyncStop) {
    return activeSkillInventorySyncStop;
  }

  let cancelled = false;
  let debounceTimer = null;

  const scheduleRefresh = () => {
    if (cancelled) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      if (cancelled) return;
      fetchAndSyncSkillInventory({ isCancelled: () => cancelled });
    }, SKILL_INVENTORY_REFRESH_DEBOUNCE_MS);
  };

  // initial fetch — immediate, not debounced, mirroring startPluginSkillSync
  fetchAndSyncSkillInventory({ isCancelled: () => cancelled });

  const unsubscribeCatalog = subscribeToolkitCatalogRefresh(() => {
    scheduleRefresh();
  });

  const unsubscribeSettings = subscribeSettings(({ namespace } = {}) => {
    if (namespace !== "runtime") return;
    const workspaceRoot = readCurrentWorkspaceRoot();
    const includeUserDirs = readSkillsIncludeUserDirsSetting();
    const last = lastSkillInventoryFetchContext;
    const changed =
      !last ||
      workspaceRoot !== last.workspaceRoot ||
      includeUserDirs !== last.includeUserDirs;
    if (changed) scheduleRefresh();
  });

  const unsubscribeChats = subscribeChatsStore(() => {
    const { activeChatId, selectedToolkitIds } = readActiveChatSelection();
    const last = lastSkillInventoryFetchContext;
    const changed =
      !last ||
      activeChatId !== last.activeChatId ||
      !sortedIdsEqual(selectedToolkitIds, last.selectedToolkitIds);
    if (changed) scheduleRefresh();
  });

  activeSkillInventorySyncStop = () => {
    cancelled = true;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    unsubscribeCatalog();
    unsubscribeSettings();
    unsubscribeChats();
    activeSkillInventorySyncStop = null;
  };

  return activeSkillInventorySyncStop;
};
