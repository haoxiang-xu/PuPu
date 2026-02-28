import { useRef, useState } from "react";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { Select } from "../../../BUILTIN_COMPONENTs/select/select";
import AttachmentChipList from "./attachment_chip_list";
import ToolPickerPopover from "./tool_picker_popover";

const PILL_HEIGHT = 32;

const isTextEntryTarget = (target) =>
  Boolean(
    target &&
      typeof target.closest === "function" &&
      target.closest(
        "input, textarea, [contenteditable]:not([contenteditable='false'])",
      ),
  );

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

  const selectBg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)";

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
        {modelOptions && modelOptions.length > 0 && (
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

export default AttachPanel;
