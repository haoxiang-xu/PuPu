import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { Select } from "../../../BUILTIN_COMPONENTs/select/select";
import { selectContextCompositionView } from "../../../SERVICEs/context_composition_v1";

export const TITLE_ID = "context-composition-title";
export const DESCRIPTION_ID = "context-composition-description";

/* scrollHeight rounds to an integer; real layout can land on a fraction just
   above it (subpixel font metrics, etc). Reapplying the rounded value as an
   exact height then leaves content a hair taller than its box, which flips
   the viewport's own overflow:auto into showing a real scrollbar for a
   fraction of a pixel of overflow. A small buffer absorbs that. */
export const CONTENT_HEIGHT_BUFFER = 2;
/* Independent of either shell's own outer cap (the popover's 64vh/480px, the
   modal's 70vh) — Panel owns its OWN scroll boundary so genuinely tall
   content always gets an internal scrollbar here, predictably, regardless of
   which shell hosts it, rather than depending on doing the arithmetic against
   a cap it cannot see. */
export const MAX_PANE_VIEWPORT_HEIGHT = 420;
const SLIDE_TRANSITION = "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
const HEIGHT_TRANSITION = "height 220ms cubic-bezier(0.22, 1, 0.36, 1)";

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

const formatTokens = (value, t) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    return t("context_usage.unavailable");
  }
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

const formatPercent = (ratio, t) => {
  if (typeof ratio !== "number" || !Number.isFinite(ratio) || ratio < 0) {
    return t("context_usage.unavailable");
  }
  if (ratio > 0 && ratio < 0.001) return "<0.1%";
  const digits = ratio >= 0.1 ? 0 : 1;
  return `${(ratio * 100).toFixed(digits).replace(/\.0$/, "")}%`;
};

const qualityLabel = (quality, t) => {
  if (quality === "reconciled_estimate") {
    return t("context_usage.quality_reconciled_estimate");
  }
  if (quality === "estimated") return t("context_usage.quality_estimated");
  if (quality === "partial") return t("context_usage.quality_partial");
  return t("context_usage.unavailable");
};

const unavailableCopy = (reason, t) => {
  if (reason === "extension_invalid") {
    return t("context_usage.invalid_receipt");
  }
  return t("context_usage.no_evidence");
};

const formatCallCount = (count, t) =>
  t(
    count === 1
      ? "context_usage.call_count_one"
      : "context_usage.call_count_other",
    { count },
  );

const GROUP_LABEL_KEYS = Object.freeze({
  instructions: "context_usage.group_instructions",
  tools: "context_usage.group_tools",
  skills: "context_usage.group_skills",
  agent_coordination: "context_usage.group_agent_coordination",
  output_contract: "context_usage.group_output_contract",
  memory_task_state: "context_usage.group_memory_task_state",
  files_media: "context_usage.group_files_media",
  conversation: "context_usage.group_conversation",
});

const groupLabel = (group, t) =>
  GROUP_LABEL_KEYS[group.id] ? t(GROUP_LABEL_KEYS[group.id]) : group.label;

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
const ScopeToggle = ({ scope, onChange, modelCallRef, palette, t }) => (
  <div
    role="tablist"
    aria-label={t("context_usage.scope_label")}
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
      ["model_call", t("context_usage.context")],
      ["run_tree", t("context_usage.summary")],
    ].map(([id, label]) => {
      const selected = scope === id;
      return (
        <Button
          key={id}
          ref={id === "model_call" ? modelCallRef : undefined}
          label={label}
          onClick={() => onChange(id)}
          dom_props={{
            id: `context-composition-${id}-tab`,
            "data-testid": `context-composition-${id}-tab`,
            type: "button",
            role: "tab",
            "aria-selected": selected,
            "aria-controls": `context-composition-${id}-panel`,
          }}
          style={{
            borderRadius: 5,
            paddingVertical: 2.5,
            paddingHorizontal: 8,
            backgroundColor: selected ? palette.surfaceStrong : "transparent",
            color: palette.text,
            opacity: selected ? 1 : 0.62,
            fontFamily: "NunitoSans, sans-serif",
            fontSize: 11,
            fontWeight: selected ? 580 : 500,
          }}
        />
      );
    })}
  </div>
);

/**
 * Trigger row for CallPicker's Select — same compact, secondary sizing the
 * native <select> it replaces used (26px, 11.5px), so swapping the engine
 * doesn't also change how much visual weight this utility control carries
 * next to the real content below it.
 */
const CallPickerTrigger = ({ label, open, palette }) => (
  <Button
    label={label}
    postfix_icon="arrow_down"
    dom_props={{ type: "button" }}
    style={{
      justifyContent: "space-between",
      gap: 8,
      width: "100%",
      minWidth: 0,
      height: 26,
      marginBottom: 9,
      paddingVertical: 0,
      paddingHorizontal: 7,
      border: "1px solid var(--pupu-menu-border, transparent)",
      borderRadius: 6,
      backgroundColor: palette.surface,
      color: palette.text,
      fontFamily: "NunitoSans, sans-serif",
      fontSize: 11.5,
      content: {
        label: {
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flex: 1,
          textAlign: "left",
        },
        postfixIconWrap: {
          flex: "0 0 auto",
          opacity: 0.75,
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        },
        icon: { width: 10, height: 10, color: palette.faint },
      },
    }}
  />
);

/**
 * Which physical call this scope is showing — riding the SAME BUILTIN Select
 * (palette variant) as the model/tools/workspace menus, rather than a native
 * <select>, so it opens as one more frosted menu in this family instead of
 * the browser's own OS-styled dropdown. It manages its own open state: unlike
 * those three, nothing outside this already-open popover needs to know when
 * this one opens, so there is no shared state to coordinate it with.
 */
const CallPicker = ({ calls, selectedCallKey, onChange, palette, t }) => {
  const [open, setOpen] = useState(false);
  if (calls.length < 2) return null;
  const selectedIndex = calls.findIndex((call) => call.key === selectedCallKey);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : calls.length - 1;
  const options = calls.map((call, index) => ({
    value: String(index),
    label: t("context_usage.call_label", {
      number: index + 1,
      provider: call.provider,
      model: call.model,
    }),
  }));

  return (
    <Select
      aria-label={t("context_usage.physical_call")}
      options={options}
      value={String(activeIndex)}
      set_value={(nextValue) => {
        const call = calls[Number(nextValue)];
        if (call) onChange(call.key);
      }}
      filterable={false}
      open={open}
      on_open_change={setOpen}
      dropdown_position="bottom"
      variant="palette"
      /* A long run reaches dozens of calls; without a ceiling the dropdown's
         list has no max-height at all and grows past the screen. 260 matches
         the workspace selector on the same attach-panel row. */
      dropdown_style={{ maxHeight: 260 }}
      custom_trigger={
        <CallPickerTrigger
          label={options[activeIndex]?.label ?? ""}
          open={open}
          palette={palette}
        />
      }
    />
  );
};

const Headline = ({ view, usageView, palette, t, active = true }) => {
  if (view.scope === "run_tree") {
    return (
      <div
        data-testid={active ? "context-composition-headline" : undefined}
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
          {t("context_usage.summary")}
        </span>
        <span
          data-testid="run-tree-delivered-input"
          style={{ color: palette.muted, fontSize: 12, whiteSpace: "nowrap" }}
        >
          {view.providerTotalQuality === "reported"
            ? `~${formatTokens(view.deliveredInputTokens, t)}`
            : t("context_usage.delivered_unavailable")}
          {" · "}
          <span data-testid="run-tree-call-count">
            {formatCallCount(view.callCount, t)}
          </span>
        </span>
      </div>
    );
  }

  const pressure = resolveWindowPressure(view, usageView);

  return (
    <div
      data-testid={active ? "context-composition-headline" : undefined}
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
          ? t("context_usage.attributed", {
              tokens: formatTokens(view.attributedTokens, t),
            })
          : t("context_usage.full", { percentage: formatPercent(pressure, t) })}
      </span>
      <span
        style={{ color: palette.muted, fontSize: 12, whiteSpace: "nowrap" }}
      >
        {view.providerInputTokens === null
          ? t("context_usage.provider_total_unavailable")
          : view.contextWindowTokens === null
            ? t("context_usage.window_size_unknown")
            : t("context_usage.token_window", {
                inputTokens: formatTokens(view.providerInputTokens, t),
                contextWindowTokens: formatTokens(view.contextWindowTokens, t),
              })}
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
const CompositionBar = ({ view, palette, t, active = true }) => {
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
          ? t("context_usage.estimated_composition_with_window")
          : t("context_usage.estimated_composition_without_window")
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
          title={t("context_usage.group_tokens", {
            label: groupLabel(group, t),
            tokens: formatTokens(group.tokens, t),
          })}
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
          data-testid={active ? "context-composition-residual-segment" : undefined}
          data-pattern="hatched"
          title={t("context_usage.unattributed_tokens", {
            tokens: formatTokens(residual, t),
          })}
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
          data-testid={active ? "context-composition-unknown-segment" : undefined}
          data-pattern="hatched"
          title={t("context_usage.unknown_remainder")}
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
  active = true,
}) => {
  const interactive = typeof onClick === "function";

  return (
    <Button
      onClick={onClick}
      disabled={!interactive}
      dom_props={{
        type: "button",
        "data-group-toggle": interactive ? "true" : undefined,
        "data-testid": active ? testId : undefined,
        "aria-expanded": interactive ? expanded : undefined,
        "aria-controls": interactive && expanded ? detailId : undefined,
      }}
      style={{
        display: "grid",
        // A fourth, fixed-width track for the disclosure chevron — reserved on
        // EVERY row, not just expandable ones, so a row without one (the
        // residual, or UsageOnlyView's Cached/New-this-turn rows) still lines
        // its value up with the expandable rows above and below it instead of
        // sitting flush against an edge they don't share.
        gridTemplateColumns: "11px minmax(0, 1fr) auto 14px",
        alignItems: "center",
        gap: 8,
        width: "100%",
        // Concentric with the shell: panel r22 − 12px inset = r10, on the same
        // 28px row height the selectors beside it use.
        minHeight: 28,
        paddingVertical: 0,
        paddingHorizontal: 8,
        borderRadius: 10,
        color: palette.text,
        fontFamily: "NunitoSans, sans-serif",
        fontSize: 13,
        fontWeight: 470,
        textAlign: "left",
        background: {
          hoverBackgroundColor: palette.hover,
          activeBackgroundColor: palette.hover,
          transitionIn: "background-color 0.13s ease",
          transitionOut: "background-color 0.13s ease",
        },
        content: {
          children: { display: "contents" },
        },
        state: {
          disabled: { root: { opacity: 1, cursor: "default" } },
        },
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
      {interactive && (
        <Icon
          src="arrow_down"
          color={palette.faint}
          style={{
            width: 10,
            height: 10,
            justifySelf: "center",
            opacity: 0.75,
            // Closed points down (arrow_down's natural orientation), open
            // points up — keep this row's and CallPicker's chevrons on the
            // same rotation language.
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        />
      )}
    </Button>
  );
};

const GroupList = ({ view, openGroup, onOpenGroup, palette, t, active = true }) => {
  const residualTokens = resolveResidualTokens(view);

  return (
    <div data-testid={active ? "context-composition-groups" : undefined}>
      {view.groups.map((group) => {
        const expanded = openGroup === group.id;
        const detailId = `context-composition-group-${group.id}`;
        return (
          <div key={group.id}>
            <Row
              color={group.color}
              label={groupLabel(group, t)}
              value={
                view.scope === "model_call" &&
                view.percentageAvailable &&
                group.share !== null
                  ? `${formatTokens(group.tokens, t)} · ${formatPercent(group.share, t)}`
                  : formatTokens(group.tokens, t)
              }
              expanded={expanded}
              detailId={detailId}
              onClick={() => onOpenGroup(expanded ? null : group.id)}
              palette={palette}
              testId="context-composition-group-toggle"
              active={active}
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
                      {formatTokens(subtype.tokens, t)} ·{" "}
                      {t(
                        subtype.sourceCount === 1
                          ? "context_usage.source_count_one"
                          : "context_usage.source_count_other",
                        { count: subtype.sourceCount },
                      )}
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
          label={t("context_usage.unattributed")}
          value={formatTokens(residualTokens, t)}
          palette={palette}
          testId="context-composition-residual-row"
          active={active}
        />
      )}
    </div>
  );
};

const QualityLine = ({ view, palette, t, active = true }) => {
  const text =
    view.scope === "run_tree"
      ? `${t(
          view.agentCount === 1
            ? "context_usage.agent_count_one"
            : "context_usage.agent_count_other",
          { count: view.agentCount },
        )} · ${t("context_usage.peak", {
          value:
            view.peakWindowPressure === null
              ? t("context_usage.unavailable")
              : formatPercent(view.peakWindowPressure, t),
        })}`
      : `${qualityLabel(view.compositionQuality, t)}${
          view.coverage?.status === "complete"
            ? ` · ${t("context_usage.complete_coverage")}`
            : ` · ${t("context_usage.partial_coverage")}`
        }`;

  return (
    <div
      data-testid={active ? "context-composition-quality" : undefined}
      aria-label={t("context_usage.composition_quality")}
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
const UsageOnlyView = ({ usage, palette, t, active = true }) => {
  const cached = usage.cacheReadTokens;
  const fresh =
    usage.uncachedTokens === null && usage.cacheWriteTokens === null
      ? null
      : (usage.uncachedTokens || 0) + (usage.cacheWriteTokens || 0);

  return (
    <div data-testid={active ? "context-usage-only" : undefined}>
      <div
        data-testid={active ? "context-composition-headline" : undefined}
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
            ? t("context_usage.full", {
                percentage: formatPercent(usage.windowPressure, t),
              })
            : t("context_usage.used", {
                tokens: formatTokens(usage.inputTokens, t),
              })}
        </span>
        <span style={{ color: palette.muted, fontSize: 12, whiteSpace: "nowrap" }}>
          {usage.contextWindowTokens === null
            ? t("context_usage.window_size_unknown")
            : t("context_usage.token_window", {
                inputTokens: formatTokens(usage.inputTokens, t),
                contextWindowTokens: formatTokens(usage.contextWindowTokens, t),
              })}
        </span>
      </div>

      <div
        role="img"
        aria-label={t("context_usage.context_window_occupancy")}
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
            label={t("context_usage.cached")}
            value={formatTokens(cached, t)}
            palette={palette}
            testId="context-usage-cached"
            active={active}
          />
        )}
        {fresh !== null && (
          <Row
            color="#5E9DE6"
            label={t("context_usage.new_this_turn")}
            value={formatTokens(fresh, t)}
            palette={palette}
            testId="context-usage-fresh"
            active={active}
          />
        )}
      </div>

      <div
        data-testid={active ? "context-usage-note" : undefined}
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
        {t("context_usage.usage_note", {
          calls: formatCallCount(usage.callCount, t),
        })}
      </div>
    </div>
  );
};

const UnavailableView = ({ reason, palette, t, active = true }) => (
  <div
    role="status"
    data-testid={active ? "context-composition-unavailable" : undefined}
    style={{
      padding: "22px 14px 24px",
      margin: "0 4px",
      borderRadius: 8,
      backgroundColor: palette.surface,
      textAlign: "center",
    }}
  >
    <div style={{ fontSize: 13, fontWeight: 560, marginBottom: 4 }}>
      {t("context_usage.no_data_yet")}
    </div>
    <div style={{ color: palette.muted, fontSize: 11.5, lineHeight: 1.5 }}>
      {unavailableCopy(reason, t)}
    </div>
  </div>
);

/**
 * One scope's content — Context (model_call) or Summary (run_tree). Both are
 * mounted at all times, side by side in a 200%-wide track (see the viewport
 * below); this is what lets switching scope slide the old one out and the new
 * one in instead of swapping content in place and snapping the box to a new
 * height.
 *
 * The inactive pane stays fully rendered (so the slide has something real to
 * show, not a blank box) but is `aria-hidden` + `inert` — unreachable by
 * keyboard or a screen reader — and its own `openGroup` is forced closed so
 * an expansion made in the active pane cannot silently mirror into the one
 * sliding off-screen. Its testids are suppressed too, since the shared
 * category ids/labels are identical to the active pane's own — otherwise
 * every existing `getByText`/`getByTestId` query in this component's tests
 * would start matching twice.
 */
const ScopePane = ({
  paneRef,
  scopeId,
  active,
  view,
  usageView,
  selectedCallKey,
  onSelectCall,
  openGroup,
  onOpenGroup,
  palette,
  t,
}) => (
  <div
    ref={paneRef}
    id={`context-composition-${scopeId}-panel`}
    data-testid={`context-composition-pane-${scopeId}`}
    role="tabpanel"
    aria-labelledby={`context-composition-${scopeId}-tab`}
    aria-live="polite"
    aria-hidden={!active}
    inert={!active}
    style={{ flex: "0 0 50%", minWidth: 0, boxSizing: "border-box" }}
  >
    {!view.available && usageView && scopeId === "model_call" ? (
      <UsageOnlyView usage={usageView} palette={palette} t={t} active={active} />
    ) : view.available ? (
      <>
        {scopeId === "model_call" && (
          <CallPicker
            calls={view.calls || []}
            selectedCallKey={selectedCallKey || view.selectedCallKey}
            onChange={onSelectCall}
            palette={palette}
            t={t}
          />
        )}
        <Headline
          view={view}
          usageView={usageView}
          palette={palette}
          t={t}
          active={active}
        />
        <CompositionBar view={view} palette={palette} t={t} active={active} />
        <GroupList
          view={view}
          openGroup={openGroup}
          onOpenGroup={onOpenGroup}
          palette={palette}
          t={t}
          active={active}
        />
        <QualityLine view={view} palette={palette} t={t} active={active} />
      </>
    ) : (
      <UnavailableView reason={view.reason} palette={palette} t={t} active={active} />
    )}
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
}) => {
  const { t } = useTranslation();
  const [scope, setScope] = useState("model_call");
  const [selectedCallKey, setSelectedCallKey] = useState(null);
  const [openGroup, setOpenGroup] = useState(null);
  const [viewportHeight, setViewportHeight] = useState(null);
  const modelCallPaneRef = useRef(null);
  const runTreePaneRef = useRef(null);

  const modelCallView = useMemo(
    () =>
      selectContextCompositionView(bundle, {
        scope: "model_call",
        callKey: selectedCallKey,
      }) || { ...FALLBACK_VIEW, scope: "model_call" },
    [bundle, selectedCallKey],
  );
  const runTreeView = useMemo(
    () =>
      selectContextCompositionView(bundle, { scope: "run_tree" }) || {
        ...FALLBACK_VIEW,
        scope: "run_tree",
      },
    [bundle],
  );
  const overallAvailable = modelCallView.available || runTreeView.available;

  useEffect(() => {
    if (!open) return;
    setScope("model_call");
    setSelectedCallKey(null);
    setOpenGroup(null);
  }, [open]);

  /* Re-measure the ACTIVE pane's own natural height whenever anything that can
     change it changes: switching scope, expanding a group, picking a different
     physical call, or the underlying data itself. Each pane renders with no
     height constraint of its own, so scrollHeight is always its true natural
     size — unlike measuring an element that is itself capped, which reports
     the compressed height instead and feeds an ever-shrinking value back into
     the cap on every pass. */
  useLayoutEffect(() => {
    const activePane = (
      scope === "model_call" ? modelCallPaneRef : runTreePaneRef
    ).current;
    if (!activePane) return;
    const raw = activePane.scrollHeight;
    // 0 stays 0 — that is the "not measured yet" sentinel the height fallback
    // below checks for, not a real content height to pad.
    const measured = raw > 0 ? raw + CONTENT_HEIGHT_BUFFER : 0;
    setViewportHeight((current) => (current === measured ? current : measured));
  }, [scope, openGroup, selectedCallKey, modelCallView, runTreeView, usageView]);

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
          {t("context_usage.title")}
        </h2>
        {overallAvailable && (
          <ScopeToggle
            scope={scope}
            onChange={setScope}
            modelCallRef={scopeRef}
            palette={palette}
            t={t}
          />
        )}
        {trailing}
      </div>

      <p id={DESCRIPTION_ID} style={{ display: "none" }}>
        {t("context_usage.description")}
      </p>

      {/* Vertical scroll + a fixed, JS-driven height live here — a SEPARATE
          element from the horizontal slide, which only ever needs to clip.

          Before the first measurement, this sizes to content on its own
          ("auto", capped only by the hard ceiling) instead of committing to
          MAX_PANE_VIEWPORT_HEIGHT and animating down once the real height
          lands. The whole popover already has one reveal — Tooltip's own
          scale+opacity, the same one every other menu on this row uses — and
          a SECOND, independent height animation stacked on top of it is
          exactly what read as not matching them: it fades in, but then also
          visibly grows or shrinks to size a beat later, which they never do
          because their height was never anything but auto in the first
          place. `auto` cannot be CSS-transitioned, so this first paint is
          necessarily an immediate snap, not an animation — matching them
          exactly. Only scope switches and group expansions AFTER that first
          paint animate, because only then is there a prior numeric height for
          the browser to interpolate from. */}
      <div
        ref={listRef}
        data-testid="context-composition-viewport"
        style={{
          minHeight: 0,
          overflowX: "hidden",
          overflowY: "auto",
          overscrollBehavior: "contain",
          height: viewportHeight
            ? `${Math.min(viewportHeight, MAX_PANE_VIEWPORT_HEIGHT)}px`
            : "auto",
          maxHeight: viewportHeight ? undefined : MAX_PANE_VIEWPORT_HEIGHT,
          transition: HEIGHT_TRANSITION,
        }}
      >
        <div
          data-testid="context-composition-track"
          style={{
            display: "flex",
            alignItems: "flex-start",
            width: "200%",
            transform: `translateX(${scope === "model_call" ? "0%" : "-50%"})`,
            transition: SLIDE_TRANSITION,
          }}
        >
          <ScopePane
            paneRef={modelCallPaneRef}
            scopeId="model_call"
            active={scope === "model_call"}
            view={modelCallView}
            usageView={usageView}
            selectedCallKey={selectedCallKey}
            onSelectCall={setSelectedCallKey}
            openGroup={scope === "model_call" ? openGroup : null}
            onOpenGroup={setOpenGroup}
            palette={palette}
            t={t}
          />
          <ScopePane
            paneRef={runTreePaneRef}
            scopeId="run_tree"
            active={scope === "run_tree"}
            view={runTreeView}
            usageView={null}
            selectedCallKey={null}
            onSelectCall={() => {}}
            openGroup={scope === "run_tree" ? openGroup : null}
            onOpenGroup={setOpenGroup}
            palette={palette}
            t={t}
          />
        </div>
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
