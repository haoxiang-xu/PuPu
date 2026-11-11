import React, { useId, useState } from "react";
import Timeline from "../../../../../BUILTIN_COMPONENTs/timeline/timeline";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import useReducedMotion from "../../../../../BUILTIN_COMPONENTs/mini_react/use_reduced_motion";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import InputVariablesSection from "./input_variables_section";
import OutputVariablesSection from "./output_variables_section";
import OutputSchemaSection from "./output_schema_section";
import KernelSection from "./kernel_section";
import PanelHelp from "./panel_help";
function ProcessDisclosure({ id, section, title, help, problems, expanded, onToggle, isDark, reducedMotion, children }) {
  return (
    // Keep the larger title hit target on Timeline's point baseline. Section
    // grouping comes from the rail and spacing, with no hover surface.
    <div data-testid={`process-disclosure-${section}`}
      style={{ marginTop: -8, marginLeft: -6, marginRight: -6, minWidth: 0, backgroundColor: "transparent" }}>
      <div data-testid={`process-header-${section}`}
        style={{
          position: "relative", display: "flex", alignItems: "center", gap: 7, minWidth: 0,
          padding: "6px 9px", minHeight: 32, boxSizing: "border-box",
          fontSize: 12, lineHeight: "18px",
          color: isDark ? "#e6e6e6" : "#222",
        }}>
        {/* A full-row native toggle, with help as its own sibling control. */}
        <button type="button" aria-label={title} aria-expanded={expanded}
          aria-controls={id} onClick={onToggle}
          style={{ position: "absolute", inset: 0, width: "100%", minHeight: 32,
            padding: "6px 9px", border: 0, borderRadius: 8, cursor: "pointer", backgroundColor: "transparent" }} />
        <span style={{ flexShrink: 0, fontWeight: 500, pointerEvents: "none" }}>{title}</span>
        <Icon src="arrow_down" color="#86868b" style={{ width: 12, height: 12, flexShrink: 0,
          pointerEvents: "none", transform: expanded ? "rotate(180deg)" : "none",
          transition: reducedMotion ? "none" : "transform 200ms cubic-bezier(0.32,0.72,0,1)" }} />
        {help && <span style={{ position: "relative", display: "inline-flex", flexShrink: 0, marginLeft: -4 }}>
          <PanelHelp label={title}>{help}</PanelHelp>
        </span>}
        {problems.length > 0 && <span aria-hidden="true" style={{ color: isDark ? "#ffaaaa" : "#a52a2a", fontSize: 11, pointerEvents: "none" }}>!</span>}
      </div>
      <div id={id} role="region" aria-label={title} aria-hidden={!expanded} inert={!expanded}
        data-testid={`process-section-${section}`}
        style={{ display: "grid", minWidth: 0, gridTemplateRows: expanded ? "1fr" : "0fr",
          opacity: expanded ? 1 : 0, visibility: expanded ? "visible" : "hidden",
          transition: reducedMotion ? "none" : `grid-template-rows 200ms cubic-bezier(0.32,0.72,0,1), opacity 160ms ease, visibility 0s ${expanded ? "0s" : "200ms"}` }}>
        <div style={{ minHeight: 0, overflow: "hidden" }}>
          <div style={{ paddingTop: 7 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, padding: "0 9px 8px" }}>
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// A view of the same editors, not a second document or a second Kernel owner.
// Sections stay mounted while folded, including refused/pending field text.
export default function ProcessTimeline({ document, node, revision, isDark, onChange, rowDiagnostics }) {
  const { t } = useTranslation();
  const id = useId();
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(() => new Set(["input"]));
  const toggle = (key) => setOpen((old) => {
    const next = new Set(old);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const inputProblems = Object.values(rowDiagnostics?.inputs || {}).flat();
  const outputProblems = Object.values(rowDiagnostics?.outputs || {}).flat();
  const input = <InputVariablesSection document={document} node={node} rowDiagnostics={rowDiagnostics?.inputs}
    isDark={isDark} onChange={onChange} hideHeading addAtEnd breadcrumb />;
  const output = <>
    <OutputSchemaSection document={document} node={node} revision={revision} isDark={isDark} onChange={onChange} />
    <OutputVariablesSection document={document} node={node} revision={revision} rowDiagnostics={rowDiagnostics?.outputs}
      isDark={isDark} onChange={onChange} hideHeading addAtEnd breadcrumb />
  </>;

  return <KernelSection document={document} node={node} revision={revision} isDark={isDark} onChange={onChange}
    renderSections={({ model, prompt, promptHelp, modelProblems, promptProblems }) => {
      const sections = [
        { key: "input", title: t("agents.io.input_variables"), content: input, problems: inputProblems },
        { key: "model", title: t("agents.inspector.model"), content: model, problems: modelProblems },
        { key: "prompt", title: t("agents.execution.agent.prompt"), content: prompt, help: promptHelp, problems: promptProblems },
        { key: "output", title: t("agents.io.output_variables"), content: output, problems: outputProblems },
      ];
      return <div data-testid="process-detail-timeline" style={{ minWidth: 0 }}>
        <Timeline compact show_all_points items={sections.map((section, index) => ({
          key: section.key,
          point: <span aria-hidden="true" style={{ display: "block", width: index === 0 || index === 3 ? 12 : 10,
            height: index === 0 || index === 3 ? 12 : 10, borderRadius: "50%", boxSizing: "border-box",
            background: index === 0 || index === 3 ? (isDark ? "#a0a0aa" : "#81818b") : "transparent",
            border: index === 0 || index === 3 ? "none" : `1px solid ${isDark ? "#a0a0aa" : "#81818b"}` }} />,
          body: <ProcessDisclosure id={`${id}-${section.key}`} section={section.key} title={section.title}
            help={section.help} problems={section.problems} expanded={open.has(section.key)} onToggle={() => toggle(section.key)}
            isDark={isDark} reducedMotion={reducedMotion}>{section.content}</ProcessDisclosure>,
        }))} />
      </div>;
    }} />;
}
