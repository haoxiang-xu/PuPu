import { useContext, useEffect, useMemo, useRef, useState } from "react";

import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Modal from "../../../BUILTIN_COMPONENTs/modal/modal";
import { useModalLifecycle } from "../../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { selectContextCompositionView } from "../../../SERVICEs/context_composition_v1";

const TITLE_ID = "context-composition-title";
const DESCRIPTION_ID = "context-composition-description";

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

const providerQualityLabel = (quality) =>
  quality === "reported" ? "Reported" : "Unavailable";

const coverageLabel = (coverage) =>
  coverage?.status === "complete" ? "Complete" : "Partial";

const unavailableCopy = (reason) => {
  if (reason === "extension_invalid") {
    return "Receipt composition data did not pass validation.";
  }
  return "No Context Composition evidence is available for this scope.";
};

const themePalette = (theme, isDark) => ({
  background:
    theme?.semantic?.background ||
    theme?.modal?.backgroundColor ||
    (isDark ? "#1E1E1E" : "#FFFFFF"),
  text: theme?.color || (isDark ? "#E5E5E5" : "#222222"),
  muted: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.52)",
  faint: isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)",
  border: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.10)",
  divider: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)",
  surface: isDark ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.045)",
  surfaceStrong: isDark
    ? "rgba(255,255,255,0.10)"
    : "rgba(0,0,0,0.085)",
  residual: isDark ? "#646464" : "#A8A8A8",
  hatch: isDark ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.55)",
  accent: isDark ? "#B8B8B8" : "#404040",
});

const Metric = ({ label, value, testId }) => (
  <div style={{ minWidth: 0 }}>
    <div
      style={{
        fontSize: 11,
        lineHeight: 1.3,
        opacity: 0.55,
        marginBottom: 2,
      }}
    >
      {label}
    </div>
    <div
      data-testid={testId}
      style={{
        fontSize: 15,
        lineHeight: 1.25,
        fontWeight: 600,
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {value}
    </div>
  </div>
);

const ScopeTabs = ({ scope, onChange, modelCallRef, palette }) => (
  <div
    role="tablist"
    aria-label="Composition scope"
    style={{
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: 3,
      padding: 3,
      borderRadius: 8,
      backgroundColor: palette.surface,
      marginBottom: 12,
    }}
  >
    {[
      ["model_call", "Model Call"],
      ["run_tree", "Run Tree"],
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
            minHeight: 30,
            padding: "5px 10px",
            border: "none",
            borderRadius: 6,
            backgroundColor: selected ? palette.surfaceStrong : "transparent",
            color: palette.text,
            fontFamily: "NunitoSans, sans-serif",
            fontSize: 13,
            fontWeight: selected ? 600 : 500,
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
  if (!calls.length) return null;
  const selectedIndex = calls.findIndex((call) => call.key === selectedCallKey);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : calls.length - 1;

  return (
    <label
      htmlFor="context-composition-call-picker"
      style={{
        display: "grid",
        gridTemplateColumns: "76px minmax(0, 1fr)",
        alignItems: "center",
        gap: 8,
        marginBottom: 12,
        color: palette.muted,
        fontSize: 12,
      }}
    >
      Model call
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
          height: 30,
          padding: "0 8px",
          border: `1px solid ${palette.border}`,
          borderRadius: 6,
          color: palette.text,
          backgroundColor: palette.surface,
          fontFamily: "NunitoSans, sans-serif",
          fontSize: 12,
        }}
      >
        {calls.map((call, index) => (
          <option key={call.key} value={String(index)}>
            {`Call ${index + 1} · ${call.provider} / ${call.model}`}
          </option>
        ))}
      </select>
    </label>
  );
};

const CompositionHeadline = ({ view, palette }) => {
  if (view.scope === "run_tree") {
    const delivered =
      view.providerTotalQuality === "reported"
        ? formatTokens(view.deliveredInputTokens)
        : "Unavailable";
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px 18px",
          marginBottom: 13,
          padding: "10px 12px",
          borderRadius: 8,
          backgroundColor: palette.surface,
        }}
      >
        <Metric
          label="Delivered input"
          value={delivered}
          testId="run-tree-delivered-input"
        />
        <Metric label="Calls" value={view.callCount} testId="run-tree-call-count" />
        <Metric
          label="Agents"
          value={view.agentCount}
          testId="run-tree-agent-count"
        />
        <Metric
          label="Peak window pressure"
          value={
            view.peakWindowPressure === null
              ? "Unavailable"
              : formatPercent(view.peakWindowPressure)
          }
          testId="run-tree-peak-pressure"
        />
      </div>
    );
  }

  const showPercent =
    view.percentageAvailable &&
    typeof view.windowPressure === "number" &&
    Number.isFinite(view.windowPressure);
  return (
    <div data-testid="context-composition-headline" style={{ marginBottom: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          fontFamily: "NunitoSans, sans-serif",
        }}
      >
        <span style={{ fontSize: 17, fontWeight: 600 }}>
          {showPercent
            ? `${formatPercent(view.windowPressure)} Full`
            : `${formatTokens(view.attributedTokens)} attributed`}
        </span>
        <span style={{ color: palette.muted, fontSize: 13, textAlign: "right" }}>
          {view.providerInputTokens === null
            ? "Provider total unavailable"
            : view.contextWindowTokens === null
              ? `${formatTokens(view.providerInputTokens)} input tokens`
              : `${formatTokens(view.providerInputTokens)} / ${formatTokens(
                  view.contextWindowTokens,
                )} tokens`}
        </span>
      </div>
    </div>
  );
};

const hatchedStyle = (palette) => ({
  backgroundColor: palette.residual,
  backgroundImage: `repeating-linear-gradient(135deg, transparent 0, transparent 4px, ${palette.hatch} 4px, ${palette.hatch} 6px)`,
});

const CompositionBar = ({ view, palette }) => {
  const semanticTotal = view.groups.reduce((sum, group) => sum + group.tokens, 0);
  const residualKnown = Number.isSafeInteger(view.residualTokens);
  const denominator = residualKnown
    ? semanticTotal + view.residualTokens
    : semanticTotal;

  return (
    <div
      role="img"
      aria-label={
        residualKnown
          ? "Estimated input composition with residual shown separately"
          : "Estimated input composition; unknown remainder shown separately"
      }
      style={{
        display: "flex",
        width: "100%",
        height: 10,
        gap: 2,
        overflow: "hidden",
        borderRadius: 5,
        backgroundColor: palette.surface,
        marginBottom: 13,
      }}
    >
      {view.groups.map((group) => (
        <span
          key={group.id}
          title={`${group.label}: ${formatTokens(group.tokens)} tokens`}
          aria-hidden="true"
          style={{
            minWidth: 3,
            flexGrow:
              denominator > 0 ? Math.max(group.tokens / denominator, 0.001) : 1,
            flexBasis: 0,
            backgroundColor: group.color,
          }}
        />
      ))}
      {residualKnown ? (
        view.residualTokens > 0 && (
          <span
            data-testid="context-composition-residual-segment"
            data-pattern="hatched"
            title={`Residual: ${formatTokens(view.residualTokens)} tokens`}
            aria-hidden="true"
            style={{
              ...hatchedStyle(palette),
              minWidth: 3,
              flexGrow:
                denominator > 0
                  ? Math.max(view.residualTokens / denominator, 0.001)
                  : 1,
              flexBasis: 0,
            }}
          />
        )
      ) : (
        <span
          data-testid="context-composition-unknown-segment"
          data-pattern="hatched"
          title="Unknown remainder"
          aria-hidden="true"
          style={{
            ...hatchedStyle(palette),
            minWidth: 20,
            flexGrow: semanticTotal > 0 ? 0.18 : 1,
            flexBasis: semanticTotal > 0 ? "18%" : 0,
          }}
        />
      )}
    </div>
  );
};

const GroupList = ({ view, openGroup, onOpenGroup, palette }) => (
  <div data-testid="context-composition-groups">
    {view.groups.map((group) => {
      const expanded = openGroup === group.id;
      const detailId = `context-composition-group-${group.id}`;
      return (
        <div
          key={group.id}
          style={{ borderBottom: `1px solid ${palette.divider}` }}
        >
          <button
            type="button"
            data-group-toggle="true"
            data-testid="context-composition-group-toggle"
            aria-expanded={expanded}
            aria-controls={detailId}
            onClick={() => onOpenGroup(group.id)}
            style={{
              display: "grid",
              gridTemplateColumns: "14px minmax(0, 1fr) auto",
              alignItems: "center",
              gap: 9,
              width: "100%",
              minHeight: 39,
              padding: "6px 0",
              border: "none",
              backgroundColor: "transparent",
              color: palette.text,
              fontFamily: "NunitoSans, sans-serif",
              fontSize: 13,
              textAlign: "left",
              cursor: "pointer",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 10,
                height: 10,
                borderRadius: 3,
                backgroundColor: group.color,
              }}
            />
            <span style={{ minWidth: 0, fontWeight: 550 }}>{group.label}</span>
            <span style={{ color: palette.muted, whiteSpace: "nowrap" }}>
              {formatTokens(group.tokens)}
              {view.scope === "model_call" &&
              view.percentageAvailable &&
              group.share !== null
                ? ` · ${formatPercent(group.share)}`
                : ""}
            </span>
          </button>
          {expanded && (
            <div
              id={detailId}
              style={{
                padding: "0 0 8px 23px",
                color: palette.muted,
                fontSize: 11,
              }}
            >
              {group.subtypes.slice(0, 6).map((subtype) => (
                <div
                  key={`${subtype.categoryId}:${subtype.id}`}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    padding: "3px 0",
                  }}
                >
                  <span>{humanize(subtype.id)}</span>
                  <span style={{ color: palette.faint, whiteSpace: "nowrap" }}>
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
  </div>
);

const QualityAxes = ({ view, palette }) => {
  const axes = [
    ["Composition", qualityLabel(view.compositionQuality)],
    ["Provider total", providerQualityLabel(view.providerTotalQuality)],
    ["Coverage", coverageLabel(view.coverage)],
  ];
  return (
    <div
      aria-label="Composition quality"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
        gap: 8,
        paddingTop: 11,
      }}
    >
      {axes.map(([label, value]) => (
        <div key={label} style={{ minWidth: 0 }}>
          <div style={{ color: palette.faint, fontSize: 10 }}>{label}</div>
          <div
            style={{
              marginTop: 2,
              color: palette.muted,
              fontSize: 11,
              lineHeight: 1.25,
            }}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
  );
};

const AvailableView = ({ view, openGroup, onOpenGroup, palette }) => (
  <>
    <CompositionHeadline view={view} palette={palette} />
    <CompositionBar view={view} palette={palette} />
    {view.scope === "run_tree" && (
      <div style={{ margin: "-3px 0 8px", color: palette.faint, fontSize: 10 }}>
        Known categories within delivered input.
      </div>
    )}
    <GroupList
      view={view}
      openGroup={openGroup}
      onOpenGroup={onOpenGroup}
      palette={palette}
    />
    <QualityAxes view={view} palette={palette} />
  </>
);

const UnavailableView = ({ reason, palette }) => (
  <div
    role="status"
    style={{
      padding: "28px 18px",
      border: `1px solid ${palette.border}`,
      borderRadius: 8,
      backgroundColor: palette.surface,
      textAlign: "center",
    }}
  >
    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 5 }}>
      Composition details unavailable
    </div>
    <div style={{ color: palette.muted, fontSize: 12, lineHeight: 1.45 }}>
      {unavailableCopy(reason)}
    </div>
  </div>
);

const ContextCompositionPanel = ({ bundle, open, palette }) => {
  const [scope, setScope] = useState("model_call");
  const [selectedCallKey, setSelectedCallKey] = useState(null);
  const [openGroup, setOpenGroup] = useState(null);
  const modelCallRef = useRef(null);

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
    const timer = window.setTimeout(() => modelCallRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    setOpenGroup(view.available ? view.groups[0]?.id || null : null);
  }, [view]);

  return (
    <div
      data-testid="context-composition-panel"
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        maxHeight: "70vh",
        backgroundColor: palette.background,
        color: palette.text,
      }}
    >
      <div style={{ padding: "18px 48px 0 18px" }}>
        <h2
          id={TITLE_ID}
          style={{
            margin: 0,
            fontSize: 22,
            lineHeight: 1.25,
            fontWeight: 600,
            fontFamily: "NunitoSans, sans-serif",
          }}
        >
          Context Composition
        </h2>
        <p
          id={DESCRIPTION_ID}
          style={{
            margin: "5px 0 13px",
            color: palette.muted,
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          Estimated contribution to the provider input for this response.
        </p>
      </div>

      <div
        style={{
          minHeight: 0,
          overflowY: "auto",
          padding: "0 18px 18px",
        }}
      >
        <ScopeTabs
          scope={scope}
          onChange={setScope}
          modelCallRef={modelCallRef}
          palette={palette}
        />
        {scope === "model_call" && (
          <CallPicker
            calls={view.calls || []}
            selectedCallKey={selectedCallKey || view.selectedCallKey}
            onChange={setSelectedCallKey}
            palette={palette}
          />
        )}
        <div
          id="context-composition-scope-panel"
          role="tabpanel"
          aria-labelledby={`context-composition-${scope}-tab`}
          aria-live="polite"
        >
          {view.available ? (
            <AvailableView
              view={view}
              openGroup={openGroup}
              onOpenGroup={setOpenGroup}
              palette={palette}
            />
          ) : (
            <UnavailableView reason={view.reason} palette={palette} />
          )}
        </div>
      </div>
    </div>
  );
};

export const ContextCompositionModal = ({
  open,
  onClose,
  bundle,
  returnFocusRef,
}) => {
  useModalLifecycle("context-composition-modal", open);
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const palette = themePalette(theme, isDark);

  const handleClose = () => {
    onClose?.();
    returnFocusRef?.current?.focus?.();
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      ariaLabelledBy={TITLE_ID}
      ariaDescribedBy={DESCRIPTION_ID}
      style={{
        width: 430,
        minWidth: 0,
        maxWidth: "calc(100vw - 32px)",
        maxHeight: "70vh",
        padding: 0,
        backgroundColor: palette.background,
        color: palette.text,
        overflow: "hidden",
      }}
    >
      <Button
        prefix_icon="close"
        ariaLabel="Close Context Composition"
        title="Close"
        onClick={handleClose}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          paddingVertical: 6,
          paddingHorizontal: 6,
          iconOnlyPaddingVertical: 6,
          iconOnlyPaddingHorizontal: 6,
          borderRadius: 6,
          opacity: 0.45,
          zIndex: 2,
          WebkitAppRegion: "no-drag",
          content: {
            prefixIconWrap: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 0,
            },
            icon: { width: 14, height: 14 },
          },
        }}
      />
      <ContextCompositionPanel
        bundle={bundle}
        open={open}
        palette={palette}
      />
    </Modal>
  );
};

export default ContextCompositionModal;
