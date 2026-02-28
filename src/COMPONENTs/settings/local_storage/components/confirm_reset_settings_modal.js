import Modal from "../../../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";

const ConfirmResetSettingsModal = ({ open, onClose, onConfirm, isDark }) => (
  <Modal
    open={open}
    onClose={onClose}
    style={{
      width: 380,
      padding: "28px 28px 20px",
      backgroundColor: isDark ? "#1a1a1a" : "#ffffff",
      display: "flex",
      flexDirection: "column",
      gap: 0,
      borderRadius: 12,
    }}
  >
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: isDark
          ? "rgba(255,160,0,0.13)"
          : "rgba(200,120,0,0.09)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16,
        flexShrink: 0,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM11 15H13V17H11V15ZM11 7H13V13H11V7Z"
          fill={isDark ? "rgba(255,180,60,0.9)" : "rgba(160,100,0,0.9)"}
        />
      </svg>
    </div>

    <div
      style={{
        fontSize: 15,
        fontWeight: 600,
        color: isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)",
        marginBottom: 8,
        lineHeight: 1.3,
      }}
    >
      Reset all settings to defaults?
    </div>

    <div
      style={{
        fontSize: 13,
        lineHeight: 1.6,
        color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
        marginBottom: 20,
      }}
    >
      Deleting the{" "}
      <span
        style={{
          fontFamily: "'SF Mono', 'Fira Code', monospace",
          fontSize: 12,
          padding: "1px 6px",
          borderRadius: 4,
          backgroundColor: isDark
            ? "rgba(255,255,255,0.07)"
            : "rgba(0,0,0,0.05)",
          color: isDark ? "rgba(255,255,255,0.60)" : "rgba(0,0,0,0.55)",
        }}
      >
        settings
      </span>{" "}
      key will restore all preferences — including theme, appearance, and any
      future settings — back to their default values. This cannot be undone.
    </div>

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button
        label="Cancel"
        onClick={onClose}
        style={{
          fontSize: 13,
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 7,
          opacity: 0.65,
        }}
      />
      <Button
        label="Reset to defaults"
        onClick={onConfirm}
        style={{
          fontSize: 13,
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 7,
          backgroundColor: isDark
            ? "rgba(220,140,0,0.30)"
            : "rgba(200,120,0,0.12)",
          hoverBackgroundColor: isDark
            ? "rgba(220,140,0,0.48)"
            : "rgba(200,120,0,0.22)",
          color: isDark ? "rgba(255,200,80,1)" : "rgba(140,80,0,1)",
        }}
      />
    </div>
  </Modal>
);

export default ConfirmResetSettingsModal;
