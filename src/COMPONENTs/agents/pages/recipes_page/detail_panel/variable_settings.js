import React, { useContext } from "react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import useReducedMotion from "../../../../../BUILTIN_COMPONENTs/mini_react/use_reduced_motion";

// An intrinsic-height disclosure: editors stay mounted so partially typed
// paths survive closing, while inert removes closed controls from interaction.
export default function VariableSettings({ id, testid, expanded, isDark, children, footer }) {
  const { onThemeMode } = useContext(ConfigContext);
  const dark = typeof isDark === "boolean" ? isDark : onThemeMode === "dark_mode";
  const reducedMotion = useReducedMotion();
  return (
    <div id={id} data-testid={testid} aria-hidden={!expanded} inert={!expanded}
      style={{
        display: "grid",
        gridTemplateRows: expanded ? "1fr" : "0fr",
        opacity: expanded ? 1 : 0,
        visibility: expanded ? "visible" : "hidden",
        minWidth: 0,
        transition: reducedMotion ? "none"
          : `grid-template-rows 200ms cubic-bezier(0.2, 0, 0, 1), opacity 160ms ease, visibility 0s ${expanded ? "0s" : "200ms"}`,
      }}>
      <div style={{ minHeight: 0, overflow: "hidden" }}>
        <div style={{ paddingTop: 6 }}>
          <div data-testid={`${testid}-surface`} style={{
            display: "flex", flexDirection: "column", gap: 12,
            padding: 10, minWidth: 0, borderRadius: 8,
            backgroundColor: dark ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.028)",
            border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
          }}>
            {children}
            <div data-testid={`${testid}-footer`} style={{
              display: "flex", justifyContent: "flex-end", paddingTop: 8,
              borderTop: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
            }}>{footer}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function VariableSettingRow({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <span style={{ width: 56, flexShrink: 0, fontSize: 10.5, lineHeight: 1.45, color: "#86868b" }}>{label}</span>
      <div style={{ display: "flex", flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
