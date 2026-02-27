import {
  useContext,
  useRef,
  useState,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { FloatingTextField } from "../../BUILTIN_COMPONENTs/input/textfield";
import { Select } from "../../BUILTIN_COMPONENTs/select/select";
import api from "../../SERVICEs/api";

/* ── Attachment toolbar (chat input) ── */
const AttachPanel = ({
  color,
  active,
  focused,
  focusBg,
  focusShadow,
  onAttachFile,
  onAttachLink,
  modelOptions,
  selectedModelId,
  onSelectModel,
  onGroupToggle,
  modelSelectDisabled,
  isDark,
  attachmentsEnabled = true,
  attachmentsDisabledReason = "",
}) => {
  const floating = active || focused;
  let panelBg = "transparent";
  if (floating) panelBg = focusBg || "rgba(255,255,255,0.95)";

  const PILL_HEIGHT = 32;
  const selectBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";
  const isTextEntryTarget = (target) =>
    Boolean(
      target &&
        typeof target.closest === "function" &&
        target.closest(
          "input, textarea, [contenteditable]:not([contenteditable='false'])",
        ),
    );

  return (
    <div
      onMouseDown={(e) => {
        if (isTextEntryTarget(e.target)) return;
        e.preventDefault();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px",
        borderRadius: 22,
        backgroundColor: panelBg,
        boxShadow: floating ? focusShadow : "none",
        transition: "background-color 0.22s ease, box-shadow 0.22s ease",
      }}
    >
      {modelOptions && modelOptions.length > 0 && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => {
            if (!isTextEntryTarget(e.target)) {
              e.preventDefault();
            }
            e.stopPropagation();
          }}
          style={{ display: "flex", alignItems: "center" }}
        >
          <Select
            options={modelOptions}
            value={selectedModelId || null}
            set_value={onSelectModel}
            placeholder="Select model..."
            filterable={true}
            filter_mode="panel"
            search_placeholder="Search models..."
            disabled={modelSelectDisabled}
            show_trigger_icon={true}
            on_group_toggle={onGroupToggle}
            style={{
              height: PILL_HEIGHT,
              maxWidth: 180,
              fontSize: 12,
              color,
              backgroundColor: selectBg,
              borderRadius: floating ? 999 : 16,
              outline: "none",
              padding: "0 10px",
            }}
            dropdown_style={{
              maxWidth: 260,
              minWidth: 180,
            }}
          />
        </div>
      )}
      {onAttachFile && (
        <div
          title={
            attachmentsEnabled
              ? "Attach image or PDF"
              : attachmentsDisabledReason || "Current model does not support file inputs"
          }
        >
          <Button
            prefix_icon="add"
            onClick={onAttachFile}
            disabled={!attachmentsEnabled}
            style={{ color, fontSize: 14, borderRadius: floating ? 22 : 16 }}
          />
        </div>
      )}
      {onAttachLink && (
        <Button
          prefix_icon="link"
          onClick={onAttachLink}
          style={{ color, fontSize: 14, borderRadius: floating ? 22 : 16 }}
        />
      )}
    </div>
  );
};

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
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const [liveOllamaModels, setLiveOllamaModels] = useState([]);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const ollamaProviderModels = modelCatalog?.providers?.ollama;
  const openaiProviderModels = modelCatalog?.providers?.openai;
  const anthropicProviderModels = modelCatalog?.providers?.anthropic;

  // Fetch live Ollama models
  useEffect(() => {
    let cancelled = false;
    api.ollama
      .listModels()
      .then((models) => {
        if (!cancelled) {
          setLiveOllamaModels(models.map((m) => m.name));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleGroupToggle = useCallback((groupName) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  }, []);

  // Build grouped select options with stable reference to avoid hover resets.
  const modelOptions = useMemo(() => {
    const groups = [];

    // Ollama group — prefer live list, fall back to catalog
    const ollamaModels =
      liveOllamaModels.length > 0
        ? liveOllamaModels
        : ollamaProviderModels || [];
    if (ollamaModels.length > 0) {
      groups.push({
        group: "Ollama",
        icon: "ollama",
        collapsed: !!collapsedGroups["Ollama"],
        options: ollamaModels.map((name) => ({
          value: `ollama:${name}`,
          label: name,
          trigger_label: name,
        })),
      });
    }

    // OpenAI group
    const openaiModels = openaiProviderModels || [];
    if (openaiModels.length > 0) {
      groups.push({
        group: "OpenAI",
        icon: "open_ai",
        collapsed: !!collapsedGroups["OpenAI"],
        options: openaiModels.map((name) => ({
          value: `openai:${name}`,
          label: name,
          trigger_label: name,
        })),
      });
    }

    // Anthropic group
    const anthropicModels = anthropicProviderModels || [];
    if (anthropicModels.length > 0) {
      groups.push({
        group: "Anthropic",
        icon: "Anthropic",
        collapsed: !!collapsedGroups["Anthropic"],
        options: anthropicModels.map((name) => ({
          value: `anthropic:${name}`,
          label: name,
          trigger_label: name,
        })),
      });
    }

    return groups;
  }, [
    liveOllamaModels,
    ollamaProviderModels,
    openaiProviderModels,
    anthropicProviderModels,
    collapsedGroups,
  ]);

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
        // During IME composition (e.g. Chinese/Japanese input), Enter confirms
        // the candidate word — do not send the message.
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
        {showAttachments && hasAttachments && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 8,
            }}
          >
            {attachments.map((attachment, index) => {
              const attachmentId =
                typeof attachment?.id === "string" && attachment.id
                  ? attachment.id
                  : `attachment-${index}`;
              const attachmentName =
                typeof attachment?.name === "string" && attachment.name.trim()
                  ? attachment.name.trim()
                  : "attachment";
              return (
                <div
                  key={attachmentId}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 2,
                    padding: "2px 6px 2px 8px",
                    borderRadius: 999,
                    border: isDark
                      ? "1px solid rgba(255,255,255,0.12)"
                      : "1px solid rgba(0,0,0,0.14)",
                    backgroundColor: isDark
                      ? "rgba(255,255,255,0.05)"
                      : "rgba(0,0,0,0.04)",
                    maxWidth: "100%",
                  }}
                >
                  <span
                    title={attachmentName}
                    style={{
                      fontSize: 11,
                      lineHeight: 1.3,
                      color: isDark
                        ? "rgba(255,255,255,0.78)"
                        : "rgba(0,0,0,0.74)",
                      maxWidth: 260,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {attachmentName}
                  </span>
                  {typeof onRemoveAttachment === "function" && (
                    <Button
                      prefix_icon="close"
                      disabled={isStreaming}
                      onClick={() => onRemoveAttachment(attachmentId)}
                      style={{
                        color,
                        fontSize: 12,
                        borderRadius: 999,
                        padding: 2,
                        iconOnlyPaddingVertical: 1,
                        iconOnlyPaddingHorizontal: 1,
                        opacity: isStreaming ? 0.35 : 0.7,
                      }}
                    />
                  )}
                </div>
              );
            })}
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
              />
            ) : null
          }
          functional_section={
            <div
              style={{
                margin: -6,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {value.length > 0 && !isStreaming && (
                <Button
                  prefix_icon="close"
                  style={{
                    color,
                    padding: 6,
                    fontSize: 18,
                    borderRadius: 22,
                    iconOnlyPaddingVertical: 4,
                    iconOnlyPaddingHorizontal: 4,
                  }}
                  onClick={handleClear}
                />
              )}
              {isStreaming ? (
                <Button
                  prefix_icon="stop_mini_filled"
                  onClick={onStop}
                  style={{
                    root: {
                      background: isDark
                        ? "rgba(255,255,255,0.88)"
                        : "rgba(28,28,28,0.86)",
                      color: isDark ? "#111" : "#eee",
                      padding: 6,
                      fontSize: 18,
                      borderRadius: 22,
                      iconOnlyPaddingVertical: 4,
                      iconOnlyPaddingHorizontal: 4,
                    },
                    hoverBackgroundColor: isDark
                      ? "rgba(0,0,0,0.07)"
                      : "rgba(255,255,255,0.09)",
                    activeBackgroundColor: isDark
                      ? "rgba(0,0,0,0.14)"
                      : "rgba(255,255,255,0.18)",
                  }}
                />
              ) : (
                <Button
                  prefix_icon="arrow_up"
                  onClick={onSend}
                  disabled={sendDisabled}
                  style={{
                    root: {
                      background: isDark
                        ? "rgba(255,255,255,0.88)"
                        : "rgba(28,28,28,0.86)",
                      color: isDark ? "#111" : "#eee",
                      padding: 6,
                      fontSize: 18,
                      borderRadius: 22,
                      opacity: sendDisabled ? 0.35 : 1,
                      iconOnlyPaddingVertical: 4,
                      iconOnlyPaddingHorizontal: 4,
                    },
                    hoverBackgroundColor: isDark
                      ? "rgba(0,0,0,0.07)"
                      : "rgba(255,255,255,0.09)",
                    activeBackgroundColor: isDark
                      ? "rgba(0,0,0,0.14)"
                      : "rgba(255,255,255,0.18)",
                  }}
                />
              )}
            </div>
          }
          style={{ width: "100%", margin: 0, borderRadius: 22 }}
        />

        {showAttachments && !attachmentsEnabled && attachmentsDisabledReason && (
          <div
            style={{
              textAlign: "left",
              fontSize: 11,
              fontFamily: theme?.font?.fontFamily || "inherit",
              color: theme?.color || "#222",
              opacity: onThemeMode === "dark_mode" ? 0.6 : 0.65,
              paddingTop: 6,
            }}
          >
            {attachmentsDisabledReason}
          </div>
        )}

        {/* disclaimer text */}
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
