import { node_title } from "../node_title";
import { agentProblemMessage } from "../agents_i18n";
import { can_preflight } from "../skeleton_resource_session";

/* What the Test panel says about itself, in one place: whether the thing on
   screen can run, and if not, which node to fix and what to do there. The
   store answers a preflight with the FIRST problem it meets — a code, a path
   into the document and an engineer's sentence — so this reads the path back
   into a node of the document the author is looking at, and says the two
   problems everyone meets first in words: an Agent with no model picked yet,
   and a Switch with nothing to switch on. */

const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const own = (value, key) => record(value) && Object.prototype.hasOwnProperty.call(value, key);

export const LIVE_STATUSES = new Set(["starting", "running", "waiting"]);

/* The top-level node a store path points into: `[…, "nodes", 3, …]` by
   position, or `[…, "nodes", "agent", …]` by id. Only the first `nodes` is
   read, so a problem deep inside an embedded child lands on the pool that
   holds it — the node the author can open from this graph. */
export function node_at_path(document, path) {
  if (!record(document) || !Array.isArray(document.nodes) || !Array.isArray(path)) return null;
  const at = path.indexOf("nodes");
  if (at < 0 || at + 1 >= path.length) return null;
  const key = path[at + 1];
  if (Number.isSafeInteger(key)) return record(document.nodes[key]) ? document.nodes[key] : null;
  if (typeof key === "string") return document.nodes.find((node) => record(node) && node.id === key) || null;
  return null;
}

/* An Agent whose config has no Kernel: the model was never picked (a draft
   prompt, `kernel_draft`, is all it carries). */
function lacks_model(node) {
  return node.type === "agent" && record(node.config) && !own(node.config, "kernel");
}

/* A Switch whose execution has no `value`: the case list is there, the thing
   it compares is not. */
function lacks_switch_value(node) {
  return node.type === "switch_case" && record(node.config) && record(node.config.execution)
    && !own(node.config.execution, "value");
}

/* `{ node_id, text }` for a refused preflight, or null when it was not one. */
export function explain_problem(error, document, t) {
  if (!record(error)) return null;
  const node = node_at_path(document, error.path);
  if (!node) {
    const message = agentProblemMessage(error, t) || error.code || "";
    return { node_id: null, text: message };
  }
  const name = node_title(node, t).title;
  if (lacks_model(node)) return { node_id: node.id, name, no_model: true, text: t("agents.test_run.problem.no_model", { node: name }) };
  if (lacks_switch_value(node)) return { node_id: node.id, text: t("agents.test_run.problem.switch_value", { node: name }) };
  return {
    node_id: node.id,
    text: t("agents.test_run.problem.node", { node: name, message: agentProblemMessage(error, t) || error.code || "" }),
  };
}

/* The one sentence at the top of the panel, its tone, and the one thing to do
   about it. Ordered by what the author has to deal with first.
   tone: "bad" | "wait" | "busy" | "good" | "idle". */
/* The Agent nodes of a document that carry no model of their own. A test
   runs them with the model picked in its composer. */
export function unconfigured_agents(document) {
  if (!record(document) || document.kind !== "agent" || !Array.isArray(document.nodes)) return [];
  return document.nodes.filter((node) => record(node) && lacks_model(node));
}

/* The model an Agent document already names for itself: its first Agent
   node's Kernel profile, as the composer's "provider:model" id. */
export function own_model_id(document) {
  if (!record(document) || !Array.isArray(document.nodes)) return null;
  const node = document.nodes.find((item) => record(item) && item.type === "agent" && record(item.config) && record(item.config.kernel));
  const profile = node && record(node.config.kernel.profile) ? node.config.kernel.profile : null;
  if (!profile) return null;
  if (typeof profile.id === "string" && profile.id) return profile.id;
  return typeof profile.provider === "string" && typeof profile.model === "string" ? `${profile.provider}:${profile.model}` : null;
}

/* What a refused or unanswered request says, for the line under the
   status. A code the panel knows is said in words; anything else keeps the
   host's own sentence. */
export function request_problem_text(error, t, model = "") {
  if (!record(error)) return "";
  if (error.code === "builder_test_command_refused") return t("agents.test_run.problem.version_mismatch");
  if (error.code === "test_model_unavailable") {
    return model_problem_text(Array.isArray(error.path) ? error.path[1] : null, model, t);
  }
  return run_error_text(error, t);
}

/* A refused approval the run cannot take on a second try: the wait it
   answered is gone, closed, or (a runtime fault) was never recorded. The
   tool did not run; clicking again only meets the same refusal. */
const FINAL_APPROVAL_CODES = new Set(["interaction_not_found", "interaction_expired", "interaction_canonical_conflict",
  "interaction_receipt_conflict", "interaction_receipt_missing", "execution_cancelled"]);
export function approval_refused_for_good(error) {
  return record(error) && typeof error.code === "string"
    && (FINAL_APPROVAL_CODES.has(error.code)
      /* A read can meet skeleton_interaction_invalid in passing; a refused
         answer's other skeleton_interaction_* codes are final. */
      || (error.code.startsWith("skeleton_interaction_") && error.code !== "skeleton_interaction_invalid"));
}

/* What a refused approval says on its card and in the status line. */
export function approval_problem_text(error, t) {
  if (!record(error)) return "";
  if (error.code === "interaction_expired") return t("agents.test_run.problem.approval_expired");
  if (approval_refused_for_good(error)) return t("agents.test_run.problem.approval_refused");
  return request_problem_text(error, t);
}

/* What a run that failed says. A refusal the panel knows is said in words;
   the host's own sentence otherwise; and when the host only knows the run
   did not finish, that. */
export function run_error_text(error, t) {
  if (!record(error)) return "";
  if (error.code === "workspace_unavailable") return t("agents.test_run.problem.workspace_needed");
  if (error.code === "skeleton_memory_provider_unsupported") return t("agents.test_run.problem.memory_provider");
  /* The runtime keeps no detail when a step's handler throws (the model call
     itself, most often): say what is known and the usual causes. */
  if (error.code === "handler_error") return t("agents.test_run.problem.handler_failed");
  const message = typeof error.message === "string" ? error.message : "";
  if (!message || /^The test did not complete\./.test(message) || /^The recorded test failed\./.test(message)) return t("agents.test_run.problem.run_incomplete");
  return message;
}

/* A model as the composer shows it: "custom.kimi:kimi-k2.6" is kimi-k2.6. */
export function model_label(id) {
  if (typeof id !== "string") return "";
  const at = id.indexOf(":");
  return at >= 0 ? id.slice(at + 1) : id;
}

/* Why a model cannot run an Agent test, from the Kernel catalog's reason. */
export function model_problem_text(reason, model, t) {
  if (reason === "memory_provider") return t("agents.test_run.problem.memory_provider");
  const key = reason === "context_window_unknown" || reason === "output_limit_unknown" ? "model_no_limits"
    : reason === "profile_refused" ? "model_refused" : "model_not_offered";
  return t(`agents.test_run.problem.${key}`, { model: model_label(model) });
}

/* Whether the Kernel catalog (the one the node's model picker reads) can run
   this model: null when it can or the catalog is not read yet, else the
   reason it cannot. */
export function model_unusable(catalog, model) {
  if (!record(catalog) || !Array.isArray(catalog.profiles) || typeof model !== "string" || !model) return null;
  if (catalog.profiles.some((profile) => record(profile) && profile.id === model)) return null;
  const known = Array.isArray(catalog.unavailable) ? catalog.unavailable.find((row) => record(row) && row.id === model) : null;
  return known && typeof known.reason === "string" ? known.reason : "not_offered";
}

export function panel_state({ session, kind, last, uncertain, confirmed, fallbackModel, fallbackProblem, error }, t) {
  if (session.conflict) return { tone: "bad", text: t("agents.test_run.state.conflict") };
  /* Nothing came back for a request that may have gone out. Saying so, and
     what to do: look first, send again only if nothing was recorded. A reply
     PuPu could not read is most often a half-updated install. */
  if (uncertain) {
    const text = t("agents.test_run.state.uncertain");
    return { tone: "bad", action: "refresh",
      text: record(error) && error.code === "builder_test_protocol_error" ? `${text} ${t("agents.test_run.state.uncertain_restart")}` : text };
  }
  if (!confirmed && error && !last) {
    return { tone: "bad", action: "refresh", text: request_problem_text(error,t,fallbackModel), blocks: true };
  }
  if (last && last.status === "waiting") return { tone: "wait", text: t("agents.test_run.state.waiting") };
  if (last && LIVE_STATUSES.has(last.status)) return { tone: "busy", text: t("agents.test_run.state.running") };
  if (session.dirty || !session.edit_token) return { tone: "idle", text: t("agents.test_run.state.unsaved") };
  const preflight = session.preflight;
  if (preflight && preflight.stale) return { tone: "bad", text: t("agents.save.preflight_stale"), action: "recheck" };
  if (preflight && !preflight.ok) {
    const problem = explain_problem(preflight.error, session.document, t);
    /* An Agent with no model of its own runs with the model picked in the
       composer, as a chat does; with none picked it waits for one. */
    if (problem && problem.no_model && kind === "agent") {
      if (fallbackModel && fallbackProblem) {
        return { tone: "bad", text: model_problem_text(fallbackProblem, fallbackModel, t), blocks: true };
      }
      return fallbackModel
        ? { tone: "good", text: t("agents.test_run.state.uses_chosen_model", { node: problem.name }) }
        : { tone: "wait", text: t("agents.test_run.state.pick_model", { node: problem.name }), blocks: true };
    }
    return {
      tone: "bad",
      text: t("agents.test_run.state.not_ready", { problem: problem ? problem.text : t("agents.save.not_ready_to_run") }),
      action: problem && problem.node_id ? "fix" : "recheck",
      node_id: problem ? problem.node_id : null,
      blocks: true,
    };
  }
  if (!preflight && can_preflight(session)) return { tone: "idle", text: t("agents.test_run.state.checking") };
  return { tone: "good", text: t(kind === "agent" ? "agents.test_run.state.ready_agent" : "agents.test_run.state.ready_workflow") };
}
