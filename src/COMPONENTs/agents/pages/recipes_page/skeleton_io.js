/* What the builder writes for a node's inputs and outputs.
 *
 * PuPu is the producer here: the panels compose these objects and the Skeleton
 * runtime validates and evaluates them. Every object below is CLOSED on the
 * consumer side — an unknown key is rejected, not ignored — so they are built
 * field by field rather than spread from whatever the panel happens to hold.
 *
 * Shapes read from `unchain/skeleton/io.py` on 2026-09-27. They are pinned by
 * this module's tests, so a drift fails here rather than at a user's first run.
 * The producer → strict-consumer contract test still needs the pinned build
 * artifact, and until that exists nothing here is evidence that a document is
 * accepted — only that the builder emits the shape it claims to. */

/* A policy says what happens when the upstream value is ABSENT. It is not a
 * type constraint: `error` does not forbid an explicit null — a resolved null
 * is a value and passes — and `default` applies only on absence. The labels
 * therefore name the behaviour; "Required" and "Nullable" would read as claims
 * about what the value may be. */
export const MISSING_POLICIES = Object.freeze([
  {
    value: "error",
    label: "Fail if missing",
    description: "The run stops here when the value is not there.",
  },
  {
    value: "null",
    label: "Use null if missing",
    description: "The consumer receives null, never an empty string.",
  },
  {
    value: "default",
    label: "Use a default if missing",
    description: "The stated value is substituted, only when nothing arrives.",
  },
]);

export const MISSING_POLICY_VALUES = Object.freeze(
  MISSING_POLICIES.map((policy) => policy.value),
);

export function missing_policy(value) {
  return MISSING_POLICIES.find((policy) => policy.value === value) || null;
}

/* ── Value expressions ──────────────────────────────────────────────────── */

export function literal_expression(value) {
  return { kind: "literal", value };
}

export function ref_expression(node_id, path) {
  return { kind: "ref", node_id, path: Array.isArray(path) ? [...path] : [] };
}

/* Takes the first expression that resolves, which is how an input reads from
 * whichever of several upstream nodes actually ran. Two is the minimum: one
 * would just be that expression. */
export function first_present_expression(values) {
  return { kind: "first_present", values: Array.isArray(values) ? [...values] : [] };
}

export const EXPRESSION_KINDS = Object.freeze([
  "literal",
  "ref",
  "first_present",
]);

/* ── Bindings ───────────────────────────────────────────────────────────── */

/* `default` is present only for the default policy — beside any other it is an
 * unknown field, so it is never carried along "just in case". */
export function make_binding({ name, value, missing, default_value }) {
  const binding = { name, value, missing };
  if (missing === "default") binding.default = default_value;
  return binding;
}

export function binding_default(binding) {
  return binding && binding.missing === "default" ? binding.default : undefined;
}

/* Changing the policy has to rebuild the object rather than assign onto it,
 * because leaving a stale `default` behind is a rejected document. */
export function with_missing_policy(binding, missing, default_value) {
  return make_binding({
    name: binding && binding.name,
    value: binding && binding.value,
    missing,
    default_value:
      missing === "default"
        ? default_value !== undefined
          ? default_value
          : binding_default(binding)
        : undefined,
  });
}

/* ── Output mappings ────────────────────────────────────────────────────── */

export const OUTPUT_SOURCE_KINDS = Object.freeze(["input", "result"]);

/* There is no type on the wire: an exported value carries the type of what it
 * came from. The `{name, type}` rows the legacy `.recipe` format still stores
 * are a different shape, and adopting Skeleton migrates them rather than
 * adding a source beside the type. */
export function make_output_mapping({ name, kind, path }) {
  return {
    name,
    source: { kind, path: Array.isArray(path) ? [...path] : [] },
  };
}

/* ── What the builder must not emit ─────────────────────────────────────── */

const PATH_ITEM = (item) =>
  typeof item === "string" ||
  (typeof item === "number" && Number.isInteger(item) && item >= 0);

function path_problem(path, where) {
  if (!Array.isArray(path)) return { code: "invalid_type", where, message: "path must be an array" };
  const bad = path.findIndex((item) => !PATH_ITEM(item));
  if (bad !== -1) {
    return {
      code: "invalid_path",
      where: `${where}[${bad}]`,
      message: "path item must be a string or a non-negative integer",
    };
  }
  return null;
}

function expression_problem(expression, where) {
  if (!expression || typeof expression !== "object") {
    return { code: "invalid_type", where, message: "value must be an object" };
  }
  const { kind } = expression;
  if (!EXPRESSION_KINDS.includes(kind)) {
    return { code: "unknown_variant", where, message: "unknown value expression" };
  }
  if (kind === "ref") {
    if (typeof expression.node_id !== "string" || !expression.node_id) {
      return { code: "invalid_value", where: `${where}.node_id`, message: "node_id must be a non-empty string" };
    }
    return path_problem(expression.path, `${where}.path`);
  }
  if (kind === "first_present") {
    const values = expression.values;
    if (!Array.isArray(values) || values.length < 2) {
      return {
        code: "invalid_value",
        where: `${where}.values`,
        message: "first_present requires at least two values",
      };
    }
    for (let i = 0; i < values.length; i += 1) {
      const problem = expression_problem(values[i], `${where}.values[${i}]`);
      if (problem) return problem;
    }
  }
  return null;
}

/* A local mirror of the rules the runtime enforces, so the panel can refuse to
 * compose a document the runtime would reject, and say which row is at fault.
 * It is not a substitute for that validator — it never decides admission, it
 * only keeps the builder from producing something it already knows is wrong. */
export function binding_problems(bindings) {
  const problems = [];
  const seen = new Set();
  (Array.isArray(bindings) ? bindings : []).forEach((binding, index) => {
    const where = `bindings[${index}]`;
    if (typeof binding?.name !== "string" || !binding.name) {
      problems.push({ code: "invalid_value", where: `${where}.name`, message: "name must be a non-empty string" });
    } else if (seen.has(binding.name)) {
      problems.push({ code: "duplicate_name", where: `${where}.name`, message: "binding name is duplicated" });
    } else {
      seen.add(binding.name);
    }
    if (!MISSING_POLICY_VALUES.includes(binding?.missing)) {
      problems.push({ code: "invalid_value", where: `${where}.missing`, message: "unknown missing policy" });
    } else if (binding.missing === "default" && !("default" in binding)) {
      problems.push({ code: "missing_field", where: `${where}.default`, message: "default policy requires default" });
    } else if (binding.missing !== "default" && "default" in binding) {
      problems.push({ code: "unknown_field", where: `${where}.default`, message: "default is only allowed for default policy" });
    }
    const problem = expression_problem(binding?.value, `${where}.value`);
    if (problem) problems.push(problem);
  });
  return problems;
}

export function output_mapping_problems(mappings) {
  const problems = [];
  const seen = new Set();
  (Array.isArray(mappings) ? mappings : []).forEach((mapping, index) => {
    const where = `mappings[${index}]`;
    if (typeof mapping?.name !== "string" || !mapping.name) {
      problems.push({ code: "invalid_value", where: `${where}.name`, message: "name must be a non-empty string" });
    } else if (seen.has(mapping.name)) {
      problems.push({ code: "duplicate_name", where: `${where}.name`, message: "output name is duplicated" });
    } else {
      seen.add(mapping.name);
    }
    const source = mapping?.source;
    if (!source || typeof source !== "object") {
      problems.push({ code: "invalid_type", where: `${where}.source`, message: "source must be an object" });
      return;
    }
    if (!OUTPUT_SOURCE_KINDS.includes(source.kind)) {
      problems.push({ code: "unknown_variant", where: `${where}.source.kind`, message: "source must be input or result" });
    }
    const problem = path_problem(source.path, `${where}.source.path`);
    if (problem) problems.push(problem);
  });
  return problems;
}

/* ── What the editor can safely take apart ──────────────────────────────── */

/* A node's config is opaque to the envelope, so a draft whose expression is
 * the wrong shape — `values` a string rather than an array, a literal holding
 * an object, a kind nobody knows — saves and loads unchanged. The editor has
 * to render it anyway.
 *
 * The danger is not only the crash. Spreading a string into a new source list
 * yields one entry per character, and coercing an object literal through a
 * text box replaces it with "[object Object]": both silently rewrite what the
 * author wrote into something else. So an expression the controls cannot take
 * apart is shown as it is and left alone until the author replaces it
 * deliberately. */
const MAX_EXPRESSION_DEPTH = 8;

/* The segments the picker can put in an option key and read back. Anything
 * else — an object, a negative index, a fraction — is ordinary JSON the
 * envelope admits and the runtime rejects with `invalid_path`, and coercing it
 * through a template string throws before the row can say so. */
function path_is_usable(path) {
  return (
    Array.isArray(path) &&
    path.every(
      (part) =>
        typeof part === "string" ||
        (typeof part === "number" && Number.isInteger(part) && part >= 0),
    )
  );
}

/* The same question for an output mapping, and for the same reason: a draft
   whose `source` is a string or whose `path` is an object saves and loads
   unchanged, and every control below would rewrite it into something the
   author never typed. `name` is excluded deliberately — a row with a bad name
   is still a row whose source can be fixed, and the name box corrects itself
   the moment it is typed in. */
export function output_mapping_is_editable(mapping) {
  if (!mapping || typeof mapping !== "object") return false;
  const source = mapping.source;
  if (!source || typeof source !== "object") return false;
  if (!OUTPUT_SOURCE_KINDS.includes(source.kind)) return false;
  return path_is_usable(source.path);
}

export function expression_is_editable(expression, depth = 0) {
  if (depth > MAX_EXPRESSION_DEPTH) return false;
  if (!expression || typeof expression !== "object") return false;
  switch (expression.kind) {
    case "literal":
      return typeof expression.value === "string";
    case "ref":
      return typeof expression.node_id === "string" && path_is_usable(expression.path);
    case "first_present":
      /* A candidate the picker cannot render makes the whole row unusable, so
       * the check goes all the way down rather than stopping at the array. */
      return (
        Array.isArray(expression.values) &&
        expression.values.every((entry) => expression_is_editable(entry, depth + 1))
      );
    default:
      return false;
  }
}

/* The original value, readable, for a row that cannot offer controls. */
export function expression_summary(expression) {
  if (expression === undefined) return "(nothing)";
  try {
    const text = JSON.stringify(expression);
    return text === undefined ? String(expression) : text;
  } catch (error) {
    return String(expression);
  }
}
