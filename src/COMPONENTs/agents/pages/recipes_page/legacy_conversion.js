import { kernel_admission_problems, python_strip } from "./kernel_config";
import {
  node_kernel,
  node_legacy_pool_entries,
  node_pool_is_legacy,
} from "./skeleton_document";
import { entry_needs_kernel } from "./subagent_pool_config";
import { safe_text } from "./document_values";

/* Which Kernel the store is handed for legacy data, and when it may be.
 *
 * Two places in the store refuse to act on legacy data without a Kernel
 * configuration the caller chose, both measured on the repaired fixed
 * installation pair (wheel SHA-256 `5b0f16dc…`):
 *
 *   - `convert_legacy_pools` refuses `legacy_profile_required` for an inline
 *     Subagent Pool entry: it carries a prompt rather than naming an Agent,
 *     so becoming one means being materialised, and that needs a model.
 *   - `preflight` refuses the same code for a migrated Agent — one holding an
 *     agent node with `legacy_recipe` or `legacy_template` — when some agent
 *     node still has no Kernel of its own, or when a pool holds an inline
 *     entry, which never has one. A node that HAS one is authoritative: its
 *     profile, prompt, iteration limit, schema and budget are prepared as the
 *     author wrote them, and the supplied Kernel is a fallback the node does
 *     not touch. Only a kernel-absent node takes it, and then its legacy
 *     prompt, model and iteration limit are projected onto it.
 *
 * The Kernel is the one the author configured on this Agent's Kernel Loop.
 * Nothing here invents a model, an endpoint or a credential reference: a
 * profile names where requests go and which secret pays for them, and an
 * editor that guessed either would be pointing a definition somewhere nobody
 * chose. If there is no configured Kernel, there is nothing to hand over and
 * the panel says so.
 *
 * One write, one Kernel, for the conversion. The store converts every legacy
 * pool in the resource in a single write, and every Agent it builds there is
 * built without a Kernel of its own — so they all take the supplied one, two
 * Kernel Loops configured differently cannot both be honoured, and this
 * refuses rather than picking one. Preflight is not that: a graph whose nodes
 * all carry their own Kernel is checked with no fallback at all, so Kernels
 * that disagree are no longer a reason the check cannot be made.
 *
 * The two uses do NOT hand over the same thing, and that is the point of
 * keeping them apart:
 *
 *   - preflight hands it over as the author configured it, because whatever
 *     takes it as a fallback is built out of it — a node here, or a node of a
 *     legacy Agent this one references, whose document the renderer cannot
 *     see. Anything dropped here would be dropped from that.
 *   - the conversion materialises SOMEBODY ELSE'S Agent — one per inline
 *     entry — so two fields are projected rather than copied. `prompt`,
 *     because the entry's own legacy prompt replaces it (measured for both
 *     inline formats); and `json_schema`, because the parent's
 *     structured-output contract is not the subagent's and the supplied
 *     Kernel is carried over verbatim, which would force the parent's schema
 *     on every Agent the conversion builds. `CAPTURED_EMBEDDED_KERNEL` is
 *     that measurement. */

const is_object = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/* The root the store reports a faulty supplied Kernel under, so a problem
   this mirror finds reads with the same address the runtime would give it. */
export const LEGACY_KERNEL_PATH = "legacy_kernel";

export const CONVERSION_KERNEL_ABSENT = "kernel_absent";
export const CONVERSION_KERNEL_AMBIGUOUS = "kernel_ambiguous";
export const CONVERSION_KERNEL_REFUSED = "kernel_refused";
export const CONVERSION_MODEL_MISMATCH = "model_mismatch";

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
 * does, in each format. Before the runtime was repaired the soul path built
 * the frontmatter itself and left the model out of it, so a soul entry
 * declared nothing and every profile was accepted.
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

/* The Kernel as it goes to somebody else's Agent. See the header. */
export function conversion_kernel(kernel) {
  return { ...kernel, prompt: "", json_schema: null };
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

function agent_nodes(document) {
  const nodes =
    is_object(document) && Array.isArray(document.nodes) ? document.nodes : [];
  return nodes.filter((node) => is_object(node) && node.type === "agent");
}

/* Which Agent nodes in this document came from legacy data.
 *
 * `preflight`'s own condition, mirrored: an agent node holding
 * `legacy_recipe` or `legacy_template`. It is about the node's config and not
 * about the resource's provenance — a migrated Agent whose nodes have been
 * rewritten is no longer one, and the store would not ask for a Kernel. */
export function migrated_agent_nodes(document) {
  return agent_nodes(document)
    .filter((node) => {
      const config = is_object(node.config) ? node.config : {};
      return (
        Object.prototype.hasOwnProperty.call(config, "legacy_recipe") ||
        Object.prototype.hasOwnProperty.call(config, "legacy_template")
      );
    })
    .map((node) => node.id);
}

/* Every legacy pool entry in this document that needs a Kernel, with where it
   sits. The index is the entry's position in the pool's own stored list,
   which is the address the store reports a fault at. */
export function inline_pool_entries(document) {
  const nodes =
    is_object(document) && Array.isArray(document.nodes) ? document.nodes : [];
  const found = [];
  nodes.forEach((node) => {
    if (!is_object(node) || node.type !== "subagent_pool") return;
    if (!node_pool_is_legacy(node)) return;
    node_legacy_pool_entries(node).forEach((entry, index) => {
      if (entry_needs_kernel(entry)) found.push({ pool_id: node.id, index, entry });
    });
  });
  return found;
}

/* The one Kernel every use of the legacy data would be given, or why there is
   not one. `project` is how the Kernel is handed over for this use. */
function agreed_kernel(document, project) {
  const configured = agent_nodes(document)
    .map((node) => ({ node_id: node.id, kernel: node_kernel(node) }))
    .filter((entry) => entry.kernel)
    .map((entry) => ({ node_id: entry.node_id, kernel: project(entry.kernel) }));
  if (configured.length === 0) {
    return { kernel: null, refusal: { code: CONVERSION_KERNEL_ABSENT } };
  }
  const chosen = configured[0].kernel;
  const shape = stable(chosen);
  if (configured.some((entry) => stable(entry.kernel) !== shape)) {
    return {
      kernel: null,
      refusal: {
        code: CONVERSION_KERNEL_AMBIGUOUS,
        nodes: configured.map((entry) => entry.node_id),
      },
    };
  }
  /* Asked here because the store asks it: a Kernel the author has not
     finished is stored happily as a draft, and handing it over would be
     refused with a path under `legacy_kernel` that names a field on a panel
     the author is not looking at. The exact validator is the right mirror —
     the write runs `validate_kernel_config` and nothing else. */
  const problems = kernel_admission_problems(chosen, [LEGACY_KERNEL_PATH]);
  if (problems.length > 0) {
    return {
      kernel: null,
      refusal: { code: CONVERSION_KERNEL_REFUSED, problem: problems[0] },
    };
  }
  return { kernel: chosen, refusal: null };
}

/* What `convert_legacy_pools` may be handed, and whether it may be called.
 *
 * `required` is false when no pool holds an inline entry: the conversion then
 * needs no Kernel and `null` goes over, exactly as before. A refusal means
 * the store is not asked at all — it would refuse, and the panel can say why
 * without a round trip that writes nothing. */
export function legacy_conversion_plan(document) {
  const found = inline_pool_entries(document);
  const entries = found.map((entry) => ({
    pool_id: entry.pool_id,
    index: entry.index,
    name: legacy_entry_label(entry.entry),
    declared: legacy_entry_declared_model(entry.entry),
  }));
  if (entries.length === 0) {
    return { required: false, pools: [], entries, kernel: null, refusal: null };
  }
  const pools = [...new Set(entries.map((entry) => entry.pool_id))];
  const agreed = agreed_kernel(document, conversion_kernel);
  if (agreed.refusal) {
    return { required: true, pools, entries, kernel: null, refusal: agreed.refusal };
  }
  /* The runtime does not take the author's choice as an instruction here. An
     entry that already declares a model is compared against the one supplied,
     and a difference is `identity_mismatch` with nothing written — so the
     panel answers the comparison before offering the write, rather than
     letting the author discover it by having a write refused. */
  const mismatched = entries.filter(
    (entry) =>
      entry.declared !== null &&
      !profile_holds_model(entry.declared, agreed.kernel.profile),
  );
  if (mismatched.length > 0) {
    return {
      required: true,
      pools,
      entries,
      kernel: null,
      refusal: {
        code: CONVERSION_MODEL_MISMATCH,
        entries: mismatched,
        chosen: profile_label(agreed.kernel.profile),
      },
    };
  }
  return {
    required: true,
    pools,
    entries,
    kernel: agreed.kernel,
    chosen: profile_label(agreed.kernel.profile),
    refusal: null,
  };
}

/* What `preflight` may be handed.
 *
 * Only when the legacy data needs it, so a modern Agent's check is the same
 * request it has always been. Whenever it might, the Kernel goes over rather
 * than being withheld for being unnecessary here: a legacy Agent this one
 * references can be the node that needs the fallback, and its document is
 * not in the renderer's hands. A node that has its own Kernel ignores what
 * is sent.
 *
 * No pre-check of the declared model here, for a reason: preflight answers
 * rather than writes, and its refusal is already on screen in the save bar —
 * including `identity_mismatch` when a kernel-absent node's own legacy data
 * names a different model than the Kernel it has been given. The conversion
 * is pre-checked because a refused write teaches the author nothing about
 * which entry caused it. */
export function legacy_preflight_kernel(document) {
  if (
    migrated_agent_nodes(document).length === 0 &&
    inline_pool_entries(document).length === 0
  ) {
    return null;
  }
  return agreed_kernel(document, (kernel) => kernel).kernel;
}
