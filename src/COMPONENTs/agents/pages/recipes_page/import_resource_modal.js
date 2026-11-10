import React, { useCallback, useEffect, useRef, useState } from "react";
import Modal from "../../../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../BUILTIN_COMPONENTs/input/input";
import Select from "../../../../BUILTIN_COMPONENTs/select/select";
import { safe_text } from "./document_values";
import { profile_label } from "./code_config";
import { import_resource, python_profiles, save_python_profile, transfer_capabilities } from "./skeleton_resources";
import { import_document, import_occurrences, import_payload, import_refusal, read_import_file } from "./resource_import";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { agentMessage, renderAgentMessage } from "./agents_i18n";

/* Importing one exported Agent or Workflow (#357), with a local Python chosen
 * for each of its Code nodes.
 *
 * Nothing is written until Import: choosing a file, reading it, choosing a
 * Python or closing the form leaves the library as it was. Each file is its
 * own intent — choosing another file, clearing it or closing the form voids
 * every answer still on its way for the one before, so a late read or a late
 * import reply never lands on what is now on screen. Naming a new Python is
 * the existing registration, kept on its own: it adds the Python to the list
 * and selects nothing. */

const LABEL = { fontSize: 11, fontWeight: 600, color: "var(--pupu-text-muted)", textTransform: "uppercase", letterSpacing: 0.4 };
const NOTE = { fontSize: 11, color: "var(--pupu-text-muted)", lineHeight: 1.5 };
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const ROW = { display: "flex", alignItems: "center", gap: 8 };
const FIELD = { width: "100%", fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 };
const SMALL = { fontSize: 11, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6 };
const problem_style = (isDark) => ({ fontSize: 11, lineHeight: 1.5, color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)" });
const reason = (result, fallback) => result && result.error && renderAgentMessage(result.error, agentMessage) !== result.error
  ? renderAgentMessage(result.error, agentMessage) : result && result.error && (result.error.message || result.error.code)
    ? safe_text(result.error.message || result.error.code) : fallback;

const EMPTY_FILE = { status: "none", name: null, text: null, document: null, occurrences: [], problem: null };

export default function ImportResourceModal({ open, onClose, onImported, isDark }) {
  const { t } = useTranslation();
  const [capability, setCapability] = useState({ status: "loading", data: null, problem: null });
  const [profiles, setProfiles] = useState({ status: "loading", list: [], problem: null });
  const [file, setFile] = useState(EMPTY_FILE);
  const [choices, setChoices] = useState({});
  const [submit, setSubmit] = useState({ status: "idle", refusal: null, resource: null });
  const [adding, setAdding] = useState(null);
  const [addState, setAddState] = useState({ status: "idle", message: null });
  const inputRef = useRef(null);
  /* The intent every answer is checked against: one per chosen file, voided
     by another file, a clear, closing or unmounting. */
  const intent = useRef(0);
  const mounted = useRef(true);
  useEffect(() => () => {
    mounted.current = false;
    intent.current += 1;
  }, []);

  /* Each read of the Python list is numbered, and only the newest one asked
     may set what is shown: an earlier read answering late — success or
     failure — would otherwise take back a Python a later read already
     listed (R-IUI-02). */
  const listTicket = useRef(0);
  const loadProfiles = useCallback(async () => {
    const mine = ++listTicket.current;
    const result = await python_profiles();
    if (!mounted.current || listTicket.current !== mine) return;
    setProfiles(result.ok
      ? { status: "ready", list: result.data.profiles, problem: null }
      : { status: "failed", list: [], problem: reason(result, agentMessage("agents.import.profiles_failed")) });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setCapability({ status: "loading", data: null, problem: null });
    transfer_capabilities().then((result) => {
      if (!alive || !mounted.current) return;
      setCapability(result.ok
        ? { status: "ready", data: result.data, problem: null }
        : { status: "unavailable", data: null, problem: reason(result, agentMessage("agents.import.host_unavailable")) });
    });
    loadProfiles();
    return () => {
      alive = false;
    };
  }, [open, loadProfiles]);

  const reset = () => {
    intent.current += 1;
    setFile(EMPTY_FILE);
    setChoices({});
    setSubmit({ status: "idle", refusal: null, resource: null });
    if (inputRef.current) inputRef.current.value = "";
  };

  const close = () => {
    reset();
    startForm(null);
    onClose();
  };

  const choose = async (picked) => {
    reset();
    if (!picked) return;
    const mine = intent.current;
    setFile({ ...EMPTY_FILE, status: "reading", name: picked.name });
    const max = capability.data && Number.isSafeInteger(capability.data.file_bytes) ? capability.data.file_bytes : null;
    const read = await read_import_file(picked, max, agentMessage);
    if (!mounted.current || intent.current !== mine) return;
    if (!read.ok) {
      setFile({ ...EMPTY_FILE, status: "refused", name: picked.name, problem: read.message });
      return;
    }
    const parsed = import_document(read.text, agentMessage);
    if (!parsed.ok) {
      setFile({ ...EMPTY_FILE, status: "refused", name: picked.name, problem: parsed.message });
      return;
    }
    setFile({ status: "ready", name: picked.name, text: read.text, document: parsed.document, occurrences: import_occurrences(parsed.document, agentMessage), problem: null });
  };

  const payload = file.status === "ready" ? import_payload(file.text, file.occurrences, choices) : null;
  const ready = capability.status === "ready" && payload !== null && submit.status !== "working" && submit.status !== "done";

  const run = async () => {
    if (!ready) return;
    const mine = intent.current;
    const sent = payload;
    setSubmit({ status: "working", refusal: null, resource: null });
    const result = await import_resource(sent);
    if (!mounted.current || intent.current !== mine) return;
    if (result.ok) {
      setSubmit({ status: "done", refusal: null, resource: result.data.resource });
      if (typeof onImported === "function") onImported(result.data.resource);
    } else {
      setSubmit({ status: "refused", refusal: import_refusal(result.error, file.document, file.occurrences, agentMessage), resource: null });
    }
  };

  /* A registration belongs to the form that sent it, as it was when it was
     sent (R-IUI-01). Opening the form, cancelling it, or editing what it
     holds starts a new intent, so a reply to an earlier one — even with the
     same name and path typed again — never closes, clears or labels the form
     now open. The store still keeps a Python it accepted, so any success
     refreshes the list; nothing is ever selected for the author. */
  const registration = useRef({ pending: null, ticket: 0 });
  const startForm = (values) => {
    registration.current.pending = null;
    setAddState({ status: "idle", message: null });
    setAdding(values);
  };
  const editForm = (values) => {
    if (registration.current.pending !== null) {
      registration.current.pending = null;
      setAddState({ status: "idle", message: null });
    }
    setAdding(values);
  };
  const addProfile = async () => {
    const id = adding ? adding.id.trim() : "";
    const executable = adding ? adding.executable.trim() : "";
    if (!id || !executable) return;
    const mine = ++registration.current.ticket;
    registration.current.pending = mine;
    setAddState({ status: "saving", message: null });
    const result = await save_python_profile(id, executable);
    if (!mounted.current) return;
    if (result.ok) loadProfiles();
    if (registration.current.pending !== mine) return;
    registration.current.pending = null;
    if (result.ok) {
      setAdding(null);
      setAddState({ status: "done", message: agentMessage("agents.import.profile_added", { id: safe_text(id) }) });
    } else {
      setAddState({ status: "refused", message: reason(result, agentMessage("agents.import.python_refused")) });
    }
  };

  const options = profiles.list
    .filter((profile) => profile && typeof profile.id === "string")
    .map((profile) => ({ value: profile.id, label: profile_label(profile, t) }));
  const document = file.document;
  const unchosen = file.occurrences.filter((occurrence) => !choices[occurrence.key]).length;

  return (
    <Modal open={open} onClose={close} style={{ width: 460, maxHeight: "80vh", overflowY: "auto", padding: "22px 24px 20px", backgroundColor: "var(--pupu-surface)" }}>
      <div data-testid="import-resource-modal" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.85)" }}>
          {t("agents.import.title")}
        </div>
        {capability.status === "loading" && <span style={NOTE}>{t("agents.import.checking")}</span>}
        {capability.status === "unavailable" && (
          <span data-testid="import-unavailable" style={problem_style(isDark)}>
            {t("agents.import.unavailable", { message: renderAgentMessage(capability.problem, t) })}
          </span>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={LABEL}>{t("agents.import.file")}</span>
          <input
            ref={inputRef}
            data-testid="import-file-input"
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(event) => choose(event.target.files && event.target.files[0])}
          />
          <div style={ROW}>
            <Button
              label={file.name ? t("agents.import.another_file") : t("agents.import.choose_file")}
              disabled={capability.status !== "ready"}
              onClick={() => inputRef.current && inputRef.current.click()}
              style={SMALL}
            />
            {file.name && <span data-testid="import-file-name" style={{ ...NOTE, ...MONO }}>{safe_text(file.name)}</span>}
            {file.name && <Button label={t("agents.import.clear")} onClick={reset} style={{ ...SMALL, opacity: 0.7 }} />}
          </div>
          {file.status === "reading" && <span style={NOTE}>{t("agents.import.reading")}</span>}
          {file.status === "refused" && <span data-testid="import-file-problem" style={problem_style(isDark)}>{renderAgentMessage(file.problem, t)}</span>}
        </div>

        {file.status === "ready" && document && (
          <div data-testid="import-preview" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={LABEL}>{t("agents.import.contents")}</span>
            <span style={NOTE}>
              {document.kind === "workflow" ? t("agents.import.workflow") : document.kind === "agent" ? t("agents.nodes.agent") : safe_text(document.kind)}{" "}
              <b>{safe_text(document.name || document.id)}</b> · <span style={MONO}>{safe_text(document.id)}</span>
            </span>
            <span style={NOTE}>
              {file.occurrences.length === 0
                ? t("agents.import.no_code")
                : file.occurrences.length === 1 ? t("agents.import.code_one") : t("agents.import.code_other", { count: file.occurrences.length })}{" "}
              {t("agents.import.references_not_imported")}
            </span>
          </div>
        )}

        {file.status === "ready" && file.occurrences.length > 0 && (
          <div data-testid="import-runtimes" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={LABEL}>{t("agents.import.runtimes")}</span>
            {profiles.status === "failed" && (
              <span style={problem_style(isDark)}>
                {t("agents.import.profiles_problem", { message: renderAgentMessage(profiles.problem, t) })}{" "}
                <Button label={t("agents.explorer.try_again")} onClick={loadProfiles} style={{ fontSize: 10.5, paddingVertical: 1, paddingHorizontal: 6 }} />
              </span>
            )}
            {file.occurrences.map((occurrence, index) => (
              <div key={occurrence.key} data-testid={`import-runtime-${index}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={NOTE}>
                  <span style={MONO}>{occurrence.node_id}</span>
                  {occurrence.inside.length > 0 ? t("agents.import.inside", { path: occurrence.inside.map((part) => renderAgentMessage(part, t)).join(" › ") }) : null}
                  {occurrence.stored_profile ? t("agents.import.previous_python", { profile: safe_text(occurrence.stored_profile) }) : null}
                </span>
                <Select
                  options={options}
                  value={choices[occurrence.key] || null}
                  set_value={(value) => {
                    if (typeof value !== "string" || !value) return;
                    setChoices((now) => ({ ...now, [occurrence.key]: value }));
                    /* A refusal was about the choices it was sent with. */
                    if (submit.status === "refused") setSubmit({ status: "idle", refusal: null, resource: null });
                  }}
                  filterable={false}
                  placeholder={profiles.status === "loading" ? t("agents.import.reading_profiles") : t("agents.import.choose_python")}
                  disabled={profiles.status !== "ready" || submit.status === "working" || submit.status === "done"}
                  style={FIELD}
                />
              </div>
            ))}
            {!adding && (
              <span>
                <Button
                  label={t("agents.import.name_python")}
                  onClick={() => {
                    startForm({ id: "", executable: "" });
                  }}
                  style={{ ...SMALL, color: "var(--pupu-accent)" }}
                />
              </span>
            )}
            {adding && (
              <div data-testid="import-runtime-add" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Input value={adding.id} placeholder={t("agents.import.profile_name")} set_value={(next) => editForm({ ...adding, id: next })} style={FIELD} />
                <Input value={adding.executable} placeholder={t("agents.import.python_path")} set_value={(next) => editForm({ ...adding, executable: next })} style={{ ...FIELD, ...MONO }} />
                <span style={NOTE}>{t("agents.import.python_explanation")}</span>
                <div style={ROW}>
                  <Button label={addState.status === "saving" ? t("agents.import.probing") : t("agents.import.add")} disabled={addState.status === "saving" || !adding.id.trim() || !adding.executable.trim()} onClick={addProfile} style={SMALL} />
                  <Button label={t("agents.explorer.cancel")} onClick={() => startForm(null)} style={{ ...SMALL, opacity: 0.7 }} />
                </div>
              </div>
            )}
            {addState.message && (
              <span data-testid="import-runtime-add-state" style={addState.status === "refused" ? problem_style(isDark) : NOTE}>{renderAgentMessage(addState.message, t)}</span>
            )}
          </div>
        )}

        {submit.status === "refused" && submit.refusal && (
          <div data-testid="import-refusal" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {submit.refusal.sentence && <span style={problem_style(isDark)}>{renderAgentMessage(submit.refusal.sentence, t)}</span>}
            <span style={{ ...problem_style(isDark), ...MONO }}>
              {safe_text(submit.refusal.code)} · {safe_text(submit.refusal.path)} · {renderAgentMessage(submit.refusal.message, t)}
            </span>
          </div>
        )}
        {submit.status === "done" && submit.resource && (
          <div data-testid="import-done" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={NOTE}>
              {t("agents.import.stored", { name: "\uE000", id: "\uE001" }).split(/(\uE000|\uE001)/).map((part, index) => part === "\uE000"
                ? <b key={index}>{safe_text(submit.resource.name || submit.resource.id)}</b>
                : part === "\uE001" ? <span key={index} style={MONO}>{safe_text(submit.resource.id)}</span> : part)}
            </span>
            <span data-testid="import-done-diagnostics" style={NOTE}>
              {Array.isArray(submit.resource.diagnostics) && submit.resource.diagnostics.length > 0
                ? submit.resource.diagnostics.length === 1 ? t("agents.import.diagnostic_one") : t("agents.import.diagnostic_other", { count: submit.resource.diagnostics.length })
                : t("agents.import.no_diagnostics")}{" "}
              {t("agents.import.stored_not_runnable")}
            </span>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span data-testid="import-pending" style={NOTE}>
            {file.status === "ready" && unchosen > 0 && submit.status !== "done" ? unchosen === 1 ? t("agents.import.remaining_one") : t("agents.import.remaining_other", { count: unchosen }) : ""}
          </span>
          <div style={ROW}>
            <Button label={submit.status === "done" ? t("agents.import.close") : t("agents.explorer.cancel")} onClick={close} style={{ ...SMALL, opacity: 0.75 }} />
            {submit.status !== "done" && (
              <Button
                label={submit.status === "working" ? t("agents.import.importing") : t("agents.import.import")}
                disabled={!ready}
                onClick={run}
                style={{ ...SMALL, color: "var(--pupu-accent)" }}
              />
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
