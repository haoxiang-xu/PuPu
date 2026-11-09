import en from "../../../../locales/en.json";
import { resolveKey } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";

const AGENT_MESSAGE = Symbol("agent-ui-message");

export function agentEnglishText(key, vars) {
  const value = resolveKey(en, key);
  if (value === undefined) return key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (_, name) =>
    Object.prototype.hasOwnProperty.call(vars, name)
      ? String(vars[name])
      : `{${name}}`,
  );
}

/* Local notices keep presentation intent, not a locale or an API payload.
 * Capture interpolation values when the action finishes, then resolve copy
 * at render time. JSON/backend values cannot acquire this private marker. */
export function agentMessage(key, vars) {
  const snapshot = Object.fromEntries(Object.entries(vars || {}).map(([name, value]) => {
    const record = value && typeof value === "object" &&
      Object.prototype.hasOwnProperty.call(value, AGENT_MESSAGE) ? value[AGENT_MESSAGE] : null;
    const unchanged = record && (!Object.prototype.hasOwnProperty.call(record, "englishError") ||
      value.message === record.englishError);
    return [name, unchanged ? agentMessage(record.key, record.vars) : String(value)];
  }));
  return Object.freeze({ [AGENT_MESSAGE]: Object.freeze({ key, vars: Object.freeze(snapshot) }) });
}

export function renderAgentMessage(value, t = agentEnglishText) {
  const record = value && typeof value === "object" &&
    Object.prototype.hasOwnProperty.call(value, AGENT_MESSAGE) ? value[AGENT_MESSAGE] : null;
  if (!record || (Object.prototype.hasOwnProperty.call(record, "englishError") &&
    value.message !== record.englishError)) return value;
  const vars = Object.fromEntries(Object.entries(record.vars).map(([name, item]) =>
    [name, renderAgentMessage(item, t)]));
  return t(record.key, vars);
}

export function agentError(key, vars) {
  const notice = agentMessage(key, vars);
  const error = new Error(renderAgentMessage(notice));
  if (typeof Error.captureStackTrace === "function") Error.captureStackTrace(error, agentError);
  Object.defineProperty(error, AGENT_MESSAGE, {
    value: Object.freeze({ ...notice[AGENT_MESSAGE], englishError: error.message }),
  });
  return error;
}

/* Local diagnostic objects retain their public English message/code/path.
 * The private, non-serializable marker only travels along explicit local
 * forwarding seams. A backend JSON lookalike cannot acquire it. */
export function agentProblem(key, vars, details = {}) {
  const notice = agentMessage(key, vars);
  const problem = { ...details, message: renderAgentMessage(notice) };
  Object.defineProperty(problem, AGENT_MESSAGE, {
    value: Object.freeze({ ...notice[AGENT_MESSAGE], englishError: problem.message }),
  });
  return problem;
}

export function copyAgentProblem(source, target) {
  const record = source && typeof source === "object" &&
    Object.prototype.hasOwnProperty.call(source, AGENT_MESSAGE) ? source[AGENT_MESSAGE] : null;
  if (record && Object.prototype.hasOwnProperty.call(record, "englishError") && source.message === record.englishError && target.message === source.message) {
    Object.defineProperty(target, AGENT_MESSAGE, { value: record });
  }
  return target;
}

export function agentProblemMessage(problem, t = agentEnglishText) {
  const rendered = renderAgentMessage(problem, t);
  return rendered === problem ? problem?.message : rendered;
}

/* A synchronous UI formatter can return a private notice. Keep the original
 * English string in the diagnostic, with ownership only on its local shell. */
export function agentProblemFromMessage(message, details = {}) {
  const text = renderAgentMessage(message);
  const problem = { ...details, message: text };
  const record = message && typeof message === "object" &&
    Object.prototype.hasOwnProperty.call(message, AGENT_MESSAGE) ? message[AGENT_MESSAGE] : null;
  if (record && (!Object.prototype.hasOwnProperty.call(record, "englishError") || message.message === record.englishError)) Object.defineProperty(problem, AGENT_MESSAGE, {
    value: Object.freeze({ ...record, englishError: text }),
  });
  return problem;
}

const AGENT_REASON = Symbol("agent-ui-reason");

export function agentReasonPayload(payload) {
  const notice = payload.reason;
  const record = notice && typeof notice === "object" &&
    Object.prototype.hasOwnProperty.call(notice, AGENT_MESSAGE) ? notice[AGENT_MESSAGE] : null;
  if (!record || (Object.prototype.hasOwnProperty.call(record, "englishError") && notice.message !== record.englishError)) return payload;
  const reason = renderAgentMessage(notice);
  const result = { ...payload, reason };
  Object.defineProperty(result, AGENT_REASON, { value: Object.freeze({ notice, reason }) });
  return result;
}

export function agentPayloadReason(payload, t = agentEnglishText) {
  const record = payload && typeof payload === "object" &&
    Object.prototype.hasOwnProperty.call(payload, AGENT_REASON) ? payload[AGENT_REASON] : null;
  return record && payload.reason === record.reason ? renderAgentMessage(record.notice, t) : payload?.reason;
}
