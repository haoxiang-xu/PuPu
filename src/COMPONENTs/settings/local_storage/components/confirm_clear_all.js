import Button from "../../../../BUILTIN_COMPONENTs/input/button";

const ConfirmClearAll = ({
  isDark,
  onConfirm,
  onCancel,
  label = "Clear all?",
}) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "6px 10px",
      borderRadius: 8,
      backgroundColor: isDark ? "rgba(220,50,50,0.12)" : "rgba(220,50,50,0.07)",
      border: `1px solid ${
        isDark ? "rgba(220,50,50,0.25)" : "rgba(220,50,50,0.18)"
      }`,
    }}
  >
    <span
      style={{
        flex: 1,
        fontSize: 12,
        color: isDark ? "rgba(255,120,120,0.9)" : "rgba(180,40,40,0.9)",
      }}
    >
      {label}
    </span>
    <Button
      label="Cancel"
      onClick={onCancel}
      style={{
        fontSize: 12,
        paddingVertical: 3,
        paddingHorizontal: 10,
        borderRadius: 5,
        opacity: 0.7,
      }}
    />
    <Button
      label="Clear"
      onClick={onConfirm}
      style={{
        fontSize: 12,
        paddingVertical: 3,
        paddingHorizontal: 10,
        borderRadius: 5,
        backgroundColor: isDark
          ? "rgba(220,50,50,0.45)"
          : "rgba(220,50,50,0.15)",
        hoverBackgroundColor: isDark
          ? "rgba(220,50,50,0.6)"
          : "rgba(220,50,50,0.25)",
        color: isDark ? "rgba(255,140,140,1)" : "rgba(180,40,40,1)",
      }}
    />
  </div>
);

export default ConfirmClearAll;
