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

/* ── palette header effort pills — segmented control in the model palette's
   bottom header (palette_actions slot). Levels come from the selected model's
   capability declaration; clicking the active level clears it back to the
   provider default. ── */

const EFFORT_SHORT_LABELS = {
  minimal: "min",
  low: "low",
  medium: "med",
  high: "high",
};

const EffortPillRow = ({ efforts, selected, onSelect, isDark, theme }) => {
  if (!Array.isArray(efforts) || efforts.length === 0) return null;
  return (
    <div
      style={{
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: 2,
        borderRadius: 999,
        backgroundColor: isDark
          ? "rgba(255,255,255,0.06)"
          : "rgba(0,0,0,0.05)",
      }}
    >
      {efforts.map((level) => {
        const isActive = level === selected;
        const restColor = isActive
          ? isDark
            ? "rgba(255,255,255,0.92)"
            : "rgba(0,0,0,0.85)"
          : isDark
            ? "rgba(255,255,255,0.38)"
            : "rgba(0,0,0,0.4)";
        return (
          <button
            key={level}
            type="button"
            title={level}
            onMouseDown={(e) => {
              e.preventDefault();
              if (typeof onSelect === "function") {
                onSelect(isActive ? null : level);
              }
            }}
            onMouseEnter={(e) => {
              if (isActive) return;
              e.currentTarget.style.color = isDark
                ? "rgba(255,255,255,0.7)"
                : "rgba(0,0,0,0.7)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = restColor;
            }}
            style={{
              border: "none",
              cursor: "pointer",
              borderRadius: 999,
              padding: "3px 7px",
              fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
              fontSize: 10,
              letterSpacing: "0.02em",
              backgroundColor: isActive
                ? isDark
                  ? "rgba(255,255,255,0.16)"
                  : "rgba(0,0,0,0.1)"
                : "transparent",
              color: restColor,
              transition: "background-color 0.13s ease, color 0.13s ease",
            }}
          >
            {EFFORT_SHORT_LABELS[level] || level}
          </button>
        );
      })}
    </div>
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
  onSelectReasoningEffort,
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
  /* keyboard focus reads as the control's HOVER state: a Button-style
     scale-in glow behind the control (wrapper must be position:relative) */
  const kbGlow = (id) => (
    <ScaleHighlight
      visible={kbActiveId === id}
      color={isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.06)"}
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

  /* shared pill style (model selector) */
  const pillStyle = {
    height: PILL_HEIGHT,
    fontSize: 12,
    color,
    backgroundColor: selectBg,
    borderRadius: floating ? 999 : 16,
    outline: "none",
    padding: "0 10px",
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
      {glowId ? kbGlow(glowId) : null}
      {children}
    </div>
  );

  return (
    <div
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
              palette_actions={
                <EffortPillRow
                  efforts={reasoningEffortOptions}
                  selected={selectedReasoningEffort}
                  onSelect={onSelectReasoningEffort}
                  isDark={isDark}
                  theme={theme}
                />
              }
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
