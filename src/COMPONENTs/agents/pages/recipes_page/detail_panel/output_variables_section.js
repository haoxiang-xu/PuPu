import { agentEnglishText } from "../agents_i18n";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import React from "react";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import OutputRow from "./output_row";
import OutputValuePill from "./output_value_pill";
import {
  node_bindings,
  node_declares_outputs,
  node_output_mappings,
  output_source_kinds_for,
  with_node_output_mappings,
} from "../skeleton_document";
import { identity_of } from "../document_values";
import { make_output_mapping, output_mapping_problems } from "../skeleton_io";
import { result_roots_for } from "../skeleton_result_roots";
import { CAPTION_TEXT, Region, note } from "./panel_style";
import AskOutputRow from "./ask_output_row";
import { add_ask, add_reply, ask_rows, ask_unavailable, remove_ask, taken_ask_names, update_ask } from "../agent_asks";
import { is_system_context_input, is_system_context_output } from "./system_context_visibility";

/* Output Variables: what this node passes on, and from where.
 *
 * This is the other half of a binding. An input row reads a name some upstream
 * node exports; these rows are what that list is made of, so a graph wires up
 * from the bottom of one panel to the top of the next.
 *
 * Nothing here decides admission. The store's `diagnose` and the runtime's
 * `validate_static_execution_io` do, and `output_surface_problems` only mirrors
 * them so a row can say what is wrong with it before any round trip — the same
 * split the input rows use.
 *
 * `result_root_problems` is not a mirror, and the difference is worth keeping
 * visible. The static validator never looks at the result side at all, so a
 * result naming a field its producer does not have passes every check and
 * fails only once the node runs. The runtime does admit a closed result shape
 * for most node types, so saying it here is saying something true sooner —
 * but it is the builder speaking, not a repetition of a check that exists. An
 * earlier round of this file claimed a result's shape was not statically
 * knowable at all, which was wrong for every type but three; the round after
 * it over-corrected and spoke as if an Agent's schema always closed its own
 * field list, which is wrong whenever the schema does not say so. */

const SECTION_LABEL = CAPTION_TEXT;

function input_names(node, document) {
  return node_bindings(node)
    .filter((binding) => !document || !is_system_context_input(document, node, binding))
    .map((binding) => binding && binding.name)
    .filter((name) => typeof name === "string" && name);
}

/* The builder's reading of `StaticIOSurfaces.output_problem`, plus the one
   rule the draft diagnose states in words: "end outputs may only use inputs".
   Both are reachable from a loaded draft even though the controls will not
   compose them, so both have to be sayable on a row. */
export function output_surface_problems(node, mappings, t = agentEnglishText) {
  const problems = [];
  const names = input_names(node);
  const type = node && node.type;
  mappings.forEach((mapping, index) => {
    const source = mapping && mapping.source;
    if (!source || typeof source !== "object") return;
    const where = `mappings[${index}].source`;
    if (type === "end" && source.kind !== "input" && source.kind !== undefined) {
      problems.push({
        code: "invalid_value",
        where: `${where}.kind`,
        message: t("agents.io.an_end_can_only_export_what_it_was_given_not_a_result"),
      });
      return;
    }
    if (source.kind !== "input") return;
    const [first] = Array.isArray(source.path) ? source.path : [];
    if (first === undefined) return; /* The whole inputs object; nothing to name. */
    /* A segment of any other shape is already refused by the path check as
       `invalid_path`, and it must not be touched to say so a second time. The
       store keeps `[{toString: null}]`, and composing it into a message
       converts it to a string, which throws — taking the whole panel with it
       before any diagnostic could be shown. */
    if (typeof first === "number") {
      problems.push({
        code: "missing_value",
        where: `${where}.path[0]`,
        message: t("agents.io.a_list_position_cannot_name_an_input_choose_one_by_name"),
      });
      return;
    }
    if (typeof first !== "string") return;
    if (!names.includes(first)) {
      problems.push({
        code: "missing_value",
        where: `${where}.path[0]`,
        message: t("agents.io.validation.input_absent", { name: first }),
      });
    }
  });
  return problems;
}



/* What the runtime will refuse, said earlier.
 *
 * This one is not a mirror: the static validator never looks at the result
 * side, so `result: ["typo"]` on an Agent draws no diagnostic at all and fails
 * only once the node runs, with `missing_value` at `mappings[0].source.path`.
 * Saying so here is saying something true sooner, not inventing a rule — but
 * only where the inventory is closed, and that is the whole of the second
 * half. An earlier round read an Agent's schema for its direct `properties`
 * and then spoke as if that list were exhaustive. It is not: without
 * `additionalProperties: false` the result may carry fields the schema never
 * names, and the runtime publishes them. A list that may be incomplete cannot
 * prove a name absent, so an open one says nothing at all rather than
 * something categorical about a field that really does arrive. */
export function result_root_problems(node, mappings, t = agentEnglishText) {
  const roots = result_roots_for(node, t);
  if (!roots.known || !roots.closed) return [];
  const captions = {
    agent: { object: "agents.io.validation.agent_result_object", absent: "agents.io.validation.agent_result_absent" },
    tool_call: { object: "agents.io.validation.tool_call_result_object", absent: "agents.io.validation.tool_call_result_absent" },
    skill_read: { object: "agents.io.validation.skill_read_result_object", absent: "agents.io.validation.skill_read_result_absent" },
    code: { object: "agents.io.validation.code_result_object", absent: "agents.io.validation.code_result_absent" },
    workflow_call: { object: "agents.io.validation.workflow_call_result_object", absent: "agents.io.validation.workflow_call_result_absent" },
  };
  const caption = Object.prototype.hasOwnProperty.call(captions, node && node.type)
    ? captions[node.type]
    : { object: "agents.io.validation.other_result_object", absent: "agents.io.validation.other_result_absent" };
  const problems = [];
  mappings.forEach((mapping, index) => {
    const source = mapping && mapping.source;
    if (!source || typeof source !== "object" || source.kind !== "result") return;
    const [first] = Array.isArray(source.path) ? source.path : [];
    if (first === undefined) return; /* The whole result. */
    const where = `mappings[${index}].source.path[0]`;
    if (typeof first !== "string") {
      /* A position cannot name a field of an object, and a shape the path
         check already refused is left to it. */
      if (typeof first === "number") {
        problems.push({
          code: "missing_value",
          where,
          message: t(caption.object),
        });
      }
      return;
    }
    if (!roots.roots.includes(first)) {
      problems.push({
        code: "missing_value",
        where,
        message: t(caption.absent, { name: first }),
      });
    }
  });
  return problems;
}

/* Presentation only: the runtime's context remains in the result and any
   stored exports. Keep original indexes so editing a visible row never
   addresses a hidden one. Invalid metadata stays visible for repair. */
export function visible_output_rows(node, rowDiagnostics, document) {
  const mappings = node_output_mappings(node);
  const problems = output_mapping_problems(mappings);
  return mappings.flatMap((mapping, index) => {
    const metadata = is_system_context_output(document, node, mapping);
    const hasProblem = Boolean(rowDiagnostics?.[index]?.length)
      || problems.some((problem) => problem.where.startsWith(`mappings[${index}]`));
    return metadata && !hasProblem ? [] : [{ mapping, index }];
  });
}

export default function OutputVariablesSection({
  document,
  node,
  /* Which handed-over document this is — see `DetailPanel`. It belongs in the
     row identity below, where the rest of "which row is this" already is. */
  revision,
  rowDiagnostics,
  isDark,
  onChange,
  hideHeading = false,
  addAtEnd = false,
  breadcrumb = false,
  /* How the rows look, apart from what they store. `breadcrumb` is the
     Agent / Start / End reading; `look="pill"` gives any other node the same
     rows, with the value typed as a path so a row can still reach inside a
     result (`result.items[0]`) as the older row's path editor could. */
  look,
}) {
  const { t } = useTranslation();
  const pill = breadcrumb || look === "pill";
  /* A branch selects an outlet rather than producing a value, and a pool
     attaches rather than runs, so neither has an outputs key at all. */
  if (!node_declares_outputs(node && node.type)) return null;

  const mappings = node_output_mappings(node);
  const kinds = output_source_kinds_for(node.type);
  const names = input_names(node, document);
  const roots = result_roots_for(node, t);
  const pickerRoots = node.type === "agent"
    ? { ...roots, roots: roots.roots.filter((name) => name !== "context") }
    : roots;
  const visibleRows = visible_output_rows(node, rowDiagnostics, document);
  const Row = pill ? OutputValuePill : OutputRow;
  const rowLook = pill && !breadcrumb ? { typedPath: true } : {};
  const composed = [
    ...output_mapping_problems(mappings, t),
    ...output_surface_problems(node, mappings, t),
    ...result_root_problems(node, mappings, t),
  ];

  /* An Agent's "Ask the agent for…" outputs: a schema field and the output
     of the same name, edited as one row (see `agent_asks`). */
  const isAgent = node.type === "agent";
  const asks = isAgent ? ask_rows(node) : new Map();
  const askBlocked = isAgent ? ask_unavailable(node) : null;

  function set_mappings(next) {
    onChange(with_node_output_mappings(document, node.id, next));
  }

  function add_mapping() {
    const kind = kinds[0];
    set_mappings([
      ...mappings,
      make_output_mapping({
        name: "",
        kind,
        /* Seeded with a usable first step where one is knowable, so a new row
           is never born already refused. */
        path: kind === "input" && names.length > 0 ? [names[0]] : [],
      }),
    ]);
  }

  const add_button = <Button
    prefix_icon={addAtEnd ? undefined : "add"}
    label={addAtEnd ? t("agents.io.add_output") : undefined}
    ariaLabel={t("agents.io.add_output")}
    title={t("agents.io.add_output")}
    onClick={add_mapping}
    style={{ fontSize: 11, paddingVertical: addAtEnd ? 5 : 3, paddingHorizontal: addAtEnd ? 6 : 4,
      iconOnlyPaddingVertical: 3, iconOnlyPaddingHorizontal: 4, borderRadius: 5,
      alignSelf: addAtEnd ? "flex-start" : undefined,
      content: { icon: { width: 14, height: 14 } }, color: addAtEnd ? (isDark ? "#a1a1aa" : "#68686f") : "var(--pupu-text-muted)" }} />;

  const agentAddStyle = {
    fontSize: 11, paddingVertical: 5, paddingHorizontal: 6, borderRadius: 5,
    color: isDark ? "#a1a1aa" : "#68686f",
  };
  const agent_add = (
    <div data-testid="agent-add-output" style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
        <Button label={t("agents.io.ask.add_ask")} ariaLabel={t("agents.io.ask.add_ask")}
          disabled={Boolean(askBlocked)} onClick={() => onChange(add_ask(document, node))} style={agentAddStyle} />
        <Button label={t("agents.io.ask.add_input")} ariaLabel={t("agents.io.ask.add_input")}
          onClick={add_mapping} style={agentAddStyle} />
        <Button label={t("agents.io.ask.add_reply")} ariaLabel={t("agents.io.ask.add_reply")}
          onClick={() => onChange(add_reply(document, node))} style={agentAddStyle} />
      </div>
      {askBlocked && <span data-testid="agent-ask-unavailable" style={note(isDark)}>{t(askBlocked)}</span>}
      {asks.size > 0 && <span data-testid="agent-ask-json-note" style={note(isDark)}>{t("agents.io.ask.json_note")}</span>}
    </div>
  );

  return (
    /* Addressable on its own: the legacy Start panel heads its own section with
       the same words, and although the two models never render together — a
       Skeleton page has no recipe and a recipe page has no document — a probe
       searching by that text cannot tell which one it found. */
    <div
      data-testid="skeleton-output-variables"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      {(!hideHeading || !addAtEnd) && <div
        style={{
          display: "flex",
          justifyContent: hideHeading ? "flex-end" : "space-between",
          alignItems: "center",
        }}
      >
        {!hideHeading && <span style={SECTION_LABEL}>{t("agents.io.output_variables")}</span>}
        {!addAtEnd && add_button}
      </div>}

      {mappings.length === 0 && !addAtEnd && (
        <span style={{ fontSize: 11, color: "#86868b" }}>
          {t("agents.io.this_node_passes_nothing_on_so_nothing_downstream_can_read_from_it")}
        </span>
      )}

      {(() => {
        const rows = visibleRows.map(({ mapping, index }) => asks.has(index) ? (
          <AskOutputRow
            key={index}
            testid={`ask-output-${index}`}
            field={asks.get(index)}
            index={index}
            nodeId={node.id}
            revision={revision}
            taken={taken_ask_names(node, asks.get(index).name)}
            isDark={isDark}
            problems={[
              ...composed.filter((problem) => problem.where.startsWith(`mappings[${index}]`)),
              ...((rowDiagnostics && rowDiagnostics[index]) || []),
            ]}
            onChange={(patch) => onChange(update_ask(document, node, index, patch))}
            onRemove={() => onChange(remove_ask(document, node, index))}
          />
        ) : (
        <Row
          key={index}
          mapping={mapping}
          index={index}
          /* What a row is, for the controls that hold text the document does
             not. The position alone is not it: remove a row and the next one
             takes its place, and anything still keyed to that place now
             describes a different mapping. The node and the row's own name
             narrow it as far as the wire allows — `{name, source}` is closed,
             so there is no id to carry. A rename drops a pending refusal,
             which is the harmless direction.
             This used to end "and the rest is caught by comparing the stored
             value", which is not true: a document arriving from the store can
             land on the same value, and the refused step then stayed on
             screen beside a page that said Saved. So the document it was
             typed against is part of what a row is, and a replacement remints
             the steps rather than leaving them to a comparison that cannot
             see it. Joined through `identity_of`, because a node id may hold
             a colon and `a + ":" + b` is not an encoding. */
          identity={identity_of([
            revision,
            node.id,
            index,
            (mapping && mapping.name) || "",
          ])}
          nodeType={node.type}
          kinds={kinds}
          inputNames={names}
          resultRoots={pickerRoots}
          isDark={isDark}
          {...rowLook}
          problems={[
            ...composed.filter((problem) =>
              problem.where.startsWith(`mappings[${index}]`),
            ),
            ...((rowDiagnostics && rowDiagnostics[index]) || []),
          ]}
          onChange={(next) =>
            set_mappings(mappings.map((old, i) => (i === index ? next : old)))
          }
          onRemove={() => set_mappings(mappings.filter((_, i) => i !== index))}
        />
      ));
        return pill ? <Region isDark={isDark}>{rows}</Region> : rows;
      })()}
      {addAtEnd && (isAgent ? agent_add : add_button)}
    </div>
  );
}
