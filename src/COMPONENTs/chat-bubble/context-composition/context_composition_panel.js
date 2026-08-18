import { useContext, useEffect, useMemo, useState } from "react";

import { ConfigContext } from "../../../CONTAINERs/config/context";
import { selectContextCompositionView } from "../../../SERVICEs/context_composition_v1";

export const TITLE_ID = "context-composition-title";
export const DESCRIPTION_ID = "context-composition-description";

const FALLBACK_VIEW = Object.freeze({
  available: false,
  reason: "extension_missing",
  scope: "model_call",
  calls: [],
  groups: [],
  percentageAvailable: false,
});

const humanize = (value) => {
  const words = String(value || "").split("_").filter(Boolean).join(" ");
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : "";
};

const formatTokens = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) return "Unavailable";
  if (value >= 1000000) {
    const formatted = (value / 1000000).toFixed(1).replace(/\.0$/, "");
    return `${formatted}M`;
  }
  if (value >= 1000) {
    const formatted = (value / 1000).toFixed(1).replace(/\.0$/, "");
    return `${formatted}K`;
  }
  return String(value);
};

const formatPercent = (ratio) => {
  if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 0) {
    return "Unavailable";
  }
  if (ratio > 0 && ratio < 0.001) return "<0.1%";
  const digits = ratio >= 0.1 ? 0 : 1;
  return `${(ratio * 100).toFixed(digits).replace(/\.0$/, "")}%`;
};

const qualityLabel = (quality) => {
  if (quality === "reconciled_estimate") return "Reconciled estimate";
  if (quality === "estimated") return "Estimated";
  if (quality === "partial") return "Partial";
  return "Unavailable";
};

const unavailableCopy = (reason) => {
  if (reason === "extension_invalid") {
    return "Receipt composition data did not pass validation.";
  }
  return "This response carried no Context Composition evidence.";
};

export const contextCompositionPalette = (theme, isDark) => ({
  background:
    theme?.semantic?.background ||
    theme?.modal?.backgroundColor ||
    (isDark ? "#1E1E1E" : "#FFFFFF"),
  text: theme?.color || (isDark ? "#E5E5E5" : "#222222"),
  muted: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.52)",
  faint: isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)",
  divider: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
  surface: isDark ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.045)",
  surfaceStrong: isDark ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.085)",
  hover: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.045)",
  residual: isDark ? "#5A5C63" : "#B3B5BC",
  hatch: isDark ? "rgba(255,255,255,0.36)" : "rgba(255,255,255,0.68)",
});

const InfoGlyph = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 16 16"
    aria-hidden="true"
    style={{ flex: "0 0 auto", opacity: 0.7 }}
  >
    <circle cx="8" cy="8" r="6.1" stroke="currentColor" strokeWidth="1.2" fill="none" />
    <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <circle cx="8" cy="4.9" r="0.78" fill="currentColor" />
  </svg>
);

/**
 * What the provider was billed for, minus what we could attribute.
 *
 * The reconciled figure only exists once coverage is complete, but the gap is
 * real either way — without it the listed rows silently fail to add up to the
 * headline. Naming it "unattributed" is exact: it is the part we did not
 * account for, not a claim about what is in it.
 */
const resolveResidualTokens = (view) => {
  if (Number.isSafeInteger(view.residualTokens) && view.residualTokens > 0) {
    return view.residualTokens;
  }
  const total = view.providerInputTokens;
  const attributed = view.attributedTokens;
  if (
    Number.isSafeInteger(total) &&
    Number.isSafeInteger(attributed) &&
    total > attributed
  ) {
    return total - attributed;
  }
  return null;
};

/**
 * Window occupancy does not depend on how completely we attributed the input —
 * it only needs the provider total and the window size. Prefer the accounting
 * view so this reads the same number the ring outside does.
 */
const resolveWindowPressure = (view, usageView) => {
  if (
    usageView?.percentageAvailable === true &&
    typeof usageView.windowPressure === "number" &&
    Number.isFinite(usageView.windowPressure)
  ) {
    return usageView.windowPressure;
  }
  if (
    view.percentageAvailable === true &&
    typeof view.windowPressure === "number" &&
    Number.isFinite(view.windowPressure)
  ) {
    return view.windowPressure;
  }
  return null;
};

const hatchedStyle = (palette) => ({
  backgroundColor: palette.residual,
  backgroundImage: `repeating-linear-gradient(135deg, transparent 0 2px, ${palette.hatch} 2px 3.6px)`,
});

/* ── Scope toggle — rides the title row, where the close button used to be ── */
const ScopeToggle = ({ scope, onChange, modelCallRef, palette }) => (
  <div
    role="tablist"
    aria-label="Composition scope"
    style={{
      marginLeft: "auto",
      flex: "0 0 auto",
      display: "inline-flex",
      gap: 2,
      padding: 2,
      borderRadius: 7,
      backgroundColor: palette.surface,
    }}
  >
    {[
      // "Context" is what fills the window on the next call; "Summary" is the
      // whole turn's accounting, including subagents.
      ["model_call", "Context"],
      ["run_tree", "Summary"],
    ].map(([id, label]) => {
      const selected = scope === id;
      return (
        <button
          key={id}
          id={`context-composition-${id}-tab`}
          ref={id === "model_call" ? modelCallRef : undefined}
          type="button"
          role="tab"
          aria-selected={selected}
          aria-controls="context-composition-scope-panel"
          onClick={() => onChange(id)}
          style={{
            border: "none",
            borderRadius: 5,
            padding: "2.5px 8px",
            backgroundColor: selected ? palette.surfaceStrong : "transparent",
            color: palette.text,
            opacity: selected ? 1 : 0.62,
            fontFamily: "NunitoSans, sans-serif",
            fontSize: 11,
            fontWeight: selected ? 580 : 500,
            cursor: "pointer",
          }}
        >
          {label}
        </button>
      );
    })}
  </div>
);

const CallPicker = ({ calls, selectedCallKey, onChange, palette }) => {
  if (calls.length < 2) return null;
  const selectedIndex = calls.findIndex((call) => call.key === selectedCallKey);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : calls.length - 1;

  return (
    <select
      id="context-composition-call-picker"
      aria-label="Physical model call"
      value={String(activeIndex)}
      onChange={(event) => {
        const call = calls[Number(event.target.value)];
        if (call) onChange(call.key);
      }}
      style={{
        width: "100%",
        minWidth: 0,
        height: 26,
        marginBottom: 9,
        padding: "0 7px",
        border: "1px solid var(--pupu-menu-border, transparent)",
        borderRadius: 6,
        color: palette.text,
        backgroundColor: palette.surface,
        fontFamily: "NunitoSans, sans-serif",
        fontSize: 11.5,
      }}
    >
      {calls.map((call, index) => (
        <option key={call.key} value={String(index)}>
          {`Call ${index + 1} · ${call.provider} / ${call.model}`}
        </option>
      ))}
    </select>
  );
};

const Headline = ({ view, usageView, palette }) => {
  if (view.scope === "run_tree") {
    return (
      <div
        data-testid="context-composition-headline"
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          padding: "0 8px",
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.022em" }}>
          Summary
        </span>
        <span
          data-testid="run-tree-delivered-input"
          style={{ color: palette.muted, fontSize: 12, whiteSpace: "nowrap" }}
        >
          {view.providerTotalQuality === "reported"
            ? `~${formatTokens(view.deliveredInputTokens)}`
            : "Delivered unavailable"}
          {" · "}
          <span data-testid="run-tree-call-count">{view.callCount}</span> calls
        </span>
      </div>
    );
  }

  const pressure = resolveWindowPressure(view, usageView);

  return (
    <div
      data-testid="context-composition-headline"
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: 12,
        padding: "0 8px",
        marginBottom: 8,
      }}
    >
      <span
        style={{
          fontSize: 19,
          fontWeight: 600,
          letterSpacing: "-0.022em",
          whiteSpace: "nowrap",
        }}
      >
        {pressure === null
          ? `${formatTokens(view.attributedTokens)} attributed`
          : `${formatPercent(pressure)} Full`}
      </span>
      <span
        style={{ color: palette.muted, fontSize: 12, whiteSpace: "nowrap" }}
      >
        {view.providerInputTokens === null
          ? "Provider total unavailable"
          : view.contextWindowTokens === null
            ? "Window size unknown"
            : `~${formatTokens(view.providerInputTokens)} / ${formatTokens(
                view.contextWindowTokens,
              )} Tokens`}
      </span>
    </div>
  );
};

/**
 * The track itself IS the context window. Segments are sized against
 * contextWindowTokens so the coloured run stops at the real fill level and the
 * remaining track reads as unused window. When no window is reported there is
 * no honest denominator, so segments normalise across what we do know and the
 * bar carries no "how full" claim at all.
 */
const CompositionBar = ({ view, palette }) => {
  const semanticTotal = view.groups.reduce((sum, group) => sum + group.tokens, 0);
  const resolvedResidual = resolveResidualTokens(view);
  const residualKnown = resolvedResidual !== null;
  const residual = residualKnown ? resolvedResidual : 0;
  const windowTokens =
    typeof view.contextWindowTokens === "number" &&
    Number.isFinite(view.contextWindowTokens) &&
    view.contextWindowTokens > 0
      ? view.contextWindowTokens
      : null;
  const denominator = windowTokens ?? semanticTotal + residual;
  const widthOf = (tokens) =>
    denominator > 0 ? `${Math.max((tokens / denominator) * 100, 0.25)}%` : "0%";

  return (
    <div
      role="img"
      aria-label={
        windowTokens
          ? "Estimated input composition against the context window"
          : "Estimated input composition; context window size unknown"
      }
      style={{
        display: "flex",
        width: "calc(100% - 16px)",
        margin: "0 8px",
        height: 6,
        gap: 2,
        overflow: "hidden",
        borderRadius: 3,
        backgroundColor: palette.surfaceStrong,
        marginBottom: 11,
      }}
    >
      {view.groups.map((group) => (
        <span
          key={group.id}
          title={`${group.label}: ${formatTokens(group.tokens)} tokens`}
          aria-hidden="true"
          style={{
            flex: "0 0 auto",
            width: widthOf(group.tokens),
            borderRadius: 2,
            backgroundColor: group.color,
          }}
        />
      ))}
      {residualKnown ? (
        <span
          data-testid="context-composition-residual-segment"
          data-pattern="hatched"
          title={`Unattributed: ${formatTokens(residual)} tokens`}
          aria-hidden="true"
          style={{
            ...hatchedStyle(palette),
            flex: "0 0 auto",
            width: widthOf(residual),
            borderRadius: 2,
          }}
        />
      ) : (
        <span
          data-testid="context-composition-unknown-segment"
          data-pattern="hatched"
          title="Unknown remainder"
          aria-hidden="true"
          style={{
            ...hatchedStyle(palette),
            flex: semanticTotal > 0 ? "0 0 auto" : "1 1 auto",
            width: semanticTotal > 0 ? "6%" : "100%",
            borderRadius: 2,
          }}
        />
      )}
    </div>
  );
};

const Row = ({
  color,
  hatched,
  label,
  value,
  expanded,
  onClick,
  detailId,
  palette,
  testId,
}) => {
  const [hovered, setHovered] = useState(false);
  const interactive = typeof onClick === "function";

  return (
    <button
      type="button"
      data-group-toggle={interactive ? "true" : undefined}
      data-testid={testId}
      aria-expanded={interactive ? expanded : undefined}
      aria-controls={interactive && expanded ? detailId : undefined}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      disabled={!interactive}
      style={{
        display: "grid",
        gridTemplateColumns: "11px minmax(0, 1fr) auto",
        alignItems: "center",
        gap: 8,
        width: "100%",
        // Concentric with the shell: panel r22 − 12px inset = r10, on the same
        // 28px row height the selectors beside it use.
        minHeight: 28,
        padding: "0 8px",
        border: "none",
        borderRadius: 10,
        backgroundColor:
          hovered && interactive ? palette.hover : "transparent",
        color: palette.text,
        fontFamily: "NunitoSans, sans-serif",
        fontSize: 13,
        fontWeight: 470,
        textAlign: "left",
        cursor: interactive ? "pointer" : "default",
        transition: "background-color 0.13s ease",
      }}
    >
      <span
        aria-hidden="true"
        style={
          hatched
            ? { ...hatchedStyle(palette), width: 11, height: 11, borderRadius: 3 }
            : { width: 11, height: 11, borderRadius: 3, backgroundColor: color }
        }
      />
      <span
        style={{
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: palette.muted,
          fontSize: 12,
          fontWeight: 450,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </span>
    </button>
  );
};

const GroupList = ({ view, openGroup, onOpenGroup, palette }) => {
  const residualTokens = resolveResidualTokens(view);

  return (
    <div data-testid="context-composition-groups">
      {view.groups.map((group) => {
        const expanded = openGroup === group.id;
        const detailId = `context-composition-group-${group.id}`;
        return (
          <div key={group.id}>
            <Row
              color={group.color}
              label={group.label}
              value={
                view.scope === "model_call" &&
                view.percentageAvailable &&
                group.share !== null
                  ? `${formatTokens(group.tokens)} · ${formatPercent(group.share)}`
                  : formatTokens(group.tokens)
              }
              expanded={expanded}
              detailId={detailId}
              onClick={() => onOpenGroup(expanded ? null : group.id)}
              palette={palette}
              testId="context-composition-group-toggle"
            />
            {expanded && (
              <div
                id={detailId}
                style={{
                  padding: "1px 8px 6px 27px",
                  color: palette.muted,
                  fontSize: 11.5,
                }}
              >
                {group.subtypes.slice(0, 6).map((subtype) => (
                  <div
                    key={`${subtype.categoryId}:${subtype.id}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "1.5px 0",
                    }}
                  >
                    <span>{humanize(subtype.id)}</span>
                    <span
                      style={{
                        color: palette.faint,
                        fontSize: 11,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatTokens(subtype.tokens)} · {subtype.sourceCount}{" "}
                      {subtype.sourceCount === 1 ? "source" : "sources"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Unattributed is a real slice of the delivered input. Listing it is what
          lets the rows add up to the headline instead of quietly falling short. */}
      {residualTokens !== null && (
        <Row
          hatched
          label="Unattributed"
          value={formatTokens(residualTokens)}
          palette={palette}
          testId="context-composition-residual-row"
        />
      )}
    </div>
  );
};

const QualityLine = ({ view, palette }) => {
  const text =
    view.scope === "run_tree"
      ? `${view.agentCount} ${view.agentCount === 1 ? "agent" : "agents"} · Peak ${
          view.peakWindowPressure === null
            ? "unavailable"
            : formatPercent(view.peakWindowPressure)
        }`
      : `${qualityLabel(view.compositionQuality)}${
          view.coverage?.status === "complete"
            ? " · Complete coverage"
            : " · Partial coverage"
        }`;

  return (
    <div
      data-testid="context-composition-quality"
      aria-label="Composition quality"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        marginTop: 4,
        padding: "7px 8px 3px",
        borderTop: `1px solid ${palette.divider}`,
        color: palette.faint,
        fontSize: 11,
        minWidth: 0,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      <InfoGlyph />
      {text}
    </div>
  );
};

/**
 * Accounting-only view. Provider usage exists on every call, so this renders
 * long before the runtime can attribute the window to categories. It shows the
 * one number that is actually authoritative — how full the window is — and says
 * plainly that the breakdown is not available rather than faking eight zeroes.
 */
const UsageOnlyView = ({ usage, palette }) => {
  const cached = usage.cacheReadTokens;
  const fresh =
    usage.uncachedTokens === null && usage.cacheWriteTokens === null
      ? null
      : (usage.uncachedTokens || 0) + (usage.cacheWriteTokens || 0);

  return (
    <div data-testid="context-usage-only">
      <div
        data-testid="context-composition-headline"
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          padding: "0 8px",
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 19, fontWeight: 600, letterSpacing: "-0.022em" }}>
          {usage.percentageAvailable
            ? `${formatPercent(usage.windowPressure)} Full`
            : `${formatTokens(usage.inputTokens)} used`}
        </span>
        <span style={{ color: palette.muted, fontSize: 12, whiteSpace: "nowrap" }}>
          {usage.contextWindowTokens === null
            ? "Window size unknown"
            : `~${formatTokens(usage.inputTokens)} / ${formatTokens(
                usage.contextWindowTokens,
              )} Tokens`}
        </span>
      </div>

      <div
        role="img"
        aria-label="Context window occupancy"
        style={{
          display: "flex",
          width: "calc(100% - 16px)",
          margin: "0 8px",
          height: 6,
          borderRadius: 3,
          overflow: "hidden",
          backgroundColor: palette.surfaceStrong,
          marginBottom: 11,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: usage.percentageAvailable
              ? `${Math.min(100, Math.max(usage.windowPressure * 100, 0.25))}%`
              : "100%",
            borderRadius: 2,
            backgroundColor: usage.percentageAvailable
              ? "#5E9DE6"
              : palette.residual,
            ...(usage.percentageAvailable ? {} : hatchedStyle(palette)),
          }}
        />
      </div>

      <div>
        {cached !== null && (
          <Row
            color="#55B982"
            label="Cached"
            value={formatTokens(cached)}
            palette={palette}
            testId="context-usage-cached"
          />
        )}
        {fresh !== null && (
          <Row
            color="#5E9DE6"
            label="New this turn"
            value={formatTokens(fresh)}
            palette={palette}
            testId="context-usage-fresh"
          />
        )}
      </div>

      <div
        data-testid="context-usage-note"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: 4,
          padding: "7px 8px 3px",
          borderTop: `1px solid ${palette.divider}`,
          color: palette.faint,
          fontSize: 11,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        <InfoGlyph />
        {`${usage.callCount} ${
          usage.callCount === 1 ? "call" : "calls"
        } · Category breakdown unavailable`}
      </div>
    </div>
  );
};

const UnavailableView = ({ reason, palette }) => (
  <div
    role="status"
    style={{
      padding: "22px 14px 24px",
      margin: "0 4px",
      borderRadius: 8,
      backgroundColor: palette.surface,
      textAlign: "center",
    }}
  >
    <div style={{ fontSize: 13, fontWeight: 560, marginBottom: 4 }}>
      No composition data yet
    </div>
    <div style={{ color: palette.muted, fontSize: 11.5, lineHeight: 1.5 }}>
      {unavailableCopy(reason)}
    </div>
  </div>
);

/**
 * Shared body for both shells — the anchored popover on the attach panel and
 * the centred modal reached from a trace chain. The shell owns placement,
 * dismissal and (for the modal) the close button; everything inside the card
 * lives here so the two entries can never drift apart.
 */
const ContextCompositionPanel = ({
  bundle,
  open,
  palette,
  trailing,
  scopeRef,
  listRef,
  usageView = null,
  onLayoutChange,
}) => {
  const [scope, setScope] = useState("model_call");
  const [selectedCallKey, setSelectedCallKey] = useState(null);
  const [openGroup, setOpenGroup] = useState(null);

  const view = useMemo(
    () =>
      selectContextCompositionView(bundle, {
        scope,
        callKey: scope === "model_call" ? selectedCallKey : null,
      }) || { ...FALLBACK_VIEW, scope },
    [bundle, scope, selectedCallKey],
  );

  useEffect(() => {
    if (!open) return;
    setScope("model_call");
    setSelectedCallKey(null);
    setOpenGroup(null);
  }, [open]);

  // Everything below changes how tall this panel renders. The shell animates
  // its height from this, so it has to be told rather than left to observe.
  useEffect(() => {
    onLayoutChange?.();
  }, [scope, openGroup, selectedCallKey, view, onLayoutChange]);

  return (
    <div
      data-testid="context-composition-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        color: palette.text,
        fontFamily: "NunitoSans, sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "0 8px",
          marginBottom: 9,
        }}
      >
        <h2
          id={TITLE_ID}
          style={{
            margin: 0,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            color: palette.muted,
            fontSize: 13,
            fontWeight: 550,
            lineHeight: 1.3,
          }}
        >
          Context Usage
        </h2>
        {view.available && (
          <ScopeToggle
            scope={scope}
            onChange={setScope}
            modelCallRef={scopeRef}
            palette={palette}
          />
        )}
        {trailing}
      </div>

      <p id={DESCRIPTION_ID} style={{ display: "none" }}>
        Estimated contribution to the provider input for this response.
      </p>

      <div
        ref={listRef}
        id="context-composition-scope-panel"
        role="tabpanel"
        aria-labelledby={`context-composition-${scope}-tab`}
        aria-live="polite"
        style={{ minHeight: 0, overflowY: "auto", overscrollBehavior: "contain" }}
      >
        {!view.available && usageView ? (
          <UsageOnlyView usage={usageView} palette={palette} />
        ) : view.available ? (
          <>
            {scope === "model_call" && (
              <CallPicker
                calls={view.calls || []}
                selectedCallKey={selectedCallKey || view.selectedCallKey}
                onChange={setSelectedCallKey}
                palette={palette}
              />
            )}
            <Headline view={view} usageView={usageView} palette={palette} />
            <CompositionBar view={view} palette={palette} />
            <GroupList
              view={view}
              openGroup={openGroup}
              onOpenGroup={setOpenGroup}
              palette={palette}
            />
            <QualityLine view={view} palette={palette} />
          </>
        ) : (
          <UnavailableView reason={view.reason} palette={palette} />
        )}
      </div>
    </div>
  );
};

export const useContextCompositionPalette = () => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  return useMemo(() => contextCompositionPalette(theme, isDark), [theme, isDark]);
};

export default ContextCompositionPanel;
