import { document_problems } from "./skeleton_document";

/* What a Subagent Pool node holds, and what the runtime refuses.
 *
 * `subagent_config.py`'s `validate_subagent_pool_config`, mirrored rule by
 * rule, with the Python line each rule comes from. The frozen answers are
 * `subagent_pool_admission_capture`, enumerated from the validator against
 * the fixed installation pair rather than written from a reading of it.
 *
 * This mirror is not a convenience. The capture's second half records which
 * boundary says anything at all about a pool's configuration, and the answer
 * is: none of the ones the author meets while editing. The format check
 * accepts any `config` object, so `save_draft` stores a broken pool without a
 * word; `diagnose_skeleton_draft` — the list this panel's notices are built
 * from — returns nothing for it; and so does the structural execution gate.
 * The refusal arrives from `prepare_agent_graph`, which PuPu reaches only
 * through `SkeletonResourceStore.preflight`, when the author presses Run. So
 * if this editor does not say it, nothing says it until then.
 *
 * The runtime raises on the first problem; this collects them all, because an
 * editor that reports one fault per attempt makes a pool something the author
 * discovers by repeated rejection.
 *
 * One boundary, stated rather than hidden: an *embedded* Agent is a whole
 * document, and this answers for it only as far as the envelope every
 * document shares (`document_problems`, the same format layer) plus the three
 * rules that decide whether a graph is an Agent graph at all. Whether its
 * Kernel is configured is the child's own panel's subject, and the row says
 * so. `prepare_agent_graph` does refuse an unconfigured child at Run; nothing
 * here claims otherwise. */

export const SUBAGENTS_CONFIG_KEY = "subagents";

/* `_MODES`, `_OUTPUT_MODES`, `_MEMORY_POLICIES` (`subagent_config.py:11-13`). */
export const SUBAGENT_MODES = Object.freeze(["delegate", "handoff", "worker"]);
export const SUBAGENT_OUTPUT_MODES = Object.freeze([
  "summary",
  "last_message",
  "full_trace",
]);
export const SUBAGENT_MEMORY_POLICIES = Object.freeze([
  "ephemeral",
  "scoped_persistent",
]);

/* The entry is CLOSED to exactly these (`subagent_config.py:56-59`): every
   one required, nothing else admitted. A legacy `recipe_ref` beside them is
   an unknown field, not a reference. */
export const SUBAGENT_ENTRY_KEYS = Object.freeze([
  "id",
  "name",
  "description",
  "source",
  "allowed_modes",
  "output_mode",
  "memory_policy",
  "parallel_safe",
  "allowed_tools",
  "disabled_tools",
]);

export const SUBAGENT_SOURCE_KINDS = Object.freeze(["agent_ref", "embedded"]);

const TOOL_LIST_KEYS = Object.freeze(["allowed_tools", "disabled_tools"]);

const is_object = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function problem(code, where, message) {
  return { code, where, message };
}

/* The runtime's path, written the way every other problem in this editor
   writes one: `config.subagents[0].source.agent_id`. */
export function pool_where(path) {
  return path.reduce(
    (text, step) => (typeof step === "number" ? `${text}[${step}]` : `${text}.${step}`),
    "",
  ).replace(/^\./, "");
}

/* `_closed` (`:21-30`): the object, then its missing keys, then its extra
   ones. The runtime names only the alphabetically first of each; this names
   all of them. */
function closed(value, path, required, problems) {
  if (!is_object(value)) {
    problems.push(problem("invalid_type", pool_where(path), "value must be an object"));
    return false;
  }
  required.forEach((key) => {
    if (!(key in value)) {
      problems.push(
        problem("missing_field", pool_where([...path, key]), "required field is missing"),
      );
    }
  });
  Object.keys(value).forEach((key) => {
    if (!required.includes(key)) {
      problems.push(problem("unknown_field", pool_where([...path, key]), "unknown field"));
    }
  });
  return true;
}

/* `_text` (`:32-37`): a string, and not a blank one. */
function text(value, path, label, problems) {
  if (typeof value !== "string") {
    problems.push(problem("invalid_type", pool_where(path), `${label} must be a string`));
    return false;
  }
  if (!value.trim()) {
    problems.push(problem("invalid_value", pool_where(path), `${label} must be non-empty`));
    return false;
  }
  return true;
}

/* `:88-97`. `allowed_tools` may be `null`, which is "every tool"; nothing
   else may be, and an empty list is a real answer meaning "no tool". */
function tool_list(value, path, field, problems) {
  if (field === "allowed_tools" && value === null) return;
  const usable =
    Array.isArray(value) &&
    value.every((tool) => typeof tool === "string" && tool.trim());
  if (!usable) {
    problems.push(
      problem("invalid_type", pool_where(path), `${field} must contain non-empty strings`),
    );
    return;
  }
  if (new Set(value).size !== value.length) {
    problems.push(
      problem("duplicate_name", pool_where(path), `${field} contains duplicates`),
    );
  }
}

/* `prepare_agent_graph`'s own first questions of an embedded document.
 *
 * The first is the one this whole node is about: `if snapshot["kind"] !=
 * "agent"` → `wrong_kind` (`agent_preparation.py:21-22`). A complete, legal,
 * pure Workflow is a perfectly good document, and the envelope has no
 * objection to it — a Workflow is refused there only for holding an Agent
 * node — so nothing but this says that a Subagent Pool may not hold one.
 * Which is exactly what this mirror missed: the pool's own headline rule,
 * passing silently for the one document shape that states it.
 *
 * Asked only of `workflow`, because that is the only other kind the envelope
 * admits: an absent or unrecognised kind is already refused there, and the
 * runtime never reaches this question for it.
 *
 * Then the ticket's definition of a subagent: a complete Agent graph with its
 * own Start, End and at least one Kernel Loop (`validation.py:43-49`). The
 * rest of a graph's structure — reachability, outlets, cycles — is the
 * child's own subject and is not re-derived here. */
function agent_graph_problems(child, path, problems) {
  if (child.kind === "workflow") {
    problems.push(
      problem(
        "wrong_kind",
        pool_where([...path, "kind"]),
        "Agent preparation requires agent kind",
      ),
    );
  }
  const nodes = Array.isArray(child.nodes) ? child.nodes : [];
  const count = (type) =>
    nodes.filter((node) => is_object(node) && node.type === type).length;
  const at = pool_where([...path, "nodes"]);
  if (count("start") !== 1) {
    problems.push(problem("start_count", at, "graph requires exactly one start node"));
  }
  if (count("end") !== 1) {
    problems.push(problem("end_count", at, "graph requires exactly one end node"));
  }
  if (child.kind === "agent" && count("agent") === 0) {
    problems.push(problem("agent_required", at, "agent graph requires an agent node"));
  }
}

/* `:99-111`. A source says where the Agent comes from, and the two kinds are
   each closed. `kind` missing or not a string is reported against the source
   itself rather than against `kind`, which is what the runtime does. */
function source_problems(source, path, problems) {
  if (!is_object(source) || typeof source.kind !== "string") {
    problems.push(
      problem("invalid_type", pool_where(path), "subagent source must be an object with kind"),
    );
    return;
  }
  if (source.kind === "agent_ref") {
    if (!closed(source, path, ["kind", "agent_id"], problems)) return;
    if ("agent_id" in source) {
      text(source.agent_id, [...path, "agent_id"], "Agent resource id", problems);
    }
    return;
  }
  if (source.kind === "embedded") {
    if (!closed(source, path, ["kind", "document"], problems)) return;
    if (!("document" in source)) return;
    const child_path = [...path, "document"];
    if (!is_object(source.document)) {
      problems.push(
        problem("invalid_type", pool_where(child_path), "embedded Agent must be an object"),
      );
      return;
    }
    /* The same format layer every document is read through, under the path
       the runtime would report it at. */
    const prefix = pool_where(child_path);
    document_problems(source.document).forEach((found) => {
      problems.push(
        problem(found.code, `${prefix}${found.where.replace(/^document/, "")}`, found.message),
      );
    });
    agent_graph_problems(source.document, child_path, problems);
    return;
  }
  problems.push(
    problem(
      "unknown_variant",
      pool_where([...path, "kind"]),
      "subagent source must be agent_ref or embedded",
    ),
  );
}

/* A new entry, with every field written out.
 *
 * The contract plan's words for this boundary: the product's default values
 * are written explicitly by the producer and never silently supplied by the
 * consumer. The UI composing a definition *is* a producer, so an entry it
 * creates carries all ten fields, and they are the same defaults the store
 * writes when it converts a legacy pool (`_subagent_entry`,
 * `skeleton_resource_store.py:287-301`) — a hand-made entry and a converted
 * one are then the same object, rather than two dialects of one wire.
 *
 * `allowed_tools: null` is "every tool", which is not the same as `[]`, "no
 * tool". `disabled_tools` may not be null at all. */
export function new_subagent_entry({ id, name, agent_id }) {
  return {
    id,
    name,
    description: "",
    source: { kind: "agent_ref", agent_id },
    allowed_modes: ["delegate", "worker"],
    output_mode: "summary",
    memory_policy: "ephemeral",
    parallel_safe: true,
    allowed_tools: null,
    disabled_tools: [],
  };
}

/* An id and a name nothing in this pool is using. Both are unique per pool
   (`:66-69`), and the composer is never handed a collision — the same rule
   the schema editor's field names follow, for the same reason: the document
   cannot hold two entries with one name, so there is no resolution that is
   not a choice about which of the author's two entries to destroy. */
export function free_entry_id(taken) {
  const used = Array.isArray(taken) ? taken : [];
  for (let n = 1; n <= used.length + 1; n += 1) {
    const candidate = `subagent-${n}`;
    if (!used.includes(candidate)) return candidate;
  }
  return `subagent-${used.length + 2}`;
}

export function free_entry_name(taken, base) {
  const used = Array.isArray(taken) ? taken : [];
  const wanted = typeof base === "string" && base.trim() ? base : "Subagent";
  if (!used.includes(wanted)) return wanted;
  for (let n = 2; n <= used.length + 2; n += 1) {
    const candidate = `${wanted} ${n}`;
    if (!used.includes(candidate)) return candidate;
  }
  return `${wanted} ${used.length + 3}`;
}

/* How many entries claim each name, or each id.
 *
 * Counted rather than collected: "this value already collides" and "it
 * collides this many times" are different facts, and only the second can tell
 * a repair that leaves two duplicates from an edit that makes a third. An
 * entry that states neither takes no part — a draft can hold `null` where an
 * entry should be, and it claims nothing. */
export function entry_claims(list, key) {
  const counts = new Map();
  (Array.isArray(list) ? list : []).forEach((entry) => {
    if (!is_object(entry) || typeof entry[key] !== "string") return;
    counts.set(entry[key], (counts.get(entry[key]) || 0) + 1);
  });
  return counts;
}

/* Whether a write would make the pool's two unique fields worse than it found
 * them.
 *
 * Not "whether the result has duplicates". A saved draft can hold three
 * entries with one id — the store's format check asks nothing of a pool's
 * contents — and refusing every list that still held a duplicate refused the
 * first repair too, because removing one of three leaves two. Entry ids have
 * no edit control, so removal is the only repair there is, and it was the one
 * blocked; an unrelated edit elsewhere in the pool was blocked with it.
 *
 * So the rule is about claims: a value may end up claimed once, always, and
 * beyond that only as many times as it already was. A removal always passes,
 * an edit that touches neither field always passes, and nothing can add a
 * claim to a name or an id that is already taken. */
export function introduces_collision(before, next) {
  return ["name", "id"].some((key) => {
    const held = entry_claims(before, key);
    return [...entry_claims(next, key).entries()].some(
      ([value, count]) => count > Math.max(held.get(value) || 0, 1),
    );
  });
}

export function subagent_pool_problems(config, base = ["config"]) {
  const problems = [];
  if (!closed(config, base, [SUBAGENTS_CONFIG_KEY], problems)) return problems;
  const path = [...base, SUBAGENTS_CONFIG_KEY];
  const entries = config[SUBAGENTS_CONFIG_KEY];
  if (!Array.isArray(entries)) {
    if (SUBAGENTS_CONFIG_KEY in config) {
      problems.push(problem("invalid_type", pool_where(path), "subagents must be an array"));
    }
    return problems;
  }
  /* `:51-52`. An empty pool is not an incomplete pool the runtime tolerates:
     it is refused, because a pool that holds nothing cannot be what a Kernel
     attaches to. */
  if (entries.length === 0) {
    problems.push(
      problem("missing_value", pool_where(path), "subagent pool must contain an Agent"),
    );
    return problems;
  }
  const ids = new Set();
  const names = new Set();
  entries.forEach((entry, index) => {
    const entry_path = [...path, index];
    if (!closed(entry, entry_path, SUBAGENT_ENTRY_KEYS, problems)) return;
    const has = (key) => key in entry;
    if (has("id") && text(entry.id, [...entry_path, "id"], "subagent id", problems)) {
      if (ids.has(entry.id)) {
        problems.push(
          problem("duplicate_name", pool_where([...entry_path, "id"]), "subagent id is duplicated"),
        );
      }
      ids.add(entry.id);
    }
    if (has("name") && text(entry.name, [...entry_path, "name"], "subagent name", problems)) {
      if (names.has(entry.name)) {
        problems.push(
          problem("duplicate_name", pool_where([...entry_path, "name"]), "subagent name is duplicated"),
        );
      }
      names.add(entry.name);
    }
    if (has("description") && typeof entry.description !== "string") {
      problems.push(
        problem("invalid_type", pool_where([...entry_path, "description"]), "description must be a string"),
      );
    }
    if (has("allowed_modes")) {
      const modes = entry.allowed_modes;
      const where = pool_where([...entry_path, "allowed_modes"]);
      /* `:75-77`. An empty list is `invalid_type` here rather than a missing
         value — the runtime asks both questions in one expression. */
      if (!Array.isArray(modes) || modes.length === 0) {
        problems.push(problem("invalid_type", where, "allowed_modes must be a non-empty array"));
      } else if (
        modes.some((mode) => typeof mode !== "string" || !SUBAGENT_MODES.includes(mode))
      ) {
        problems.push(problem("unknown_variant", where, "allowed_modes contains an unknown mode"));
      } else if (new Set(modes).size !== modes.length) {
        problems.push(problem("duplicate_name", where, "allowed_modes contains duplicates"));
      }
    }
    if (has("output_mode") && !SUBAGENT_OUTPUT_MODES.includes(entry.output_mode)) {
      problems.push(
        problem("unknown_variant", pool_where([...entry_path, "output_mode"]), "output_mode is unknown"),
      );
    }
    if (has("memory_policy") && !SUBAGENT_MEMORY_POLICIES.includes(entry.memory_policy)) {
      problems.push(
        problem("unknown_variant", pool_where([...entry_path, "memory_policy"]), "memory_policy is unknown"),
      );
    }
    if (has("parallel_safe") && typeof entry.parallel_safe !== "boolean") {
      problems.push(
        problem("invalid_type", pool_where([...entry_path, "parallel_safe"]), "parallel_safe must be a boolean"),
      );
    }
    TOOL_LIST_KEYS.forEach((field) => {
      if (has(field)) tool_list(entry[field], [...entry_path, field], field, problems);
    });
    /* `:96-97`. Named on both lists at once is a contradiction the author has
       to resolve, and it is reported against the disabled list because that
       is the one the runtime names. */
    if (
      Array.isArray(entry.allowed_tools) &&
      Array.isArray(entry.disabled_tools) &&
      entry.allowed_tools.some((tool) => entry.disabled_tools.includes(tool))
    ) {
      problems.push(
        problem(
          "invalid_value",
          pool_where([...entry_path, "disabled_tools"]),
          "a tool cannot be both allowed and disabled",
        ),
      );
    }
    if (has("source")) source_problems(entry.source, [...entry_path, "source"], problems);
  });
  return problems;
}
