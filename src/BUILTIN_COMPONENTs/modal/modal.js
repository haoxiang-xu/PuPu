import { useState, useEffect, useRef, useContext } from "react";
import ReactDOM from "react-dom";
import Icon from "../icon/icon";
import { ConfigContext } from "../../CONTAINERs/config/context";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Modal — base component                                                                                                     */
/*                                                                                                                              */
/*  Props:                                                                                                                      */
/*    open        — boolean, controls visibility                                                                                */
/*    onClose     — callback fired when backdrop / ESC pressed                                                                  */
/*    style       — merged onto the panel div                                                                                   */
/*    overlayStyle — merged onto the backdrop                                                                                   */
/*    children    — whatever you put inside                                                                                     */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ANIM_DURATION = 260; // ms — matches CSS transition

const Modal = ({ open, onClose, style, overlayStyle, children }) => {
  const { theme } = useContext(ConfigContext);
  const mt = theme?.modal || {};

  /* ── mount / unmount with exit animation ─────────────── */
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // next tick → trigger enter animation
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setVisible(true)),
      );
    } else {
      setVisible(false);
      timerRef.current = setTimeout(() => setMounted(false), ANIM_DURATION);
    }
    return () => clearTimeout(timerRef.current);
  }, [open]);

  /* ── ESC to close ────────────────────────────────────── */
  useEffect(() => {
    if (!mounted) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mounted, onClose]);

  if (!mounted) return null;

  return ReactDOM.createPortal(
    <div
      aria-modal="true"
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        /* overlay */
        backgroundColor: mt.overlayColor || "rgba(0,0,0,0.35)",
        opacity: visible ? 1 : 0,
        transition: `opacity ${ANIM_DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`,
        ...overlayStyle,
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      {/* ── panel ───────────────────────────────────────── */}
      <div
        style={{
          position: "relative",
          backgroundColor: mt.backgroundColor || "#fff",
          borderRadius: mt.borderRadius ?? 14,
          boxShadow: mt.boxShadow || "0 24px 80px rgba(0,0,0,0.18)",
          border: mt.border || "none",
          padding: mt.padding ?? 24,
          minWidth: mt.minWidth ?? 360,
          maxWidth: mt.maxWidth ?? 480,
          width: "100%",
          boxSizing: "border-box",
          /* enter / exit animation */
          transform: visible ? "translateY(0)" : "translateY(8px)",
          opacity: visible ? 1 : 0,
          transition: [
            `transform ${ANIM_DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`,
            `opacity ${ANIM_DURATION}ms cubic-bezier(0.32, 0.72, 0, 1)`,
          ].join(", "),
          fontFamily: theme?.font?.fontFamily || "inherit",
          color: theme?.color || "#222",
          ...style,
        }}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ModalCloseButton — small × in top-right                                                                                    */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ModalCloseButton = ({ onClick }) => {
  const { theme } = useContext(ConfigContext);
  const mt = theme?.modal || {};
  const [hovered, setHovered] = useState(false);

  return (
    <button
      aria-label="Close"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: "absolute",
        top: 16,
        right: 16,
        width: 28,
        height: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        background: hovered
          ? mt.secondaryButtonBg || "rgba(0,0,0,0.06)"
          : "transparent",
        borderRadius: 7,
        cursor: "pointer",
        padding: 0,
        transition: "background 0.15s ease",
      }}
    >
      <Icon
        src="close"
        color={
          hovered
            ? mt.closeButtonHoverColor || "#222"
            : mt.closeButtonColor || "rgba(0,0,0,0.35)"
        }
        style={{ width: 16, height: 16 }}
      />
    </button>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ModalButton — reusable primary / secondary button                                                                          */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ModalButton = ({
  label,
  variant = "secondary",
  onClick,
  style: btnStyle,
  bg,
}) => {
  const { theme } = useContext(ConfigContext);
  const mt = theme?.modal || {};
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const isPrimary = variant === "primary";

  const baseBg = bg
    ? bg
    : isPrimary
      ? mt.primaryButtonBg || "#222"
      : mt.secondaryButtonBg || "rgba(0,0,0,0.06)";
  const baseColor = isPrimary
    ? mt.primaryButtonColor || "#fff"
    : mt.secondaryButtonColor || "#222";

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        flex: 1,
        height: 38,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        borderRadius: 7,
        cursor: "pointer",
        fontSize: mt.bodyFontSize || 14,
        fontWeight: 500,
        fontFamily: theme?.font?.fontFamily || "inherit",
        color: baseColor,
        backgroundColor: baseBg,
        opacity: pressed ? 0.75 : 1,
        transform: pressed
          ? "scale(0.97)"
          : hovered
            ? "scale(1.01)"
            : "scale(1)",
        transition:
          "transform 0.15s ease, opacity 0.12s ease, background-color 0.15s ease",
        padding: "0 16px",
        ...btnStyle,
      }}
    >
      {label}
    </button>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ConfirmModal                                                                                                               */
/*  Props: open, onClose, onConfirm, title, message, confirmLabel, cancelLabel                                                 */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ConfirmModal = ({
  open,
  onClose,
  onConfirm,
  title = "Confirm",
  message = "Are you sure you want to proceed?",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  style,
}) => {
  const { theme } = useContext(ConfigContext);
  const mt = theme?.modal || {};

  return (
    <Modal open={open} onClose={onClose} style={style}>
      <ModalCloseButton onClick={onClose} />

      {/* title */}
      <div
        style={{
          fontSize: mt.titleFontSize || 18,
          fontWeight: mt.titleFontWeight || 600,
          marginBottom: 8,
          paddingRight: 32,
        }}
      >
        {title}
      </div>

      {/* body */}
      <div
        style={{
          fontSize: mt.bodyFontSize || 14,
          color: mt.bodyColor || "rgba(0,0,0,0.6)",
          lineHeight: 1.55,
          marginBottom: 24,
        }}
      >
        {message}
      </div>

      {/* buttons */}
      <div style={{ display: "flex", gap: 10 }}>
        <ModalButton
          label={cancelLabel}
          variant="secondary"
          onClick={onClose}
        />
        <ModalButton
          label={confirmLabel}
          variant="primary"
          onClick={() => {
            onConfirm?.();
            onClose?.();
          }}
        />
      </div>
    </Modal>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ErrorModal                                                                                                                 */
/*  Props: open, onClose, title, message, closeLabel                                                                           */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ErrorModal = ({
  open,
  onClose,
  title = "Error",
  message = "Something went wrong. Please try again.",
  closeLabel = "Dismiss",
  style,
}) => {
  const { theme } = useContext(ConfigContext);
  const mt = theme?.modal || {};

  return (
    <Modal open={open} onClose={onClose} style={style}>
      <ModalCloseButton onClick={onClose} />

      {/* icon + title */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 8,
          paddingRight: 32,
        }}
      >
        {/* red dot accent */}
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: mt.errorAccent || "#E5484D",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: mt.titleFontSize || 18,
            fontWeight: mt.titleFontWeight || 600,
          }}
        >
          {title}
        </span>
      </div>

      {/* body */}
      <div
        style={{
          fontSize: mt.bodyFontSize || 14,
          color: mt.bodyColor || "rgba(0,0,0,0.6)",
          lineHeight: 1.55,
          marginBottom: 24,
        }}
      >
        {message}
      </div>

      {/* button */}
      <div style={{ display: "flex", gap: 10 }}>
        <ModalButton
          label={closeLabel}
          variant="primary"
          bg={mt.errorAccent || "#E5484D"}
          onClick={onClose}
          style={{ color: "#000000" }}
        />
      </div>
    </Modal>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  AgreementModal                                                                                                             */
/*  Props: open, onClose, onAgree, title, message, agreeLabel, declineLabel                                                    */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const AgreementModal = ({
  open,
  onClose,
  onAgree,
  title = "Terms & Conditions",
  message = "By continuing, you agree to our Terms of Service and Privacy Policy.",
  agreeLabel = "I Agree",
  declineLabel = "Decline",
  style,
}) => {
  const { theme } = useContext(ConfigContext);
  const mt = theme?.modal || {};

  return (
    <Modal open={open} onClose={onClose} style={style}>
      <ModalCloseButton onClick={onClose} />

      {/* title */}
      <div
        style={{
          fontSize: mt.titleFontSize || 18,
          fontWeight: mt.titleFontWeight || 600,
          marginBottom: 8,
          paddingRight: 32,
        }}
      >
        {title}
      </div>

      {/* body */}
      <div
        style={{
          fontSize: mt.bodyFontSize || 14,
          color: mt.bodyColor || "rgba(0,0,0,0.6)",
          lineHeight: 1.55,
          marginBottom: 24,
        }}
      >
        {message}
      </div>

      {/* buttons */}
      <div style={{ display: "flex", gap: 10 }}>
        <ModalButton
          label={declineLabel}
          variant="secondary"
          onClick={onClose}
        />
        <ModalButton
          label={agreeLabel}
          variant="primary"
          bg={mt.successAccent || "#30A46C"}
          onClick={() => {
            onAgree?.();
            onClose?.();
          }}
          style={{ color: "#000000" }}
        />
      </div>
    </Modal>
  );
};

export default Modal;
export {
  Modal,
  ConfirmModal,
  ErrorModal,
  AgreementModal,
  ModalButton,
  ModalCloseButton,
};
