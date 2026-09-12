import {
  forwardRef,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { Z } from "../../../BUILTIN_COMPONENTs/layer/z_layers";
import { themeHighlightColor } from "../../../CONTAINERs/config/theme_highlight";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import useReducedMotion from "../../../BUILTIN_COMPONENTs/mini_react/use_reduced_motion";
import ScaleHighlight from "../../../BUILTIN_COMPONENTs/class/scale_highlight";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import Slider from "../../../BUILTIN_COMPONENTs/input/slider";
import Tooltip from "../../../BUILTIN_COMPONENTs/tooltip/tooltip";
import { Select } from "../../../BUILTIN_COMPONENTs/select/select";
import AttachmentChipList from "./attachment_chip_list";
import { QueueAttachSection } from "./queue_pile";
import { WorkspaceModal } from "../../workspace/workspace_modal";
import useChatInputToolkits from "../hooks/use_chat_input_toolkits";
import { COMPUTER_TOOLKIT_ID } from "../constants";
import useChatInputWorkspaces from "../hooks/use_chat_input_workspaces";
import useAttachPanelLayout from "../hooks/use_attach_panel_layout";
import {
  MOVABLE_ATTACH_WIDGETS,
  moveAttachWidget,
  setAttachWidgetHidden,
  writeAttachPanelLayout,
} from "../../../SERVICEs/attach_panel_layout";
import { emitModelCatalogRefresh } from "../../../SERVICEs/model_catalog_refresh";
import { hasContextCompositionEvidence } from "../../../SERVICEs/context_composition_v1";
import {
  readFeatureFlags,
  subscribeFeatureFlags,
} from "../../../SERVICEs/feature_flags";
import ContextCompositionProgress from "./context_composition_progress";

const MOVABLE_ATTACH_WIDGET_SET = new Set(MOVABLE_ATTACH_WIDGETS);

/* ── arrange-mode jiggle ────────────────────────────────────────────────────
   The iOS home-screen tell: while arranging, every movable widget rocks a
   couple of degrees around its centre, each on its own phase, so the row
   reads as "loose" without a word of instruction. Keyframes cannot live in
   an inline style, so they are injected once into the document head, the
   way the spinners do it. */
const JIGGLE_STYLE_ATTR = "data-pupu-attach-jiggle";
const JIGGLE_NAME = "pupu-attach-jiggle";
/* the menu's rows are wide and short, so they rock less — the same period,
   a third of the angle — or the labels would read as shaking */
const JIGGLE_ROW_NAME = "pupu-attach-jiggle-row";
const JIGGLE_PERIOD_MS = 260;
/* the "…" menu's rows cascade in the way the palette's do (option_list.js
   rowStagger): rise 8px and fade, 200ms on the palette's own curve, 30ms
   apart top-down */
const MENU_IN_NAME = "pupu-attach-menu-in";
const ensureJiggleKeyframes = () => {
  if (typeof document === "undefined") return;
  if (document.head.querySelector(`style[${JIGGLE_STYLE_ATTR}]`)) return;
  const style = document.createElement("style");
  style.setAttribute(JIGGLE_STYLE_ATTR, "");
  style.textContent = `
    @keyframes ${JIGGLE_NAME} {
      0%   { transform: rotate(-1.6deg) translateY(0.2px); }
      50%  { transform: rotate(1.6deg) translateY(-0.2px); }
      100% { transform: rotate(-1.6deg) translateY(0.2px); }
    }
    @keyframes ${JIGGLE_ROW_NAME} {
      0%   { transform: rotate(-0.5deg); }
      50%  { transform: rotate(0.5deg); }
      100% { transform: rotate(-0.5deg); }
    }
    @keyframes ${MENU_IN_NAME} {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
};

const MODEL_SELECTOR_REFRESH_THROTTLE_MS = 1500;

const PILL_HEIGHT = 32;
const TOOL_SELECTOR_TRIGGER_ICON_SIZE = 18;

const isTextEntryTarget = (target) =>
  Boolean(
    target &&
    typeof target.closest === "function" &&
    target.closest(
      "input, textarea, [contenteditable]:not([contenteditable='false'])",
    ),
  );

/* ── palette header action — small uppercase button in the dropdown's
   bottom header (CLEAR / + ADD), faint at rest, brightens on hover ── */

const HeaderAction = ({ children, onAct, accent = false, isDark, theme }) => {
  const restColor = accent
    ? isDark
      ? "#9ad9a0"
      : "rgba(25,125,65,0.95)"
    : isDark
      ? "rgba(255,255,255,0.35)"
      : "rgba(0,0,0,0.38)";
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onAct();
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = isDark
          ? "rgba(255,255,255,0.08)"
          : "rgba(0,0,0,0.06)";
        if (!accent)
          e.currentTarget.style.color = isDark
            ? "rgba(255,255,255,0.7)"
            : "rgba(0,0,0,0.7)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
        e.currentTarget.style.color = restColor;
      }}
      style={{
        flexShrink: 0,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
        fontSize: 10,
        letterSpacing: "0.05em",
        color: restColor,
        padding: "2px 6px",
        borderRadius: 7,
        transition: "background-color 0.13s ease, color 0.13s ease",
      }}
    >
      {children}
    </button>
  );
};

/* ── model palette footer rows: effort and context window, one control ──
   Both live in the palette_footer slot under the chip/search header, both
   are ordered ladders the user picks one notch of, and both follow the same
   rules: the pick is per chat and remembered per model, it is one-way (no
   reset — the untouched state is the default, marked as such), a drag
   follows the hand locally and commits once on release, keys commit at
   once. So they share one row: a 28px capsule (concentric with the panel:
   radius 22 - padding 8 = 14) holding a label well, the BUILTIN Slider in
   its glass material driven in index space over the notches, and a value
   well at the end (glass has no centre label, and a tooltip would be
   clipped by the footer). ── */

const EFFORT_SHORT_LABELS = {
  none: "none",
  minimal: "min",
  low: "low",
  medium: "med",
  high: "high",
  xhigh: "x-high",
  max: "max",
};

/* 28 = 2 x (panel radius 22 - panel padding 8). See the capsule's style. */
const CAPSULE_HEIGHT = 28;
/* Both wells carry a floor so that, when the effort and context rows stack,
   their tracks start and end on the same x whatever the two labels and
   values happen to be ("effort" vs "context", "low" vs "128k"). */
const LABEL_WELL_MIN_WIDTH = 66;
const VALUE_WELL_MIN_WIDTH = 46;

/* Presets are powers of two and read in binary k (32768 → 32k, 131072 →
   128k); a model's own declared window is usually a round decimal figure
   (128000 → 128k, the way the model is sold), so a round-thousand value
   reads in decimal k and everything else rounds on the 1024 grid (40960 →
   40k). */
const formatWindowShort = (tokens) =>
  tokens % 1000 === 0
    ? `${tokens / 1000}k`
    : `${Math.round(tokens / 1024)}k`;

const NotchSliderRow = ({
  testId,
  readoutTestId,
  label,
  notches,
  shownIndex,
  selected,
  defaultHint,
  onSelect,
  isDark,
  theme,
  t: _t,
}) => {
  /* Local-first drag. Committing means a chat-store write, a per-model
     memory write and a re-render of the whole chat page — far too much to
     do on every pointermove, and the thumb was visibly waiting on it. While
     the pointer is down the row keeps the live notch in its own state
     (thumb and well follow the hand at once) and commits exactly once on
     release. Keyboard steps are single events and commit immediately. */
  const [liveIndex, setLiveIndex] = useState(null);
  const liveIndexRef = useRef(null);
  const draggingRef = useRef(false);
  const endDragRef = useRef(null);
  const latestRef = useRef({ notches: [], selected: null, onSelect: null });
  useEffect(
    () => () => {
      /* unmount mid-drag: drop the listeners, commit nothing */
      if (endDragRef.current) {
        endDragRef.current.detach();
        endDragRef.current = null;
      }
    },
    [],
  );

  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const lastIndex = notches.length - 1;
  const marks = notches.map((_notch, index) => index);
  latestRef.current = { notches, selected, onSelect };

  /* One-way and idempotent: the notch already chosen is not a reset, and a
     key press clamped at the track's end is not a new pick. Reads the latest
     render's notches and selection so a release after re-renders stays
     right. */
  const commit = (index) => {
    const latest = latestRef.current;
    const notch = latest.notches[index];
    if (!notch || notch.value === latest.selected) return;
    if (typeof latest.onSelect === "function") latest.onSelect(notch.value);
  };
  const handleChange = (index) => {
    const notch = Math.round(index);
    if (draggingRef.current) {
      liveIndexRef.current = notch;
      setLiveIndex(notch);
      return;
    }
    commit(notch);
  };
  const endDrag = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (endDragRef.current) {
      endDragRef.current.detach();
      endDragRef.current = null;
    }
    const notch = liveIndexRef.current;
    liveIndexRef.current = null;
    setLiveIndex(null);
    if (notch != null) commit(notch);
  };
  const beginDrag = () => {
    if (draggingRef.current) return;
    draggingRef.current = true;
    liveIndexRef.current = shownIndex;
    setLiveIndex(shownIndex);
    const end = () => endDrag();
    const types = ["pointerup", "mouseup", "touchend", "pointercancel", "blur"];
    types.forEach((type) => window.addEventListener(type, end));
    endDragRef.current = {
      detach: () => types.forEach((type) => window.removeEventListener(type, end)),
    };
  };
  const activeIndex = liveIndex ?? shownIndex;
  const picked = selected != null || liveIndex != null;

  /* Materials lifted from mini_ui's glass switch, tuned lighter for a
     control that sits inside an already-frosted panel: the groove is a
     pressed-in gradient with a light seam beneath it, the wells are pressed
     deeper into it. */
  const grooveBackground = isDark
    ? "rgba(255,255,255,0.07)"
    : "linear-gradient(to bottom, rgba(0,0,0,0.065), rgba(0,0,0,0.025))";
  const grooveShadow = isDark
    ? "inset 0 1px 2px rgba(0,0,0,0.28)"
    : "inset 0 1px 2px rgba(0,0,0,0.07), 0 0.75px 0 rgba(255,255,255,0.5)";
  const labelWellBackground = isDark ? "rgba(0,0,0,0.16)" : "rgba(0,0,0,0.045)";
  const labelWellShadow = isDark
    ? "inset 0 1px 2px rgba(0,0,0,0.32)"
    : "inset 0 1px 2px rgba(0,0,0,0.09)";
  /* No accent until a pick: an untouched channel is the default, not a
     level the user asked for. A transparent progress leaves only the glass
     channel showing. */
  const activeColor = picked
    ? isDark
      ? "rgba(154,217,160,0.85)"
      : "rgba(25,125,65,0.7)"
    : "rgba(0,0,0,0)";
  const thumbColor = picked
    ? isDark
      ? "rgba(154,217,160,0.95)"
      : "rgba(25,125,65,0.9)"
    : isDark
      ? "rgba(255,255,255,0.55)"
      : "rgba(0,0,0,0.45)";
  const labelColor = picked
    ? isDark
      ? "rgba(255,255,255,0.88)"
      : "rgba(0,0,0,0.86)"
    : isDark
      ? "rgba(255,255,255,0.55)"
      : "rgba(0,0,0,0.55)";

  return (
    <div
      data-testid={testId}
      data-picked={picked ? "true" : "false"}
      title={picked ? undefined : defaultHint}
      style={{
        display: "flex",
        alignItems: "stretch",
        width: "100%",
        height: CAPSULE_HEIGHT,
        /* This repo sets no global border-box, so width:100% plus padding
           would hang the capsule's right end out past the panel. */
        boxSizing: "border-box",
        padding: 3,
        borderRadius: 999,
        background: grooveBackground,
        boxShadow: grooveShadow,
      }}
    >
      <span
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          minWidth: LABEL_WELL_MIN_WIDTH,
          marginRight: 4,
          padding: "0 8px 0 10px",
          borderRadius: 999,
          fontFamily,
          fontSize: 9.5,
          letterSpacing: "0.09em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          cursor: "default",
          color: isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.38)",
          background: labelWellBackground,
          boxShadow: labelWellShadow,
        }}
      >
        {/* Uppercase text never uses the descender the line box still
            reserves for it, so centring the LINE box leaves the caps ~1px
            above the well's true centre. `text-box` trims the box to the
            cap/baseline edges; it applies to a block only, hence this span.
            Unsupported, the box stays untrimmed and this renders exactly as
            it does today. */}
        <span style={{ display: "block", textBox: "trim-both cap alphabetic" }}>
          {label}
        </span>
      </span>

      {/* 4px of inset on both ends: the glass channel already insets its
          travel by its own cap radius, so only a hair of air is needed for
          the frosted thumb at either extreme. The Slider is fluid: it sizes
          and measures itself from this span, so its thumb, marks and
          hit-testing always share one width. */}
      <span
        onPointerDownCapture={beginDrag}
        onMouseDownCapture={beginDrag}
        onTouchStartCapture={beginDrag}
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          alignItems: "center",
          padding: "0 4px",
          boxSizing: "border-box",
        }}
      >
        <span style={{ display: "block", width: "100%" }}>
          <Slider
            material="glass"
            value={activeIndex}
            set_value={handleChange}
            min={0}
            max={lastIndex}
            step={1}
            marks={marks}
            show_tooltip={false}
            label_format={(index) =>
              (notches[Math.round(index)] ?? notches[0]).label
            }
            style={{
              width: "100%",
              height: 22,
              /* the whole glass geometry fits the 28px capsule, pressed
                 included: 16px channel, 24px ring, 24 × 1.15 = 27.6 */
              channelHeight: 16,
              thumbSize: 24,
              pressScale: 1.15,
              activeColor,
              thumbColor,
            }}
          />
        </span>
      </span>

      {/* the value well — pressed into the groove like the label well, lit
          only once something is picked. It reads the notch the track rests
          on, which is also what the request will carry. */}
      <span
        data-testid={readoutTestId}
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          minWidth: VALUE_WELL_MIN_WIDTH,
          padding: "0 9px",
          marginLeft: 4,
          borderRadius: 999,
          fontFamily,
          fontSize: 10,
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
          color: labelColor,
          background: labelWellBackground,
          boxShadow: labelWellShadow,
        }}
      >
        {notches[activeIndex].label}
      </span>
    </div>
  );
};

/* Effort: the levels come from the selected model's capability declaration
   (provider-shaped, up to seven), already ordered. The untouched track rests
   on the model's own default level. */
const EffortSliderRow = ({
  efforts,
  selected,
  defaultEffort,
  onSelect,
  isDark,
  theme,
  t,
}) => {
  const levels = Array.isArray(efforts) ? efforts : [];
  if (levels.length === 0) return null;
  const notches = levels.map((level) => ({
    value: level,
    label: EFFORT_SHORT_LABELS[level] || level,
  }));
  const shownLevel = selected || defaultEffort || levels[0];
  const shownIndex = Math.max(0, levels.indexOf(shownLevel));
  return (
    <NotchSliderRow
      testId="effort-row"
      readoutTestId="effort-readout"
      label={t("chat.attach.effort")}
      notches={notches}
      shownIndex={shownIndex}
      selected={selected || null}
      defaultHint={
        defaultEffort
          ? t("chat.attach.effort_default_hint", { level: defaultEffort })
          : undefined
      }
      onSelect={onSelect}
      isDark={isDark}
      theme={theme}
      t={t}
    />
  );
};

/* Context window (#227): the presets, cut at the model's declared maximum,
   which becomes the track's own last notch when it sits above the last
   preset that fits (a 128000 model gets its 128k, a 40960 one its 40k)
   instead of stopping a notch short of what it can do. The request then
   carries the declared value exactly. The untouched track rests on PuPu's
   default window. */
const ContextWindowSliderRow = ({
  presets,
  selected,
  defaultWindow,
  maxWindow,
  onSelect,
  isDark,
  theme,
  t,
}) => {
  const windows = Array.isArray(presets)
    ? presets
        .filter((tokens) => Number.isInteger(tokens) && tokens > 0)
        .sort((a, b) => a - b)
    : [];
  if (windows.length === 0 || !defaultWindow) return null;

  const maxReachable =
    Number.isInteger(maxWindow) && maxWindow > 0 ? maxWindow : Infinity;
  const reachable = windows.filter((tokens) => tokens <= maxReachable);
  const track =
    Number.isFinite(maxReachable) &&
    maxReachable > (reachable[reachable.length - 1] ?? 0)
      ? [...reachable, maxReachable]
      : reachable.length > 0
        ? reachable
        : windows.slice(0, 1);
  const shownWindow = selected || defaultWindow;
  /* A remembered pick above this model's window rests on the last notch the
     track still has; the sidecar caps the request the same way. */
  let shownIndex = 0;
  track.forEach((tokens, index) => {
    if (tokens <= shownWindow) shownIndex = index;
  });
  const notches = track.map((tokens) => ({
    value: tokens,
    label: formatWindowShort(tokens),
  }));
  return (
    <NotchSliderRow
      testId="context-window-row"
      readoutTestId="context-window-readout"
      label={t("chat.attach.context")}
      notches={notches}
      shownIndex={shownIndex}
      selected={selected || null}
      defaultHint={t("chat.attach.context_default_hint", {
        tokens: formatWindowShort(defaultWindow),
      })}
      onSelect={onSelect}
      isDark={isDark}
      theme={theme}
      t={t}
    />
  );
};

/* ── main component ── */

const AttachPanel = forwardRef(({
  color,
  active,
  focused,
  focusBg,
  focusShadow,
  onAttachFile,
  onAttachLink,
  onAttachScreenshot,
  modelOptions,
  showModelSelector = true,
  selectedModelId,
  onSelectModel,
  reasoningEffortOptions = [],
  selectedReasoningEffort = null,
  defaultReasoningEffort = null,
  onSelectReasoningEffort,
  contextWindowPresets = [],
  selectedContextWindow = null,
  defaultContextWindow = null,
  maxContextWindow = null,
  onSelectContextWindow,
  onGroupToggle,
  modelSelectDisabled,
  isDark,
  attachmentsEnabled = true,
  attachments = [],
  onRemoveAttachment,
  isStreaming = false,
  showToolSelector = true,
  toolSelectDisabled = false,
  selectedToolkits = [],
  onToolkitsChange,
  showWorkspaceSelector = true,
  selectedWorkspaceIds = [],
  onWorkspaceIdsChange,
  selectedRecipeName = "Default",
  onSelectRecipe,
  queueItems = [],
  onQueueUndo,
  contextCompositionBundle = null,
  contextUsageView = null,
  onKeyboardActiveChange = () => {},
  onRequestInputFocus = () => {},
  onSelectorOpenChange = () => {},
}, ref) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const highlight = themeHighlightColor(theme);
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [openSelector, setOpenSelector] = useState(null);
  const contextCompositionProgressRef = useRef(null);
  // Provider usage arrives on every call, composition only once a source is
  // instrumented — so the indicator appears as soon as there is anything true
  // to show, not only when the full breakdown exists.
  const hasContextComposition =
    hasContextCompositionEvidence(contextCompositionBundle) ||
    Boolean(contextUsageView);

  /* Optimistic mirrors for the multi-selects: the checkbox flips against
     LOCAL state instantly (re-rendering just this panel), while the real
     update — which lives at the top of the chat page and re-renders the
     whole message tree — rides a startTransition in the background. */
  const [localToolkits, setLocalToolkits] = useState(selectedToolkits);
  useEffect(() => {
    setLocalToolkits(selectedToolkits);
  }, [selectedToolkits]);
  const handleToolkitsValueChange = useCallback(
    (next) => {
      setLocalToolkits(next);
      startTransition(() => {
        (onToolkitsChange || (() => {}))(next);
      });
    },
    [onToolkitsChange],
  );

  const [localWorkspaceIds, setLocalWorkspaceIds] = useState(
    selectedWorkspaceIds,
  );
  useEffect(() => {
    setLocalWorkspaceIds(selectedWorkspaceIds);
  }, [selectedWorkspaceIds]);
  const handleWorkspaceIdsValueChange = useCallback(
    (next) => {
      setLocalWorkspaceIds(next);
      startTransition(() => {
        (onWorkspaceIdsChange || (() => {}))(next);
      });
    },
    [onWorkspaceIdsChange],
  );
  const [featureFlags, setFeatureFlags] = useState(() => readFeatureFlags());
  const lastModelSelectorRefreshAt = useRef(0);
  const {
    toolkitOptions,
    refreshToolkits,
    computerAvailable,
    computerResolutionKnown,
  } = useChatInputToolkits({ selectedModelId });

  /* Reconcile a residual selection: once computer use is DEFINITIVELY not
     selectable for this chat (master switch off, bridge unavailable, or the
     current model unsupported), strip "builtin.computer" from the selection
     through the normal setter — otherwise the entry sits disabled with the id
     stuck in the payload and the user can only clear ALL tools to remove it.
     Server truth still gates real mounting; this is a selection-consistency
     fix. Switching to a supported model + on again simply re-checks the box. */
  useEffect(() => {
    if (!computerResolutionKnown || computerAvailable) return;
    if (!Array.isArray(selectedToolkits)) return;
    if (!selectedToolkits.includes(COMPUTER_TOOLKIT_ID)) return;
    handleToolkitsValueChange(
      selectedToolkits.filter((value) => value !== COMPUTER_TOOLKIT_ID),
    );
  }, [
    computerAvailable,
    computerResolutionKnown,
    selectedToolkits,
    handleToolkitsValueChange,
  ]);
  const { workspaceOptions } = useChatInputWorkspaces();
  const isAgentsFeatureEnabled =
    featureFlags.enable_user_access_to_agents === true;
  const hasActiveAgentRecipe =
    isAgentsFeatureEnabled &&
    Boolean(selectedRecipeName && selectedRecipeName !== "Default");

  useEffect(() => {
    setFeatureFlags(readFeatureFlags());
    return subscribeFeatureFlags(setFeatureFlags);
  }, []);

  useEffect(() => {
    if (
      !isAgentsFeatureEnabled &&
      selectedRecipeName &&
      selectedRecipeName !== "Default" &&
      onSelectRecipe
    ) {
      onSelectRecipe("Default");
    }
  }, [isAgentsFeatureEnabled, onSelectRecipe, selectedRecipeName]);

  const modelSelectOptions = modelOptions || [];
  /* Footer rows belong to the current selection, not to the list: the effort
     ladder when the model declares levels, the context-window slider when it
     declares a default window (built-in Ollama), both stacked when it has
     both, and null — not an empty element — when it has neither, so the
     footer collapses instead of leaving a rule over an empty band. */
  const effortRow =
    reasoningEffortOptions.length > 0 ? (
      <EffortSliderRow
        efforts={reasoningEffortOptions}
        selected={selectedReasoningEffort}
        defaultEffort={defaultReasoningEffort}
        onSelect={onSelectReasoningEffort}
        isDark={isDark}
        theme={theme}
        t={t}
      />
    ) : null;
  const contextRow =
    Array.isArray(contextWindowPresets) &&
    contextWindowPresets.length > 0 &&
    Number.isInteger(defaultContextWindow) &&
    defaultContextWindow > 0 ? (
      <ContextWindowSliderRow
        presets={contextWindowPresets}
        selected={selectedContextWindow}
        defaultWindow={defaultContextWindow}
        maxWindow={maxContextWindow}
        onSelect={onSelectContextWindow}
        isDark={isDark}
        theme={theme}
        t={t}
      />
    ) : null;
  const paletteFooter =
    effortRow || contextRow ? (
      <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
        {effortRow}
        {contextRow}
      </div>
    ) : null;

  const modelSelectValue = selectedModelId || null;

  const handleSelectValueChange = useCallback(
    (next) => {
      if (onSelectRecipe && hasActiveAgentRecipe) {
        onSelectRecipe("Default");
      }
      if (onSelectModel) onSelectModel(next);
    },
    [hasActiveAgentRecipe, onSelectModel, onSelectRecipe],
  );

  /* ── keyboard control (driven by chat_input via ref) ──
     kbIndex highlights one control in the row; a selector opened via
     keyboard reports back on close so focus returns to the input. */
  const [kbIndex, setKbIndex] = useState(-1);
  const [kbQueueOpen, setKbQueueOpen] = useState(false);
  const kbOpenedSelectorRef = useRef(null);
  const kbReturnIndexRef = useRef(-1);

  const handleModelSelectorOpenChange = useCallback((next) => {
    setOpenSelector(next ? "model" : null);
    if (next) {
      const now = Date.now();
      if (
        now - lastModelSelectorRefreshAt.current >
        MODEL_SELECTOR_REFRESH_THROTTLE_MS
      ) {
        lastModelSelectorRefreshAt.current = now;
        emitModelCatalogRefresh({ reason: "model_selector_opened" });
      }
    } else if (kbOpenedSelectorRef.current === "model") {
      kbOpenedSelectorRef.current = null;
      onRequestInputFocus();
      setKbIndex(kbReturnIndexRef.current); // back where the user was
    }
  }, [onRequestInputFocus]);

  const handleToolsOpenChange = useCallback(
    (next) => {
      if (next) {
        void refreshToolkits();
        setOpenSelector("tools");
        return;
      }

      setOpenSelector(null);
      if (kbOpenedSelectorRef.current === "tools") {
        kbOpenedSelectorRef.current = null;
        onRequestInputFocus();
        setKbIndex(kbReturnIndexRef.current);
      }
    },
    [refreshToolkits, onRequestInputFocus],
  );

  const handleContextCompositionOpenChange = useCallback((next) => {
    setOpenSelector(next ? "context_composition" : null);
  }, []);

  const handleWorkspaceOpenChange = useCallback(
    (next) => {
      setOpenSelector(next ? "workspace" : null);
      if (!next && kbOpenedSelectorRef.current === "workspace") {
        kbOpenedSelectorRef.current = null;
        onRequestInputFocus();
        setKbIndex(kbReturnIndexRef.current);
      }
    },
    [onRequestInputFocus],
  );

  /* ── widget layout (#217) ──────────────────────────────────────────────
     The movable widgets render in the user's order; the ones the user tucked
     away live in the "…" menu at the end of the row and are invoked from
     there. Availability is this chat's business (no screenshot handler, tools
     hidden behind an agent recipe) and the model's (attachments the model
     cannot read): an unavailable widget is skipped in both places — never
     shown disabled — and keeps its slot for when it comes back; when the
     last tucked one goes, the "…" goes with it. The model pill and the
     queue segment are not movable. */
  const layout = useAttachPanelLayout();
  const widgetAvailable = {
    context_composition: hasContextComposition,
    attach: Boolean(onAttachFile && attachmentsEnabled),
    screenshot: Boolean(onAttachFile && onAttachScreenshot && attachmentsEnabled),
    tools: Boolean(onAttachFile && showToolSelector && !hasActiveAgentRecipe),
    workspace: Boolean(onAttachFile && showWorkspaceSelector),
    link: Boolean(onAttachLink),
  };
  const visibleWidgets = layout.order.filter(
    (id) => widgetAvailable[id] && !layout.hidden.includes(id),
  );
  const tuckedWidgets = layout.order.filter(
    (id) => widgetAvailable[id] && layout.hidden.includes(id),
  );
  const hasMore = tuckedWidgets.length > 0;
  const [moreIndex, setMoreIndex] = useState(0);
  const [arranging, setArranging] = useState(false);
  /* The "…" menu is open state of its own, not a value of openSelector: a
     tucked tools/workspace palette or the tucked ring's panel opens FROM a
     row of this menu (openSelector becomes "tools"…), and the menu has to
     stay put underneath as their anchor. Opening anything else on the row
     (the model pill, a visible widget) closes the menu — see the effect. */
  const [moreOpen, setMoreOpen] = useState(false);
  const tuckedWidgetsRef = useRef(tuckedWidgets);
  tuckedWidgetsRef.current = tuckedWidgets;

  const arrangingRef = useRef(false);
  const handleMoreOpenChange = useCallback(
    (next) => {
      setMoreOpen(next);
      if (next) {
        setOpenSelector("more");
        setMoreIndex(0);
        return;
      }
      setOpenSelector((current) =>
        current === "more" || tuckedWidgetsRef.current.includes(current)
          ? null
          : current,
      );
      if (kbOpenedSelectorRef.current === "more") {
        kbOpenedSelectorRef.current = null;
        onRequestInputFocus();
        setKbIndex(kbReturnIndexRef.current);
      }
    },
    [onRequestInputFocus],
  );
  useEffect(() => {
    if (!moreOpen || arranging) return;
    if (
      openSelector !== null &&
      openSelector !== "more" &&
      !tuckedWidgets.includes(openSelector)
    ) {
      setMoreOpen(false);
    }
  }, [openSelector, moreOpen, tuckedWidgets, arranging]);
  arrangingRef.current = arranging;

  /* ── arrange mode (#217) ─────────────────────────────────────────────────
     The row itself becomes the editor: every movable widget sits in a
     dashed slot, the "…" button unfolds into a dashed tray holding the
     tucked widgets, and a Done control ends the session (so do Escape and
     a click outside). Dragging a slot past its neighbours reorders; dropping
     it on the tray tucks it; dragging a tray item back out restores it at
     the drop point. Each drop is written at once, so a closed window loses
     nothing. Keyboard: ←/→ walk the slots and tray items, Shift+←/→ move
     the highlighted one, Enter tucks or restores it. */
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const prefersReducedMotion = useReducedMotion();
  useEffect(() => {
    if ((arranging || moreOpen) && !prefersReducedMotion) ensureJiggleKeyframes();
  }, [arranging, moreOpen, prefersReducedMotion]);
  const slotRefs = useRef(new Map()); /* row slots, id → element */
  const menuRowRefs = useRef(new Map()); /* menu rows, id → element */
  const menuRef = useRef(null);
  const moreWrapRef = useRef(null); /* the "…" button's wrapper */
  const moreOpenRef = useRef(false);
  moreOpenRef.current = moreOpen;
  const dragRef = useRef(null);
  /* {id, x, y}: the ghost's centre in viewport coordinates (it is portaled
     to the body so it rides above the menu popover) */
  const [dragGhost, setDragGhost] = useState(null);
  /* {zone: "row" | "menu", index} */
  const [dropTarget, setDropTarget] = useState(null);

  const persist = (nextLayout) => {
    const persistence = writeAttachPanelLayout(nextLayout);
    if (persistence && typeof persistence.catch === "function") {
      persistence.catch(() => {});
    }
  };
  /* Insert `id` before the `index`-th member of `list` (or after its last
     member) in the record's order, skipping over widgets this chat cannot
     offer so they keep their own places. `list` is the row (available, not
     hidden) or the menu (available, hidden), without `id`. */
  const placeAmong = (baseLayout, id, list, index) => {
    const withoutId = baseLayout.order.filter((item) => item !== id);
    let orderIndex;
    if (index < list.length) {
      orderIndex = withoutId.indexOf(list[index]);
    } else if (list.length > 0) {
      orderIndex = withoutId.indexOf(list[list.length - 1]) + 1;
    } else {
      orderIndex = 0;
    }
    return moveAttachWidget(baseLayout, id, orderIndex);
  };
  const rowListOf = (baseLayout, id) =>
    baseLayout.order.filter(
      (item) => item !== id && widgetAvailable[item] && !baseLayout.hidden.includes(item),
    );
  const menuListOf = (baseLayout, id) =>
    baseLayout.order.filter(
      (item) => item !== id && widgetAvailable[item] && baseLayout.hidden.includes(item),
    );
  const placeInRow = (baseLayout, id, visibleIndex) =>
    placeAmong(baseLayout, id, rowListOf(baseLayout, id), visibleIndex);
  const placeInMenu = (baseLayout, id, menuIndex) =>
    placeAmong(baseLayout, id, menuListOf(baseLayout, id), menuIndex);
  const persistIfChanged = (next) => {
    const current = layoutRef.current;
    if (
      next.order.join("|") === current.order.join("|") &&
      next.hidden.join("|") === current.hidden.join("|")
    ) {
      return;
    }
    persist(next);
  };
  const applyDrop = (id, target) => {
    const current = layoutRef.current;
    if (!target || typeof target.index !== "number") return;
    if (target.zone === "menu") {
      const tucked = setAttachWidgetHidden(current, id, true);
      persistIfChanged(placeInMenu(tucked, id, target.index));
      return;
    }
    const restored = setAttachWidgetHidden(current, id, false);
    persistIfChanged(placeInRow(restored, id, target.index));
  };
  /* The ghost is pointer-transparent, so whatever sits under the hand — the
     composer's text, most of the time — would set the cursor: an I-beam in
     the middle of a drag, a grab hand only while passing over a slot. While
     a widget is in hand the page itself shows the grabbing hand, and nothing
     can be text-selected by the sweep. Restored on release. */
  const dragCursorRef = useRef(null);
  const holdDragCursor = () => {
    if (typeof document === "undefined" || dragCursorRef.current) return;
    const { style } = document.body;
    dragCursorRef.current = {
      cursor: style.cursor,
      userSelect: style.userSelect,
      webkitUserSelect: style.webkitUserSelect,
    };
    style.cursor = "grabbing";
    style.userSelect = "none";
    style.webkitUserSelect = "none";
  };
  const releaseDragCursor = () => {
    const saved = dragCursorRef.current;
    if (!saved || typeof document === "undefined") return;
    dragCursorRef.current = null;
    const { style } = document.body;
    style.cursor = saved.cursor;
    style.userSelect = saved.userSelect;
    style.webkitUserSelect = saved.webkitUserSelect;
  };
  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    releaseDragCursor();
    if (drag) {
      drag.detach();
      if (drag.moved && drag.target) applyDrop(drag.id, drag.target);
      /* a widget carried from the row into the menu: it is in, the menu
         has done its job and folds away; a move within the menu keeps it */
      if (
        drag.target &&
        drag.target.zone === "menu" &&
        drag.origin.zone !== "menu" &&
        moreOpenRef.current
      ) {
        moreOpenRef.current = false;
        handleMoreOpenChangeRef.current(false);
      }
    }
    setDragGhost(null);
    setDropTarget(null);
  };
  const handleMoreOpenChangeRef = useRef(handleMoreOpenChange);
  handleMoreOpenChangeRef.current = handleMoreOpenChange;
  /* The menu that a hover on the "…" opened was not there to measure when
     the hover was read: re-read the target against it once it is (and once
     more a frame later, after the popover engine has placed it), so the gap
     opens at the end nearest the button whichever side it hangs on. */
  useEffect(() => {
    if (!moreOpen) return undefined;
    const reread = () => {
      const drag = dragRef.current;
      if (!drag || !drag.last) return;
      drag.target = computeTargetRef.current(drag.id, drag.last.x, drag.last.y);
      setDropTarget(drag.target);
    };
    reread();
    const frame =
      typeof requestAnimationFrame === "function" ? requestAnimationFrame(reread) : null;
    return () => {
      if (frame != null) cancelAnimationFrame(frame);
    };
  }, [moreOpen]);
  /* The drop target is read against LIVE positions on every move. The
     panel keeps moving under a drag that starts from a long press (arrange
     mode marks the panel active, so it floats up over a couple of hundred
     milliseconds), and a snapshot taken at drag start pointed at where the
     tray had been. Live reading is stable against the gap the target
     opens: the gap always moves away from the centre the pointer just
     crossed, so the comparison never flips back. The menu is checked
     first; taking it as the target only grows its own rect by a gap row,
     so it needs no hysteresis. */
  const moreButtonRect = () => {
    const wrap = moreWrapRef.current;
    if (!wrap) return null;
    const el = wrap.querySelector?.('[data-testid="attach-more"]') || wrap;
    return el.getBoundingClientRect?.() || null;
  };
  const menuEndIndex = (id) => tuckedWidgets.filter((item) => item !== id).length;
  const computeTarget = (id, clientX, clientY) => {
    const menu = menuRef.current?.getBoundingClientRect?.();
    const more = moreButtonRect();
    /* a hair of slack only: the open gap row already grows the menu's own
       rect toward the pointer */
    const slack = 6;
    const within = (rect, x, y) =>
      x >= rect.left - slack && x <= rect.right + slack && y >= rect.top - slack && y <= rect.bottom + slack;
    if (menu) {
      if (within(menu, clientX, clientY)) {
        let index = 0;
        tuckedWidgets.forEach((item) => {
          if (item === id) return;
          const rect = menuRowRefs.current.get(item)?.getBoundingClientRect?.();
          if (rect && rect.top + rect.height / 2 < clientY) index += 1;
        });
        return { zone: "menu", index };
      }
      /* on the "…" itself, or in the seam between it and the menu (the
         button's own width only — a row slot that happens to sit under the
         menu's span is still the row): the end of the menu nearest the
         button. The engine hangs the menu below the row when there is no
         room above, so that end is the top there. */
      if (more) {
        const seam = {
          left: more.left,
          right: more.right,
          top: Math.min(more.top, menu.top),
          bottom: Math.max(more.bottom, menu.bottom),
        };
        if (within(seam, clientX, clientY)) {
          const menuAbove = menu.bottom <= more.top + slack;
          return { zone: "menu", index: menuAbove ? menuEndIndex(id) : 0 };
        }
      }
    } else if (
      more &&
      clientX >= more.left - slack &&
      clientX <= more.right + slack &&
      clientY >= more.top - slack &&
      clientY <= more.bottom + slack
    ) {
      /* hovering the "…" with a widget in hand: the menu opens as the drop
         zone (see onMove) and the widget would go at its end */
      return { zone: "menu", index: menuEndIndex(id) };
    }
    let index = 0;
    visibleWidgets.forEach((item) => {
      if (item === id) return;
      const rect = slotRefs.current.get(item)?.getBoundingClientRect?.();
      if (rect && rect.left + rect.width / 2 < clientX) index += 1;
    });
    return { zone: "row", index };
  };
  const computeTargetRef = useRef(computeTarget);
  computeTargetRef.current = computeTarget;
  const beginDragAt = (id, startX, startY) => {
    if (dragRef.current) return;
    /* where it came from: that slot stays open while the widget hovers the
       other zone, so neither the row's width nor the menu's height shifts
       under the hand mid-drag */
    const origin = tuckedWidgets.includes(id)
      ? { zone: "menu", index: tuckedWidgets.indexOf(id) }
      : { zone: "row", index: Math.max(0, visibleWidgets.indexOf(id)) };
    const ghostAt = (event) => ({ id, x: event.clientX, y: event.clientY, origin });
    const onMove = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (event.buttons === 0) {
        endDrag();
        return;
      }
      /* through the ref: the latest render's slots and visible list */
      drag.last = { x: event.clientX, y: event.clientY };
      drag.target = computeTargetRef.current(id, event.clientX, event.clientY);
      setDragGhost(ghostAt(event));
      setDropTarget(drag.target);
      /* the menu is open exactly while the hand is over it or over the "…":
         dragging in opens it, dragging out (a menu row leaving, or a row
         widget carried away again) closes it */
      const wantOpen = drag.target.zone === "menu";
      if (wantOpen !== moreOpenRef.current) {
        moreOpenRef.current = wantOpen;
        handleMoreOpenChangeRef.current(wantOpen);
      }
    };
    const onUp = () => endDrag();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("blur", onUp);
    /* lifted at once: the ghost sits under the pointer and the gap opens
       exactly where the widget was, so nothing shifts until it moves */
    const initialTarget = computeTarget(id, startX, startY);
    dragRef.current = {
      id,
      origin,
      moved: true,
      last: { x: startX, y: startY },
      target: initialTarget,
      detach: () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        window.removeEventListener("blur", onUp);
      },
    };
    holdDragCursor();
    setDragGhost(ghostAt({ clientX: startX, clientY: startY }));
    setDropTarget(initialTarget);
  };
  const beginDrag = (id, e) => {
    if (dragRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    beginDragAt(id, e.clientX, e.clientY);
  };
  /* A long press enters arrange mode WITH the pressed widget already in
     hand: the slots exist only after that render, so the drag is started in
     an effect once they do, and the pointer that is still down carries on. */
  const pendingDragRef = useRef(null);
  const beginDragAtRef = useRef(beginDragAt);
  beginDragAtRef.current = beginDragAt;
  useEffect(() => {
    if (!arranging) return;
    const pending = pendingDragRef.current;
    if (!pending) return;
    pendingDragRef.current = null;
    beginDragAtRef.current(pending.id, pending.clientX, pending.clientY);
  }, [arranging]);
  const endDragRef = useRef(endDrag);
  endDragRef.current = endDrag;
  const releaseDragCursorRef = useRef(releaseDragCursor);
  releaseDragCursorRef.current = releaseDragCursor;
  useEffect(
    () => () => {
      if (dragRef.current) dragRef.current.detach();
      releaseDragCursorRef.current();
    },
    [],
  );
  /* Entering from the keyboard keeps the highlighted widget highlighted;
     entering with the mouse (Arrange…, right-click, long press) highlights
     nothing — a hover wash on the first icon read as "selected". The first
     arrow key then lands on the first slot. */
  const startArranging = () => {
    const { kbIndex: idx, kbControls: controls } = kbStateRef.current;
    const highlighted = idx >= 0 ? controls[idx] : null;
    const keep =
      highlighted && MOVABLE_ATTACH_WIDGET_SET.has(highlighted) ? highlighted : null;
    kbActiveWidgetRef.current = keep;
    arrangingRef.current = true;
    setArranging(true);
    setKbIndex(keep ? 0 : -1);
  };
  const startArrangingRef = useRef(startArranging);
  startArrangingRef.current = startArranging;
  const LONG_PRESS_MS = 500;
  const longPressTimerRef = useRef(null);
  const longPressFiredRef = useRef(false);
  const disarmLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  const armLongPress = (id, clientX, clientY) => {
    disarmLongPress();
    longPressFiredRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      longPressFiredRef.current = true;
      /* the pressed widget goes straight into the hand */
      pendingDragRef.current = { id, clientX, clientY };
      startArrangingRef.current();
    }, LONG_PRESS_MS);
  };
  useEffect(() => () => disarmLongPress(), []);
  const finishArranging = useCallback(() => {
    if (dragRef.current) endDragRef.current();
    arrangingRef.current = false;
    setArranging(false);
    setMoreOpen(false);
    setOpenSelector((current) => (current === "more" ? null : current));
    setKbIndex(-1);
    onRequestInputFocus();
  }, [onRequestInputFocus]);
  /* a click anywhere outside the row ends the session */
  useEffect(() => {
    if (!arranging) return undefined;
    const onDocDown = (event) => {
      const rowEl = rowRef.current;
      if (rowEl && rowEl.contains(event.target)) return;
      const menuEl = menuRef.current;
      if (menuEl && menuEl.contains(event.target)) return;
      finishArranging();
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [arranging, finishArranging]);
  const rowRef = useRef(null);

  /* keyboard moves while arranging: Shift+←/→ move the highlighted widget one
     slot; Enter tucks a row widget or restores a tray one (at the end). */
  const kbMoveArranging = (id, delta) => {
    const current = layoutRef.current;
    if (current.hidden.includes(id)) return;
    const shown = current.order.filter(
      (item) => widgetAvailable[item] && !current.hidden.includes(item),
    );
    const at = shown.indexOf(id);
    if (at < 0) return;
    const to = at + delta;
    if (to < 0 || to >= shown.length) return;
    /* placeInRow indexes the row WITHOUT this widget, where the neighbour
       we hop over sits at `to` in either direction */
    persist(placeInRow(current, id, to));
  };
  const kbToggleArranging = (id) => {
    const current = layoutRef.current;
    if (current.hidden.includes(id)) {
      const restored = setAttachWidgetHidden(current, id, false);
      persist(placeInRow(restored, id, rowListOf(restored, id).length));
    } else {
      const tucked = setAttachWidgetHidden(current, id, true);
      persist(placeInMenu(tucked, id, menuListOf(tucked, id).length));
    }
  };

  /* ordered, availability-filtered control list for keyboard navigation:
     the pill, the visible widgets in the user's order, the "…" button when
     anything is tucked away, then the queue. */
  const kbControls = [];
  if (arranging) {
    visibleWidgets.forEach((id) => kbControls.push(id));
    tuckedWidgets.forEach((id) => kbControls.push(id));
  } else {
    if (showModelSelector && modelSelectOptions.length > 0)
      kbControls.push("model");
    visibleWidgets.forEach((id) => kbControls.push(id));
    if (hasMore) kbControls.push("more");
    if (queueItems.length > 0) kbControls.push("queue");
  }

  const kbStateRef = useRef({});
  kbStateRef.current = {
    kbIndex,
    kbQueueOpen,
    kbControls,
    moreOpen,
    moreIndex,
    tuckedWidgets,
    arranging,
  };

  useEffect(() => {
    onKeyboardActiveChange(kbIndex >= 0 || arranging);
  }, [kbIndex, arranging, onKeyboardActiveChange]);

  /* While a dropdown is open, FREEZE the panel's floating state as it was
     at open time: a floating panel must not retract when the dropdown's
     search input steals focus, and a resting panel must not pop out from
     a mouse click. (Keyboard opens always start floated — input focused.) */
  const floating = active || focused;
  const selectorWasOpenRef = useRef(false);
  const holdFloatRef = useRef(false);
  useEffect(() => {
    const isOpen = openSelector != null;
    if (isOpen && !selectorWasOpenRef.current) {
      holdFloatRef.current = floating;
    }
    if (!isOpen) holdFloatRef.current = false;
    selectorWasOpenRef.current = isOpen;
    onSelectorOpenChange(isOpen && holdFloatRef.current);
  }, [openSelector, floating, onSelectorOpenChange]);

  /* keep index valid when controls disappear (e.g. queued turns all undone) */
  useEffect(() => {
    if (kbIndex >= kbControls.length) {
      setKbIndex(kbControls.length ? kbControls.length - 1 : -1);
    }
    if (kbQueueOpen && !kbControls.includes("queue")) setKbQueueOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbControls.length]);

  const exitKeyboard = useCallback(() => {
    setKbIndex(-1);
    setKbQueueOpen(false);
  }, []);

  const kbActivate = (id) => {
    kbReturnIndexRef.current = kbStateRef.current.kbIndex;
    if (id === "model") {
      kbOpenedSelectorRef.current = "model";
      handleModelSelectorOpenChange(true);
    } else if (id === "tools") {
      kbOpenedSelectorRef.current = "tools";
      handleToolsOpenChange(true);
    } else if (id === "workspace") {
      kbOpenedSelectorRef.current = "workspace";
      handleWorkspaceOpenChange(true);
    } else if (id === "context_composition") {
      exitKeyboard();
      contextCompositionProgressRef.current?.open?.();
    } else if (id === "attach") {
      exitKeyboard();
      if (attachmentsEnabled && onAttachFile) onAttachFile();
    } else if (id === "screenshot") {
      exitKeyboard();
      if (attachmentsEnabled && onAttachScreenshot) onAttachScreenshot();
    } else if (id === "link") {
      exitKeyboard();
      if (onAttachLink) onAttachLink();
    } else if (id === "queue") {
      setKbQueueOpen(true);
    } else if (id === "more") {
      kbOpenedSelectorRef.current = "more";
      handleMoreOpenChange(true);
    }
  };
  const kbActivateRef = useRef(kbActivate);

  /* Invoking a widget from the "…" menu: one-shot actions fire and close the
     menu; the popover widgets open their own panel anchored to their menu
     row, so the menu stays put underneath. */
  const activateTucked = (id) => {
    if (id === "attach") {
      handleMoreOpenChange(false);
      if (attachmentsEnabled && onAttachFile) onAttachFile();
    } else if (id === "screenshot") {
      handleMoreOpenChange(false);
      if (attachmentsEnabled && onAttachScreenshot) onAttachScreenshot();
    } else if (id === "link") {
      handleMoreOpenChange(false);
      if (onAttachLink) onAttachLink();
    } else if (id === "tools") {
      handleToolsOpenChange(true);
    } else if (id === "workspace") {
      handleWorkspaceOpenChange(true);
    } else if (id === "context_composition") {
      setOpenSelector("context_composition");
    }
  };
  const activateTuckedRef = useRef(activateTucked);
  activateTuckedRef.current = activateTucked;
  kbActivateRef.current = kbActivate;

  useImperativeHandle(
    ref,
    () => ({
      /* returns true when keyboard mode engaged (controls exist) */
      enterKeyboard: () => {
        const { kbControls: controls } = kbStateRef.current;
        if (!controls.length) return false;
        setKbIndex(0);
        return true;
      },
      exitKeyboard,
      /* returns "handled" (host must preventDefault) or "pass" (key falls
         through to the input; keyboard mode already exited) */
      handleKeyboardKey: (key, modifiers = {}) => {
        const {
          kbIndex: idx,
          kbQueueOpen: queueOpen,
          kbControls: controls,
          arranging: isArranging,
        } = kbStateRef.current;
        if (isArranging) {
          const current = controls[idx] ?? null;
          if (key === "Escape") {
            finishArranging();
            return "handled";
          }
          if (key === "ArrowLeft" || key === "ArrowRight") {
            const delta = key === "ArrowRight" ? 1 : -1;
            if (modifiers.shift && current) {
              kbMoveArrangingRef.current(current, delta);
              return "handled";
            }
            if (controls.length > 0) {
              const next =
                idx < 0
                  ? delta > 0
                    ? 0
                    : controls.length - 1
                  : (idx + delta + controls.length) % controls.length;
              kbActiveWidgetRef.current = controls[next];
              setKbIndex(next);
              /* the highlight moving onto a tucked widget shows the menu */
              if (
                tuckedWidgetsRef.current.includes(controls[next]) &&
                !kbStateRef.current.moreOpen
              ) {
                setMoreOpen(true);
                setOpenSelector("more");
              }
            }
            return "handled";
          }
          if ((key === "Enter" || key === " ") && current) {
            kbToggleArrangingRef.current(current);
            return "handled";
          }
          /* every other key stays inside the session and does nothing */
          return "handled";
        }
        if (idx < 0) return "pass";
        const { moreOpen, moreIndex: menuIdx, tuckedWidgets: tucked } =
          kbStateRef.current;
        if (moreOpen) {
          if (key === "Escape") {
            handleMoreOpenChange(false);
            return "handled";
          }
          if (key === "ArrowUp" || key === "ArrowDown") {
            const delta = key === "ArrowDown" ? 1 : -1;
            const count = Math.max(1, tucked.length);
            setMoreIndex((prev) => (prev + delta + count) % count);
            return "handled";
          }
          if (key === "Enter" && modifiers.shift) {
            /* Shift+Enter on a menu row: arrange, with that row highlighted */
            kbActiveWidgetRef.current = tucked[menuIdx] ?? null;
            startArrangingRef.current();
            return "handled";
          }
          if (key === "Enter" || key === " ") {
            if (menuIdx < tucked.length) {
              activateTuckedRef.current(tucked[menuIdx]);
            }
            return "handled";
          }
          if (key === "ArrowLeft" || key === "ArrowRight") return "handled";
          handleMoreOpenChange(false);
          exitKeyboard();
          return "pass";
        }
        if (queueOpen) {
          if (key === "Escape") {
            setKbQueueOpen(false);
            return "handled";
          }
          if (
            ["ArrowUp", "ArrowDown", "Enter", "Delete", "Backspace"].includes(
              key,
            )
          ) {
            /* the queue panel's own document listener performs the action */
            return "handled";
          }
          if (key === "ArrowLeft" || key === "ArrowRight") return "handled";
          exitKeyboard();
          return "pass";
        }
        if (key === "ArrowLeft" || key === "ArrowRight") {
          const delta = key === "ArrowRight" ? 1 : -1;
          setKbIndex(
            (prev) => (prev + delta + controls.length) % controls.length,
          );
          return "handled";
        }
        if (
          key === "Enter" &&
          modifiers.shift &&
          MOVABLE_ATTACH_WIDGET_SET.has(controls[idx])
        ) {
          startArrangingRef.current();
          return "handled";
        }
        if (key === "Enter" || key === " " || key === "ArrowUp") {
          kbActivateRef.current(controls[idx]);
          return "handled";
        }
        if (key === "Escape" || key === "ArrowDown") {
          exitKeyboard();
          return "handled";
        }
        exitKeyboard();
        return "pass";
      },
    }),
    [exitKeyboard, handleMoreOpenChange, finishArranging],
  );
  const kbMoveArrangingRef = useRef(kbMoveArranging);
  kbMoveArrangingRef.current = kbMoveArranging;
  const kbToggleArrangingRef = useRef(kbToggleArranging);
  kbToggleArrangingRef.current = kbToggleArranging;
  /* While arranging the highlight is pinned to a WIDGET, not a slot index,
     so it follows the widget it sits on when a move or a tuck relocates it.
     Set on navigation and on entry, read back whenever the control list
     changes. */
  const kbActiveWidgetRef = useRef(null);
  const kbActiveId = kbIndex >= 0 ? kbControls[kbIndex] : null;
  useEffect(() => {
    if (!arranging) return;
    const wanted = kbActiveWidgetRef.current;
    if (!wanted) return;
    const at = kbControls.indexOf(wanted);
    if (at >= 0 && at !== kbIndex) setKbIndex(at);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arranging, kbControls.join("|")]);
  /* Keyboard focus reads as the control's HOVER state — so it has to land on
     the same value hovering does, not merely look similar. This glow sits
     BEHIND the control, so a filled control paints its own fill back on top
     of it: `overFill` asks for the layer that still resolves to HOVER_ALPHA
     once that happens. Anything transparent (the icon buttons) takes the
     plain wash. */
  const kbGlow = (id, { overFill = false } = {}) => (
    <ScaleHighlight
      visible={kbActiveId === id}
      color={overFill ? hoverWashOverFill : hoverWash}
      borderRadius={999}
    />
  );

  let panelBg = "transparent";
  if (floating)
    panelBg = isDark
      ? "rgba(var(--pupu-surface-rgb),0.6)"
      : "rgba(var(--pupu-surface-rgb),0.72)";

  const selectBg = isDark
    ? "rgba(var(--pupu-text-rgb),0.07)"
    : "rgba(var(--pupu-text-rgb),0.05)";

  /* ── Hover / press, aligned across the whole row ──────────────────────
     One gesture must not read as three different things. Before this, the
     model pill stacked the theme's hover wash on its own fill and landed at
     ~0.145, the icon buttons landed at 0.08, and the keyboard glow was 0.10:
     hovering an icon left it DIMMER than an untouched pill beside it.
     What is fixed here is the RESULT, not the wash. Whatever a control starts
     from, hovering it lands on HOVER_ALPHA and pressing it on PRESS_ALPHA, so
     the control under the pointer is always the brightest thing in the row.
     `washOver` solves for the layer that gets a filled control there — plain
     source-over compositing, kept as arithmetic so the relationship cannot
     drift the way three hand-picked constants did. */
  const SELECT_FILL_ALPHA = isDark ? 0.07 : 0.05;
  const HOVER_ALPHA = isDark ? 0.14 : 0.1;
  const PRESS_ALPHA = isDark ? 0.2 : 0.14;
  const textWash = (alpha) =>
    `rgba(var(--pupu-text-rgb),${Math.round(alpha * 1000) / 1000})`;
  const washOver = (target, base) => textWash((target - base) / (1 - base));

  const hoverWash = textWash(HOVER_ALPHA);
  const pressWash = textWash(PRESS_ALPHA);
  const hoverWashOverFill = washOver(HOVER_ALPHA, SELECT_FILL_ALPHA);
  const pressWashOverFill = washOver(PRESS_ALPHA, SELECT_FILL_ALPHA);

  /* shared pill style (model selector) */
  const pillStyle = {
    height: PILL_HEIGHT,
    fontSize: 12,
    color,
    backgroundColor: selectBg,
    borderRadius: floating ? 999 : 16,
    outline: "none",
    padding: "0 10px",
    /* this control is filled, so its wash is solved against that fill */
    hoverBackgroundColor: hoverWashOverFill,
    activeBackgroundColor: pressWashOverFill,
  };

  /* icon-only buttons: every box is exactly PILL_HEIGHT square so the row's
     inner ring is a uniform 4px — hover circles (r16) + 4px inset = 20, the
     row's rendered corner radius (22 clamped at 40px height). Concentric. */
  const iconBtnStyle = {
    color,
    fontSize: 14,
    iconSize: 16,
    iconOnlyPaddingVertical: (PILL_HEIGHT - 16) / 2,
    iconOnlyPaddingHorizontal: (PILL_HEIGHT - 16) / 2,
    borderRadius: floating ? 999 : 16,
    /* these start transparent, so the wash IS the result. Overriding the
       global button token here is deliberate: the row has to converge, and
       0.08 over this panel is below the pill's resting fill. */
    hoverBackgroundColor: hoverWash,
    activeBackgroundColor: pressWash,
  };

  /* badge overlay for icon buttons */
  const Badge = ({ count }) =>
    count > 0 ? (
      <span
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          minWidth: 13,
          height: 13,
          borderRadius: 999,
          background: highlight,
          color: "#fff",
          fontSize: 8,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 2px",
          pointerEvents: "none",
          boxSizing: "border-box",
        }}
      >
        {count}
      </span>
    ) : null;

  /* stop-propagation wrapper for selects */
  /* Only the model pill goes through here, and it is the one FILLED control in
     the row — its glow has to be solved against that fill. */
  /* ── one renderer per movable widget, for the row and for the "…" menu ──
     The row form is the 32px control as it always was; the menu form is a
     full-width row (icon · label · badge) that invokes the same thing. The
     two popover widgets (tools, workspace) render their Select in BOTH forms
     with the form as the trigger, so their palette anchors to wherever the
     user opened it from; their open state is the shared openSelector either
     way. */
  /* The menu is the palette surface (radius 22, padding 8), so a row is a
     28px pill (radius 14 = 22 - 8, concentric with the menu's corner) and
     the icon sits in a 28px circle flush with the pill's left cap — the
     circle, the pill's cap and the menu's corner share one centre. */
  const MENU_ROW = 28;
  const menuRowStyle = (active, index = -1) => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: MENU_ROW,
    width: "100%",
    boxSizing: "border-box",
    padding: "0 12px 0 0",
    borderRadius: MENU_ROW / 2,
    ...(index >= 0 && !prefersReducedMotion
      ? {
          animationName: MENU_IN_NAME,
          animationDuration: "200ms",
          animationTimingFunction: "cubic-bezier(0.22,1,0.36,1)",
          animationDelay: `${60 + index * 30}ms`,
          animationFillMode: "both",
        }
      : {}),
    fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
    fontSize: 12.5,
    whiteSpace: "nowrap",
    cursor: "pointer",
    color: active ? "var(--pupu-text-strong)" : "var(--pupu-text-secondary)",
    backgroundColor: active ? hoverWash : "transparent",
    userSelect: "none",
  });
  const iconCircleStyle = {
    width: MENU_ROW,
    height: MENU_ROW,
    borderRadius: 999,
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    boxSizing: "border-box",
    backgroundColor: "rgba(var(--pupu-text-rgb),0.06)",
  };
  const menuIcon = (src, tinted) => (
    <span data-icon-circle="" style={iconCircleStyle}>
      <Icon src={src} color={tinted ? highlight : undefined} style={{ width: 15, height: 15 }} />
    </span>
  );
  const menuCount = (count) =>
    count > 0 ? (
      <span
        style={{
          marginLeft: "auto",
          minWidth: 13,
          height: 13,
          borderRadius: 999,
          background: highlight,
          color: "#fff",
          fontSize: 8,
          fontWeight: 700,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 3px",
          boxSizing: "border-box",
        }}
      >
        {count}
      </span>
    ) : null;
  /* a long press on a menu row is the way into arrange mode from the
     menu, with that row already in hand (the row's own click, and the
     Select it may be the trigger of, must not fire off the release) */
  const menuRowPressProps = (id) => ({
    onPointerDown: (e) => {
      if (e.button != null && e.button !== 0) return;
      armLongPress(id, e.clientX, e.clientY);
    },
    onPointerUp: disarmLongPress,
    onPointerLeave: disarmLongPress,
    onPointerCancel: disarmLongPress,
    onClickCapture: (e) => {
      if (longPressFiredRef.current) {
        longPressFiredRef.current = false;
        e.stopPropagation();
        e.preventDefault();
      }
    },
  });
  const menuRow = (
    id,
    index,
    { icon, label, count = 0, tinted = false, onAct, inert = false },
  ) => (
    <div
      /* inert (arrange mode): the row is a picture inside a draggable slot
         that carries the identity — no data-widget, no role, no click */
      {...(inert ? {} : { "data-widget": id, role: "menuitem", tabIndex: -1 })}
      {...(inert ? {} : menuRowPressProps(id))}
      onMouseEnter={inert ? undefined : () => setMoreIndex(index)}
      /* no stopPropagation: for tools and workspace this row IS the Select's
         custom trigger, and the click has to reach the Select to open it */
      onClick={!inert && onAct ? () => onAct() : undefined}
      style={{
        ...menuRowStyle(!inert && moreIndex === index, inert ? -1 : index),
        ...(inert ? { flex: 1, minWidth: 0, cursor: "inherit" } : {}),
      }}
    >
      {menuIcon(icon, tinted)}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {menuCount(count)}
    </div>
  );

  /* in the menu the Select's trigger wrapper has to stretch, or the plugin
     and workspace rows come out narrower than their neighbours */
  const MENU_TRIGGER_WRAP = { width: "100%", display: "flex" };
  const toolsSelect = (trigger, extra = {}) => (
                <Select
                  {...extra}
                  multi
                  options={toolkitOptions}
                  value={localToolkits}
                  set_value={handleToolkitsValueChange}
                  filterable={true}
                  filter_mode="panel"
                  search_placeholder={t("toolkit.search_placeholder")}
                  disabled={toolSelectDisabled}
                  open={openSelector === "tools"}
                  on_open_change={handleToolsOpenChange}
                  dropdown_position="top"
                  variant="palette"
                  palette_chip={
                    localToolkits.length > 0
                      ? `${t("chat.attach.tools")} ×${localToolkits.length}`
                      : t("chat.attach.tools")
                  }
                  palette_actions={
                    localToolkits.length > 0 ? (
                      <HeaderAction
                        onAct={() => handleToolkitsValueChange([])}
                        isDark={isDark}
                        theme={theme}
                      >
                        {t("chat.attach.clear")}
                      </HeaderAction>
                    ) : null
                  }
                  dropdown_style={{ maxHeight: 280 }}
                  custom_trigger={trigger}
                />
  );
  const workspaceSelect = (trigger, extra = {}) => (
                <Select
                  {...extra}
                  multi
                  options={workspaceOptions}
                  value={localWorkspaceIds}
                  set_value={handleWorkspaceIdsValueChange}
                  filterable={true}
                  filter_mode="panel"
                  search_placeholder={t("chat.attach.search_workspaces")}
                  open={openSelector === "workspace"}
                  on_open_change={handleWorkspaceOpenChange}
                  dropdown_position="top"
                  variant="palette"
                  palette_chip={
                    localWorkspaceIds.length > 0
                      ? `${t("chat.attach.workspace")} ×${localWorkspaceIds.length}`
                      : t("chat.attach.workspace")
                  }
                  palette_actions={
                    <>
                      <HeaderAction
                        accent
                        onAct={() => {
                          setOpenSelector(null);
                          setWorkspaceModalOpen(true);
                        }}
                        isDark={isDark}
                        theme={theme}
                      >
                        {t("chat.attach.add")}
                      </HeaderAction>
                      {localWorkspaceIds.length > 0 ? (
                        <HeaderAction
                          onAct={() => handleWorkspaceIdsValueChange([])}
                          isDark={isDark}
                          theme={theme}
                        >
                          {t("chat.attach.clear")}
                        </HeaderAction>
                      ) : null}
                    </>
                  }
                  dropdown_style={{ maxHeight: 260 }}
                  custom_trigger={trigger}
                />
  );
  const toolsRowTrigger = (
    <div style={{ position: "relative" }}>
                      <Button
                        prefix_icon="tool"
                        ariaLabel={t("chat.attach.select_toolkits")}
                        title={t("chat.attach.select_toolkits")}
                        style={{
                          ...iconBtnStyle,
                          color:
                            localToolkits.length > 0
                              ? highlight
                              : color,
                          iconSize: TOOL_SELECTOR_TRIGGER_ICON_SIZE,
                          iconOnlyPaddingVertical:
                            (PILL_HEIGHT - TOOL_SELECTOR_TRIGGER_ICON_SIZE) / 2,
                          iconOnlyPaddingHorizontal:
                            (PILL_HEIGHT - TOOL_SELECTOR_TRIGGER_ICON_SIZE) / 2,
                        }}
                      />
                      <Badge count={localToolkits.length} />
                    </div>
  );
  const workspaceRowTrigger = (
    <div style={{ position: "relative" }}>
                      <Button
                        prefix_icon="folder_2"
                        title={t("chat.attach.select_workspaces")}
                        style={{
                          ...iconBtnStyle,
                          color:
                            localWorkspaceIds.length > 0
                              ? highlight
                              : color,
                        }}
                      />
                      <Badge count={localWorkspaceIds.length} />
                    </div>
  );

  const renderRowWidget = (id) => {
    switch (id) {
      case "context_composition":
        return (
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              borderRadius: 999,
            }}
          >
            {kbGlow("context_composition")}
            <ContextCompositionProgress
              ref={contextCompositionProgressRef}
              bundle={contextCompositionBundle}
              usageView={contextUsageView}
              isDark={isDark}
              highlight={highlight}
              hoverBackgroundColor={hoverWash}
              activeBackgroundColor={pressWash}
              // Shares openSelector with the model/tools/workspace menus so
              // opening one of the other three closes this, and vice versa —
              // without this it was its own, uncoordinated open/closed island.
              open={openSelector === "context_composition"}
              onOpenChange={handleContextCompositionOpenChange}
            />
          </div>
        );
      case "attach":
        return (
            <div
              title={t("chat.attach.attach_file")}
              style={{
                position: "relative",
                display: "flex",
                borderRadius: 999,
              }}
            >
              {kbGlow("attach")}
              <Button
                prefix_icon="attachment"
                onClick={onAttachFile}
                style={iconBtnStyle}
              />
            </div>
        );
      case "screenshot":
        return (
              <div
                title={t("chat.attach.screenshot")}
                style={{
                  position: "relative",
                  display: "flex",
                  borderRadius: 999,
                }}
              >
                {kbGlow("screenshot")}
                <Button
                  prefix_icon="screenshot"
                  onClick={onAttachScreenshot}
                  style={iconBtnStyle}
                />
              </div>
        );
      case "tools":
        return (
          <div style={{ position: "relative", display: "flex", borderRadius: 999 }}>
            {kbGlow("tools")}
            {toolsSelect(toolsRowTrigger)}
          </div>
        );
      case "workspace":
        return (
          <div style={{ position: "relative", display: "flex", borderRadius: 999 }}>
            {kbGlow("workspace")}
            {workspaceSelect(workspaceRowTrigger)}
          </div>
        );
      case "link":
        return (
          <span
            style={{ position: "relative", display: "flex", borderRadius: 999 }}
          >
            {kbGlow("link")}
            <Button
              prefix_icon="link"
              onClick={onAttachLink}
              style={iconBtnStyle}
            />
          </span>
        );
      default:
        return null;
    }
  };

  const renderMenuWidget = (id, index, { inert = false } = {}) => {
    switch (id) {
      case "context_composition":
        return (
          <div
            key={id}
            {...(inert ? {} : { "data-widget": id, role: "menuitem", tabIndex: -1 })}
            {...(inert ? {} : menuRowPressProps(id))}
            onMouseEnter={inert ? undefined : () => setMoreIndex(index)}
            onClick={inert ? undefined : (e) => {
              e.stopPropagation();
              /* the ring is its own trigger; a click on the label reaches it
                 through the shared open state instead of toggling twice */
              if (
                e.target.closest &&
                e.target.closest('[data-testid="context-composition-progress"]')
              ) {
                return;
              }
              setOpenSelector("context_composition");
            }}
            style={{
              ...menuRowStyle(!inert && moreIndex === index, inert ? -1 : index),
              ...(inert ? { flex: 1, minWidth: 0, cursor: "inherit" } : {}),
            }}
          >
            <span data-icon-circle="" style={{ ...iconCircleStyle, position: "relative" }}>
              {/* the ring is a fixed 32px control: parked at -2,-2 and scaled
                  by 28/32 about its own centre, so it lands dead centre in
                  the 28px circle (grid centring left it 2px off) */}
              <span
                style={{
                  position: "absolute",
                  left: (MENU_ROW - PILL_HEIGHT) / 2,
                  top: (MENU_ROW - PILL_HEIGHT) / 2,
                  width: PILL_HEIGHT,
                  height: PILL_HEIGHT,
                  display: "flex",
                  transform: `scale(${MENU_ROW / PILL_HEIGHT})`,
                  transformOrigin: "50% 50%",
                }}
              >
                <ContextCompositionProgress
                  ref={contextCompositionProgressRef}
                  bundle={contextCompositionBundle}
                  usageView={contextUsageView}
                  isDark={isDark}
                  highlight={highlight}
                  hoverBackgroundColor={hoverWash}
                  activeBackgroundColor={pressWash}
                  open={openSelector === "context_composition"}
                  onOpenChange={handleContextCompositionOpenChange}
                />
              </span>
            </span>
            <span>{t("chat.attach.context_usage")}</span>
          </div>
        );
      case "attach":
        return menuRow(id, index, {
          icon: "attachment",
          label: t("chat.attach.attach_file"),
          onAct: () => activateTucked("attach"),
          inert,
        });
      case "screenshot":
        return menuRow(id, index, {
          icon: "screenshot",
          label: t("chat.attach.screenshot"),
          onAct: () => activateTucked("screenshot"),
          inert,
        });
      case "link":
        return menuRow(id, index, {
          icon: "link",
          label: t("chat.attach.link"),
          onAct: () => activateTucked("link"),
          inert,
        });
      case "tools": {
        const picture = menuRow(id, index, {
          icon: "tool",
          label: t("chat.attach.select_toolkits"),
          count: localToolkits.length,
          tinted: localToolkits.length > 0,
          inert,
        });
        /* inert: the picture alone — a mounted Select would open on the
           press that is meant to lift the row */
        return inert ? picture : (
          <div key={id} style={{ display: "flex" }}>
            {toolsSelect(picture, { trigger_wrapper_style: MENU_TRIGGER_WRAP })}
          </div>
        );
      }
      case "workspace": {
        const picture = menuRow(id, index, {
          icon: "folder_2",
          label: t("chat.attach.select_workspaces"),
          count: localWorkspaceIds.length,
          tinted: localWorkspaceIds.length > 0,
          inert,
        });
        return inert ? picture : (
          <div key={id} style={{ display: "flex" }}>
            {workspaceSelect(picture, { trigger_wrapper_style: MENU_TRIGGER_WRAP })}
          </div>
        );
      }
      default:
        return null;
    }
  };

  /* ── arrange-mode pieces ── */
  const draggingId = dragGhost ? dragGhost.id : null;
  const rowItemsWhileDragging = visibleWidgets.filter((id) => id !== draggingId);
  const menuItemsWhileDragging = tuckedWidgets.filter((id) => id !== draggingId);
  const dragOrigin = dragGhost ? dragGhost.origin : null;
  const rowGapIndex = !draggingId || !dropTarget
    ? -1
    : dropTarget.zone === "row"
      ? dropTarget.index
      : dragOrigin && dragOrigin.zone === "row"
        ? dragOrigin.index
        : -1;
  const menuGapIndex = !draggingId || !dropTarget
    ? -1
    : dropTarget.zone === "menu"
      ? dropTarget.index
      : dragOrigin && dragOrigin.zone === "menu"
        ? dragOrigin.index
        : -1;
  const arrangeGap = (open, size) => (
    <span
      aria-hidden="true"
      data-arrange-gap={open ? "open" : "closed"}
      style={{
        display: "block",
        width: open ? size : 0,
        height: size,
        flexShrink: 0,
        transition: "width 0.14s ease",
      }}
    />
  );
  /* The widget in hand: portaled to the body at a fixed position so it rides
     above the menu popover (which is itself a portal at Z.TOOLTIP). */
  const ghostPortal =
    dragGhost && typeof document !== "undefined"
      ? createPortal(
          <span
            data-widget={dragGhost.id}
            data-ghost="true"
            style={{
              position: "fixed",
              left: dragGhost.x - PILL_HEIGHT / 2,
              top: dragGhost.y - PILL_HEIGHT / 2,
              width: PILL_HEIGHT,
              height: PILL_HEIGHT,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 999,
              backgroundColor: "var(--pupu-surface)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
              transform: "scale(1.08)",
              pointerEvents: "none",
              zIndex: Z.DRAG_GHOST,
              color,
            }}
          >
            <span style={{ display: "flex", pointerEvents: "none" }}>
              {renderRowWidget(dragGhost.id)}
            </span>
          </span>,
          document.body,
        )
      : null;
  /* A slot owns the pointer while arranging: the widget inside is inert
     (its own click never fires), a press on the slot lifts it into a drag,
     and every slot rocks on its own phase like an iOS home screen. */
  const arrangeSlot = (id, child, size) => {
    /* a stable per-widget phase so neighbours never rock in unison */
    const phase = MOVABLE_ATTACH_WIDGETS.indexOf(id);
    const jiggling = !prefersReducedMotion;
    return (
      <span
        data-widget={id}
        ref={(el) => {
          if (el) slotRefs.current.set(id, el);
          else slotRefs.current.delete(id);
        }}
        onPointerDown={(e) => beginDrag(id, e)}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          boxSizing: "border-box",
          borderRadius: 999,
          cursor: "grab",
          touchAction: "none",
          userSelect: "none",
          animationName: jiggling ? JIGGLE_NAME : "none",
          animationDuration: `${JIGGLE_PERIOD_MS}ms`,
          animationTimingFunction: "ease-in-out",
          animationIterationCount: "infinite",
          animationDelay: `${-((phase * 37) % JIGGLE_PERIOD_MS)}ms`,
          transformOrigin: "50% 50%",
        }}
      >
        {kbGlow(id)}
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 3,
            borderRadius: 999,
            border: "1px dashed var(--pupu-border-strong)",
            pointerEvents: "none",
          }}
        />
        <span
          style={{
            display: "flex",
            pointerEvents: "none",
            transform: size < PILL_HEIGHT ? `scale(${size / PILL_HEIGHT})` : "none",
          }}
        >
          {child}
        </span>
      </span>
    );
  };

  /* arrange-mode pieces of the menu: one gap per position (the open one
     grows to a row's height), rows that can be dragged out, and a caption
     row when the menu is empty. No heading and no outlines: the rows
     parting is the whole tell, as in the row. */
  /* the drop point is plain empty space the rows part to leave — the
     same tell as the row's gap, no outline, no wash */
  const menuGap = (open) => (
    <span
      aria-hidden="true"
      data-menu-gap={open ? "open" : "closed"}
      style={{
        display: "block",
        height: open ? MENU_ROW : 0,
        marginTop: open ? 1 : 0,
        marginBottom: open ? 1 : 0,
        transition: "height 0.14s ease, margin 0.14s ease",
      }}
    />
  );
  const arrangeMenuRow = (id, child) => {
    const phase = MOVABLE_ATTACH_WIDGETS.indexOf(id);
    return (
    <span
      key={id}
      data-widget={id}
      ref={(el) => {
        if (el) menuRowRefs.current.set(id, el);
        else menuRowRefs.current.delete(id);
      }}
      onPointerDown={(e) => beginDrag(id, e)}
      style={{
        position: "relative",
        display: "flex",
        cursor: "grab",
        touchAction: "none",
        userSelect: "none",
        animationName: prefersReducedMotion ? "none" : JIGGLE_ROW_NAME,
        animationDuration: `${JIGGLE_PERIOD_MS}ms`,
        animationTimingFunction: "ease-in-out",
        animationIterationCount: "infinite",
        animationDelay: `${-((phase * 37) % JIGGLE_PERIOD_MS)}ms`,
        transformOrigin: "50% 50%",
      }}
    >
      {kbGlow(id)}
      <span style={{ display: "flex", flex: 1, minWidth: 0, pointerEvents: "none" }}>
        {child}
      </span>
    </span>
    );
  };
  const moreMenu = (
    <div
      ref={menuRef}
      data-testid="attach-more-menu"
      data-surface="palette"
      data-arranging={arranging ? "true" : "false"}
      role="menu"
      onMouseDown={(e) => {
        if (!isTextEntryTarget(e.target)) e.preventDefault();
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        minWidth: 200,
        boxSizing: "border-box",
        /* the palette surface: same radius, padding, frost and edge as the
           model / plugins / workspace menus on this row */
        padding: 8,
        borderRadius: 22,
        backgroundColor: isDark
          ? "rgba(var(--pupu-surface-rgb),0.85)"
          : "rgba(var(--pupu-surface-rgb),0.9)",
        border: isDark
          ? "1px solid rgba(var(--pupu-text-rgb),0.10)"
          : "1px solid rgba(var(--pupu-text-rgb),0.09)",
        backdropFilter: "blur(20px) saturate(130%)",
        WebkitBackdropFilter: "blur(20px) saturate(130%)",
        boxShadow: isDark
          ? "0 8px 32px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.4)"
          : "0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)",
      }}
    >
      {arranging ? (
        <>
          {menuItemsWhileDragging.length === 0 ? (
            <div
              data-menu-gap={menuGapIndex >= 0 ? "open" : "closed"}
              style={{
                height: MENU_ROW,
                boxSizing: "border-box",
                borderRadius: MENU_ROW / 2,
                transition: "color 0.14s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: menuGapIndex >= 0 ? highlight : "var(--pupu-text-faint)",
                userSelect: "none",
              }}
            >
              {t("chat.attach.drop_here")}
            </div>
          ) : null}
          {menuItemsWhileDragging.map((id, index) => (
            <span key={id} style={{ display: "flex", flexDirection: "column" }}>
              {menuGap(menuGapIndex === index)}
              {arrangeMenuRow(id, renderMenuWidget(id, index, { inert: true }))}
            </span>
          ))}
          {menuItemsWhileDragging.length > 0
            ? menuGap(menuGapIndex === menuItemsWhileDragging.length)
            : null}
        </>
      ) : (
        <>
          {tuckedWidgets.map((id, index) => (
            <span key={id} style={{ display: "flex", flexDirection: "column" }}>
              {renderMenuWidget(id, index)}
            </span>
          ))}
        </>
      )}
    </div>
  );

  const moreTargeted =
    arranging && dragGhost != null && dropTarget && dropTarget.zone === "menu";
  const moreButton = (
    <span
      ref={moreWrapRef}
      style={{ position: "relative", display: "flex", borderRadius: 999 }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        if (!isTextEntryTarget(e.target)) e.preventDefault();
        e.stopPropagation();
      }}
    >
      {kbGlow("more")}
      <Tooltip
        trigger={["click"]}
        position="top"
        align="end"
        offset={8}
        show_arrow={false}
        tooltip_component={moreMenu}
        open={moreOpen}
        on_open_change={handleMoreOpenChange}
        /* arranging marks the composer active and the whole row floats up
           under the open menu; the menu has to ride along or it ends up
           under the very row it belongs to */
        follow_trigger={arranging}
        style={{
          padding: 0,
          backgroundColor: "transparent",
          boxShadow: "none",
          border: "none",
        }}
      >
        <Button
          prefix_icon="more"
          ariaLabel={t("chat.attach.more")}
          title={t("chat.attach.more")}
          onClick={() => {}}
          dom_props={{
            "data-testid": "attach-more",
            "aria-haspopup": "menu",
            "aria-expanded": moreOpen,
          }}
          style={{
            ...iconBtnStyle,
            ...(moreTargeted
              ? { color: highlight, backgroundColor: hoverWash }
              : {}),
          }}
        />
      </Tooltip>
    </span>
  );

  const selectWrap = (children, glowId, inert = false) => (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        if (!isTextEntryTarget(e.target)) e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        borderRadius: 999,
        ...(inert ? { opacity: 0.55, pointerEvents: "none" } : {}),
      }}
    >
      {glowId ? kbGlow(glowId, { overFill: true }) : null}
      {children}
    </div>
  );

  return (
    <div
      onPointerDownCapture={(e) => {
        // A selector dismisses on document mousedown, before the next
        // control receives click. Restore focus on the earlier pointerdown
        // (document capture can flush before React's mousedown capture) so its
        // empty panel cannot retract and move that control before mouseup.
        // Portals bubble through React too: only the actual panel row owns
        // this focus transfer, never a dropdown's search or content.
        if (
          floating &&
          e.button === 0 &&
          e.currentTarget.contains(e.target) &&
          !isTextEntryTarget(e.target)
        ) {
          onRequestInputFocus();
        }
      }}
      onMouseDown={(e) => {
        if (isTextEntryTarget(e.target)) return;
        e.preventDefault();
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 4,
      }}
    >
      <AttachmentChipList
        attachments={attachments}
        color={color}
        isDark={isDark}
        onRemoveAttachment={onRemoveAttachment}
        isStreaming={isStreaming}
      />

      <div
        ref={rowRef}
        data-testid="attach-row"
        data-kb-active={kbActiveId || ""}
        data-arranging={arranging ? "true" : "false"}
        data-drop-target={
          dropTarget ? `${dropTarget.zone}:${dropTarget.index}` : ""
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: 4,
          borderRadius: 22,
          backgroundColor: panelBg,
          /* constant 1px keeps geometry stable across the floating toggle */
          border: floating
            ? "1px solid var(--pupu-border-mid)"
            : "1px solid transparent",
          ...(floating
            ? {
                backdropFilter: "blur(20px) saturate(130%)",
                WebkitBackdropFilter: "blur(20px) saturate(130%)",
              }
            : {}),
          boxShadow: floating ? focusShadow : "none",
          transition:
            "background-color 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease",
        }}
      >
        {/* ── Model selector (not movable: dimmed and inert while arranging) ── */}
        {showModelSelector &&
          modelSelectOptions &&
          modelSelectOptions.length > 0 &&
          selectWrap(
            <Select
              options={modelSelectOptions}
              value={modelSelectValue}
              set_value={handleSelectValueChange}
              placeholder={t("chat.attach.select_model")}
              filterable={true}
              filter_mode="panel"
              search_placeholder={t("model_providers.search_models")}
              disabled={modelSelectDisabled}
              show_trigger_icon={true}
              on_group_toggle={onGroupToggle}
              open={openSelector === "model"}
              on_open_change={handleModelSelectorOpenChange}
              dropdown_position="top"
              style={{ ...pillStyle, maxWidth: 180 }}
              variant="palette"
              palette_chip="model"
              palette_rail
              /* Picking a model never closes the palette: the effort row
                 below is the natural next choice, and switching between
                 models to compare them is a normal thing to do. The trigger
                 and an outside click remain the ways out. */
              keep_open_on_select
              /* null, not an element that renders null: the footer slot draws
                 its own separator and padding, so an always-present child
                 would leave a rule and a band of empty height under every
                 model that has no effort at all. */
              palette_footer={paletteFooter}
            />,
            "model",
            arranging,
          )}

        {/* ── Movable widgets, in the user's order, then the "…" menu ── */}
        {arranging ? (
          <div
            data-testid="attach-widgets"
            style={{ display: "flex", alignItems: "center", gap: 0 }}
          >
            {/* While a widget is dragged it leaves the flow (it rides the
                pointer as a ghost, portaled to the body so it sits above the
                menu popover) and the icons part to leave an empty slot at
                the drop point — the way an iOS home screen makes room —
                rather than marking the point with a line. One gap element
                sits in every position so the open one can grow and the
                closing one shrink as the pointer moves. */}
            <div data-arrange="row" style={{ display: "flex", alignItems: "center", gap: 0 }}>
              {rowItemsWhileDragging.map((id, index) => (
                <span key={id} style={{ display: "flex", alignItems: "center" }}>
                  {arrangeGap(rowGapIndex === index, 32)}
                  {arrangeSlot(id, renderRowWidget(id), 32)}
                </span>
              ))}
              {arrangeGap(rowGapIndex === rowItemsWhileDragging.length, 32)}
            </div>
            {/* the "…" stays where it is: its menu, open for the session, is
                the place tucked widgets go */}
            {moreButton}
            <span style={{ marginLeft: 6, display: "flex" }}>
              <Button
                onClick={finishArranging}
                dom_props={{ "data-testid": "attach-arrange-done" }}
                /* full PILL_HEIGHT like every other control on the row, so
                   its curve is concentric with the row's (radius 22 - 4px
                   padding = 16 = half of 32); a shorter pill sat inset. */
                style={{
                  ...pillStyle,
                  fontSize: 11,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {t("chat.attach.done")}
              </Button>
            </span>
          </div>
        ) : visibleWidgets.length > 0 || hasMore ? (
          <div
            data-testid="attach-widgets"
            style={{ display: "flex", alignItems: "center", gap: 0 }}
          >
            {visibleWidgets.map((id) => (
              <span
                key={id}
                data-widget={id}
                /* the ways into arrange mode when nothing is tucked yet (so
                   there is no "…" menu): a right-click, or a long press */
                onContextMenu={(e) => {
                  e.preventDefault();
                  startArranging();
                }}
                onPointerDown={(e) => {
                  if (e.button != null && e.button !== 0) return;
                  armLongPress(id, e.clientX, e.clientY);
                }}
                onPointerUp={disarmLongPress}
                onPointerLeave={disarmLongPress}
                onPointerCancel={disarmLongPress}
                onClickCapture={(e) => {
                  /* the press that opened arrange mode is not a click */
                  if (longPressFiredRef.current) {
                    longPressFiredRef.current = false;
                    e.stopPropagation();
                    e.preventDefault();
                  }
                }}
                style={{ display: "flex", alignItems: "center" }}
              >
                {renderRowWidget(id)}
              </span>
            ))}
            {hasMore ? moreButton : null}
          </div>
        ) : null}

        {/* ── Queue segment — the queued turns' one and only home ── */}
        {queueItems.length > 0 && !arranging ? (
          <QueueAttachSection
            items={queueItems}
            onUndo={onQueueUndo}
            isDark={isDark}
            forceOpen={kbQueueOpen}
            onForceOpenChange={setKbQueueOpen}
            highlightRing={kbActiveId === "queue"}
          />
        ) : null}
      </div>

      <WorkspaceModal
        open={workspaceModalOpen}
        onClose={() => setWorkspaceModalOpen(false)}
      />
      {ghostPortal}
    </div>
  );
});

AttachPanel.displayName = "AttachPanel";

export default AttachPanel;
