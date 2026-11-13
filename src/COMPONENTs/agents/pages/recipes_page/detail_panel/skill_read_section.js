import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { agentEnglishText } from "../agents_i18n";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Select from "./panel_select";
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
import { addButtonStyle, note, problem as problemOf, Region } from "./panel_style";
import { Block } from "./process_timeline";

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

const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const ROW = { display: "flex", alignItems: "center", gap: 6 };
const FIELD = { width: "100%", fontSize: 12, paddingVertical: 4, paddingHorizontal: 6 };
const SMALL_BUTTON = { fontSize: 11.5, paddingVertical: 1, paddingHorizontal: 6 };
const STORED = "\u0000stored";
const IDENTITY_KEYS = ["source", "source_id", "name"];
/* A text action that sits in a row beside what it removes. */
const inRowButtonStyle = (isDark) => ({ ...addButtonStyle(isDark), alignSelf: "center", flexShrink: 0 });

const size_text = (bytes, t = agentEnglishText) => (bytes < 1024 ? t("agents.execution.skill.bytes", { count: bytes }) : t("agents.execution.skill.kilobytes", { count: (bytes / 1024).toFixed(1) }));

function refusal_text(error, t = agentEnglishText) {
  const code = error && error.code;
  if (code === "identity_mismatch") {
    return t("agents.execution.skill.identity_mismatch");
  }
  if (code === "skill_unavailable") return t("agents.execution.skill.unavailable");
  return safe_text((error && error.message) || t("agents.execution.skill.preview_failed"));
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
  const { t } = useTranslation();
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
        label: exact ? t("agents.execution.skill.unlisted_option", { name: safe_text(identity.name) || t("agents.execution.skill.unnamed") }) : t("agents.execution.skill.unreadable_option", { name: safe_text(identity.name) || t("agents.execution.skill.unnamed") }),
      }]
      : []),
    ...rows.map((row, index) => ({ value: String(index), label: `${row.identity.name} · ${source_label(row.identity.source, t)}` })),
  ];
  const selected = !identity ? null : at === -1 ? STORED : String(at);
  const listed = at === -1 ? null : rows[at];
  const problems = skill_read_problems(node, list.status === "ready" ? list.rows : null, t);
  const inputs = node_bindings(node);
  const extras = Object.keys(node.config || {}).filter((key) => !["execution", "skill"].includes(key));

  return (
    <section data-testid="skill-read-section" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {!editable && (
        <div style={problemOf(isDark)}>
          {!unique ? t("agents.execution.read_only.duplicate_ids") : t("agents.execution.read_only.stored")}
        </div>
      )}

      <div data-testid="skill-read-inputs" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <Block section="skill-read-inputs" title={t("agents.io.input_variables")} isDark={isDark}>
        {inputs.length === 0 ? (
          <span style={note(isDark)}>{t("agents.execution.skill.no_inputs")}</span>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={problemOf(isDark)}>
              {inputs.length === 1 ? t("agents.execution.skill.one_input") : t("agents.execution.skill.many_inputs", { count: inputs.length })}
            </span>
            <span>
              <Button label={t("agents.execution.skill.remove_inputs")} disabled={!editable} onClick={() => commit(without_inputs(document, node.id))}
                style={addButtonStyle(isDark)} />
            </span>
          </div>
        )}
      </Block>
      </div>

      <Block section="skill-read-skill" title={t("agents.execution.skill.skill")} isDark={isDark} help={
            <span style={note(isDark)}>
              {includeUserDirs
              ? t("agents.execution.skill.all_sources_note")
              : t("agents.execution.skill.packs_only_note")}
            {" "}{t("agents.execution.skill.project_sources_note")}</span>
      }>
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
            placeholder={list.status === "loading" ? t("agents.execution.skill.reading_list") : t("agents.execution.skill.pick_skill")}
            disabled={!editable}
            dropdown_style={{ maxHeight: "min(280px, 40vh)" }}
            style={FIELD}
          />
        </span>
        {list.status === "error" && (
          <span data-testid="skill-read-list-error" style={problemOf(isDark)}>{t("agents.execution.skill.list_failed")}<Button label={t("agents.explorer.try_again")} onClick={reloadList} style={SMALL_BUTTON} />
          </span>
        )}
        {identity && !exact && (
          <span data-testid="skill-read-stored" style={note(isDark)}>
            {t("agents.execution.skill.stored_identity", { identity: "{identity}", extra: "{extra}" }).split(/(\{identity\}|\{extra\})/g).map((part, index) => ({ __proto__: null, "{identity}": (<React.Fragment key={index}>{IDENTITY_KEYS.map((key, index) => <span key={key}>{index > 0 ? t("agents.schema.fields.list_separator") : ""}{key} <span style={MONO}>{safe_text(identity[key])}</span></span>)}</React.Fragment>), "{extra}": (<React.Fragment key={index}>{Object.keys(identity).filter((key) => !IDENTITY_KEYS.includes(key)).map((key) => <span key={`extra-${key}`}>{t("agents.schema.fields.list_separator")}{t("agents.execution.skill.extra_setting", { setting: "{setting}" }).split("{setting}").map((part, at) => <React.Fragment key={at}>{at > 0 && <span style={MONO}>{safe_text(key)}</span>}{part}</React.Fragment>)}</span>)}</React.Fragment>) }[part] || part))}
          </span>
        )}
        {listed && listed.description && <span style={note(isDark)}>{listed.description}</span>}
        {identity && complete && (
          <span data-testid="skill-read-source" style={note(isDark)}>
            {t("agents.execution.skill.source_location", { location: "{location}", source: "{source}" }).split(/(\{location\}|\{source\})/g).map((part, index) => ({ __proto__: null, "{location}": (<span key={index} style={MONO}>{safe_text(identity.source_id)}</span>), "{source}": source_label(identity.source, t) }[part] || part))}
          </span>
        )}
      </Block>

      {complete && (
        <div data-testid="skill-read-preview" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <Block section="skill-read-preview" title={t("agents.execution.skill.preview")} isDark={isDark}
            help={<span style={note(isDark)}>{t("agents.execution.skill.preview_note")}</span>}
            aside={preview.status === "ready" ? (
              <span data-testid="skill-read-preview-size">{size_text(preview.preview.bytes, t)}</span>
            ) : undefined}>
          {preview.status === "loading" && <span style={note(isDark)}>{t("agents.execution.skill.reading_preview", { name: safe_text(identity.name) })}</span>}
          {preview.status === "error" && (
            <span data-testid="skill-read-preview-error" style={problemOf(isDark)}>
              {refusal_text(preview.error, t)} <Button label={t("agents.explorer.try_again")} onClick={reloadPreview} style={SMALL_BUTTON} />
            </span>
          )}
          {preview.status === "ready" && (
            <Region isDark={isDark}>
            <pre
              data-testid="skill-read-preview-body"
              /* The app's own overlay scrollbar, as every other scroll area. */
              className="scrollable"
              data-sb-edge="6"
              style={{
                ...MONO,
                margin: 0,
                maxHeight: 220,
                overflow: "auto",
                fontSize: 11.5,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                padding: "8px 10px",
              }}
            >
              {preview.preview.body}
            </pre>
            </Region>
          )}
          </Block>
        </div>
      )}

      {extras.map((key) => (
        <div key={key} data-testid={`skill-read-setting-${key}`} style={{ ...ROW, justifyContent: "space-between" }}>
          <span style={problemOf(isDark)}>{t("agents.execution.skill.unsupported_setting", { key: safe_text(key) })}</span>
          <Button
            label={t("agents.execution.skill.remove_setting")}
            ariaLabel={t("agents.execution.skill.remove_setting_key", { key: key })}
            disabled={!editable}
            onClick={() => {
              const config = { ...node.config };
              delete config[key];
              commit({ ...document, nodes: document.nodes.map((item) => (item === node ? { ...node, config } : item)) });
            }}
            style={inRowButtonStyle(isDark)}
          />
        </div>
      ))}

      {problems.length > 0 && (
        <div data-testid="skill-read-problems" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {problems.map((problem, index) => (
            <span key={index} style={problemOf(isDark)}>{problem.message}</span>
          ))}
        </div>
      )}
    </section>
  );
}
