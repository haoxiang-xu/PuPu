import React, { useCallback, useEffect, useRef, useState } from "react";
import Modal from "../../../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../BUILTIN_COMPONENTs/input/input";
import Select from "../../../../BUILTIN_COMPONENTs/select/select";
import { safe_text } from "./document_values";
import { profile_label } from "./code_config";
import { import_resource, python_profiles, save_python_profile, transfer_capabilities } from "./skeleton_resources";
import { import_document, import_occurrences, import_payload, import_refusal, read_import_file } from "./resource_import";

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
const reason = (result, fallback) => safe_text((result && result.error && (result.error.message || result.error.code)) || fallback);

const EMPTY_FILE = { status: "none", name: null, text: null, document: null, occurrences: [], problem: null };

export default function ImportResourceModal({ open, onClose, onImported, isDark }) {
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
      : { status: "failed", list: [], problem: reason(result, "the profile list could not be read") });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setCapability({ status: "loading", data: null, problem: null });
    transfer_capabilities().then((result) => {
      if (!alive || !mounted.current) return;
      setCapability(result.ok
        ? { status: "ready", data: result.data, problem: null }
        : { status: "unavailable", data: null, problem: reason(result, "the host does not offer import") });
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
    const read = await read_import_file(picked, max);
    if (!mounted.current || intent.current !== mine) return;
    if (!read.ok) {
      setFile({ ...EMPTY_FILE, status: "refused", name: picked.name, problem: read.message });
      return;
    }
    const parsed = import_document(read.text);
    if (!parsed.ok) {
      setFile({ ...EMPTY_FILE, status: "refused", name: picked.name, problem: parsed.message });
      return;
    }
    setFile({ status: "ready", name: picked.name, text: read.text, document: parsed.document, occurrences: import_occurrences(parsed.document), problem: null });
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
      setSubmit({ status: "refused", refusal: import_refusal(result.error, file.document, file.occurrences), resource: null });
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
      setAddState({ status: "done", message: `${safe_text(id)} was added. Choose it for the steps that should use it.` });
    } else {
      setAddState({ status: "refused", message: reason(result, "the store refused this Python") });
    }
  };

  const options = profiles.list
    .filter((profile) => profile && typeof profile.id === "string")
    .map((profile) => ({ value: profile.id, label: profile_label(profile) }));
  const document = file.document;
  const unchosen = file.occurrences.filter((occurrence) => !choices[occurrence.key]).length;

  return (
    <Modal open={open} onClose={close} style={{ width: 460, maxHeight: "80vh", overflowY: "auto", padding: "22px 24px 20px", backgroundColor: "var(--pupu-surface)" }}>
      <div data-testid="import-resource-modal" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.85)" }}>
          Import an Agent or Workflow
        </div>
        {capability.status === "loading" && <span style={NOTE}>Asking the host what it can import…</span>}
        {capability.status === "unavailable" && (
          <span data-testid="import-unavailable" style={problem_style(isDark)}>
            Import is not available here: {capability.problem}
          </span>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={LABEL}>File</span>
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
              label={file.name ? "Choose another file…" : "Choose a file…"}
              disabled={capability.status !== "ready"}
              onClick={() => inputRef.current && inputRef.current.click()}
              style={SMALL}
            />
            {file.name && <span data-testid="import-file-name" style={{ ...NOTE, ...MONO }}>{safe_text(file.name)}</span>}
            {file.name && <Button label="Clear" onClick={reset} style={{ ...SMALL, opacity: 0.7 }} />}
          </div>
          {file.status === "reading" && <span style={NOTE}>Reading…</span>}
          {file.status === "refused" && <span data-testid="import-file-problem" style={problem_style(isDark)}>{file.problem}</span>}
        </div>

        {file.status === "ready" && document && (
          <div data-testid="import-preview" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={LABEL}>What it holds</span>
            <span style={NOTE}>
              {document.kind === "workflow" ? "Workflow" : document.kind === "agent" ? "Agent" : safe_text(document.kind)}{" "}
              <b>{safe_text(document.name || document.id)}</b> · <span style={MONO}>{safe_text(document.id)}</span>
            </span>
            <span style={NOTE}>
              {file.occurrences.length === 0
                ? "No Code steps, so no Python to choose."
                : `${file.occurrences.length} Code step${file.occurrences.length === 1 ? "" : "s"}, each needing a Python on this machine.`}{" "}
              Other Agents or Workflows it refers to are not in the file and are not created.
            </span>
          </div>
        )}

        {file.status === "ready" && file.occurrences.length > 0 && (
          <div data-testid="import-runtimes" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={LABEL}>Python for each Code step</span>
            {profiles.status === "failed" && (
              <span style={problem_style(isDark)}>
                The Python list could not be read: {profiles.problem}{" "}
                <Button label="Try again" onClick={loadProfiles} style={{ fontSize: 10.5, paddingVertical: 1, paddingHorizontal: 6 }} />
              </span>
            )}
            {file.occurrences.map((occurrence, index) => (
              <div key={occurrence.key} data-testid={`import-runtime-${index}`} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={NOTE}>
                  <span style={MONO}>{occurrence.node_id}</span>
                  {occurrence.inside.length > 0 ? <> · inside {occurrence.inside.join(" › ")}</> : null}
                  {occurrence.stored_profile ? <> · it used “{safe_text(occurrence.stored_profile)}” where it was exported</> : null}
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
                  placeholder={profiles.status === "loading" ? "reading the Python list…" : "choose a Python"}
                  disabled={profiles.status !== "ready" || submit.status === "working" || submit.status === "done"}
                  style={FIELD}
                />
              </div>
            ))}
            {!adding && (
              <span>
                <Button
                  label="Name a Python…"
                  onClick={() => {
                    startForm({ id: "", executable: "" });
                  }}
                  style={{ ...SMALL, color: "var(--pupu-accent)" }}
                />
              </span>
            )}
            {adding && (
              <div data-testid="import-runtime-add" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Input value={adding.id} placeholder="profile name, e.g. pupu-tools" set_value={(next) => editForm({ ...adding, id: next })} style={FIELD} />
                <Input value={adding.executable} placeholder="absolute path to its python" set_value={(next) => editForm({ ...adding, executable: next })} style={{ ...FIELD, ...MONO }} />
                <span style={NOTE}>The executable itself, never an activate script or a shell command. It is probed before it is kept. Nothing in the file is used for this.</span>
                <div style={ROW}>
                  <Button label={addState.status === "saving" ? "Probing…" : "Add"} disabled={addState.status === "saving" || !adding.id.trim() || !adding.executable.trim()} onClick={addProfile} style={SMALL} />
                  <Button label="Cancel" onClick={() => startForm(null)} style={{ ...SMALL, opacity: 0.7 }} />
                </div>
              </div>
            )}
            {addState.message && (
              <span data-testid="import-runtime-add-state" style={addState.status === "refused" ? problem_style(isDark) : NOTE}>{addState.message}</span>
            )}
          </div>
        )}

        {submit.status === "refused" && submit.refusal && (
          <div data-testid="import-refusal" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {submit.refusal.sentence && <span style={problem_style(isDark)}>{submit.refusal.sentence}</span>}
            <span style={{ ...problem_style(isDark), ...MONO }}>
              {safe_text(submit.refusal.code)} · {safe_text(submit.refusal.path)} · {submit.refusal.message}
            </span>
          </div>
        )}
        {submit.status === "done" && submit.resource && (
          <div data-testid="import-done" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={NOTE}>
              Stored <b>{safe_text(submit.resource.name || submit.resource.id)}</b> · <span style={MONO}>{safe_text(submit.resource.id)}</span>.
              An identical earlier import is kept as it was.
            </span>
            <span data-testid="import-done-diagnostics" style={NOTE}>
              {Array.isArray(submit.resource.diagnostics) && submit.resource.diagnostics.length > 0
                ? `The draft check reports ${submit.resource.diagnostics.length} problem${submit.resource.diagnostics.length === 1 ? "" : "s"}; open it to see them.`
                : "The draft check reports nothing."}{" "}
              Imported means stored, not checked to run: Run checks the rest.
            </span>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <span data-testid="import-pending" style={NOTE}>
            {file.status === "ready" && unchosen > 0 && submit.status !== "done" ? `Choose a Python for ${unchosen} more step${unchosen === 1 ? "" : "s"}.` : ""}
          </span>
          <div style={ROW}>
            <Button label={submit.status === "done" ? "Close" : "Cancel"} onClick={close} style={{ ...SMALL, opacity: 0.75 }} />
            {submit.status !== "done" && (
              <Button
                label={submit.status === "working" ? "Importing…" : "Import"}
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
