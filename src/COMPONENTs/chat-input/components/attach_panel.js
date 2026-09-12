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
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { themeHighlightColor } from "../../../CONTAINERs/config/theme_highlight";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import ScaleHighlight from "../../../BUILTIN_COMPONENTs/class/scale_highlight";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Slider from "../../../BUILTIN_COMPONENTs/input/slider";
import { Select } from "../../../BUILTIN_COMPONENTs/select/select";
import AttachmentChipList from "./attachment_chip_list";
import { QueueAttachSection } from "./queue_pile";
import { WorkspaceModal } from "../../workspace/workspace_modal";
import useChatInputToolkits from "../hooks/use_chat_input_toolkits";
import { COMPUTER_TOOLKIT_ID } from "../constants";
import useChatInputWorkspaces from "../hooks/use_chat_input_workspaces";
import { emitModelCatalogRefresh } from "../../../SERVICEs/model_catalog_refresh";
import { hasContextCompositionEvidence } from "../../../SERVICEs/context_composition_v1";
import {
  readFeatureFlags,
  subscribeFeatureFlags,
} from "../../../SERVICEs/feature_flags";
import ContextCompositionProgress from "./context_composition_progress";

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
  attachmentsDisabledReason = "",
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

  /* ordered, availability-filtered control list for keyboard navigation */
  const kbControls = [];
  if (showModelSelector && modelSelectOptions.length > 0)
    kbControls.push("model");
  if (hasContextComposition) kbControls.push("context_composition");
  if (onAttachFile) {
    kbControls.push("attach");
    if (onAttachScreenshot) kbControls.push("screenshot");
    if (showToolSelector && !hasActiveAgentRecipe) kbControls.push("tools");
    if (showWorkspaceSelector) kbControls.push("workspace");
  }
  if (onAttachLink) kbControls.push("link");
  if (queueItems.length > 0) kbControls.push("queue");

  const kbStateRef = useRef({});
  kbStateRef.current = { kbIndex, kbQueueOpen, kbControls };

  useEffect(() => {
    onKeyboardActiveChange(kbIndex >= 0);
  }, [kbIndex, onKeyboardActiveChange]);

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
    }
  };
  const kbActivateRef = useRef(kbActivate);
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
      handleKeyboardKey: (key) => {
        const {
          kbIndex: idx,
          kbQueueOpen: queueOpen,
          kbControls: controls,
        } = kbStateRef.current;
        if (idx < 0) return "pass";
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
    [exitKeyboard],
  );

  const kbActiveId = kbIndex >= 0 ? kbControls[kbIndex] : null;
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
  const selectWrap = (children, glowId) => (
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
        {/* ── Model selector ── */}
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
          )}

        {hasContextComposition ? (
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              borderRadius: 999,
              /* The row's gap of 6 separates pills from icons, but icon-to-icon
                 spacing inside the cluster below is 0. Cancel the gap here so
                 the ring sits flush against the attach controls instead of
                 reading as pushed away from them. */
              marginRight: onAttachFile ? -6 : 0,
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
        ) : null}

        {onAttachFile && (
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {/* ── Attach file button ── */}
            <div
              title={
                attachmentsEnabled
                  ? t("chat.attach.attach_file")
                  : attachmentsDisabledReason ||
                    t("chat.attach.attach_file_unsupported")
              }
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
                disabled={!attachmentsEnabled}
                style={iconBtnStyle}
              />
            </div>

            {/* ── Screenshot button ── */}
            {onAttachScreenshot && (
              <div
                title={
                  attachmentsEnabled
                    ? t("chat.attach.screenshot")
                    : attachmentsDisabledReason ||
                      t("chat.attach.screenshot_unsupported")
                }
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
                  disabled={!attachmentsEnabled}
                  style={iconBtnStyle}
                />
              </div>
            )}

            {/* ── Tools selector (icon button + badge trigger) ── */}
            {showToolSelector && !hasActiveAgentRecipe ? (
              <div style={{ position: "relative", display: "flex", borderRadius: 999 }}>
                {kbGlow("tools")}
                <Select
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
                  custom_trigger={
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
                  }
                />
              </div>
            ) : null}

            {/* ── Workspace selector (icon button + badge trigger) ── */}
            {showWorkspaceSelector ? (
              <div style={{ position: "relative", display: "flex", borderRadius: 999 }}>
                {kbGlow("workspace")}
                <Select
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
                  custom_trigger={
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
                  }
                />
              </div>
            ) : null}

          </div>
        )}

        {onAttachLink && (
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
        )}

        {/* ── Queue segment — the queued turns' one and only home ── */}
        {queueItems.length > 0 ? (
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
    </div>
  );
});

AttachPanel.displayName = "AttachPanel";

export default AttachPanel;
