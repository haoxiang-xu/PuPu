import { useState, useContext } from "react";

/* { Contexts } -------------------------------------------------------------------------------------------------------------- */
import { ConfigContext } from "../../../CONTAINERs/config/context";
/* { Contexts } -------------------------------------------------------------------------------------------------------------- */

/* { Components } ------------------------------------------------------------------------------------------------------------ */
import {
  Modal,
  ConfirmModal,
  ErrorModal,
  AgreementModal,
} from "../../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
/* { Components } ------------------------------------------------------------------------------------------------------------ */

const ModalDemo = () => {
  const { theme } = useContext(ConfigContext);
  const color = theme?.color || "black";

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);

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
        Modal
      </span>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          alignItems: "center",
        }}
      >
        <Button label="Confirm Modal" onClick={() => setConfirmOpen(true)} />
        <Button label="Error Modal" onClick={() => setErrorOpen(true)} />
        <Button
          label="Agreement Modal"
          onClick={() => setAgreementOpen(true)}
        />
        <Button label="Custom Modal" onClick={() => setCustomOpen(true)} />
      </div>

      {/* ── Confirm ─────────────────────────────────────── */}
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete Item"
        message="This action cannot be undone. Are you sure you want to delete this item permanently?"
      />

      {/* ── Error ───────────────────────────────────────── */}
      <ErrorModal
        open={errorOpen}
        onClose={() => setErrorOpen(false)}
        title="Upload Failed"
        message="The file could not be uploaded. Please check your connection and try again."
      />

      {/* ── Agreement ───────────────────────────────────── */}
      <AgreementModal
        open={agreementOpen}
        onClose={() => setAgreementOpen(false)}
        title="Terms & Conditions"
        message="By continuing, you agree to our Terms of Service and Privacy Policy. Please read them carefully before proceeding."
      />

      {/* ── Custom (base Modal) ─────────────────────────── */}
      <Modal
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        style={{ textAlign: "center", padding: 32 }}
      >
        <div
          style={{
            fontSize: 48,
            marginBottom: 16,
          }}
        >
          🎉
        </div>
        <div
          style={{
            fontSize: theme?.modal?.titleFontSize || 18,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Custom Content
        </div>
        <div
          style={{
            fontSize: theme?.modal?.bodyFontSize || 14,
            color: theme?.modal?.bodyColor || "rgba(0,0,0,0.6)",
            lineHeight: 1.55,
            marginBottom: 24,
          }}
        >
          This is a base Modal — you can put anything inside.
        </div>
        <Button label="Close" onClick={() => setCustomOpen(false)} />
      </Modal>
    </div>
  );
};

export default ModalDemo;
