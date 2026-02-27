import { useContext, useState } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import TextField, {
  FloatingTextField,
} from "../../../BUILTIN_COMPONENTs/input/textfield";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { CustomizedTooltip } from "../demo";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

/* ── Attachment toolbar (chat input) ── */
const AttachPanel = ({ color, bg, active }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 2,
      padding: "4px",
      borderRadius: 7,
      backgroundColor: active ? bg || "rgba(128,128,128,0.08)" : "transparent",
      transition: "background-color 0.22s ease",
    }}
  >
    <Button prefix_icon="add" style={{ color, fontSize: 14 }} />
    <Button prefix_icon="link" style={{ color, fontSize: 14 }} />
    <Button prefix_icon="edit" style={{ color, fontSize: 14 }} />
  </div>
);

/* ── Character counter badge ── */
const CharCount = ({ count, max, color }) => {
  const over = max && count > max;
  return (
    <span
      style={{
        fontSize: 11,
        fontFamily: "Jost, sans-serif",
        color: over ? "#e05050" : color || "rgba(128,128,128,0.5)",
        whiteSpace: "nowrap",
        userSelect: "none",
        transition: "color 0.15s ease",
      }}
    >
      {count}
      {max ? ` / ${max}` : ""}
    </span>
  );
};

const TextFieldDemo = () => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const color = theme?.color || "black";
  const subColor = isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.38)";
  const panelBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";

  /* ---- per-demo state ---- */
  const [chatVal, setChatVal] = useState("");
  const [chatFocused, setChatFocused] = useState(false);
  const chatActive = chatVal.length > 0 || chatFocused;

  const [noteVal, setNoteVal] = useState("");
  const NOTE_MAX = 280;

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        padding: "10px",
      }}
    >
      <span
        style={{
          width: "100%",
          textAlign: "left",
          fontSize: "48px",
          fontFamily: "Jost",
          color,
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        Text Field
      </span>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "flex-start",
        }}
      >
        {/* ── 1. Chat message input ── */}
        <CustomizedTooltip
          code={`
\`\`\`js
<FloatingTextField
  min_rows={1}
  max_display_rows={6}
  placeholder="Type a message..."
  content_section={<AttachPanel />}
  functional_section={<IconBtn src="arrow_up" />}
/>
\`\`\`
          `}
        >
          <FloatingTextField
            value={chatVal}
            set_value={setChatVal}
            min_rows={1}
            max_display_rows={6}
            placeholder="Type a message..."
            on_focus={() => setChatFocused(true)}
            on_blur={() => setChatFocused(false)}
            content_section={
              <AttachPanel color={color} bg={panelBg} active={chatActive} />
            }
            functional_section={
              <>
                {chatVal.length > 0 && (
                  <Button
                    prefix_icon="close"
                    style={{ color, fontSize: 14 }}
                    onClick={() => setChatVal("")}
                  />
                )}
                <Button
                  prefix_icon="arrow_up"
                  style={{ color, fontSize: 14 }}
                />
              </>
            }
            style={{ width: 320, marginTop: 32 }}
          />
        </CustomizedTooltip>

        {/* ── 2. Note / comment with character limit ── */}
        <CustomizedTooltip
          code={`
\`\`\`js
<FloatingTextField
  min_rows={3}
  max_display_rows={8}
  placeholder="Write a note..."
  functional_section={<CharCount max={280} />}
/>
\`\`\`
          `}
        >
          <FloatingTextField
            value={noteVal}
            set_value={setNoteVal}
            min_rows={3}
            max_display_rows={8}
            placeholder="Write a note..."
            functional_section={
              <CharCount
                count={noteVal.length}
                max={NOTE_MAX}
                color={subColor}
              />
            }
            style={{ width: 300 }}
          />
        </CustomizedTooltip>

        {/* ── 3. Ghost chat input ── */}
        <CustomizedTooltip
          code={`
\`\`\`js
<TextField
  min_rows={1}
  max_display_rows={6}
  placeholder="Ghost message..."
/>
\`\`\`
          `}
        >
          <TextField
            min_rows={1}
            max_display_rows={6}
            placeholder="Ghost message..."
            functional_section={
              <Button prefix_icon="arrow_up" style={{ color, fontSize: 14 }} />
            }
            style={{ width: 320 }}
          />
        </CustomizedTooltip>

        {/* ── 4. Ghost note ── */}
        <CustomizedTooltip
          code={`
\`\`\`js
<TextField
  min_rows={3}
  max_display_rows={8}
  placeholder="Ghost note..."
/>
\`\`\`
          `}
        >
          <TextField
            min_rows={3}
            max_display_rows={8}
            placeholder="Ghost note..."
            style={{ width: 300 }}
          />
        </CustomizedTooltip>
      </div>
    </div>
  );
};

export default TextFieldDemo;
