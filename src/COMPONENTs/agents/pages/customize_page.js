import { useContext, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { Input } from "../../../BUILTIN_COMPONENTs/input/input";
import { Select } from "../../../BUILTIN_COMPONENTs/select/select";
import { TextField } from "../../../BUILTIN_COMPONENTs/input/textfield";
import { SegmentedButton } from "../../../BUILTIN_COMPONENTs/input/segmented_button";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import Button from "../../../BUILTIN_COMPONENTs/input/button";

const FONT = "Jost, sans-serif";

/* ── Circular avatar ───────────────────────────────────────── */
const Avatar = ({ avatar, setAvatar, isDark, size = 96 }) => {
  const [hovered, setHovered] = useState(false);

  const handleFileSelect = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => setAvatar(ev.target?.result);
      reader.readAsDataURL(file);
    };
    input.click();
  };

  return (
    <div
      onClick={handleFileSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
        border: `1.5px solid ${
          hovered
            ? isDark
              ? "rgba(255,255,255,0.15)"
              : "rgba(0,0,0,0.12)"
            : "transparent"
        }`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        overflow: "hidden",
        position: "relative",
        flexShrink: 0,
        transition: "border-color 0.25s ease, transform 0.2s ease",
        transform: hovered ? "scale(1.03)" : "scale(1)",
      }}
    >
      {avatar ? (
        <>
          <img
            src={avatar}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: hovered ? 1 : 0,
              transition: "opacity 0.2s ease",
            }}
          >
            <Icon
              src="edit_pen"
              style={{ width: 14, height: 14 }}
              color="rgba(255,255,255,0.85)"
            />
          </div>
        </>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
          }}
        >
          <Icon
            src="user"
            style={{ width: 24, height: 24 }}
            color={isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)"}
          />
          <span
            style={{
              fontSize: 9,
              fontFamily: FONT,
              fontWeight: 500,
              color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)",
              letterSpacing: "0.3px",
            }}
          >
            {hovered ? "Upload" : ""}
          </span>
        </div>
      )}
    </div>
  );
};

const META_FONT_FAMILY = "Menlo, Monaco, Consolas, monospace";

/* ── Field label ────────────────────────────────────────────── */
const Label = ({ children, isDark }) => (
  <div
    style={{
      fontSize: 11,
      fontFamily: FONT,
      fontWeight: 500,
      letterSpacing: "0.02em",
      color: isDark ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.36)",
      marginBottom: 6,
      userSelect: "none",
    }}
  >
    {children}
  </div>
);

/* ── Section title ──────────────────────────────────────────── */
const SectionTitle = ({ children, isDark }) => (
  <div
    style={{
      fontSize: 10,
      fontFamily: FONT,
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.22)",
      marginBottom: 14,
      userSelect: "none",
    }}
  >
    {children}
  </div>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  CustomizePage                                                */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
const CustomizePage = ({ isDark }) => {
  const { theme } = useContext(ConfigContext);
  const color = theme?.color || (isDark ? "#fff" : "#111");
  const metaColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";

  const [avatar, setAvatar] = useState(null);
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [customGender, setCustomGender] = useState("");
  const [relationship, setRelationship] = useState("");
  const [speakingStyle, setSpeakingStyle] = useState("");
  const [responseLength, setResponseLength] = useState("balanced");
  const [personality, setPersonality] = useState("");
  const [backstory, setBackstory] = useState("");

  const fieldBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)";
  const fieldOutline = isDark
    ? "1px solid rgba(255,255,255,0.06)"
    : "1px solid rgba(0,0,0,0.06)";

  const inputStyle = {
    width: "100%",
    fontSize: 13,
    fontFamily: FONT,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: fieldBg,
    boxShadow: "none",
    outline: fieldOutline,
  };

  const selectStyle = {
    fontSize: 13,
    fontFamily: FONT,
    color,
    width: "100%",
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: fieldBg,
    boxShadow: "none",
    outline: fieldOutline,
  };
  const optionStyle = {
    height: 30,
    padding: "4px 10px",
    fontSize: 12.5,
    fontFamily: FONT,
  };
  const dropdownStyle = {
    padding: 5,
    borderRadius: 10,
    backgroundColor: isDark ? "rgba(22,22,22,0.98)" : "#fff",
    boxShadow: isDark
      ? "0 10px 32px rgba(0,0,0,0.5)"
      : "0 10px 28px rgba(0,0,0,0.1)",
  };

  const textFieldStyle = {
    fontSize: 13,
    fontFamily: FONT,
    lineHeight: 1.6,
    borderRadius: 8,
    width: "100%",
    backgroundColor: fieldBg,
    border: fieldOutline,
    boxShadow: "none",
  };

  const overlay_bg = isDark
    ? "rgba(20, 20, 20, 0.72)"
    : "rgba(255, 255, 255, 0.78)";
  const overlay_border = isDark
    ? "1px solid rgba(255,255,255,0.08)"
    : "1px solid rgba(0,0,0,0.08)";
  const overlay_backdrop = "blur(16px) saturate(1.4)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "50%",
        maxWidth: "50%",
        height: "100%",
        minHeight: 0,
        fontFamily: FONT,
        borderRadius: 10,
        backgroundColor: overlay_bg,
        border: overlay_border,
        backdropFilter: overlay_backdrop,
        WebkitBackdropFilter: overlay_backdrop,
        boxShadow: isDark
          ? "0 8px 32px rgba(0,0,0,0.5)"
          : "0 8px 32px rgba(0,0,0,0.1)",
        overflow: "hidden",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          padding: "14px 16px 8px",
          flexShrink: 0,
          fontSize: 11,
          fontFamily: META_FONT_FAMILY,
          color: metaColor,
          textTransform: "uppercase",
          letterSpacing: "0.8px",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        New Character
      </div>

      {/* ── Scrollable content ── */}
      <div
        className="scrollable"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "8px 24px 28px",
        }}
      >
        {/* ─── Profile ─── */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            paddingTop: 8,
            paddingBottom: 24,
          }}
        >
          <Avatar
            avatar={avatar}
            setAvatar={setAvatar}
            isDark={isDark}
            size={80}
          />
          <div style={{ width: "60%", marginTop: 16, textAlign: "center" }}>
            <Input
              placeholder="Character name"
              value={name}
              set_value={setName}
              style={{
                ...inputStyle,
                fontSize: 16,
                fontWeight: 500,
                fontFamily: FONT,
                textAlign: "center",
                borderRadius: 10,
              }}
            />
          </div>
        </div>

        {/* ─── Identity ─── */}
        <SectionTitle isDark={isDark}>Identity</SectionTitle>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginBottom: gender === "other" ? 10 : 0,
          }}
        >
          <div>
            <Label isDark={isDark}>Gender</Label>
            <Select
              options={[
                { label: "Male", value: "male" },
                { label: "Female", value: "female" },
                { label: "Non-binary", value: "non-binary" },
                { label: "Other", value: "other" },
                { label: "Prefer not to say", value: "prefer_not_to_say" },
              ]}
              value={gender}
              set_value={setGender}
              placeholder="Select"
              filterable={false}
              style={selectStyle}
              option_style={optionStyle}
              dropdown_style={dropdownStyle}
            />
          </div>
          <div>
            <Label isDark={isDark}>Relationship</Label>
            <Select
              options={[
                { label: "Assistant", value: "assistant" },
                { label: "Friend", value: "friend" },
                { label: "Mentor", value: "mentor" },
                { label: "Colleague", value: "colleague" },
                { label: "Tutor", value: "tutor" },
                { label: "Companion", value: "companion" },
                { label: "Coach", value: "coach" },
              ]}
              value={relationship}
              set_value={setRelationship}
              placeholder="Select"
              filterable={false}
              style={selectStyle}
              option_style={optionStyle}
              dropdown_style={dropdownStyle}
            />
          </div>
        </div>

        {gender === "other" && (
          <div style={{ marginBottom: 0 }}>
            <Label isDark={isDark}>Custom Gender</Label>
            <Input
              placeholder="Specify"
              value={customGender}
              set_value={setCustomGender}
              style={inputStyle}
            />
          </div>
        )}

        {/* ─── spacer ─── */}
        <div style={{ height: 24 }} />

        {/* ─── Behavior ─── */}
        <SectionTitle isDark={isDark}>Behavior</SectionTitle>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div>
            <Label isDark={isDark}>Speaking Style</Label>
            <Select
              options={[
                { label: "Casual", value: "casual" },
                { label: "Formal", value: "formal" },
                { label: "Friendly", value: "friendly" },
                { label: "Professional", value: "professional" },
                { label: "Playful", value: "playful" },
                { label: "Empathetic", value: "empathetic" },
                { label: "Direct", value: "direct" },
              ]}
              value={speakingStyle}
              set_value={setSpeakingStyle}
              placeholder="Select"
              filterable={false}
              style={selectStyle}
              option_style={optionStyle}
              dropdown_style={dropdownStyle}
              multi
              multi_label="styles"
            />
          </div>

          <div>
            <Label isDark={isDark}>Response Length</Label>
            <SegmentedButton
              options={[
                { label: "Concise", value: "concise" },
                { label: "Balanced", value: "balanced" },
                { label: "Detailed", value: "detailed" },
              ]}
              value={responseLength}
              on_change={setResponseLength}
              style={{
                width: "100%",
                fontSize: 11.5,
                fontFamily: FONT,
                padding: 3,
                gap: 2,
                borderRadius: 8,
                backgroundColor: fieldBg,
                boxShadow: `inset 0 0 0 1px ${
                  isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"
                }`,
              }}
              button_style={{ flex: 1, padding: "7px 0" }}
            />
          </div>
        </div>

        {/* ─── spacer ─── */}
        <div style={{ height: 24 }} />

        {/* ─── Story ─── */}
        <SectionTitle isDark={isDark}>Story</SectionTitle>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <div>
            <Label isDark={isDark}>Personality</Label>
            <TextField
              placeholder="Traits, temperament, quirks..."
              value={personality}
              set_value={setPersonality}
              min_rows={2}
              max_display_rows={5}
              style={textFieldStyle}
            />
          </div>

          <div>
            <Label isDark={isDark}>Backstory</Label>
            <TextField
              placeholder="History, expertise, background..."
              value={backstory}
              set_value={setBackstory}
              min_rows={2}
              max_display_rows={5}
              style={textFieldStyle}
            />
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 12,
          padding: "6px 6px 6px",
          flexShrink: 0,
        }}
      >
        <Button
          label="Save"
          prefix_icon="check"
          onClick={() => {}}
          style={{
            fontSize: 12,
            fontWeight: 600,
            paddingVertical: 3,
            paddingHorizontal: 12,
            borderRadius: 6,
          }}
        />
      </div>
    </div>
  );
};

export default CustomizePage;
