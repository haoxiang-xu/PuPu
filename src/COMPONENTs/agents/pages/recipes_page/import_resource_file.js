import { BUILTIN_PYTHON } from "./code_config";
import { safe_text } from "./document_values";
import { agentMessage, renderAgentMessage } from "./agents_i18n";
import { import_resource, python_profiles, transfer_capabilities } from "./skeleton_resources";
import { import_document, import_occurrences, import_payload, import_refusal, read_import_file } from "./resource_import";

/* Importing one exported Agent or Workflow straight from the file the
 * system's file picker returned (#484): no form in between.
 *
 * The host still takes one explicit Python per owned Code step. Each step
 * keeps the Python it was exported with when that Python exists on this
 * machine, and otherwise runs on the built-in one; either can be changed
 * afterwards in the Code step's own panel. Nothing is written until every
 * check below has passed, and a refusal is said once, in the author's words
 * where there is a sentence for it. */

const host_reason = (result, fallback) => {
  const error = result && result.error;
  if (!error) return fallback;
  const rendered = renderAgentMessage(error, agentMessage);
  if (rendered !== error) return rendered;
  return error.message || error.code ? safe_text(error.message || error.code) : fallback;
};

/* One choice per occurrence, in listed order: the exported Python when this
   machine has it, the built-in one when it does not. */
export function default_import_choices(occurrences, profiles) {
  const known = new Set((Array.isArray(profiles) ? profiles : [])
    .filter((profile) => profile && typeof profile.id === "string" && profile.available !== false)
    .map((profile) => profile.id));
  const choices = Object.create(null);
  for (const occurrence of Array.isArray(occurrences) ? occurrences : []) {
    const stored = occurrence && typeof occurrence.stored_profile === "string" ? occurrence.stored_profile : null;
    choices[occurrence.key] = stored && known.has(stored) ? stored : BUILTIN_PYTHON;
  }
  return choices;
}

export async function import_resource_file(file, t = agentMessage) {
  if (!file) return { ok: false, message: null };
  const capability = await transfer_capabilities();
  if (!capability.ok) {
    return { ok: false, message: t("agents.import.unavailable", { message: host_reason(capability, t("agents.import.host_unavailable")) }) };
  }
  const max = Number.isSafeInteger(capability.data?.file_bytes) ? capability.data.file_bytes : null;
  const read = await read_import_file(file, max, t);
  if (!read.ok) return { ok: false, message: read.message };
  const parsed = import_document(read.text, t);
  if (!parsed.ok) return { ok: false, message: parsed.message };
  const occurrences = import_occurrences(parsed.document, t);
  let profiles = [];
  if (occurrences.length > 0) {
    const listed = await python_profiles();
    if (!listed.ok) {
      return { ok: false, message: t("agents.import.unavailable", { message: host_reason(listed, t("agents.import.profiles_failed")) }) };
    }
    profiles = listed.data.profiles;
  }
  const payload = import_payload(read.text, occurrences, default_import_choices(occurrences, profiles));
  if (!payload) return { ok: false, message: t("agents.import.refused") };
  const result = await import_resource(payload);
  if (result.ok) return { ok: true, resource: result.data.resource };
  const refusal = import_refusal(result.error, parsed.document, occurrences, t);
  return { ok: false, message: refusal.sentence || refusal.message };
}
