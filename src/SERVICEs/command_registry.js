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
 *     availability: (ctx) => boolean   — ctx has at least { isStreaming }
 *     insertText?:  string   — text written into the input on pick;
 *                              defaults to `${name} ` when omitted
 *   }
 */

const registry = new Map();

/**
 * Register (or overwrite) a command entry. Registering the same `name`
 * again replaces the previous entry — this keeps the registry idempotent
 * for hot-reload / re-registration scenarios.
 */
export const registerCommand = ({
  name,
  description = "",
  icon = "",
  availability = () => true,
  insertText,
  exclusiveGroup = "",
}) => {
  if (!name || typeof name !== "string" || !name.startsWith("/")) {
    throw new Error(
      `registerCommand: "name" must be a string starting with "/" (got ${JSON.stringify(name)})`,
    );
  }
  registry.set(name, {
    name,
    description,
    icon,
    availability: typeof availability === "function" ? availability : () => true,
    insertText: insertText ?? `${name} `,
    exclusiveGroup,
  });
};

/**
 * List commands available in `ctx`, filtered by case-insensitive name
 * prefix. Ordering is stable (registration order for ties — Map preserves
 * insertion order, and Array#filter preserves relative order).
 *
 * @param {{isStreaming?: boolean, activeCommands?: string[]}} ctx —
 *   `activeCommands` lists command names already present in the message;
 *   commands sharing a non-empty `exclusiveGroup` with any of them are
 *   filtered out (a message holds ONE command per exclusive group — e.g.
 *   fyi/btw/steer are all "interject-channel" — while commands from
 *   different groups may coexist).
 * @param {string} prefix — e.g. "/", "/b" — matched case-insensitively
 *   against the command name. Empty/undefined prefix returns all
 *   available commands.
 */
export const listCommands = (ctx = {}, prefix = "") => {
  const normalizedPrefix = String(prefix || "").toLowerCase();
  const activeNames = Array.isArray(ctx.activeCommands)
    ? ctx.activeCommands.map((n) => String(n).toLowerCase())
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
        return !!cmd.availability(ctx);
      } catch {
        return false;
      }
    })
    .map(({ name, description, icon, insertText, exclusiveGroup }) => ({
      name,
      description,
      icon,
      insertText,
      exclusiveGroup,
    }));
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
 * Returns [{start, end, name, icon, exclusiveGroup, active}] for every
 * syntactic token found (active and inactive alike, so renderers can decide
 * what to highlight). `end` is exclusive and does NOT include the trailing
 * whitespace.
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
      active,
    });
  }
  return tokens;
};

/**
 * Strip the ACTIVE command tokens out of `text` (collapsing the whitespace
 * they occupied) and report them — the caller uses the active commands for
 * routing and sends the remaining body as the message content.
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
  return { commands: tokens.map((t) => t.name), body };
};

/** Test/debug helper — clears all registered commands. */
export const _clearCommandsForTest = () => {
  registry.clear();
};

/* ── Built-in seed: interject commands ─────────────────────────────────── */

const interjectAvailability = (ctx) => !!ctx?.isStreaming;

registerCommand({
  name: "/btw",
  description: "立即回答,不打断当前任务",
  icon: "btw",
  availability: interjectAvailability,
  exclusiveGroup: "interject-channel",
});

registerCommand({
  name: "/fyi",
  description: "补充给当前任务",
  icon: "fyi",
  availability: interjectAvailability,
  exclusiveGroup: "interject-channel",
});

registerCommand({
  name: "/steer",
  description: "本轮结束后执行",
  icon: "steer_arrow",
  availability: interjectAvailability,
  exclusiveGroup: "interject-channel",
});
