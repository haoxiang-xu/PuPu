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

/* ── ToolPickerPopover ── */
const BASE_TOOLKIT_IDS = new Set([
  "base",
  "toolkit",
  "builtin_toolkit",
  "base_toolkit",
]);

const ToolPickerPopover = ({
  selected,
  onChange,
  onClose,
  anchorEl,
  isDark,
}) => {
  const [toolkits, setToolkits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setIsReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    api.miso
      .getToolkitCatalog()
      .then(({ toolkits: list = [] }) => {
        setToolkits(
          list.filter(
            (tk) =>
              (tk.kind === "builtin" || tk.kind === "core") &&
              !BASE_TOOLKIT_IDS.has((tk.class_name || "").toLowerCase()) &&
              !BASE_TOOLKIT_IDS.has((tk.name || "").toLowerCase()),
          ),
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onMouseDown = (e) => {
      if (
        ref.current &&
        !ref.current.contains(e.target) &&
        anchorEl &&
        !anchorEl.contains(e.target)
      ) {
        onClose();
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [anchorEl, onClose]);

  const toggle = (className) => {
    onChange(
      selected.includes(className)
        ? selected.filter((c) => c !== className)
        : [...selected, className],
    );
  };

  const bg = isDark ? "rgb(28,28,28)" : "rgb(255,255,255)";
  const border = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.09)"; // kept for internal dividers
  const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.78)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
  const checkColor = "rgba(10,186,181,1)";
  const hoverBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        bottom: "calc(100% + 6px)",
        left: 0,
        zIndex: 99,
        background: bg,
        borderRadius: 10,
        boxShadow: isDark
          ? "0 8px 32px rgba(0,0,0,0.45)"
          : "0 8px 32px rgba(0,0,0,0.12)",
        minWidth: 260,
        maxWidth: 340,
        overflow: "hidden",
        padding: "6px 0",
        opacity: isReady ? 1 : 0,
        transform: isReady ? "scale(1)" : "scale(0.95)",
        transformOrigin: "bottom left",
        transition: "opacity 120ms ease, transform 120ms ease",
        willChange: "transform, opacity",
      }}
    >
      <div
        style={{
          padding: "6px 14px 8px",
          fontSize: 10,
          letterSpacing: "0.9px",
          textTransform: "uppercase",
          color: mutedColor,
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        Toolkits
      </div>

      {loading ? (
        <div style={{ padding: "10px 14px", fontSize: 12, color: mutedColor }}>
          Loading…
        </div>
      ) : toolkits.length === 0 ? (
        <div style={{ padding: "10px 14px", fontSize: 12, color: mutedColor }}>
          No toolkits available
        </div>
      ) : (
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {toolkits.map((tk) => {
            const checked = selected.includes(tk.class_name);
            return (
              <div
                key={tk.class_name}
                onMouseDown={(e) => {
                  e.preventDefault();
                  toggle(tk.class_name);
                }}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "7px 14px",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = hoverBg)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                {/* checkbox */}
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    border: checked
                      ? `2px solid ${checkColor}`
                      : `2px solid ${isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)"}`,
                    background: checked ? checkColor : "transparent",
                    flexShrink: 0,
                    marginTop: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.12s",
                    boxSizing: "border-box",
                  }}
                >
                  {checked && (
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                      <path
                        d="M1.5 4L3.5 6L6.5 2"
                        stroke="white"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                {/* text */}
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: textColor,
                      fontFamily: "Menlo, Monaco, Consolas, monospace",
                    }}
                  >
                    {tk.class_name}
                  </div>
                  {tk.tools && tk.tools.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 4,
                        marginTop: 3,
                      }}
                    >
                      {tk.tools.slice(0, 5).map((t) => (
                        <span
                          key={t.name}
                          style={{
                            fontSize: 9.5,
                            color: mutedColor,
                            fontFamily: "Menlo, Monaco, Consolas, monospace",
                          }}
                        >
                          {t.name}
                        </span>
                      ))}
                      {tk.tools.length > 5 && (
                        <span style={{ fontSize: 9.5, color: mutedColor }}>
                          +{tk.tools.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected.length > 0 && (
        <div
          style={{
            borderTop: `1px solid ${border}`,
            padding: "6px 14px",
          }}
        >
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              onChange([]);
            }}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontSize: 11,
              color: mutedColor,
              fontFamily: "Menlo, Monaco, Consolas, monospace",
            }}
          >
            clear all
          </button>
        </div>
      )}
    </div>
  );
};
/* ── ToolPickerPopover ── */

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
  attachments = [],
  onRemoveAttachment,
  isStreaming = false,
  selectedToolkits = [],
  onToolkitsChange,
}) => {
  const [toolPickerOpen, setToolPickerOpen] = useState(false);
  const toolBtnRef = useRef(null);
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
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 4,
      }}
    >
      {/* File list — bare, no card bg */}
      {attachments.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            padding: "0 4px",
          }}
        >
          {attachments.map((attachment, index) => {
            const attId =
              typeof attachment?.id === "string" && attachment.id
                ? attachment.id
                : `attachment-${index}`;
            const attName =
              typeof attachment?.name === "string" && attachment.name.trim()
                ? attachment.name.trim()
                : "attachment";
            return (
              <div
                key={attId}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 2,
                  padding: "6px 8px 6px 14px",
                  borderRadius: 999,
                  border: isDark
                    ? "1px solid rgba(255, 255, 255, 0.16)"
                    : "1px solid rgba(0, 0, 0, 0.32)",
                  backgroundColor: isDark
                    ? "rgb(0, 0, 0)"
                    : "rgb(255, 255, 255)",
                }}
              >
                <span
                  title={attName}
                  style={{
                    fontSize: 12,
                    lineHeight: 1.4,
                    color: isDark ? "rgb(255, 255, 255)" : "rgb(0, 0, 0)",
                    maxWidth: 220,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {attName}
                </span>
                {typeof onRemoveAttachment === "function" && (
                  <Button
                    prefix_icon="close"
                    disabled={isStreaming}
                    onClick={() => onRemoveAttachment(attId)}
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
      {/* Controls row — this is the pill */}
      <div
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
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            <div
              title={
                attachmentsEnabled
                  ? "Attach image or PDF"
                  : attachmentsDisabledReason ||
                    "Current model does not support file inputs"
              }
            >
              <Button
                prefix_icon="attachment"
                onClick={onAttachFile}
                disabled={!attachmentsEnabled}
                style={{
                  color,
                  fontSize: 14,
                  borderRadius: floating ? 22 : 16,
                }}
              />
            </div>
            {/* Tool picker button */}
            <div ref={toolBtnRef} style={{ position: "relative" }}>
              <Button
                prefix_icon="tool"
                title="Select toolkits"
                onClick={() => setToolPickerOpen((v) => !v)}
                style={{
                  color:
                    selectedToolkits.length > 0 ? "rgba(10,186,181,1)" : color,
                  fontSize: 14,
                  borderRadius: floating ? 22 : 16,
                }}
              />
              {selectedToolkits.length > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    minWidth: 13,
                    height: 13,
                    borderRadius: 999,
                    background: "rgba(10,186,181,1)",
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
                  {selectedToolkits.length}
                </span>
              )}
              {toolPickerOpen && (
                <ToolPickerPopover
                  selected={selectedToolkits}
                  onChange={onToolkitsChange || (() => {})}
                  onClose={() => setToolPickerOpen(false)}
                  anchorEl={toolBtnRef.current}
                  isDark={isDark}
                />
              )}
            </div>
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
  onDropFiles = null,
  selectedToolkits = [],
  onToolkitsChange,
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

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback(
    (e) => {
      if (!onDropFiles) return;
      const hasFiles = Array.from(e.dataTransfer?.types || []).includes(
        "Files",
      );
      if (!hasFiles) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      setIsDragging(true);
    },
    [onDropFiles],
  );

  const handleDragLeave = useCallback((e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (!onDropFiles) return;
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) {
        onDropFiles(files);
      }
    },
    [onDropFiles],
  );

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
        </div>

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
