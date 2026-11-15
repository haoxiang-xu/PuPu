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
export function request_problem_text(error, t) {
  if (!record(error)) return "";
  if (error.code === "builder_test_command_refused") return t("agents.test_run.problem.version_mismatch");
  return error.message || error.code || "";
}

export function panel_state({ session, kind, last, uncertain, fallbackModel, error }, t) {
  if (session.conflict) return { tone: "bad", text: t("agents.test_run.state.conflict") };
  /* Nothing came back for a request that may have gone out. Saying so, and
     what to do: look first, send again only if nothing was recorded. A reply
     PuPu could not read is most often a half-updated install. */
  if (uncertain) {
    const text = t("agents.test_run.state.uncertain");
    return { tone: "bad", action: "refresh",
      text: record(error) && error.code === "builder_test_protocol_error" ? `${text} ${t("agents.test_run.state.uncertain_restart")}` : text };
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
