import { memo, useContext, useEffect, useRef, useState, useCallback } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { FloatingTextField } from "../../BUILTIN_COMPONENTs/input/textfield";
import AttachPanel from "./components/attach_panel";
import CommandPalettePanel from "./components/command_palette_panel";
import InputActionButtons from "./components/input_action_buttons";
import { useChatInputModels } from "./hooks/use_chat_input_models";
import { useFileDropOverlay } from "./hooks/use_file_drop_overlay";
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
import {
  extractCommands,
  findCommandTokens,
  listCommands,
} from "../../SERVICEs/command_registry";

/**
 * Detect an in-progress slash token at the caret: a "/" at the input start or
 * after whitespace, with no whitespace between it and the caret. Returns
 * { start, query } (query includes the leading "/") or null. This is what
 * opens the command menu — anywhere in the text, not just at the start.
 */
export const detectSlashTrigger = (text, caret) => {
  if (typeof text !== "string") return null;
  const at = Number.isFinite(caret) ? caret : text.length;
  const idx = text.lastIndexOf("/", at - 1);
  if (idx === -1) return null;
  if (idx > 0 && !/\s/.test(text[idx - 1])) return null;
  const between = text.slice(idx + 1, at);
  if (/\s/.test(between)) return null;
  return { start: idx, query: text.slice(idx, at) };
};

const ChatInput = ({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming = false,
  sendDisabled = false,
  placeholder: placeholderProp,
  disclaimer,
  showAttachments = true,
  onAttachFile,
  onAttachLink,
  onAttachScreenshot,
  modelCatalog,
  selectedModelId,
  onSelectModel,
  modelSelectDisabled = false,
  showModelSelector = true,
  attachments = [],
  onRemoveAttachment,
  attachmentsEnabled = true,
  attachmentsDisabledReason = "",
  onDropFiles = null,
  showToolSelector = true,
  selectedToolkits = [],
  onToolkitsChange,
  showWorkspaceSelector = true,
  selectedWorkspaceIds = [],
  onWorkspaceIdsChange,
  selectedRecipeName = "Default",
  onSelectRecipe,
  recipeOptions = [],
  interjectState,
  onQueueUndo,
}) => {
  const { t } = useTranslation();
  const placeholder = placeholderProp || t("chat.placeholder");
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const attachPanelRef = useRef(null);
  const [panelKbActive, setPanelKbActive] = useState(false);
  const [panelSelectorOpen, setPanelSelectorOpen] = useState(false);

  const { modelOptions, handleGroupToggle } = useChatInputModels({
    model_catalog: modelCatalog,
    selected_model_id: selectedModelId,
  });

  const { isDragging, handleDragOver, handleDragLeave, handleDrop } =
    useFileDropOverlay({
      on_drop_files: onDropFiles,
    });

  const color = theme?.color || "#222";
  const panelFocusBg = isDark
    ? "var(--pupu-surface, rgba(30, 30, 30, 1))"
    : "var(--pupu-surface, rgba(255,255,255,1))";
  const panelFocusShadow = isDark
    ? "0 4px 24px rgba(0,0,0,0.32), 0 1px 3px rgba(0,0,0,0.16)"
    : "0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)";

  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  /* keyboard focus in the attach panel (or an open selector dropdown)
     must keep the panel floated — otherwise opening a dropdown blurs the
     input and the row would retract underneath it */
  const chatActive =
    value.length > 0 ||
    focused ||
    hasAttachments ||
    panelKbActive ||
    panelSelectorOpen;

  /* ── Slash-command autocomplete menu (seed of PuPu's main command system) ── */
  const [commandMenuActiveIndex, setCommandMenuActiveIndex] = useState(0);
  const [commandMenuDismissed, setCommandMenuDismissed] = useState(false);
  const prevValueRef = useRef(value);

  /* ── Inline command tokens (overlay-dyed; the value string is untouched) ── */
  const commandTokens = findCommandTokens(value, { isStreaming });
  const activeTokens = commandTokens.filter((t) => t.active);
  const activeCommandNames = activeTokens.map((t) => t.name);
  const { body: strippedBody } = extractCommands(value, { isStreaming });

  /* Slash trigger at the caret (anywhere in the text) */
  const [slashTrigger, setSlashTrigger] = useState(null);
  const pendingCaretRef = useRef(null);

  const handleValueChange = useCallback(
    (nextValue, event) => {
      if (!onChange) return;
      const caret =
        event?.target && Number.isFinite(event.target.selectionStart)
          ? event.target.selectionStart
          : nextValue.length;
      setSlashTrigger(detectSlashTrigger(nextValue, caret));
      onChange(nextValue);
    },
    [onChange],
  );

  // restore the caret after a pick rewrote the value
  useEffect(() => {
    if (pendingCaretRef.current == null) return;
    const caret = pendingCaretRef.current;
    pendingCaretRef.current = null;
    const el = inputRef.current;
    if (el) {
      el.focus();
      try {
        el.setSelectionRange(caret, caret);
      } catch {
        /* detached or non-text state — ignore */
      }
    }
  }, [value]);

  /* dye active tokens as pills in the FloatingTextField mirror overlay —
     zero layout impact (boxShadow halo, no padding), so wrapping matches
     the transparent textarea text exactly */
  const renderCommandOverlay = useCallback(
    (text) => {
      const tokens = findCommandTokens(text, { isStreaming });
      if (tokens.length === 0) return text;
      const pillBg = isDark ? "rgba(120,200,150,0.16)" : "rgba(40,150,80,0.13)";
      const pillColor = isDark
        ? "rgba(160,230,180,0.98)"
        : "rgba(25,125,65,0.98)";
      const parts = [];
      let cursor = 0;
      tokens.forEach((token, index) => {
        if (token.start > cursor) parts.push(text.slice(cursor, token.start));
        parts.push(
          <span
            key={`${token.name}-${index}`}
            data-command-token={token.name}
            data-active={token.active}
            style={
              token.active
                ? {
                    color: pillColor,
                    backgroundColor: pillBg,
                    borderRadius: 4,
                    boxShadow: `0 0 0 3px ${pillBg}`,
                    boxDecorationBreak: "clone",
                    WebkitBoxDecorationBreak: "clone",
                  }
                : undefined
            }
          >
            {text.slice(token.start, token.end)}
          </span>,
        );
        cursor = token.end;
      });
      parts.push(text.slice(cursor));
      return parts;
    },
    [isStreaming, isDark],
  );

  /* descriptions are i18n keys (default English; t() passes unknown raw
     strings through unchanged, so custom commands with literal text still
     render as-is) */
  const commandItems = (
    slashTrigger
      ? listCommands(
          { isStreaming, activeCommands: activeCommandNames },
          slashTrigger.query,
        )
      : []
  ).map((item) => ({ ...item, description: t(item.description) }));
  const commandMenuOpen =
    !commandMenuDismissed && !!slashTrigger && commandItems.length > 0;

  // any edit to the input value re-arms the menu (clears a prior Escape
  // dismissal) and resets the highlighted row back to the top
  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      setCommandMenuDismissed(false);
      setCommandMenuActiveIndex(0);
    }
  }, [value]);

  // drop a stale trigger when the body no longer contains the typed token at
  // that position (e.g. the value was cleared externally after a send)
  useEffect(() => {
    if (!slashTrigger) return;
    const tokenInText = value.slice(
      slashTrigger.start,
      slashTrigger.start + slashTrigger.query.length,
    );
    if (tokenInText !== slashTrigger.query) setSlashTrigger(null);
  }, [value, slashTrigger]);

  const handleCommandPick = useCallback(
    (item) => {
      if (!item) return;
      if (onChange) {
        if (slashTrigger) {
          // replace the typed "/tok" IN PLACE with the canonical command +
          // a trailing space; the token dyes inline right where it stands
          const inserted = `${item.name} `;
          const nextValue =
            value.slice(0, slashTrigger.start) +
            inserted +
            value.slice(slashTrigger.start + slashTrigger.query.length);
          pendingCaretRef.current = slashTrigger.start + inserted.length;
          onChange(nextValue);
        } else {
          onChange(item.insertText ?? `${item.name} `);
        }
      }
      setSlashTrigger(null);
      setCommandMenuDismissed(true);
      setCommandMenuActiveIndex(0);
    },
    [onChange, slashTrigger, value],
  );

  const handleKeyDown = useCallback(
    (e) => {
      /* attach panel keyboard mode: keys are delegated to the panel until
         it reports "pass" (typing resumes) */
      if (panelKbActive) {
        const res = attachPanelRef.current?.handleKeyboardKey?.(e.key);
        if (res === "handled") {
          e.preventDefault();
          return;
        }
      } else if (
        e.key === "ArrowUp" &&
        !commandMenuOpen &&
        !e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.target &&
        e.target.selectionStart === 0 &&
        e.target.selectionEnd === 0
      ) {
        /* caret already at the very start — a second ArrowUp climbs into
           the attach panel (leftmost control) */
        if (attachPanelRef.current?.enterKeyboard?.()) {
          e.preventDefault();
          return;
        }
      }

      if (commandMenuOpen) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setCommandMenuActiveIndex(
            (i) => (i + 1) % commandItems.length,
          );
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setCommandMenuActiveIndex(
            (i) => (i - 1 + commandItems.length) % commandItems.length,
          );
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          if (e.nativeEvent?.isComposing || e.isComposing) return;
          e.preventDefault();
          handleCommandPick(
            commandItems[commandMenuActiveIndex] || commandItems[0],
          );
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setCommandMenuDismissed(true);
          return;
        }
      }

      // Backspace right after an active token (or its trailing space)
      // deletes the whole token atomically, like a chip.
      if (
        e.key === "Backspace" &&
        activeTokens.length > 0 &&
        e.target &&
        e.target.selectionStart === e.target.selectionEnd
      ) {
        const caret = e.target.selectionStart;
        const hit = activeTokens.find(
          (token) =>
            caret === token.end ||
            (caret === token.end + 1 && /\s/.test(value[token.end] || "")),
        );
        if (hit) {
          e.preventDefault();
          const cutEnd = caret; // token end, or end+1 including the space
          if (onChange)
            onChange(value.slice(0, hit.start) + value.slice(cutEnd));
          pendingCaretRef.current = hit.start;
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        if (e.nativeEvent?.isComposing || e.isComposing) return;
        e.preventDefault();
        if (!sendDisabled && onSend) {
          onSend();
        }
      }
    },
    [
      onSend,
      sendDisabled,
      commandMenuOpen,
      commandItems,
      commandMenuActiveIndex,
      handleCommandPick,
      activeTokens,
      value,
      onChange,
      panelKbActive,
    ],
  );

  const handleClear = () => {
    if (onChange) {
      onChange("");
    }
  };

  return (
    <div
      style={{
        flexShrink: 0,
        padding: "0px 20px 16px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 780,
          padding: "0 20px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{ position: "relative" }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isDragging && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 28,
                cornerShape: "superellipse(1.5)",
                border: `2px dashed ${
                  isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.22)"
                }`,
                backgroundColor: isDark
                  ? "rgba(0,0,0,0.5)"
                  : "rgba(255,255,255,0.80)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 20,
                pointerEvents: "none",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.42)",
                  userSelect: "none",
                  WebkitUserSelect: "none",
                }}
              >
                Drop files to attach
              </span>
            </div>
          )}
          <FloatingTextField
            textarea_ref={inputRef}
            value={value}
            min_rows={5}
            max_display_rows={9}
            set_value={handleValueChange}
            placeholder={placeholder}
            overlay_render={renderCommandOverlay}
            on_focus={() => setFocused(true)}
            on_blur={() => {
              setFocused(false);
              setSlashTrigger(null);
              attachPanelRef.current?.exitKeyboard?.();
            }}
            on_key_down={handleKeyDown}
            content_section={
              showAttachments || commandMenuOpen ? (
                <CommandPalettePanel
                  open={commandMenuOpen}
                  query={slashTrigger?.query || "/"}
                  items={commandItems}
                  activeIndex={commandMenuActiveIndex}
                  onPick={handleCommandPick}
                  onHover={setCommandMenuActiveIndex}
                  isDark={isDark}
                >
                  {showAttachments ? (
                    <AttachPanel
                      ref={attachPanelRef}
                      onKeyboardActiveChange={setPanelKbActive}
                      onSelectorOpenChange={setPanelSelectorOpen}
                      onRequestInputFocus={() => inputRef.current?.focus()}
                      color={color}
                      active={chatActive}
                      focused={focused}
                      focusBg={panelFocusBg}
                      focusShadow={panelFocusShadow}
                      onAttachFile={onAttachFile}
                      onAttachLink={onAttachLink}
                      onAttachScreenshot={onAttachScreenshot}
                      modelOptions={modelOptions}
                      showModelSelector={showModelSelector}
                      selectedModelId={selectedModelId}
                      onSelectModel={onSelectModel}
                      onGroupToggle={handleGroupToggle}
                      modelSelectDisabled={modelSelectDisabled}
                      isDark={isDark}
                      attachmentsEnabled={attachmentsEnabled}
                      attachmentsDisabledReason={attachmentsDisabledReason}
                      attachments={attachments}
                      onRemoveAttachment={onRemoveAttachment}
                      isStreaming={isStreaming}
                      showToolSelector={showToolSelector}
                      selectedToolkits={selectedToolkits}
                      onToolkitsChange={onToolkitsChange}
                      showWorkspaceSelector={showWorkspaceSelector}
                      selectedWorkspaceIds={selectedWorkspaceIds}
                      onWorkspaceIdsChange={onWorkspaceIdsChange}
                      selectedRecipeName={selectedRecipeName}
                      onSelectRecipe={onSelectRecipe}
                      recipeOptions={recipeOptions}
                      queueItems={interjectState?.queueItems || []}
                      onQueueUndo={onQueueUndo}
                    />
                  ) : null}
                </CommandPalettePanel>
              ) : null
            }
            force_content_active={chatActive}
            functional_section={
              <InputActionButtons
                value={strippedBody}
                color={color}
                isDark={isDark}
                isStreaming={isStreaming}
                sendDisabled={sendDisabled}
                onClear={handleClear}
                onSend={onSend}
                onStop={onStop}
              />
            }
            style={{
              width: "100%",
              margin: 0,
              borderRadius: 40,
              /* Apple-style continuous corner curvature (Chromium 139+;
                 older engines ignore it and keep round corners) */
              cornerShape: "superellipse(1.5)",
              /* border: textfield's own default (theme-aware); softness
                 comes from the wider, lower-alpha shadow */
              boxShadow: isDark
                ? "0 8px 32px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.18)"
                : "0 8px 32px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)",
              boxShadowFocus: isDark
                ? "0 14px 44px rgba(0,0,0,0.4), 0 4px 12px rgba(0,0,0,0.2)"
                : "0 14px 44px rgba(0,0,0,0.08), 0 4px 10px rgba(0,0,0,0.05)",
              position: "relative",
              zIndex: 2,
              /* frosted: the themed surface at ~palette-family alpha, with
                 the same blur the palette panels use */
              backgroundColor: isDark
                ? "color-mix(in srgb, var(--pupu-surface, rgb(30, 30, 30)) 85%, transparent)"
                : "color-mix(in srgb, var(--pupu-surface, rgb(255, 255, 255)) 90%, transparent)",
              backdropFilter: "blur(20px) saturate(130%)",
            }}
          />
        </div>

        {disclaimer && (
          <div
            style={{
              textAlign: "center",
              fontSize: 11,
              fontFamily: theme?.font?.fontFamily || "inherit",
              color: theme?.color || "#222",
              opacity: onThemeMode === "dark_mode" ? 0.3 : 0.4,
              paddingTop: 8,
              userSelect: "none",
              WebkitUserSelect: "none",
            }}
          >
            {disclaimer}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(ChatInput);
