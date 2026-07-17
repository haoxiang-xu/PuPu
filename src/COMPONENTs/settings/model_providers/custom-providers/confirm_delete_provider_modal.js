import Modal from "../../../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";

/**
 * Confirmation modal for deleting a custom provider. The body carries the
 * design's mandatory warning that resuming historical conversations that used
 * this provider will fail (§6.1 / FM12), plus a note that the stored key is
 * removed with it (removeCustomProvider does the linked delete).
 */
const ConfirmDeleteProviderModal = ({
  open,
  onClose,
  onConfirm,
  displayName,
  isDark,
}) => {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        width: 380,
        padding: "28px 28px 20px",
        backgroundColor: "var(--pupu-background)",
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
            ? "rgba(220,50,50,0.15)"
            : "rgba(220,50,50,0.09)",
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
            d="M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z"
            fill={isDark ? "rgba(255,100,100,0.85)" : "rgba(200,40,40,0.85)"}
          />
        </svg>
      </div>

      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: isDark
            ? "rgba(var(--pupu-text-rgb),0.90)"
            : "rgba(var(--pupu-text-rgb),0.85)",
          marginBottom: 8,
          lineHeight: 1.3,
        }}
      >
        {t("model_providers.custom.delete_title", { name: displayName })}
      </div>

      <div
        style={{
          fontSize: 13,
          color: "rgba(var(--pupu-text-rgb),0.55)",
          marginBottom: 10,
          lineHeight: 1.5,
        }}
      >
        {t("model_providers.custom.delete_desc")}
      </div>

      <div
        style={{
          fontSize: 12,
          color: isDark ? "rgba(253,186,116,0.9)" : "rgba(194,65,12,0.95)",
          marginBottom: 24,
          lineHeight: 1.5,
        }}
      >
        {t("model_providers.custom.delete_resume_warning")}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Button
          label={t("common.cancel")}
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
          label={t("common.delete")}
          onClick={onConfirm}
          style={{
            fontSize: 13,
            paddingVertical: 7,
            paddingHorizontal: 16,
            borderRadius: 7,
            backgroundColor: isDark
              ? "rgba(220,50,50,0.40)"
              : "rgba(220,50,50,0.12)",
            hoverBackgroundColor: isDark
              ? "rgba(220,50,50,0.58)"
              : "rgba(220,50,50,0.22)",
            color: isDark ? "rgba(255,140,140,1)" : "rgba(180,30,30,1)",
          }}
        />
      </div>
    </Modal>
  );
};

export default ConfirmDeleteProviderModal;
