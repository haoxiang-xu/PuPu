import { useContext, useRef, useState, useCallback, useEffect, useMemo } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { FloatingTextField } from "../../BUILTIN_COMPONENTs/input/textfield";
import { Select } from "../../BUILTIN_COMPONENTs/select/select";
import api from "../../SERVICEs/api";

/* ── Attachment toolbar (chat input) ── */
const AttachPanel = ({
  color,
  bg,
  active,
  focused,
  focusBg,
  focusBorder,
  focusShadow,
  onAttachFile,
  onAttachLink,
  onAttachGlobal,
  modelOptions,
  selectedModelId,
  onSelectModel,
  onGroupToggle,
  modelSelectDisabled,
  isDark,
}) => {
  let panelBg = "transparent";
  if (active) panelBg = bg || "rgba(128,128,128,0.08)";
  if (focused) panelBg = focusBg || "rgba(255,255,255,0.95)";

  const PILL_HEIGHT = 32;
  const selectBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          e.preventDefault();
        }
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "4px",
        borderRadius: 18,
        backgroundColor: panelBg,
        boxShadow: focused ? focusShadow : "none",
        transition: "background-color 0.22s ease, box-shadow 0.22s ease",
      }}
    >
      {modelOptions && modelOptions.length > 0 && (
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events
        <div
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => {
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
              borderRadius: focused ? 999 : 9,
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
      {onAttachLink && (
        <Button
          prefix_icon="link"
          onClick={onAttachLink}
          style={{ color, fontSize: 14, borderRadius: focused ? 16 : 9 }}
        />
      )}
    </div>
  );
};

const ChatInput = ({
  value,
  onChange,
  onSend,
  sendDisabled = false,
  placeholder = "Message Mini UI Chat...",
  disclaimer,
  showAttachments = true,
  onAttachFile,
  onAttachLink,
  onAttachGlobal,
  modelCatalog,
  selectedModelId,
  onSelectModel,
  modelSelectDisabled = false,
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
  const panelBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const panelFocusBg = isDark ? "rgba(30, 30, 30, 1)" : "rgba(255,255,255,1)";
  const panelFocusBorder = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.06)";
  const panelFocusShadow = isDark
    ? "0 4px 24px rgba(0,0,0,0.32), 0 1px 3px rgba(0,0,0,0.16)"
    : "0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)";

  const chatActive = value.length > 0 || focused;

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
          maxWidth: 1000,
          padding: "0 20px",
          boxSizing: "border-box",
        }}
      >
        <FloatingTextField
          textarea_ref={inputRef}
          value={value}
          min_rows={4}
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
                bg={panelBg}
                active={chatActive}
                focused={focused}
                focusBg={panelFocusBg}
                focusBorder={panelFocusBorder}
                focusShadow={panelFocusShadow}
                onAttachFile={onAttachFile}
                onAttachLink={onAttachLink}
                onAttachGlobal={onAttachGlobal}
                modelOptions={modelOptions}
                selectedModelId={selectedModelId}
                onSelectModel={onSelectModel}
                onGroupToggle={handleGroupToggle}
                modelSelectDisabled={modelSelectDisabled}
                isDark={isDark}
              />
            ) : null
          }
          functional_section={
            <>
              {value.length > 0 && (
                <Button
                  prefix_icon="close"
                  style={{ color, fontSize: 14, borderRadius: 7 }}
                  onClick={handleClear}
                />
              )}
              <Button
                prefix_icon="arrow_up"
                onClick={onSend}
                disabled={sendDisabled}
                style={{
                  color,
                  fontSize: 14,
                  borderRadius: 7,
                  opacity: sendDisabled ? 0.35 : 1,
                }}
              />
            </>
          }
          style={{ width: "100%", margin: 0, borderRadius: 14 }}
        />

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
