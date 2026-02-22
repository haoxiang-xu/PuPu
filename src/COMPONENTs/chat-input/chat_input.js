import { useContext, useRef, useState, useCallback } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { TextField } from "../../BUILTIN_COMPONENTs/input/textfield";

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
}) => {
  let panelBg = "transparent";
  if (active) panelBg = bg || "rgba(128,128,128,0.08)";
  if (focused) panelBg = focusBg || "rgba(255,255,255,0.95)";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "4px",
        borderRadius: 7,
        backgroundColor: panelBg,
        boxShadow: focused ? focusShadow : "none",
        transition: "background-color 0.22s ease, box-shadow 0.22s ease",
      }}
    >
      {onAttachLink && (
        <Button
          prefix_icon="link"
          onClick={onAttachLink}
          style={{ color, fontSize: 14 }}
        />
      )}
      {onAttachGlobal && (
        <Button
          prefix_icon="global"
          onClick={onAttachGlobal}
          style={{ color, fontSize: 14 }}
        />
      )}
      {onAttachFile && (
        <Button
          prefix_icon="add"
          onClick={onAttachFile}
          style={{ color, fontSize: 14 }}
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
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);

  const color = theme?.color || "#222";
  const panelBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const panelFocusBg = isDark ? "rgba(30,30,30,1)" : "rgba(255,255,255,1)";
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
        <TextField
          textarea_ref={inputRef}
          value={value}
          min_rows={3}
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
          style={{ width: "100%", margin: 0, borderRadius: 7 }}
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
