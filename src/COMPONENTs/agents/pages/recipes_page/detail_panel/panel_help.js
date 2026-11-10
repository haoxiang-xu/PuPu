import React from "react";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import Tooltip from "../../../../../BUILTIN_COMPONENTs/tooltip/tooltip";
import { useTranslation } from "../../../../../BUILTIN_COMPONENTs/mini_react/use_translation";

/* Guidance stays beside its control, without occupying the working surface. */
export default function PanelHelp({ label, children }) {
  const { t } = useTranslation();
  return (
    <Tooltip
      position="left"
      wrapper_style={{ display: "inline-flex", flexShrink: 0 }}
      tooltip_component={<div style={{ maxWidth: 280, fontSize: 12, lineHeight: 1.5, overflowWrap: "anywhere" }}>{children}</div>}
    >
      <button
        type="button"
        aria-label={`${label} · ${t("toolkit.store_about")}`}
        style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, padding: 3, border: 0, borderRadius: 999, background: "none", color: "var(--pupu-text-muted)", cursor: "help", flexShrink: 0 }}
      >
        <Icon src="information" style={{ width: 13, height: 13 }} />
      </button>
    </Tooltip>
  );
}
