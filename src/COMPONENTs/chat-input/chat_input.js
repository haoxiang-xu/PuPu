import { memo, useContext, useEffect, useRef, useState, useCallback } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { FloatingTextField } from "../../BUILTIN_COMPONENTs/input/textfield";
import AttachPanel from "./components/attach_panel";
import CommandMenu from "./components/command_menu";
import CommandTag from "./components/command_tag";
import InputActionButtons from "./components/input_action_buttons";
import SteerPile from "./components/steer_pile";
import { useChatInputModels } from "./hooks/use_chat_input_models";
import { useFileDropOverlay } from "./hooks/use_file_drop_overlay";
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { listCommands } from "../../SERVICEs/command_registry";

// input value starts with "/" with no whitespace yet (single-token command prefix)
const isSlashCommandPrefix = (value) =>
  typeof value === "string" && value.startsWith("/") && !/\s/.test(value);

/**
 * When the value starts with a completed slash command ("/btw <body>") that is
 * available in the current context, split it so the command renders as an
 * inline tag and the textarea only shows the body. The value string stays the
 * single source of truth — the tag is just how the prefix is displayed, so the
 * send/routing path never changes.
 *
 * Returns { command, body } where command is the registry item or null.
 */
export const splitCommandPrefix = (value, ctx) => {
  if (typeof value !== "string") return { command: null, body: value ?? "" };
  const match = value.match(/^(\/[a-zA-Z0-9_-]+) /);
  if (!match) return { command: null, body: value };
  const token = match[1].toLowerCase();
  const command =
    listCommands(ctx || {}, token).find(
      (item) => item.name.toLowerCase() === token,
    ) || null;
  if (!command) return { command: null, body: value };
  return { command, body: value.slice(match[0].length) };
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
  onSteerUndo,
}) => {
  const { t } = useTranslation();
  const placeholder = placeholderProp || t("chat.placeholder");
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);

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
  const chatActive = value.length > 0 || focused || hasAttachments;

  /* ── Slash-command autocomplete menu (seed of PuPu's main command system) ── */
  const [commandMenuActiveIndex, setCommandMenuActiveIndex] = useState(0);
  const [commandMenuDismissed, setCommandMenuDismissed] = useState(false);
  const prevValueRef = useRef(value);

  /* ── Inline command tag: a completed "/cmd " prefix renders as a chip and the
     textarea only shows the body; `value` stays the source of truth ── */
  const { command: activeCommand, body: displayValue } = splitCommandPrefix(
    value,
    { isStreaming },
  );
  const commandPrefix = activeCommand ? `${activeCommand.name} ` : "";
  const tagWrapRef = useRef(null);
  const [tagIndent, setTagIndent] = useState(0);
  useEffect(() => {
    if (!activeCommand) {
      setTagIndent(0);
      return;
    }
    const el = tagWrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries)
        setTagIndent(Math.ceil(entry.contentRect.width) + 8);
    });
    ro.observe(el);
    setTagIndent(Math.ceil(el.offsetWidth) + 8);
    return () => ro.disconnect();
  }, [activeCommand?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDisplayChange = useCallback(
    (nextBody) => {
      if (!onChange) return;
      onChange(commandPrefix ? commandPrefix + nextBody : nextBody);
    },
    [onChange, commandPrefix],
  );

  const removeCommandTag = useCallback(() => {
    if (!onChange) return;
    onChange(displayValue);
    if (inputRef.current) inputRef.current.focus();
  }, [onChange, displayValue]);

  const commandItems = isSlashCommandPrefix(value)
    ? listCommands({ isStreaming }, value)
    : [];
  const commandMenuOpen =
    !commandMenuDismissed &&
    isSlashCommandPrefix(value) &&
    commandItems.length > 0;

  // any edit to the input value re-arms the menu (clears a prior Escape
  // dismissal) and resets the highlighted row back to the top
  useEffect(() => {
    if (prevValueRef.current !== value) {
      prevValueRef.current = value;
      setCommandMenuDismissed(false);
      setCommandMenuActiveIndex(0);
    }
  }, [value]);

  const handleCommandPick = useCallback(
    (item) => {
      if (!item) return;
      if (onChange) onChange(item.insertText ?? `${item.name} `);
      setCommandMenuDismissed(true);
      setCommandMenuActiveIndex(0);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e) => {
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

      // Backspace with the caret at the very start deletes the command tag,
      // mirroring how chip inputs behave.
      if (
        e.key === "Backspace" &&
        activeCommand &&
        e.target &&
        e.target.selectionStart === 0 &&
        e.target.selectionEnd === 0
      ) {
        e.preventDefault();
        removeCommandTag();
        return;
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
      activeCommand,
      removeCommandTag,
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
          <SteerPile
            items={interjectState?.steerItems || []}
            onUndo={onSteerUndo}
            isDark={isDark}
          />
          {commandMenuOpen && (
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: "calc(100% + 8px)",
                zIndex: 40,
              }}
            >
              <CommandMenu
                items={commandItems}
                activeIndex={commandMenuActiveIndex}
                onPick={handleCommandPick}
                isDark={isDark}
              />
            </div>
          )}
          {isDragging && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 22,
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
            value={displayValue}
            min_rows={5}
            max_display_rows={9}
            set_value={handleDisplayChange}
            placeholder={activeCommand ? "" : placeholder}
            leading_component={
              activeCommand ? (
                <span ref={tagWrapRef} style={{ display: "inline-flex" }}>
                  <CommandTag
                    name={activeCommand.name}
                    icon={activeCommand.icon}
                    onRemove={removeCommandTag}
                    isDark={isDark}
                  />
                </span>
              ) : null
            }
            leading_indent={activeCommand ? tagIndent : 0}
            on_focus={() => setFocused(true)}
            on_blur={() => setFocused(false)}
            on_key_down={handleKeyDown}
            content_section={
              showAttachments ? (
                <AttachPanel
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
                />
              ) : null
            }
            force_content_active={chatActive}
            functional_section={
              <InputActionButtons
                value={displayValue}
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
              borderRadius: 22,
              position: "relative",
              /* sits above the collapsed SteerPile (tucked behind, z-index 1)
                 but below it once it expands on hover (z-index 30) */
              zIndex: 2,
              /* opaque surface so the collapsed SteerPile reads as tucked
                 BEHIND the input rather than showing through it */
              backgroundColor: isDark
                ? "var(--pupu-surface, rgba(30, 30, 30, 1))"
                : "var(--pupu-surface, rgba(255,255,255,1))",
              backdropFilter: "blur(20px) saturate(180%)",
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
