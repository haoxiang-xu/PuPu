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

/* One column, one kind of heading. What an Agent is comes first and stays in
   view: its model and its prompt, never folded. Under them, what it is wired
   to: Input, then Output, each of which folds. The limits few people touch
   wait at the bottom. Every part is headed by the same quiet caption and uses
   the panel's full width; order and spacing do the grouping. */

/* Which of Input / Output are open is remembered for the session, so walking
   from node to node does not fold them back each time. */
const DEFAULT_OPEN = ["input"];
let rememberedOpen = new Set(DEFAULT_OPEN);
export const resetProcessPanelMemory = () => {
  rememberedOpen = new Set(DEFAULT_OPEN);
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

/* A part that is always open: a quiet caption, then the control. */
export function Block({ section, title, help, problems = [], aside, isDark, children }) {
  return (
    <div role="region" aria-label={title} data-testid={`process-section-${section}`}
      style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <div data-testid={`process-header-${section}`}
        style={{ display: "flex", alignItems: "center", gap: 6, minHeight: 22, minWidth: 0 }}>
        <span style={captionStyle(isDark)}>{title}</span>
        <ProblemCount count={problems.length} section={section} isDark={isDark} />
        {help && <span style={{ display: "inline-flex", flexShrink: 0, marginLeft: -2 }}>
          <PanelHelp label={title}>{help}</PanelHelp>
        </span>}
        {/* The same place a folded part keeps its row count. */}
        {aside !== undefined && <span data-testid={`process-aside-${section}`}
          style={{ marginLeft: "auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontSize: 11.5, fontVariantNumeric: "tabular-nums", color: MUTED(isDark),
            userSelect: "none", WebkitUserSelect: "none" }}>{aside}</span>}
      </div>
      {children}
    </div>
  );
}

function Disclosure({ id, section, title, summary, problems, expanded, onToggle, isDark, reducedMotion, children }) {
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
        {/* Folded, the row still says what is inside. */}
        <span data-testid={`process-summary-${section}`} aria-hidden={expanded ? true : undefined}
          style={{ marginLeft: "auto", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontSize: 11.5, fontVariantNumeric: "tabular-nums", color: MUTED(isDark), pointerEvents: "none",
            opacity: expanded ? 0 : 1, transition: reducedMotion ? "none" : "opacity 160ms ease" }}>
          {summary}
        </span>
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
  const output = <>
    <OutputSchemaSection document={document} node={node} revision={revision} isDark={isDark} onChange={onChange} quiet />
    <OutputVariablesSection document={document} node={node} revision={revision} rowDiagnostics={rowDiagnostics?.outputs}
      isDark={isDark} onChange={onChange} hideHeading addAtEnd breadcrumb />
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
          {/* One Kernel editor, laid out in three places. */}
          <div data-testid="skeleton-kernel" style={{ display: "contents" }}>
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
            <div data-testid="process-wiring" style={{ display: "flex", flexDirection: "column", gap: 20, minWidth: 0 }}>
              {wiring.map((section) => (
                <Disclosure key={section.key} id={`${id}-${section.key}`} section={section.key} title={section.title}
                  summary={section.summary} problems={section.problems}
                  expanded={open.has(section.key)} onToggle={() => toggle(section.key)}
                  isDark={isDark} reducedMotion={reducedMotion}>{section.content}</Disclosure>
              ))}
            </div>
            <div data-testid="process-advanced" style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
              {advanced}
            </div>
          </div>
        </div>
      );
    }} />;
}
