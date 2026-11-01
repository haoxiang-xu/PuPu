import React, { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import { api } from "../../../../../SERVICEs/api";
import { readSkillsIncludeUserDirsSetting } from "../../../../../SERVICEs/plugin_skill_sync";
import { safe_text } from "../document_values";
import { node_bindings } from "../skeleton_document";
import {
  exact_identity,
  read_skill_inventory,
  same_identity,
  skill_identity,
  skill_read_problems,
  source_label,
  with_skill,
  without_inputs,
} from "../skill_read_config";

/* A Skill Read node: one skill, read by the runtime when the run reaches it
 * (#352). Every rule here is the fixed runtime's (see `skill_read_config`):
 *
 *   - the skill is picked from the sidecar's own skill list and stored as the
 *     exact identity the runtime matches; nothing about it is composed here;
 *   - the step takes no inputs, so this section takes the place of Input
 *     Variables and shows rows stored anyway so they can be removed;
 *   - the preview is the runtime's own exact read (`previewSkeletonSkill`),
 *     shown read-only. It is never stored and never what runs: the run reads
 *     the skill again when it gets here.
 *
 * The builder has no chat workspace, so the list holds the user's skills (when
 * the user-skills switch is on, the same switch a chat run reads) and the
 * installed skill packs. */

const LABEL = { fontSize: 11, fontWeight: 600, color: "#86868b", textTransform: "uppercase", letterSpacing: 0.4 };
const NOTE = { fontSize: 10.5, color: "#86868b", lineHeight: 1.45 };
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const ROW = { display: "flex", alignItems: "center", gap: 6 };
const FIELD = { width: "100%", fontSize: 11.5, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 5 };
const SMALL_BUTTON = { fontSize: 10.5, paddingVertical: 1, paddingHorizontal: 6 };
const STORED = "\u0000stored";
const IDENTITY_KEYS = ["source", "source_id", "name"];
const problem_style = (isDark) => ({
  fontSize: 10.5,
  lineHeight: 1.45,
  color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)",
});

function Divider({ isDark }) {
  return <div style={{ height: 1, margin: "2px 0", background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }} />;
}

const size_text = (bytes) => (bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KB`);

function refusal_text(error) {
  const code = error && error.code;
  if (code === "identity_mismatch") {
    return "This skill is not available as it was picked: its exact source, location and name could not be read. The run would fail to read it.";
  }
  if (code === "skill_unavailable") return "This skill could not be read. The run would fail to read it too.";
  return safe_text((error && error.message) || "The skill could not be previewed.");
}

function useSkillList(includeUserDirs) {
  const [list, setList] = useState({ status: "loading", rows: null });
  const ticket = useRef(0);
  const read = useCallback(async () => {
    const mine = ++ticket.current;
    setList((old) => ({ ...old, status: "loading" }));
    try {
      const rows = read_skill_inventory(await api.unchain.getSkillInventory({ workspaceRoot: "", includeUserDirs, toolkits: [] }));
      if (mine === ticket.current) setList({ status: "ready", rows });
    } catch (_error) {
      if (mine === ticket.current) setList({ status: "error", rows: null });
    }
  }, [includeUserDirs]);
  useEffect(() => {
    read();
    return () => {
      ticket.current += 1;
    };
  }, [read]);
  return [list, read];
}

function usePreview(identity, includeUserDirs) {
  const key = identity ? JSON.stringify([identity.source, identity.source_id, identity.name, includeUserDirs]) : null;
  const [state, setState] = useState({ key: null, status: "idle", preview: null, error: null });
  const ticket = useRef(0);
  const read = useCallback(async () => {
    if (!key) return;
    const mine = ++ticket.current;
    setState({ key, status: "loading", preview: null, error: null });
    try {
      const [source, source_id, name] = JSON.parse(key);
      const preview = await api.unchain.previewSkeletonSkill({ source, source_id, name }, includeUserDirs);
      if (mine === ticket.current) setState({ key, status: "ready", preview, error: null });
    } catch (error) {
      if (mine === ticket.current) setState({ key, status: "error", preview: null, error });
    }
  }, [key, includeUserDirs]);
  useEffect(() => {
    read();
    return () => {
      ticket.current += 1;
    };
  }, [read]);
  return [state.key === key ? state : { status: key ? "loading" : "idle", preview: null, error: null }, read];
}

export default function SkillReadSection({ document, node, isDark, onChange }) {
  const [includeUserDirs] = useState(() => readSkillsIncludeUserDirsSetting());
  const [list, reloadList] = useSkillList(includeUserDirs);
  const identity = skill_identity(node);
  const complete = identity && ["source", "source_id", "name"].every((key) => typeof identity[key] === "string" && identity[key]);
  const [preview, reloadPreview] = usePreview(complete ? identity : null, includeUserDirs);

  const unique = Array.isArray(document && document.nodes) && document.nodes.filter((item) => item && item.id === node.id).length === 1;
  const editable = unique && (document.kind === "agent" || document.kind === "workflow") &&
    document.schema_version === 1 && typeof onChange === "function";
  const commit = (next) => {
    if (editable && next !== document) onChange(next);
  };

  /* Only an exact identity is matched to a row. One the runtime refuses — an
     extra key, a part that is not text — is its own stored option, so picking
     any listed skill, the same one included, replaces it (R-352-03). */
  const exact = exact_identity(identity);
  const rows = list.status === "ready" ? list.rows : [];
  const at = exact ? rows.findIndex((row) => same_identity(row.identity, identity)) : -1;
  const options = [
    ...(identity && at === -1 && list.status === "ready"
      ? [{
        value: STORED,
        label: `${safe_text(identity.name) || "(unnamed)"} (${exact ? "not in the skill list now" : "stored in a form the runtime cannot read"})`,
      }]
      : []),
    ...rows.map((row, index) => ({ value: String(index), label: `${row.identity.name} · ${source_label(row.identity.source)}` })),
  ];
  const selected = !identity ? null : at === -1 ? STORED : String(at);
  const listed = at === -1 ? null : rows[at];
  const problems = skill_read_problems(node, list.status === "ready" ? list.rows : null);
  const inputs = node_bindings(node);
  const extras = Object.keys(node.config || {}).filter((key) => !["execution", "skill"].includes(key));

  return (
    <section data-testid="skill-read-section" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!editable && (
        <div style={problem_style(isDark)}>
          {!unique ? "Duplicate node ids prevent editing this step." : "These stored settings are read-only here."}
        </div>
      )}

      <div data-testid="skill-read-inputs" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={LABEL}>Input Variables</span>
        {inputs.length === 0 ? (
          <span style={NOTE}>No inputs. A Skill Read takes none.</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={problem_style(isDark)}>
              {inputs.length === 1 ? "One input is" : `${inputs.length} inputs are`} stored for this step; the runtime refuses a Skill Read that has any.
            </span>
            <span>
              <Button label="Remove inputs" disabled={!editable} onClick={() => commit(without_inputs(document, node.id))}
                style={{ ...SMALL_BUTTON, paddingVertical: 2, borderRadius: 5 }} />
            </span>
          </div>
        )}
      </div>

      <Divider isDark={isDark} />

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={LABEL}>Skill</span>
        <span data-testid="skill-read-picker">
          <Select
            options={options}
            value={selected}
            set_value={(value) => {
              if (value === STORED) return;
              const row = rows[Number(value)];
              if (row && (!exact || !same_identity(row.identity, identity))) commit(with_skill(document, node.id, row.identity));
            }}
            filterable
            placeholder={list.status === "loading" ? "reading the skill list…" : "pick a skill"}
            disabled={!editable}
            dropdown_style={{ maxHeight: "min(280px, 40vh)" }}
            style={FIELD}
          />
        </span>
        {list.status === "error" && (
          <span data-testid="skill-read-list-error" style={problem_style(isDark)}>
            The skill list could not be read. <Button label="Try again" onClick={reloadList} style={SMALL_BUTTON} />
          </span>
        )}
        {identity && !exact && (
          <span data-testid="skill-read-stored" style={NOTE}>
            Stored as{" "}
            {IDENTITY_KEYS.map((key, index) => (
              <span key={key}>
                {index > 0 ? ", " : ""}
                {key} <span style={MONO}>{safe_text(identity[key])}</span>
              </span>
            ))}
            {Object.keys(identity).filter((key) => !IDENTITY_KEYS.includes(key)).map((key) => (
              <span key={`extra-${key}`}>
                , and <span style={MONO}>{safe_text(key)}</span>, which the runtime does not read
              </span>
            ))}
            . It is kept until you pick a skill.
          </span>
        )}
        {listed && listed.description && <span style={NOTE}>{listed.description}</span>}
        {identity && complete && (
          <span data-testid="skill-read-source" style={NOTE}>
            From {source_label(identity.source)}: <span style={MONO}>{safe_text(identity.source_id)}</span>
          </span>
        )}
        <span style={NOTE}>
          {includeUserDirs
            ? "Lists your skills and installed skill packs."
            : "Lists installed skill packs; your own skills are switched off in settings."}
          {" "}Skills from a chat's project folder are not listed here. A run reads the exact skill selected above, even when the project has one with the same name.
        </span>
      </div>

      {complete && (
        <div data-testid="skill-read-preview" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ ...ROW, justifyContent: "space-between" }}>
            <span style={LABEL}>Preview</span>
            {preview.status === "ready" && (
              <span data-testid="skill-read-preview-size" style={NOTE}>{size_text(preview.preview.bytes)}</span>
            )}
          </div>
          {preview.status === "loading" && <span style={NOTE}>Reading {safe_text(identity.name)}…</span>}
          {preview.status === "error" && (
            <span data-testid="skill-read-preview-error" style={problem_style(isDark)}>
              {refusal_text(preview.error)} <Button label="Try again" onClick={reloadPreview} style={SMALL_BUTTON} />
            </span>
          )}
          {preview.status === "ready" && (
            <pre
              data-testid="skill-read-preview-body"
              style={{
                ...MONO,
                margin: 0,
                maxHeight: 220,
                overflow: "auto",
                fontSize: 11,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                padding: "8px 10px",
                borderRadius: 6,
                background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
              }}
            >
              {preview.preview.body}
            </pre>
          )}
          <span style={NOTE}>
            Read-only, and not what runs: the run reads this skill again when it gets here, and a resumed run keeps what it read the first time.
          </span>
        </div>
      )}

      {extras.map((key) => (
        <div key={key} data-testid={`skill-read-setting-${key}`} style={{ ...ROW, justifyContent: "space-between" }}>
          <span style={problem_style(isDark)}>Unsupported setting: {safe_text(key)}</span>
          <Button
            label="Remove setting"
            ariaLabel={`Remove setting ${key}`}
            disabled={!editable}
            onClick={() => {
              const config = { ...node.config };
              delete config[key];
              commit({ ...document, nodes: document.nodes.map((item) => (item === node ? { ...node, config } : item)) });
            }}
            style={{ ...SMALL_BUTTON, paddingVertical: 2, borderRadius: 5 }}
          />
        </div>
      ))}

      {problems.length > 0 && (
        <div data-testid="skill-read-problems" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {problems.map((problem, index) => (
            <span key={index} style={problem_style(isDark)}>{problem.message}</span>
          ))}
        </div>
      )}
    </section>
  );
}
