import { useContext } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import Icon from "../../../../BUILTIN_COMPONENTs/icon/icon";

/**
 * PaneHeading — the title block of a Model Providers pane (#204, design A1):
 * brand icon + 22 px title, one hairline under it, optional right-side action.
 * Same language as the Settings modal's page title, so a pane reads as a
 * settings page with room rather than a card.
 */
export const PaneHeading = ({ title, icon, action = null, caption = null }) => {
  const { theme } = useContext(ConfigContext);

  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          minHeight: 32,
        }}
      >
        {icon && (
          <Icon src={icon} style={{ width: 22, height: 22, opacity: 0.85 }} />
        )}
        <span
          style={{
            fontSize: 22,
            fontWeight: 600,
            fontFamily: theme?.font?.titleFontFamily || "NunitoSans, sans-serif",
            color: "var(--pupu-text)",
            lineHeight: 1.2,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
        {caption && (
          <span
            style={{
              fontSize: 10,
              fontFamily: theme?.font?.fontFamily || "inherit",
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              color: "var(--pupu-text-faint)",
              marginLeft: 4,
              whiteSpace: "nowrap",
            }}
          >
            {caption}
          </span>
        )}
        {action && <span style={{ marginLeft: "auto" }}>{action}</span>}
      </div>
      <div
        style={{
          borderTop: "1px solid var(--pupu-border)",
          margin: "12px 0 4px",
        }}
      />
    </div>
  );
};

export default PaneHeading;
