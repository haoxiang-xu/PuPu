import React, { useEffect, useId, useRef, useState } from "react";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import useReducedMotion from "../../../../../BUILTIN_COMPONENTs/mini_react/use_reduced_motion";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import InputVariablesSection from "./input_variables_section";
import OutputVariablesSection, { visible_output_rows } from "./output_variables_section";
import OutputSchemaSection from "./output_schema_section";
import KernelSection from "./kernel_section";
import PanelHelp from "./panel_help";
import { node_bindings } from "../skeleton_document";
import { ask_unavailable } from "../agent_asks";

/* One column, one kind of heading. What an Agent is comes first and stays in
   view: its model and its prompt, never folded. Under them, what it is wired
   to: Input, then Output, each of which folds. The limits few people touch
   wait at the bottom. Every part is headed by the same quiet caption and uses
   the panel's full width; order and spacing do the grouping. */

/* Which of Input / Output are open is remembered for the session, so walking
   from node to node does not fold them back each time. */
const DEFAULT_OPEN = ["input"];
let rememberedOpen = new Set(DEFAULT_OPEN);
/* The same memory for a FoldBlock, by its own section key. */
const rememberedFolds = new Map();
export const resetProcessPanelMemory = () => {
  rememberedOpen = new Set(DEFAULT_OPEN);
  rememberedFolds.clear();
};

const MUTED = (isDark) => (isDark ? "#a1a1aa" : "#68686f");

/* The side menus' section title: small, spaced capitals, quiet. */
export const captionStyle = (isDark) => ({
  fontSize: 11, textTransform: "uppercase", letterSpacing: "1.5px", lineHeight: "18px",
  color: isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.9)", opacity: 0.4,
  userSelect: "none", WebkitUserSelect: "none",
});

/* How many things are wrong, as a number you can see while the part that
   holds them is folded or scrolled away. Jost's line box puts a digit about
   1px above the middle of a 16px pill (ink 3.3px from the top, 5.3px from the
   bottom); 2px at the top and none at the bottom centres it. */
export const PROBLEM_COUNT_PADDING = "2px 5px 0";
export function ProblemCount({ count, section, isDark }) {
  if (!count) return null;
  return (
    <span data-testid={`process-problems-${section}`} role="status" aria-label={String(count)}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        minWidth: 16, height: 16, padding: PROBLEM_COUNT_PADDING, boxSizing: "border-box", borderRadius: 999,
        fontSize: 10.5, fontWeight: 600, lineHeight: 1, pointerEvents: "none",
        color: isDark ? "#ff9c9c" : "#a52a2a",
        background: isDark ? "rgba(255,120,120,0.18)" : "rgba(176,32,32,0.1)" }}>
      {count}
    </span>
  );
}

/* Every part folds (the project owner's rule: every section can be opened
   and closed), from its words and arrow, remembered for the session by
   section, and opened once by itself when a problem turns up inside it.
   A Block starts open unless `defaultOpen` is false. `aside` (a count, a
   length) stays beside the caption whether the part is open or folded. */
export function Block({ section, title, help, problems = [], aside, defaultOpen = true, isDark, children }) {
  const id = useId();
  const reducedMotion = useReducedMotion();
  const [expanded, setExpanded] = useState(() => (rememberedFolds.has(section) ? rememberedFolds.get(section) : defaultOpen));
  const toggle = () => setExpanded((old) => {
    rememberedFolds.set(section, !old);
    return !old;
  });
  const flagged = useRef(false);
  useEffect(() => {
    const now = problems.length > 0;
    if (now && !flagged.current) setExpanded(true);
    flagged.current = now;
  }, [problems.length]);
  return (
    <Disclosure id={id} section={section} title={title} help={help} aside={aside} problems={problems}
      expanded={expanded} onToggle={toggle} isDark={isDark} reducedMotion={reducedMotion}>
      {children}
    </Disclosure>
  );
}

/* A part that starts folded. */
export function FoldBlock({ defaultOpen = false, ...props }) {
  return <Block defaultOpen={defaultOpen} {...props} />;
}

function Disclosure({ id, section, title, help, summary, aside, problems, expanded, onToggle, isDark, reducedMotion, children }) {
  return (
    // No hover surface and no card.
    <div data-testid={`process-disclosure-${section}`} style={{ minWidth: 0, backgroundColor: "transparent" }}>
      <div data-testid={`process-header-${section}`}
        style={{ display: "flex", alignItems: "center", gap: 0, minWidth: 0,
          minHeight: 32, margin: "-5px 0", boxSizing: "border-box" }}>
        {/* Only the words and the arrow toggle, with a little room around
            them: the rest of the row is somewhere safe to click away from an
            open menu. */}
        <button type="button" aria-label={title} aria-expanded={expanded}
          aria-controls={id} onClick={onToggle} data-testid={`process-toggle-${section}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, minHeight: 32,
            margin: "0 0 0 -8px", padding: "0 8px", border: 0, borderRadius: 6, cursor: "pointer",
            backgroundColor: "transparent", font: "inherit" }}>
          <span style={{ ...captionStyle(isDark), flexShrink: 0, pointerEvents: "none" }}>{title}</span>
          <Icon src="arrow_down" color="#86868b" style={{ width: 11, height: 11, flexShrink: 0, opacity: 0.8,
            pointerEvents: "none", transform: expanded ? "rotate(180deg)" : "none",
            transition: reducedMotion ? "none" : "transform 200ms cubic-bezier(0.32,0.72,0,1)" }} />
        </button>
        <ProblemCount count={problems.length} section={section} isDark={isDark} />
        {help && <span style={{ display: "inline-flex", flexShrink: 0, marginLeft: 4 }}>
          <PanelHelp label={title}>{help}</PanelHelp>
        </span>}
        {/* Open or folded, the same place keeps a Block's count. */}
        {aside !== undefined && <span data-testid={`process-aside-${section}`}
          style={{ marginLeft: "auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontSize: 11.5, fontVariantNumeric: "tabular-nums", color: MUTED(isDark),
            userSelect: "none", WebkitUserSelect: "none" }}>{aside}</span>}
        {/* Folded, the row still says what is inside. */}
        {summary !== undefined && <span data-testid={`process-summary-${section}`} aria-hidden={expanded ? true : undefined}
          style={{ marginLeft: "auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontSize: 11.5, fontVariantNumeric: "tabular-nums", color: MUTED(isDark), pointerEvents: "none",
            opacity: expanded ? 0 : 1, transition: reducedMotion ? "none" : "opacity 160ms ease" }}>
          {summary}
        </span>}
      </div>
      <div id={id} role="region" aria-label={title} aria-hidden={!expanded} inert={!expanded}
        data-testid={`process-section-${section}`}
        style={{ display: "grid", minWidth: 0, gridTemplateRows: expanded ? "1fr" : "0fr",
          opacity: expanded ? 1 : 0, visibility: expanded ? "visible" : "hidden",
          transition: reducedMotion ? "none" : `grid-template-rows 200ms cubic-bezier(0.32,0.72,0,1), opacity 160ms ease, visibility 0s ${expanded ? "0s" : "200ms"}` }}>
        <div style={{ minHeight: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, padding: "8px 0 2px" }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/* "Advanced: Edit as JSON": the Agent's JSON Output editor, kept mounted
   (it holds unstored text) and shown on request. */
function AdvancedSchema({ open, onToggle, isDark, children }) {
  const { t } = useTranslation();
  return (
    <div data-testid="agent-output-advanced" style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      <button type="button" aria-expanded={open} onClick={onToggle} data-testid="agent-output-advanced-toggle"
        style={{ display: "inline-flex", alignItems: "center", gap: 4, alignSelf: "flex-start", padding: "2px 0",
          border: 0, background: "transparent", cursor: "pointer", font: "inherit", fontSize: 11,
          color: MUTED(isDark) }}>
        <Icon src="arrow_down" color="#86868b" style={{ width: 10, height: 10, transform: open ? "rotate(180deg)" : "none" }} />
        {t("agents.io.ask.advanced")}
      </button>
      <div style={{ display: open ? "flex" : "none", flexDirection: "column", minWidth: 0 }}>{children}</div>
    </div>
  );
}

/* Folded, a part says how many rows it holds: enough to know whether there
   is anything to open it for. */
const countOf = (rows) => String(rows.filter(Boolean).length);

// A view of the same editors, not a second document or a second Kernel owner.
// Folded parts stay mounted, including refused/pending field text.
export default function ProcessTimeline({ document, node, revision, isDark, onChange, rowDiagnostics }) {
  const { t } = useTranslation();
  const id = useId();
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(() => new Set(rememberedOpen));
  const toggle = (key) => setOpen((old) => {
    const next = new Set(old);
    if (next.has(key)) next.delete(key); else next.add(key);
    rememberedOpen = new Set(next);
    return next;
  });
  const [advancedSchema, setAdvancedSchema] = useState(false);
  const inputProblems = Object.values(rowDiagnostics?.inputs || {}).flat();
  const outputProblems = Object.values(rowDiagnostics?.outputs || {}).flat();

  /* A part that turns out to hold a problem opens itself, once: after that
     it is the author's to fold again. */
  const flagged = useRef({ input: false, output: false });
  useEffect(() => {
    const now = { input: inputProblems.length > 0, output: outputProblems.length > 0 };
    const opening = Object.keys(now).filter((key) => now[key] && !flagged.current[key]);
    flagged.current = now;
    if (opening.length) setOpen((old) => new Set([...old, ...opening]));
  }, [inputProblems.length, outputProblems.length]);

  const input = <InputVariablesSection document={document} node={node} rowDiagnostics={rowDiagnostics?.inputs}
    isDark={isDark} onChange={onChange} hideHeading addAtEnd breadcrumb />;
  /* The outputs an author adds and asks for come first; the schema itself,
     as JSON Output's rows or JSON, waits under Advanced. A schema those rows
     cannot hold opens it, since that is then the only place to edit it. */
  const schemaIsJson = ask_unavailable(node) === "agents.io.ask.schema_is_json";
  const output = <>
    <OutputVariablesSection document={document} node={node} revision={revision} rowDiagnostics={rowDiagnostics?.outputs}
      isDark={isDark} onChange={onChange} hideHeading addAtEnd breadcrumb />
    <AdvancedSchema open={advancedSchema || schemaIsJson} onToggle={() => setAdvancedSchema((old) => !old)} isDark={isDark}>
      <OutputSchemaSection document={document} node={node} revision={revision} isDark={isDark} onChange={onChange} quiet />
    </AdvancedSchema>
  </>;
  return <KernelSection document={document} node={node} revision={revision} isDark={isDark} onChange={onChange}
    renderSections={({ modelPicker, advanced, prompt, promptHelp, promptSummary, modelProblems, promptProblems }) => {
      const wiring = [
        { key: "input", title: t("agents.io.input_variables"), content: input, problems: inputProblems,
          summary: countOf(node_bindings(node)) },
        { key: "output", title: t("agents.io.output_variables"), content: output, problems: outputProblems,
          summary: countOf(visible_output_rows(node, rowDiagnostics?.outputs, document).map((row) => row.mapping)) },
      ];
      return (
        <div data-testid="process-detail-timeline" style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
          {/* One Kernel editor, laid out in three places. Inputs come first
              and outputs last, on every node's page. */}
          <div data-testid="skeleton-kernel" style={{ display: "contents" }}>
            <div data-testid="process-wiring" style={{ display: "contents" }}>
            <Disclosure key={wiring[0].key} id={`${id}-${wiring[0].key}`} section={wiring[0].key} title={wiring[0].title}
              summary={wiring[0].summary} problems={wiring[0].problems}
              expanded={open.has(wiring[0].key)} onToggle={() => toggle(wiring[0].key)}
              isDark={isDark} reducedMotion={reducedMotion}>{wiring[0].content}</Disclosure>
            <Block section="model" title={t("agents.inspector.model")} problems={modelProblems} isDark={isDark}>
              {modelPicker}
            </Block>
            <Block section="prompt" title={t("agents.execution.agent.prompt")} help={promptHelp}
              problems={promptProblems} isDark={isDark}
              /* Counted in characters as a reader sees them, so a CJK prompt
                 and an emoji are not over-counted. */
              aside={t("agents.execution.kernel.prompt_characters", { count: Array.from(typeof promptSummary === "string" ? promptSummary : "").length })}>
              {prompt}
            </Block>
            <div data-testid="process-advanced" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
              {advanced}
            </div>
            <Disclosure key={wiring[1].key} id={`${id}-${wiring[1].key}`} section={wiring[1].key} title={wiring[1].title}
              summary={wiring[1].summary} problems={wiring[1].problems}
              expanded={open.has(wiring[1].key)} onToggle={() => toggle(wiring[1].key)}
              isDark={isDark} reducedMotion={reducedMotion}>{wiring[1].content}</Disclosure>
            </div>
          </div>
        </div>
      );
    }} />;
}
