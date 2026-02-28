import { useContext, useRef, useState, useCallback } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { FloatingTextField } from "../../BUILTIN_COMPONENTs/input/textfield";
import AttachPanel from "./components/attach_panel";
import InputActionButtons from "./components/input_action_buttons";
import { useChatInputModels } from "./hooks/use_chat_input_models";
import { useFileDropOverlay } from "./hooks/use_file_drop_overlay";

const ChatInput = ({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming = false,
  sendDisabled = false,
  placeholder = "Message Mini UI Chat...",
  disclaimer,
  showAttachments = true,
  onAttachFile,
  onAttachLink,
  modelCatalog,
  selectedModelId,
  onSelectModel,
  modelSelectDisabled = false,
  attachments = [],
  onRemoveAttachment,
  attachmentsEnabled = true,
  attachmentsDisabledReason = "",
  onDropFiles = null,
  selectedToolkits = [],
  onToolkitsChange,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);

  const { modelOptions, handleGroupToggle } = useChatInputModels({
    model_catalog: modelCatalog,
  });

  const { isDragging, handleDragOver, handleDragLeave, handleDrop } =
    useFileDropOverlay({
      on_drop_files: onDropFiles,
    });

  const color = theme?.color || "#222";
  const panelFocusBg = isDark ? "rgba(30, 30, 30, 1)" : "rgba(255,255,255,1)";
  const panelFocusShadow = isDark
    ? "0 4px 24px rgba(0,0,0,0.32), 0 1px 3px rgba(0,0,0,0.16)"
    : "0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)";

  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  const chatActive = value.length > 0 || focused || hasAttachments;

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        if (e.nativeEvent?.isComposing || e.isComposing) return;
        e.preventDefault();
        if (!sendDisabled && onSend) {
          onSend();
        }
      }
    },
    [onSend, sendDisabled],
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
            value={value}
            min_rows={5}
            max_display_rows={9}
            set_value={onChange}
            placeholder={placeholder}
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
                  modelOptions={modelOptions}
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
                  selectedToolkits={selectedToolkits}
                  onToolkitsChange={onToolkitsChange}
                />
              ) : null
            }
            force_content_active={chatActive}
            functional_section={
              <InputActionButtons
                value={value}
                color={color}
                isDark={isDark}
                isStreaming={isStreaming}
                sendDisabled={sendDisabled}
                onClear={handleClear}
                onSend={onSend}
                onStop={onStop}
              />
            }
            style={{ width: "100%", margin: 0, borderRadius: 22 }}
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

export default ChatInput;
