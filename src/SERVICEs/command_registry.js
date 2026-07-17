import { createLogger } from "./console_logger";

/**
 * command_registry — slash-command registry for the chat input.
 *
 * Minimal seed for what will grow into PuPu's main command system: the data
 * shape is designed so future user-defined commands and MCP-provided
 * commands are added as additional `registerCommand()` entries, never a
 * rewrite of this module.
 *
 * A command entry:
 *   {
 *     name:         string   — includes the leading "/", e.g. "/btw"
 *     description:  string   — short human-readable description
 *     availability: (ctx) => boolean   — ctx is normalized with:
 *                              { phase: 'composer'|'streaming',
 *                                selectedToolkits: string[] }
 *     insertText?:  string   — text written into the input on pick;
 *                              defaults to `${name} ` when omitted
 *     channel?:     string   — protocol channel the command routes to
 *                              (e.g. "btw"/"fyi"/"queue"); "" when the
 *                              command has no channel semantic. Consumers
 *                              MUST read this field instead of deriving a
 *                              channel from the command name, so renaming
 *                              a command never touches the wire protocol.
 *     source?:      string   — registration source (default "builtin");
 *                              determines priority: builtin(0) > interject(1)
 *                              > plugin:*(2). Used for conflict resolution.
 *     sourceLabel?: string   — human-readable attribution for the source
 *                              (e.g. a plugin's display name); "" when the
 *                              command carries no external attribution.
 *     expandsTo?:   string   — optional expansion target (default "")
 *   }
 */

const logger = createLogger("COMMANDS", "src/SERVICEs/command_registry.js");

const registry = new Map();

/**
 * Normalize the availability ctx before handing it to command predicates:
 * - phase: explicit "composer"/"streaming" wins; otherwise derived from
 *   isStreaming (true → streaming, else composer)
 * - selectedToolkits: always an array (defaults to [])
 */
const normalizeCtx = (ctx = {}) => {
  const phase =
    ctx.phase === "composer" || ctx.phase === "streaming"
      ? ctx.phase
      : ctx.isStreaming
        ? "streaming"
        : "composer";
  return {
    ...ctx,
    phase,
    selectedToolkits: Array.isArray(ctx.selectedToolkits)
      ? ctx.selectedToolkits
      : [],
  };
};

/* provider priority: lower rank wins a name conflict */
const sourceRank = (source) => {
  if (source === "builtin") return 0;
  if (source === "interject") return 1;
  return 2; // "plugin:<toolkitId>" and anything else
};

/**
 * Register (or overwrite) a command entry. Registering the same `name`
 * again with the same source replaces the previous entry — this keeps the
 * registry idempotent for hot-reload / re-registration scenarios. Higher-priority
 * sources can replace lower-priority ones; lower-priority sources cannot replace
 * higher-priority ones and return false.
 */
export const registerCommand = ({
  name,
  description = "",
  icon = "",
  availability = () => true,
  insertText,
  exclusiveGroup = "",
  channel = "",
  source = "builtin",
  sourceLabel = "",
  expandsTo = "",
}) => {
  if (!name || typeof name !== "string" || !name.startsWith("/")) {
    throw new Error(
      `registerCommand: "name" must be a string starting with "/" (got ${JSON.stringify(name)})`,
    );
  }

  // Resolve case-insensitively to find existing entry
  const lowerName = name.toLowerCase();
  const resolvedKey = findRegisteredName(lowerName);
  const existing = registry.get(resolvedKey);

  if (existing && existing.source !== source) {
    if (sourceRank(source) >= sourceRank(existing.source)) {
      logger.warn(
        "register_conflict",
        `${name} from ${source} rejected — already owned by ${existing.source}`,
      );
      return false;
    }
    logger.warn(
      "register_override",
      `${name} from ${source} replaces lower-priority ${existing.source}`,
    );
  }

  // Delete old key if storing under a different case
  if (existing && resolvedKey !== name) {
    registry.delete(resolvedKey);
  }

  registry.set(name, {
    name,
    description,
    icon,
    availability: typeof availability === "function" ? availability : () => true,
    insertText: insertText ?? `${name} `,
    exclusiveGroup,
    channel: typeof channel === "string" ? channel : "",
    source,
    sourceLabel: typeof sourceLabel === "string" ? sourceLabel : "",
    expandsTo: typeof expandsTo === "string" ? expandsTo : "",
  });
  return true;
};

/**
 * List commands available in `ctx`, filtered by case-insensitive name
 * prefix. Ordering is stable (registration order for ties — Map preserves
 * insertion order, and Array#filter preserves relative order).
 *
 * @param {{phase?: 'composer'|'streaming', isStreaming?: boolean, activeCommands?: string[], selectedToolkits?: string[]}} ctx —
 *   Context is normalized before use: phase defaults to derived from isStreaming;
 *   selectedToolkits defaults to []; activeCommands lists command names already
 *   present in the message; commands sharing a non-empty `exclusiveGroup` with
 *   any of them are filtered out (a message holds ONE command per exclusive group —
 *   e.g. fyi/btw/queue are all "interject-channel" — while commands from
 *   different groups may coexist).
 * @param {string} prefix — e.g. "/", "/b" — matched case-insensitively
 *   against the command name. Empty/undefined prefix returns all
 *   available commands.
 */
export const listCommands = (ctx = {}, prefix = "") => {
  const normalizedCtx = normalizeCtx(ctx);
  const normalizedPrefix = String(prefix || "").toLowerCase();
  const activeNames = Array.isArray(normalizedCtx.activeCommands)
    ? normalizedCtx.activeCommands.map((n) => String(n).toLowerCase())
    : [];
  const blockedGroups = new Set(
    activeNames
      .map((n) => registry.get(findRegisteredName(n))?.exclusiveGroup)
      .filter(Boolean),
  );
  return Array.from(registry.values())
    .filter((cmd) => cmd.name.toLowerCase().startsWith(normalizedPrefix))
    .filter(
      (cmd) => !(cmd.exclusiveGroup && blockedGroups.has(cmd.exclusiveGroup)),
    )
    .filter((cmd) => {
      try {
        return !!cmd.availability(normalizedCtx);
      } catch {
        return false;
      }
    })
    .map(
      ({ name, description, icon, insertText, exclusiveGroup, channel, sourceLabel }) => ({
        name,
        description,
        icon,
        insertText,
        exclusiveGroup,
        channel,
        sourceLabel,
      }),
    );
};

const findRegisteredName = (lowerName) => {
  for (const key of registry.keys()) {
    if (key.toLowerCase() === lowerName) return key;
  }
  return lowerName;
};

/**
 * Scan free text for command tokens (word-boundary "/cmd" occurrences,
 * followed by whitespace or end-of-text) and resolve which ones take effect
 * under the exclusive-group rule: scanning left to right, a token is ACTIVE
 * if its command is available in `ctx` and no earlier active token occupies
 * the same non-empty exclusiveGroup; otherwise it stays plain text.
 *
 * Returns [{start, end, name, icon, exclusiveGroup, channel, active}] for
 * every syntactic token found (active and inactive alike, so renderers can
 * decide what to highlight). `end` is exclusive and does NOT include the
 * trailing whitespace.
 */
export const findCommandTokens = (text, ctx = {}) => {
  if (typeof text !== "string" || !text) return [];
  const tokens = [];
  const takenGroups = new Set();
  const re = /(^|\s)(\/[a-zA-Z0-9_-]+)(?=\s|$)/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const raw = match[2];
    const start = match.index + match[1].length;
    const def =
      listCommands(ctx, raw.toLowerCase()).find(
        (item) => item.name.toLowerCase() === raw.toLowerCase(),
      ) || null;
    if (!def) continue;
    const group = def.exclusiveGroup || "";
    const active = !group || !takenGroups.has(group);
    if (active && group) takenGroups.add(group);
    tokens.push({
      start,
      end: start + raw.length,
      name: def.name,
      icon: def.icon,
      exclusiveGroup: group,
      channel: def.channel || "",
      active,
    });
  }
  return tokens;
};

/**
 * Strip the ACTIVE command tokens out of `text` (collapsing the whitespace
 * they occupied) and report them — the caller uses the active commands for
 * routing and sends the remaining body as the message content.
 *
 * `commands` entries are {name, channel} — routing consumers read `channel`
 * (the registry's protocol field), never parse the name.
 */
export const extractCommands = (text, ctx = {}) => {
  const tokens = findCommandTokens(text, ctx).filter((t) => t.active);
  if (tokens.length === 0) return { commands: [], body: text ?? "" };
  let body = "";
  let cursor = 0;
  for (const token of tokens) {
    body += text.slice(cursor, token.start);
    cursor = token.end;
    // swallow ONE whitespace character following the token, if any
    if (/\s/.test(text[cursor] || "")) cursor += 1;
  }
  body += text.slice(cursor);
  return {
    commands: tokens.map((t) => ({ name: t.name, channel: t.channel })),
    body,
  };
};

/**
 * Like extractCommands, but active commands that declare a non-empty
 * `expandsTo` template contribute that template (in token order) ahead of
 * the remaining user text, joined by blank lines. Commands without a
 * template still strip from the text (their names remain in `commands`
 * for routing). Returned body is trimmed.
 */
export const expandCommands = (text, ctx = {}) => {
  const { commands, body } = extractCommands(text, ctx);
  if (commands.length === 0) return { commands, body };
  const templates = commands
    .map((cmd) => registry.get(cmd.name)?.expandsTo || "")
    .map((template) => template.trim())
    .filter(Boolean);
  const joined = [...templates, body.trim()].filter(Boolean).join("\n\n");
  return { commands, body: joined };
};

/** Remove every command registered under `source` (e.g. "plugin:mcp.notion"). */
export const unregisterBySource = (source) => {
  for (const [name, entry] of registry.entries()) {
    if (entry.source === source) registry.delete(name);
  }
};

/** Case-insensitive lookup; returns the projected entry or null. */
export const getCommand = (name) => {
  const entry = registry.get(findRegisteredName(String(name || "").toLowerCase()));
  if (!entry) return null;
  const { availability, ...projected } = entry;
  return { ...projected };
};

/** Test/debug helper — clears all registered commands. */
export const _clearCommandsForTest = () => {
  registry.clear();
};

/* ── Built-in seed: interject commands ─────────────────────────────────── */

const interjectAvailability = (ctx) => ctx.phase === "streaming";

registerCommand({
  name: "/btw",
  description: "commands.btw",
  icon: "btw",
  availability: interjectAvailability,
  exclusiveGroup: "interject-channel",
  channel: "btw",
  source: "interject",
});

registerCommand({
  name: "/fyi",
  description: "commands.fyi",
  icon: "fyi",
  availability: interjectAvailability,
  exclusiveGroup: "interject-channel",
  channel: "fyi",
  source: "interject",
});

registerCommand({
  name: "/queue",
  description: "commands.queue",
  icon: "queue_arrow",
  availability: interjectAvailability,
  exclusiveGroup: "interject-channel",
  channel: "queue",
  source: "interject",
});
