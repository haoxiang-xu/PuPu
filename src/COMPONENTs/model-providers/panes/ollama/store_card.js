import { useContext } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { SizePicker } from "./size_picker";

/**
 * StoreCard — one library model in the Ollama store grid (#204, design O3).
 *
 * Collapsed: name in mono with its category tags, a two-line description,
 * and a foot with the size range and the pull count; an "installed" mark
 * when any tag of it is on disk. Expanded (one at a time, spans the grid
 * row): the full description on the left, the SizePicker on the right.
 *
 * Boxes are hairline-only: the card is the one place PuPu draws a border
 * around content, and it stays unfilled so the grid still reads as one
 * surface.
 */

const anyTagInstalled = (installedNames, name) => {
  if (!installedNames) return false;
  for (const entry of installedNames) {
    if (entry === name || entry === `${name}:latest` || entry.startsWith(`${name}:`)) {
      return true;
    }
  }
  return false;
};

const sizeRange = (sizes) => {
  if (!Array.isArray(sizes) || sizes.length === 0) return "";
  if (sizes.length === 1) return sizes[0];
  return `${sizes[0]} – ${sizes[sizes.length - 1]}`;
};

const TagChip = ({ children, fontFamily }) => (
  <span
    style={{
      fontSize: 9.5,
      fontFamily,
      letterSpacing: ".06em",
      textTransform: "uppercase",
      color: "var(--pupu-text-faint)",
      border: "1px solid var(--pupu-border)",
      borderRadius: 4,
      padding: "1px 5px",
      lineHeight: 1.4,
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </span>
);

export const StoreCard = ({
  model,
  expanded,
  onToggle,
  why = null,
  isDark,
  installedNames,
  pullingMap,
  onPull,
  onCancel,
}) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const installed = anyTagInstalled(installedNames, model.name);
  const tags = Array.isArray(model.tags) ? model.tags : [];
  const mono = { fontFamily: "'SF Mono', 'Fira Code', monospace" };
  const mutedColor = "var(--pupu-text-faint)";

  /* Collapsed cards are ~200 px: let the chips wrap under a long name
     instead of squeezing it to an ellipsis. */
  const head = (
    <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flexWrap: expanded ? "nowrap" : "wrap" }}>
      <span
        style={{
          ...mono,
          fontSize: expanded ? 15 : 13,
          fontWeight: 500,
          color: "var(--pupu-text)",
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {model.name}
      </span>
      {tags.slice(0, expanded ? 6 : 2).map((tag) => (
        <TagChip key={tag} fontFamily={fontFamily}>
          {tag}
        </TagChip>
      ))}
    </div>
  );

  const foot = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 11,
        fontFamily,
        color: mutedColor,
        marginTop: "auto",
        fontVariantNumeric: "tabular-nums",
        minWidth: 0,
      }}
    >
      {installed ? (
        <span style={{ color: "var(--pupu-success, #5cc084)", letterSpacing: ".06em", textTransform: "uppercase", fontSize: 10 }}>
          {t("model_providers.store.installed")}
        </span>
      ) : (
        <span style={{ ...mono, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {sizeRange(model.sizes)}
        </span>
      )}
      {model.pulls && (
        <span style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>
          {t("model_providers.store.pulls", { count: model.pulls })}
        </span>
      )}
    </div>
  );

  const baseStyle = {
    border: `1px solid ${expanded ? "var(--pupu-border-strong, var(--pupu-border))" : "var(--pupu-border)"}`,
    borderRadius: 9,
    padding: 12,
    minWidth: 0,
    cursor: expanded ? "default" : "pointer",
    backgroundColor: "transparent",
    transition: "border-color 0.15s ease, background-color 0.15s ease",
  };

  if (!expanded) {
    return (
      <div
        role="button"
        tabIndex={0}
        data-testid={`store-card-${model.name}`}
        data-expanded="false"
        onClick={() => onToggle(model.name)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle(model.name);
          }
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--pupu-overlay-ghost)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
        style={{ ...baseStyle, display: "flex", flexDirection: "column", gap: 6, minHeight: 104 }}
      >
        {head}
        <div
          style={{
            fontSize: 11.5,
            fontFamily,
            color: mutedColor,
            lineHeight: 1.4,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {why || model.description}
        </div>
        {foot}
      </div>
    );
  }

  return (
    <div
      data-testid={`store-card-${model.name}`}
      data-expanded="true"
      style={{
        ...baseStyle,
        gridColumn: "1 / -1",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 260px)",
        gap: 18,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {head}
          <span
            role="button"
            tabIndex={0}
            aria-label="Collapse"
            data-testid={`store-card-collapse-${model.name}`}
            onClick={() => onToggle(model.name)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggle(model.name);
              }
            }}
            style={{ marginLeft: "auto", fontSize: 11, color: mutedColor, cursor: "pointer", fontFamily, whiteSpace: "nowrap" }}
          >
            ×
          </span>
        </div>
        <div style={{ fontSize: 12.5, fontFamily, color: "var(--pupu-text-secondary)", lineHeight: 1.5 }}>
          {model.description}
          {why && (
            <div style={{ marginTop: 6, color: mutedColor }}>{why}</div>
          )}
        </div>
        {foot}
      </div>
      <SizePicker
        model={model}
        isDark={isDark}
        installedNames={installedNames}
        pullingMap={pullingMap}
        onPull={onPull}
        onCancel={onCancel}
      />
    </div>
  );
};

export default StoreCard;
