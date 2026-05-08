import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { Select } from "../../../BUILTIN_COMPONENTs/select/select";
import AttachmentChipList from "./attachment_chip_list";
import { WorkspaceModal } from "../../workspace/workspace_modal";
import useChatInputToolkits from "../hooks/use_chat_input_toolkits";
import useChatInputWorkspaces from "../hooks/use_chat_input_workspaces";
import { emitModelCatalogRefresh } from "../../../SERVICEs/model_catalog_refresh";
import {
  readFeatureFlags,
  subscribeFeatureFlags,
} from "../../../SERVICEs/feature_flags";

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

/* ── shared footer helpers ── */

const ClearAllFooter = ({ onClear, isDark, theme }) => (
  <button
    onMouseDown={(e) => {
      e.preventDefault();
      onClear();
    }}
    style={{
      background: "none",
      border: "none",
      padding: "2px 4px",
      cursor: "pointer",
      fontSize: 11,
      color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
      fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
    }}
  >
    clear all
  </button>
);

const WorkspaceFooter = ({ onClear, hasSelection, onAdd, isDark, theme }) => {
  const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.78)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {hasSelection && (
        <button
          onMouseDown={(e) => {
            e.preventDefault();
            onClear();
          }}
          style={{
            background: "none",
            border: "none",
            padding: "2px 4px",
            cursor: "pointer",
            fontSize: 11,
            color: mutedColor,
            fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
            textAlign: "left",
          }}
        >
          clear all
        </button>
      )}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          onAdd();
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          cursor: "pointer",
          padding: "3px 4px",
          opacity: 0.55,
          borderRadius: 4,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.55")}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          style={{ flexShrink: 0 }}
        >
          <path
            d="M7 2.5V11.5M2.5 7H11.5"
            stroke={textColor}
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
        <span
          style={{
            fontSize: 12,
            fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
            color: textColor,
            fontWeight: 500,
          }}
        >
          Add Workspace
        </span>
      </div>
    </div>
  );
};

/* ── main component ── */

const AttachPanel = ({
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
  onGroupToggle,
  modelSelectDisabled,
  isDark,
  attachmentsEnabled = true,
  attachmentsDisabledReason = "",
  attachments = [],
  onRemoveAttachment,
  isStreaming = false,
  showToolSelector = true,
  selectedToolkits = [],
  onToolkitsChange,
  showWorkspaceSelector = true,
  selectedWorkspaceIds = [],
  onWorkspaceIdsChange,
  selectedRecipeName = "Default",
  onSelectRecipe,
}) => {
  const { theme } = useContext(ConfigContext);
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const [openSelector, setOpenSelector] = useState(null);
  const [featureFlags, setFeatureFlags] = useState(() => readFeatureFlags());
  const lastModelSelectorRefreshAt = useRef(0);
  const { toolkitOptions, refreshToolkits } = useChatInputToolkits();
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
    }
  }, []);

  const handleToolsOpenChange = useCallback(
    (next) => {
      if (next) {
        void refreshToolkits();
        setOpenSelector("tools");
        return;
      }

      setOpenSelector(null);
    },
    [refreshToolkits],
  );

  const floating = active || focused;
  let panelBg = "transparent";
  if (floating) panelBg = focusBg || "rgba(255,255,255,0.95)";

  const selectBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";

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
        {count}
      </span>
    ) : null;

  /* stop-propagation wrapper for selects */
  const selectWrap = (children) => (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        if (!isTextEntryTarget(e.target)) e.preventDefault();
        e.stopPropagation();
      }}
      style={{ display: "flex", alignItems: "center" }}
    >
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
          padding: "4px",
          borderRadius: 22,
          backgroundColor: panelBg,
          boxShadow: floating ? focusShadow : "none",
          transition: "background-color 0.22s ease, box-shadow 0.22s ease",
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
              placeholder="Select model..."
              filterable={true}
              filter_mode="panel"
              search_placeholder="Search models..."
              disabled={modelSelectDisabled}
              show_trigger_icon={true}
              on_group_toggle={onGroupToggle}
              open={openSelector === "model"}
              on_open_change={handleModelSelectorOpenChange}
              dropdown_position="top"
              style={{ ...pillStyle, maxWidth: 180 }}
              dropdown_style={{
                maxWidth: 260,
                minWidth: 180,
                maxHeight: 240,
              }}
            />,
          )}

        {onAttachFile && (
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {/* ── Attach file button ── */}
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

            {/* ── Screenshot button ── */}
            {onAttachScreenshot && (
              <div
                title={
                  attachmentsEnabled
                    ? "Take a screenshot"
                    : attachmentsDisabledReason ||
                      "Current model does not support image inputs"
                }
              >
                <Button
                  prefix_icon="screenshot"
                  onClick={onAttachScreenshot}
                  disabled={!attachmentsEnabled}
                  style={{
                    color,
                    fontSize: 14,
                    borderRadius: floating ? 22 : 16,
                  }}
                />
              </div>
            )}

            {/* ── Tools selector (icon button + badge trigger) ── */}
            {showToolSelector && !hasActiveAgentRecipe ? (
              <div style={{ position: "relative" }}>
                <Select
                  multi
                  options={toolkitOptions}
                  value={selectedToolkits}
                  set_value={onToolkitsChange || (() => {})}
                  filterable={true}
                  filter_mode="panel"
                  search_placeholder="Search toolkits..."
                  open={openSelector === "tools"}
                  on_open_change={handleToolsOpenChange}
                  dropdown_position="top"
                  dropdown_style={{
                    maxWidth: 300,
                    minWidth: 220,
                    maxHeight: 280,
                  }}
                  dropdown_footer={
                    selectedToolkits.length > 0 ? (
                      <ClearAllFooter
                        onClear={() => (onToolkitsChange || (() => {}))([])}
                        isDark={isDark}
                        theme={theme}
                      />
                    ) : null
                  }
                  custom_trigger={
                    <div style={{ position: "relative" }}>
                      <Button
                        prefix_icon="tool"
                        title="Select toolkits"
                        style={{
                          color:
                            selectedToolkits.length > 0
                              ? "rgba(10,186,181,1)"
                              : color,
                          fontSize: 14,
                          iconSize: TOOL_SELECTOR_TRIGGER_ICON_SIZE,
                          borderRadius: floating ? 22 : 16,
                        }}
                      />
                      <Badge count={selectedToolkits.length} />
                    </div>
                  }
                />
              </div>
            ) : null}

            {/* ── Workspace selector (icon button + badge trigger) ── */}
            {showWorkspaceSelector ? (
              <div style={{ position: "relative" }}>
                <Select
                  multi
                  options={workspaceOptions}
                  value={selectedWorkspaceIds}
                  set_value={onWorkspaceIdsChange || (() => {})}
                  filterable={true}
                  filter_mode="panel"
                  search_placeholder="Search workspaces..."
                  open={openSelector === "workspace"}
                  on_open_change={(next) =>
                    setOpenSelector(next ? "workspace" : null)
                  }
                  dropdown_position="top"
                  dropdown_style={{
                    maxWidth: 300,
                    minWidth: 220,
                    maxHeight: 260,
                  }}
                  dropdown_footer={
                    <WorkspaceFooter
                      hasSelection={selectedWorkspaceIds.length > 0}
                      onClear={() => (onWorkspaceIdsChange || (() => {}))([])}
                      onAdd={() => {
                        setOpenSelector(null);
                        setWorkspaceModalOpen(true);
                      }}
                      isDark={isDark}
                      theme={theme}
                    />
                  }
                  custom_trigger={
                    <div style={{ position: "relative" }}>
                      <Button
                        prefix_icon="folder_2"
                        title="Select workspaces"
                        style={{
                          color:
                            selectedWorkspaceIds.length > 0
                              ? "rgba(10,186,181,1)"
                              : color,
                          fontSize: 14,
                          borderRadius: floating ? 22 : 16,
                        }}
                      />
                      <Badge count={selectedWorkspaceIds.length} />
                    </div>
                  }
                />
              </div>
            ) : null}

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

      <WorkspaceModal
        open={workspaceModalOpen}
        onClose={() => setWorkspaceModalOpen(false)}
      />
    </div>
  );
};

export default AttachPanel;
