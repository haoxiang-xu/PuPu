import React, { useCallback, useEffect, useRef, useState } from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../../BUILTIN_COMPONENTs/input/input";
import Select from "../../../../../BUILTIN_COMPONENTs/select/select";
import Switch from "../../../../../BUILTIN_COMPONENTs/input/switch";
import { BUILDER_SWITCH_SIZE } from "../builder_switch_size";
import useTakenName from "./taken_name";
import {
  LEGACY_FIELDS_CONFIG_KEY,
  node_pool_is_legacy,
  node_subagents,
  with_node_subagents,
} from "../skeleton_document";
import {
  SUBAGENT_MEMORY_POLICIES,
  SUBAGENT_MODES,
  SUBAGENT_OUTPUT_MODES,
  free_entry_id,
  free_entry_name,
  new_subagent_entry,
  subagent_pool_problems,
} from "../subagent_pool_config";
import {
  entry_agent_id,
  entry_source_label,
  subagent_candidates,
} from "../skeleton_subagent_eligibility";
import { is_unavailable, list_resources } from "../skeleton_resources";

/* The Subagent Pool: which Agents this one may call, and how.
 *
 * The pool holds Agents and never Workflows. That is not a label this panel
 * chooses — an entry's `source` is either a reference to a resource whose
 * stored kind is `agent`, or a whole embedded Agent document, and the store
 * refuses anything else at Run (`_resolve_subagent_closure`: `wrong_kind`,
 * `resource_missing`, `resource_archived`, `recursive_reference`). The picker
 * refuses the same things before the author can compose them, through the one
 * gate in `skeleton_subagent_eligibility`.
 *
 * It manages entries and how they are used. It does not edit a subagent's
 * contents: a subagent is a complete Agent graph, and a graph is edited on the
 * canvas by drilling into it. So there is no prompt box here, no model, no
 * tools of its own — everything on a row is about *this* parent's use of that
 * Agent.
 *
 * Two things this panel says that nothing else will. A pool's configuration is
 * invisible to every boundary the author meets while editing: the format check
 * accepts any of it, the draft diagnostics say nothing about it, and so does
 * the structural execution gate — the refusal comes from `prepare_agent_graph`
 * when Run is pressed. And an empty pool is not an incomplete draft the
 * runtime tolerates; it is refused outright. Both are in
 * `subagent_pool_admission_capture`. */

const SECTION_LABEL = {
  fontSize: 11,
  fontWeight: 600,
  color: "#86868b",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const CAPTION = { fontSize: 10.5, color: "#86868b", lineHeight: 1.45 };
const MONO = { fontFamily: "ui-monospace, Menlo, monospace" };
const PROBLEM = { fontSize: 10.5, lineHeight: 1.45 };
const REFUSED = { ...PROBLEM, color: "rgba(176,32,32,0.95)" };

const SECTION_CAPTION =
  "Each entry is an Agent with its own graph. This panel manages the entries and how this Agent uses them; a subagent's own contents are edited by opening its graph.";

const EMPTY_CAPTION =
  "This pool holds no Agent yet. A pool that holds nothing is refused when the Agent runs, so add one or remove the pool node.";

const LEGACY_CAPTION =
  "This pool came from a legacy definition. Its entries are converted when the Agent runs, and are shown here as they are stored; converting them into Agent graphs is not available yet, so nothing here is editable — an edit would stop the conversion from happening and the subagents would be lost.";

const UNAVAILABLE_CAPTION =
  "The Agent library is not reachable in this build, so an Agent cannot be referenced yet. Entries already stored are shown below.";

const TOOLS_CAPTION =
  "Tool restrictions are shown as stored. They are not edited here: the runtime accepts any tool name without checking it, so a name typed here could silently restrict nothing.";

const MODE_CAPTION = {
  delegate: "delegate — called as a tool, its result comes back here",
  handoff: "handoff — this Agent's turn ends and the subagent answers",
  worker: "worker — runs alongside, this Agent keeps the turn",
};

const OUTPUT_MODE_LABEL = {
  summary: "a summary",
  last_message: "its last message",
  full_trace: "its whole trace",
};

const MEMORY_LABEL = {
  ephemeral: "nothing is kept",
  scoped_persistent: "kept in its own scope",
};

const is_object = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/* A table is not read with a name out of a document. `MODE_CAPTION[mode]`
   where the mode came from the draft answers `Object.prototype` for
   `__proto__` — truthy, not a string, and rendering it as a child takes the
   panel down inside the sentence that was about to explain the mode. */
function own(table, key) {
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
}

/* Which problems belong to this row, by the path the mirror reports — the
   same addressing the runtime uses, so a row never shows another row's. */
function problems_at(problems, prefix) {
  return problems.filter(
    (problem) => problem.where === prefix || problem.where.startsWith(`${prefix}.`),
  );
}

function tools_text(entry) {
  const allowed = entry.allowed_tools;
  const disabled = Array.isArray(entry.disabled_tools) ? entry.disabled_tools : [];
  /* `null` is "every tool" and `[]` is "no tool" — the wire's own
     distinction. An absent key is neither: the entry does not say, and
     reading it as "every tool" would state something the document does not,
     over a draft the runtime refuses for the missing field. */
  const allowed_text =
    allowed === null
      ? "every tool"
      : allowed === undefined
        ? "not stated"
        : Array.isArray(allowed)
          ? allowed.length === 0
            ? "no tool"
            : allowed.join(", ")
          : "an unreadable list";
  return disabled.length > 0
    ? `Tools: ${allowed_text}, except ${disabled.join(", ")}`
    : `Tools: ${allowed_text}`;
}

function ModeToggle({ mode, on, onToggle }) {
  return (
    <Button
      label={mode}
      ariaLabel={`${on ? "Stop allowing" : "Allow"} ${mode}`}
      onClick={onToggle}
      style={{
        flexShrink: 0,
        fontSize: 10.5,
        paddingVertical: 3,
        paddingHorizontal: 7,
        borderRadius: 4,
        color: on ? "#4a5bd8" : "#86868b",
      }}
    />
  );
}

function EntryRow({ entry, index, taken, library, isDark, problems, onChange, onRemove }) {
  const name = useTakenName(entry.name, taken, entry.id);
  const agent_id = entry_agent_id(entry);
  const referenced =
    library.status === "ready" && agent_id !== null
      ? library.items.find((item) => item && item.id === agent_id) || null
      : null;
  const missing = library.status === "ready" && agent_id !== null && referenced === null;
  const modes = Array.isArray(entry.allowed_modes) ? entry.allowed_modes : [];

  function set(patch) {
    onChange({ ...entry, ...patch });
  }

  function toggle_mode(mode) {
    /* Written in the wire's own order rather than the order they were
       clicked, so two pools that allow the same modes are the same document. */
    const next = modes.includes(mode)
      ? modes.filter((held) => held !== mode)
      : SUBAGENT_MODES.filter((known) => known === mode || modes.includes(known));
    set({ allowed_modes: next });
  }

  return (
    <div
      data-testid={`subagent-entry-${index}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "8px 10px",
        borderRadius: 7,
        background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flexShrink: 0 }}>
          <Input
            value={name.shown}
            set_value={(next) => {
              const stored = name.type(next);
              if (stored !== null) set({ name: stored });
            }}
            placeholder="name"
            style={{
              width: 140,
              fontSize: 11.5,
              ...MONO,
              paddingVertical: 4,
              paddingHorizontal: 6,
              borderRadius: 5,
            }}
          />
          {name.held !== null && (
            <span data-testid={`subagent-entry-${index}-name-taken`} style={REFUSED}>
              {name.taken
                ? `Another subagent is already called ${name.held || "that"}. This was not stored.`
                : "This was not stored. The name is free now — type it again to use it."}
            </span>
          )}
        </div>
        <span data-testid={`subagent-entry-${index}-source`} style={{ ...CAPTION, flex: 1, minWidth: 0 }}>
          {`${entry_source_label(entry)}${
            referenced !== null
              ? ` · ${referenced.name}`
              : agent_id !== null
                ? ` · ${agent_id}`
                : ""
          }`}
        </span>
        <Button
          prefix_icon="close"
          ariaLabel={`Remove ${entry.name || "subagent"}`}
          onClick={onRemove}
          style={{
            flexShrink: 0,
            paddingVertical: 4,
            paddingHorizontal: 4,
            borderRadius: 4,
            content: { icon: { width: 11, height: 11 } },
          }}
        />
      </div>

      {missing && (
        <span data-testid={`subagent-entry-${index}-missing`} style={REFUSED}>
          {`No Agent with the id ${agent_id} is in the library, so this entry cannot run. Remove it or reference an Agent that exists.`}
        </span>
      )}

      <Input
        value={typeof entry.description === "string" ? entry.description : ""}
        set_value={(next) => set({ description: next })}
        placeholder="what it is for (optional)"
        style={{
          width: "100%",
          fontSize: 11,
          paddingVertical: 3,
          paddingHorizontal: 6,
          borderRadius: 5,
        }}
      />

      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <span style={{ ...CAPTION, flexShrink: 0 }}>called as</span>
        {SUBAGENT_MODES.map((mode) => (
          <ModeToggle
            key={mode}
            mode={mode}
            on={modes.includes(mode)}
            onToggle={() => toggle_mode(mode)}
          />
        ))}
      </div>
      {modes.length === 1 && own(MODE_CAPTION, modes[0]) !== undefined && (
        <span style={CAPTION}>{own(MODE_CAPTION, modes[0])}</span>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ ...CAPTION, flexShrink: 0 }}>this Agent reads</span>
        <Select
          options={SUBAGENT_OUTPUT_MODES.map((value) => ({
            value,
            label: OUTPUT_MODE_LABEL[value],
          }))}
          value={entry.output_mode}
          set_value={(next) => set({ output_mode: next })}
          filterable={false}
          style={{
            width: 136,
            flexShrink: 0,
            fontSize: 11.5,
            paddingVertical: 4,
            paddingHorizontal: 6,
            borderRadius: 5,
            gap: 4,
          }}
        />
        <span style={{ ...CAPTION, flexShrink: 0 }}>its memory</span>
        <Select
          options={SUBAGENT_MEMORY_POLICIES.map((value) => ({
            value,
            label: MEMORY_LABEL[value],
          }))}
          value={entry.memory_policy}
          set_value={(next) => set({ memory_policy: next })}
          filterable={false}
          style={{
            width: 156,
            flexShrink: 0,
            fontSize: 11.5,
            paddingVertical: 4,
            paddingHorizontal: 6,
            borderRadius: 5,
            gap: 4,
          }}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Switch
          on={entry.parallel_safe === true}
          set_on={(next) => set({ parallel_safe: Boolean(next) })}
          style={{ ...BUILDER_SWITCH_SIZE, flexShrink: 0 }}
        />
        <span style={CAPTION}>
          {entry.parallel_safe === true
            ? "May run beside other subagents."
            : "Runs on its own, never beside another subagent."}
        </span>
      </div>

      <span data-testid={`subagent-entry-${index}-tools`} style={CAPTION}>
        {tools_text(entry)}
      </span>

      {problems.map((problem, position) => (
        <span
          key={position}
          data-testid={`subagent-entry-${index}-problem-${position}`}
          style={{
            ...PROBLEM,
            color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)",
          }}
        >
          {`${problem.message} (${problem.where})`}
        </span>
      ))}
    </div>
  );
}

export default function SubagentPoolSection({ document, node, isDark, onChange }) {
  /* The library is read once per panel, for two jobs: offering Agents to
     reference, and saying that an entry's reference is no longer there. A
     build that cannot reach the store says so rather than looking like an
     account with no Agents in it. */
  const [library, setLibrary] = useState({ status: "loading", items: [], error: null });
  const [picking, setPicking] = useState(false);
  const alive = useRef(true);

  const read_library = useCallback(() => {
    return Promise.resolve(list_resources(false)).then((answer) => {
      if (!alive.current) return;
      if (answer && answer.ok) {
        const data = answer.data || {};
        setLibrary({
          status: "ready",
          items: Array.isArray(data.resources) ? data.resources : [],
          error: null,
        });
        return;
      }
      setLibrary({
        status: is_unavailable(answer) ? "unavailable" : "failed",
        items: [],
        error: (answer && answer.error) || null,
      });
    });
  }, []);

  useEffect(() => {
    alive.current = true;
    read_library();
    return () => {
      alive.current = false;
    };
  }, [read_library]);

  const legacy = node_pool_is_legacy(node);
  const held = node_subagents(node);
  const entries = Array.isArray(held) ? held : [];
  /* A legacy pool is not in this wire at all, so the wire's rules would
     describe it wrongly — `legacy_fields` would read as an unknown field and
     the missing `subagents` as a missing one, for a document the store
     expands on its own. */
  const problems = legacy ? [] : subagent_pool_problems(node.config);
  const names = entries.map((entry) => (is_object(entry) && entry.name) || "");
  const ids = entries.map((entry) => (is_object(entry) && entry.id) || "");

  /* The owner is the resource being edited, which is the document's own id:
     referencing it would be an Agent calling itself. */
  const owner_id = (document && document.id) || null;
  const offered = subagent_candidates(library.items, { owner_id });
  const withheld = library.items.length - offered.length;

  function set_entries(next) {
    /* The composer is never handed a collision, on either unique field. The
       name box is what tells the author; this is the belt at the boundary. */
    const next_names = next.map((entry) => entry.name);
    const next_ids = next.map((entry) => entry.id);
    if (new Set(next_names).size !== next_names.length) return;
    if (new Set(next_ids).size !== next_ids.length) return;
    onChange(with_node_subagents(document, node.id, next));
  }

  function add(resource) {
    setPicking(false);
    set_entries([
      ...entries,
      new_subagent_entry({
        id: free_entry_id(ids),
        name: free_entry_name(names, resource.name),
        agent_id: resource.id,
      }),
    ]);
  }

  return (
    <div
      data-testid="skeleton-subagent-pool"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={SECTION_LABEL}>Subagents</span>
        {!legacy && (
          <Button
            label={picking ? "Cancel" : "+ Add an Agent"}
            /* Read again on the way in. Within one sitting the library can
               only change from somewhere else — another window, another
               process — and the two things that go wrong then are both worth
               a request: offering an Agent that has just been archived, and
               telling the author a reference is missing when it is not. */
            onClick={() => {
              if (!picking) read_library();
              setPicking(!picking);
            }}
            style={{
              fontSize: 11,
              paddingVertical: 3,
              paddingHorizontal: 8,
              borderRadius: 5,
              color: "#4a5bd8",
            }}
          />
        )}
      </div>

      <span style={CAPTION}>{SECTION_CAPTION}</span>

      {legacy && (
        <span data-testid="subagent-pool-legacy" style={CAPTION}>
          {LEGACY_CAPTION}
        </span>
      )}

      {legacy &&
        (Array.isArray(node.config[LEGACY_FIELDS_CONFIG_KEY].subagents)
          ? node.config[LEGACY_FIELDS_CONFIG_KEY].subagents
          : []
        ).map((raw, index) => (
          <span
            key={index}
            data-testid={`subagent-legacy-entry-${index}`}
            style={{ ...CAPTION, ...MONO }}
          >
            {(is_object(raw) &&
              (raw.recipe_name || raw.template_name || raw.name)) ||
              "an entry with no name"}
          </span>
        ))}

      {!legacy && entries.length === 0 && (
        <span data-testid="subagent-pool-empty" style={CAPTION}>
          {EMPTY_CAPTION}
        </span>
      )}

      {!legacy &&
        entries.map((entry, index) =>
          is_object(entry) ? (
            <EntryRow
              key={index}
              entry={entry}
              index={index}
              taken={names.filter((_, position) => position !== index)}
              library={library}
              isDark={isDark}
              problems={problems_at(problems, `config.subagents[${index}]`)}
              onChange={(next) =>
                set_entries(entries.map((old, position) => (position === index ? next : old)))
              }
              onRemove={() =>
                set_entries(entries.filter((_, position) => position !== index))
              }
            />
          ) : (
            /* A draft can hold anything the format check takes, and a `config`
               object is all that layer asks of a pool. The problems are
               reported here rather than at the section, because they are about
               this position in the list and a reader looking for them will
               look where the entry should have been. */
            <div
              key={index}
              style={{ display: "flex", flexDirection: "column", gap: 4 }}
            >
              <span
                data-testid={`subagent-entry-${index}-unreadable`}
                style={REFUSED}
              >
                This entry is not an object, so none of its controls can be
                shown. Remove it and add the Agent again.
              </span>
              {problems_at(problems, `config.subagents[${index}]`).map(
                (problem, position) => (
                  <span
                    key={position}
                    data-testid={`subagent-entry-${index}-problem-${position}`}
                    style={{
                      ...PROBLEM,
                      color: isDark
                        ? "rgba(255,140,140,0.95)"
                        : "rgba(176,32,32,0.95)",
                    }}
                  >
                    {`${problem.message} (${problem.where})`}
                  </span>
                ),
              )}
            </div>
          ),
        )}

      {/* Said once, under the rows, and only while there is a row to say it
          about: a notice explaining a control nobody can see is the
          unreachable-UI shape, which this panel has already paid for once. */}
      {!legacy && entries.length > 0 && (
        <span data-testid="subagent-pool-tools-note" style={CAPTION}>
          {TOOLS_CAPTION}
        </span>
      )}

      {!legacy && picking && library.status === "unavailable" && (
        <span data-testid="subagent-library-unavailable" style={CAPTION}>
          {UNAVAILABLE_CAPTION}
        </span>
      )}

      {!legacy && picking && library.status === "failed" && (
        <span data-testid="subagent-library-failed" style={REFUSED}>
          {`The Agent library could not be read, so nothing can be referenced: ${
            (library.error && library.error.message) || "the store refused the request."
          }`}
        </span>
      )}

      {!legacy && picking && library.status === "ready" && (
        <div
          data-testid="subagent-picker"
          style={{ display: "flex", flexDirection: "column", gap: 4 }}
        >
          {offered.length === 0 && (
            <span data-testid="subagent-picker-empty" style={CAPTION}>
              There is no other Agent to reference yet. An Agent is built in
              this builder and appears here once it is saved.
            </span>
          )}
          {offered.map((resource) => (
            <Button
              key={resource.id}
              label={resource.name || resource.id}
              ariaLabel={`Reference ${resource.name || resource.id}`}
              onClick={() => add(resource)}
              style={{
                alignSelf: "stretch",
                fontSize: 11.5,
                paddingVertical: 4,
                paddingHorizontal: 8,
                borderRadius: 5,
              }}
            />
          ))}
          {withheld > 0 && (
            <span data-testid="subagent-picker-withheld" style={CAPTION}>
              {`${withheld} other ${
                withheld === 1 ? "resource is" : "resources are"
              } not offered: a Subagent Pool holds Agents, and not this Agent itself.`}
            </span>
          )}
        </div>
      )}

      {/* The pool's own problems. An entry's are shown on the entry, so this
          is everything addressed above them: a missing `subagents`, a pool
          holding nothing, an unknown field on the config itself.
       *
       * Not gated on the shape again. A legacy pool has no problems to show
       * because none were computed for it, and a second guard here would be a
       * condition that cannot be false — the unreachable-UI shape that has
       * already cost this panel one round, where a notice claimed something
       * no reader could ever see. */}
      {problems
          .filter((problem) => !problem.where.startsWith("config.subagents["))
          .map((problem, index) => (
            <span
              key={index}
              data-testid={`subagent-pool-problem-${index}`}
              style={{
                ...PROBLEM,
                color: isDark ? "rgba(255,140,140,0.95)" : "rgba(176,32,32,0.95)",
              }}
            >
              {`${problem.message} (${problem.where})`}
            </span>
          ))}
    </div>
  );
}
