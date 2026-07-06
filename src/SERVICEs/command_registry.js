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
  availability = () => true,
  insertText,
}) => {
  if (!name || typeof name !== "string" || !name.startsWith("/")) {
    throw new Error(
      `registerCommand: "name" must be a string starting with "/" (got ${JSON.stringify(name)})`,
    );
  }
  registry.set(name, {
    name,
    description,
    availability: typeof availability === "function" ? availability : () => true,
    insertText: insertText ?? `${name} `,
  });
};

/**
 * List commands available in `ctx`, filtered by case-insensitive name
 * prefix. Ordering is stable (registration order for ties — Map preserves
 * insertion order, and Array#filter preserves relative order).
 *
 * @param {{isStreaming?: boolean}} ctx
 * @param {string} prefix — e.g. "/", "/b" — matched case-insensitively
 *   against the command name. Empty/undefined prefix returns all
 *   available commands.
 */
export const listCommands = (ctx = {}, prefix = "") => {
  const normalizedPrefix = String(prefix || "").toLowerCase();
  return Array.from(registry.values())
    .filter((cmd) => cmd.name.toLowerCase().startsWith(normalizedPrefix))
    .filter((cmd) => {
      try {
        return !!cmd.availability(ctx);
      } catch {
        return false;
      }
    })
    .map(({ name, description, insertText }) => ({
      name,
      description,
      insertText,
    }));
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
  availability: interjectAvailability,
});

registerCommand({
  name: "/fyi",
  description: "补充给当前任务",
  availability: interjectAvailability,
});

registerCommand({
  name: "/steer",
  description: "本轮结束后执行",
  availability: interjectAvailability,
});
