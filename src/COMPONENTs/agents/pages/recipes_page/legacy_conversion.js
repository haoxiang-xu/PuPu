import {
  kernel_admission_problems,
  kernel_where,
  python_strip,
} from "./kernel_config";
import {
  node_legacy_pool_entries,
  node_pool_is_legacy,
} from "./skeleton_document";
import { entry_needs_kernel } from "./subagent_pool_config";
import { safe_text } from "./document_values";

/* Which Kernel a legacy subagent is built on, and whether it can be.
 *
 * Every Kernel comes out of the document. A Subagent Pool is attached to one
 * or more Agent nodes, and the Kernel configured on the node a pool is
 * attached to is the Kernel the Agents built from that pool's legacy entries
 * run on — measured on the fixed installation pair (wheel SHA-256
 * `ea7ee781…84b0`), where `_pool_owner_nodes` reads attach edges in either
 * orientation and counts the same node once.
 *
 * So this editor sends no Kernel of its own. The store takes a request
 * fallback for whatever has none, and the renderer has nothing to put in it
 * that would not be a guess: handing over one node's Kernel for a pool
 * attached to a different node would build those subagents on a model the
 * author never attached to them, and the store refuses exactly that when it
 * is asked to borrow one. What it cannot answer, the author configures.
 * Measured both ways with nothing sent: a migrated Agent whose Kernel Loop is
 * configured converts and checks, and a referenced legacy child is built on
 * its pool owner's Kernel; unconfigured, both answer
 * `legacy_profile_required` at the entry that needed one.
 *
 * The projection is the runtime's too. `prompt` and `json_schema` are cleared
 * from the owner's Kernel before the child is built — the parent's prompt is
 * not the child's, and the parent's structured-output contract is not the
 * child's either — and it happens after that Kernel has been validated whole,
 * so a fault in a field the child never sees is still a fault. This editor
 * does not pre-project: the same Kernel reaches `preflight` and
 * `convert_legacy_pools`, and both build the identical child
 * (`CAPTURED_CHILD_KERNEL`).
 *
 * What is left here is the question the author needs answered before pressing
 * anything: would this write be refused, and because of which pool. One write
 * covers every legacy pool in the resource, so a pool that cannot be built
 * withholds the button from all of them — and the panel names which one. */

const is_object = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/* The store's own codes, so a refusal this mirror finds and a refusal the
   runtime answers with are compared without translating one into the other.
   `kernel_refused` is the exception: it is this editor's word for "the
   owner's Kernel is not one the runtime would take", and the runtime's own
   code for it is on the problem. */
export const CONVERSION_OWNER_REQUIRED = "legacy_owner_required";
export const CONVERSION_KERNEL_ABSENT = "legacy_profile_required";
export const CONVERSION_KERNEL_AMBIGUOUS = "legacy_kernel_ambiguous";
export const CONVERSION_KERNEL_REFUSED = "kernel_refused";
export const CONVERSION_MODEL_MISMATCH = "identity_mismatch";

/* What to call a legacy entry. The three keys are the three legacy kinds —
   `recipe_ref` names a recipe, `ref` a template, `inline` itself — and the
   store reads exactly these (`skeleton_resource_store.py:345-357`).
   `legacy_fields` is the old node's keys copied verbatim and nothing has ever
   asked their shapes, so a name here can be any JSON at all, including an
   object, which React refuses as a child. */
export function legacy_entry_label(raw) {
  if (!is_object(raw)) return "an entry that is not an object";
  const stated = ["recipe_name", "template_name", "name"].find(
    (key) => typeof raw[key] === "string" && raw[key],
  );
  return stated ? raw[stated] : "an entry with no name";
}

/* The model a legacy inline entry declares, as the runtime ends up reading it.
 *
 * Both legacy formats keep one, and they keep it the same way. The store
 * hands the entry's whole `template` to `convert_legacy_definition` as a
 * skeleton template in either case — a soul entry's own prompt goes over as
 * the instructions instead of being serialised into frontmatter — so `model`
 * survives into `legacy_template` and constrains the conversion. Measured in
 * both directions: `CAPTURED_INLINE_DECLARED_MODEL` records the store
 * refusing the profile the entry does not declare and accepting the one it
 * does, in each format.
 *
 * The two shapes the store will take are mirrored exactly, because the model
 * question is only reached for an entry it takes at all: a soul entry whose
 * template has no prompt string is `invalid_shape` about the entry, and
 * saying something about its model would be answering a question the runtime
 * never asked.
 *
 * The stripping is Python's, not `trim()`'s. `_template_metadata` does
 * `model.strip() or None`, and those two sets are not nested: a name padded
 * with U+001F, U+0085 or U+00A0 is stripped by the runtime and matches, one
 * padded with U+FEFF is not stripped and matches nothing. `trim()` has all
 * four backwards, which is the same trap the endpoint rule cost a round on. */
export function legacy_entry_declared_model(raw) {
  if (!is_object(raw)) return null;
  const template = raw.template;
  if (!is_object(template)) return null;
  if (raw.prompt_format === "soul") {
    if (typeof template.prompt !== "string") return null;
  } else if (raw.prompt_format !== "skeleton") return null;
  const model = template.model;
  if (typeof model !== "string") return null;
  const stripped = python_strip(model);
  return stripped === "" ? null : stripped;
}

/* Whether a profile is the model that text names — `_model_matches`.
 *
 * The split is `split(":", 1)`, so only the first colon separates: a declared
 * `ollama:llama3:8b` is provider `ollama` and model `llama3:8b`, while the
 * same name written bare is read as provider `llama3` and model `8b` and
 * matches nothing. Both comparisons are exact and case-sensitive. A
 * declaration of nothing constrains nothing, which is the runtime's answer
 * too: `requested` has to be a non-empty string before it is compared. */
export function profile_holds_model(declared, profile) {
  if (typeof declared !== "string") return true;
  const value = python_strip(declared);
  if (value === "") return true;
  if (!is_object(profile)) return false;
  const at = value.indexOf(":");
  if (at === -1) return value === profile.model;
  return (
    value.slice(0, at) === profile.provider && value.slice(at + 1) === profile.model
  );
}

export function profile_label(profile) {
  if (!is_object(profile)) return "no model";
  return `${safe_text(profile.provider)}:${safe_text(profile.model)}`;
}

/* Stated keys only, in a fixed order, so two Kernels written by different
   editors are compared by what they say rather than by the order they say it
   in. Unknown keys take part: a Kernel carrying one is refused anyway, and
   leaving it out of the comparison would call two different Kernels the
   same. */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (is_object(value)) {
    const body = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",");
    return `{${body}}`;
  }
  const text = JSON.stringify(value);
  return text === undefined ? "null" : text;
}

function nodes_of(document) {
  return is_object(document) && Array.isArray(document.nodes)
    ? document.nodes
    : [];
}

/* Which Agent nodes a Subagent Pool is attached to — `_pool_owner_nodes`.
 *
 * Either orientation of the attach edge counts, and a pool attached twice to
 * the same node has one owner. The index comes back with the node because it
 * is part of the address the runtime reports a fault at. */
export function pool_owner_nodes(document, pool_id) {
  const nodes = nodes_of(document);
  const edges =
    is_object(document) && Array.isArray(document.edges) ? document.edges : [];
  const agents = new Set(
    nodes
      .filter((node) => is_object(node) && node.type === "agent")
      .map((node) => node.id),
  );
  const owners = new Set();
  edges.forEach((edge) => {
    if (!is_object(edge) || edge.kind !== "attach") return;
    const source = edge.source_node_id;
    const target = edge.target_node_id;
    if (source === pool_id && agents.has(target)) owners.add(target);
    else if (target === pool_id && agents.has(source)) owners.add(source);
  });
  return nodes
    .map((node, index) => ({ index, node }))
    .filter(({ node }) => is_object(node) && owners.has(node.id));
}

/* Every legacy pool entry in this document that needs an Agent built for it,
   with where it sits. The index is the entry's position in the pool's own
   stored list, which is the address the store reports a fault at. */
export function inline_pool_entries(document) {
  const found = [];
  nodes_of(document).forEach((node) => {
    if (!is_object(node) || node.type !== "subagent_pool") return;
    if (!node_pool_is_legacy(node)) return;
    node_legacy_pool_entries(node).forEach((entry, index) => {
      if (entry_needs_kernel(entry)) found.push({ pool_id: node.id, index, entry });
    });
  });
  return found;
}

function pool_config_path(document, pool_id) {
  const index = nodes_of(document).findIndex(
    (node) => is_object(node) && node.id === pool_id,
  );
  return ["document", "nodes", index, "config"];
}

/* The Kernel as the child is built on it. The runtime clears these two after
   validating the owner's Kernel whole, and the comparison between two owners
   of one pool is made on the result — so two Kernel Loops that differ only in
   their own prompt or output schema are one Kernel to a child. Measured. */
function child_kernel(kernel) {
  return { ...kernel, prompt: "", json_schema: null };
}

/* A problem the runtime would report about an owner's Kernel, addressed the
   way the runtime addresses it. `output_schema_problems` roots a schema fault
   at `schema`, which is the runtime's own root for it, and the store rewrites
   that onto the Kernel's `json_schema` — so this does too. */
function owner_problem(kernel, index) {
  const path = ["document", "nodes", index, "config", "kernel"];
  const problems = kernel_admission_problems(kernel, path);
  if (problems.length === 0) return null;
  const first = problems[0];
  if (!/^schema($|[.[])/.test(first.where)) return first;
  return {
    ...first,
    where: `${kernel_where(path)}.json_schema${first.where.slice("schema".length)}`,
  };
}

/* The Kernel this pool's children would be built on, or why there is not one.
 *
 * In the store's order, because the order is what the author is told: a pool
 * attached to nothing, then an owner with no Kernel, then an owner whose
 * Kernel the runtime refuses, then owners that disagree. */
export function pool_child_kernel(document, pool_id) {
  const owners = pool_owner_nodes(document, pool_id);
  if (owners.length === 0) {
    return {
      kernel: null,
      refusal: {
        code: CONVERSION_OWNER_REQUIRED,
        pool_id,
        where: kernel_where(pool_config_path(document, pool_id)),
      },
    };
  }
  let chosen = null;
  let shape = null;
  for (const { index, node } of owners) {
    const config = is_object(node.config) ? node.config : {};
    /* Presence, not shape. A node carrying `kernel: null` has one and it is
       refused; a node with no `kernel` key at all is unconfigured, which is
       the author's to answer and not a fault to report. */
    if (!Object.prototype.hasOwnProperty.call(config, "kernel")) {
      return {
        kernel: null,
        refusal: {
          code: CONVERSION_KERNEL_ABSENT,
          pool_id,
          node_id: node.id,
          owners: owners.map((owner) => owner.node.id),
        },
      };
    }
    const problem = owner_problem(config.kernel, index);
    if (problem) {
      return {
        kernel: null,
        refusal: {
          code: CONVERSION_KERNEL_REFUSED,
          pool_id,
          node_id: node.id,
          problem,
        },
      };
    }
    const projected = child_kernel(config.kernel);
    const written = stable(projected);
    if (chosen === null) {
      chosen = projected;
      shape = written;
    } else if (written !== shape) {
      return {
        kernel: null,
        refusal: {
          code: CONVERSION_KERNEL_AMBIGUOUS,
          pool_id,
          nodes: owners.map((owner) => owner.node.id),
          where: kernel_where(pool_config_path(document, pool_id)),
        },
      };
    }
  }
  return { kernel: chosen, refusal: null };
}

/* Whether `convert_legacy_pools` may be called, and what it would build.
 *
 * `required` is false when no pool holds an inline entry: those entries name
 * an Agent, and resolving a name needs no model. Nothing is handed over in
 * either case — see the header — so what this answers is only whether the
 * write would be refused, and by which pool.
 *
 * `by_pool` carries each pool's own answer, because the panel is drawn on one
 * pool while the write covers them all: a pool that is fine still has its
 * button withheld by a pool that is not, and saying so needs both answers. */
export function legacy_conversion_plan(document) {
  const found = inline_pool_entries(document);
  const entries = found.map((entry) => ({
    pool_id: entry.pool_id,
    index: entry.index,
    name: legacy_entry_label(entry.entry),
    declared: legacy_entry_declared_model(entry.entry),
  }));
  if (entries.length === 0) {
    return { required: false, pools: [], entries, by_pool: new Map(), refusal: null };
  }
  const pools = [...new Set(entries.map((entry) => entry.pool_id))];
  const by_pool = new Map();
  let refusal = null;
  pools.forEach((pool_id) => {
    const answer = pool_child_kernel(document, pool_id);
    /* The runtime does not take the author's choice as an instruction here.
       An entry that already declares a model is compared against the Kernel
       its own pool resolves to, and a difference is `identity_mismatch` with
       nothing written — for the whole resource, not only that pool. */
    const mismatched = answer.kernel
      ? entries.filter(
          (entry) =>
            entry.pool_id === pool_id &&
            entry.declared !== null &&
            !profile_holds_model(entry.declared, answer.kernel.profile),
        )
      : [];
    const own =
      answer.refusal ||
      (mismatched.length > 0
        ? {
            code: CONVERSION_MODEL_MISMATCH,
            pool_id,
            entries: mismatched,
            chosen: profile_label(answer.kernel.profile),
          }
        : null);
    by_pool.set(pool_id, {
      chosen: answer.kernel ? profile_label(answer.kernel.profile) : null,
      owners: owners_of(document, pool_id),
      refusal: own,
    });
    if (refusal === null && own !== null) refusal = own;
  });
  return { required: true, pools, entries, by_pool, refusal };
}

function owners_of(document, pool_id) {
  return pool_owner_nodes(document, pool_id).map(({ node }) => node.id);
}

/* What the panel says about the pool it is drawn on. A `Map`, because a pool
   id is document data and an object keyed by it would answer for
   `__proto__` as readily as for a node. */
export function plan_for_pool(plan, pool_id) {
  if (!plan || !(plan.by_pool instanceof Map)) return null;
  return plan.by_pool.get(pool_id) || null;
}
