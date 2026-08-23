/**
 * secret_capture_modal — the Memory V2 P0 renderer secret gate's only UI.
 *
 * SECURITY CONTRACT (read before editing):
 * This component receives `gate` — the six-field public object from
 * useSecretCaptureGate — and NOTHING else about the message. There is no
 * prop, no state and no ref here that holds the message text or any matched
 * value, so there is no code path by which a credential can be painted,
 * copied, measured, or handed to a child. The detected credentials are
 * described to the user only by COUNT and by STATIC kind labels
 * ("GitHub token", "Password", ...) that come from frozen tables in
 * secret_capture.js.
 *
 * Consequently this modal renders NO preview, NO diff, NO masked echo of the
 * value. If a future change wants to show "the last 4 characters", that is a
 * security-review event, not a UI tweak.
 *
 * Interaction rules:
 *  - Close (X), ESC and backdrop click are all the SAME action as Cancel:
 *    nothing is stored, nothing is sent, the composer keeps its text.
 *  - Enter submits "Store securely and send" only. There is deliberately no
 *    keyboard shortcut that sends plaintext — that requires a real click.
 */

import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import { useModalLifecycle } from "../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import Input from "../../BUILTIN_COMPONENTs/input/input";
import { SECRET_GATE_PHASES } from "./hooks/use_secret_capture_gate";

const SCOPE_OPTIONS = [
  {
    value: "chat",
    title: "This chat only",
    hint: "Usable by runs in this conversation.",
  },
  {
    value: "user",
    title: "All chats",
    hint: "Usable by any conversation in this app.",
  },
];

const SecretCaptureModal = ({
  gate,
  onConfirmStore,
  onConfirmPlain,
  onCancel,
  onScopeChange,
}) => {
  const open = Boolean(gate);
  useModalLifecycle("secret-capture-modal", open);
  const { theme, isDark } = useContext(ConfigContext) || {};
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const titleFontFamily =
    theme?.font?.titleFontFamily || "NunitoSans, sans-serif";
  const borderRadius = theme?.modal?.borderRadius || 12;

  const titleColor = isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.82)";
  const textColor = isDark ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.72)";
  const mutedColor = isDark ? "rgba(255,255,255,0.38)" : "rgba(0,0,0,0.4)";
  const warnColor = isDark ? "#fdba74" : "#c2410c";
  const hairline = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)";

  /* Names are user-typed labels for the vault entries. A name is NOT the
     secret — it ships in the handle marker and the vault descriptor — so it
     may live in local state. It is seeded from the static kind label. */
  const [names, setNames] = useState([]);
  const firstInputRef = useRef(null);
  const requestId = gate?.requestId || "";
  const labels = useMemo(
    () => (Array.isArray(gate?.labels) ? gate.labels : []),
    [gate],
  );

  useEffect(() => {
    if (!requestId) {
      setNames([]);
      return;
    }
    setNames(labels.map((label) => label));
  }, [requestId, labels]);

  useEffect(() => {
    if (!requestId) return undefined;
    const timer = setTimeout(() => {
      firstInputRef.current?.focus?.();
      firstInputRef.current?.select?.();
    }, 60);
    return () => clearTimeout(timer);
  }, [requestId]);

  if (!open) return null;

  const isStoring = gate.phase === SECRET_GATE_PHASES.STORING;
  const scopeChoice = gate.scopeChoice === "user" ? "user" : "chat";
  const count = Number.isInteger(gate.candidateCount) ? gate.candidateCount : 0;

  const submitStore = () => {
    if (isStoring) return;
    onConfirmStore?.(names);
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      style={{
        width: 520,
        maxWidth: "92vw",
        maxHeight: "84vh",
        padding: 0,
        borderRadius,
        overflow: "hidden",
        color: "var(--pupu-text)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Button
        prefix_icon="close"
        ariaLabel="Cancel"
        onClick={onCancel}
        disabled={isStoring}
        style={{
          position: "absolute",
          top: 12,
          right: 12,
          paddingVertical: 6,
          paddingHorizontal: 6,
          borderRadius: 6,
          opacity: 0.45,
          zIndex: 2,
          content: {
            prefixIconWrap: {
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              lineHeight: 0,
            },
            icon: { width: 14, height: 14 },
          },
        }}
      />

      <div
        style={{
          padding: "24px 28px 14px",
          borderBottom: `1px solid ${hairline}`,
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            fontFamily: titleFontFamily,
            color: titleColor,
            paddingRight: 40,
          }}
        >
          {count === 1
            ? "A credential is in this message"
            : "Credentials are in this message"}
        </div>
        <div
          style={{
            fontSize: 12,
            fontFamily,
            color: mutedColor,
            lineHeight: 1.5,
            marginTop: 4,
            paddingRight: 40,
          }}
        >
          {count === 1
            ? "PuPu can store it encrypted and send a reference instead, so the value never reaches the model or your chat history."
            : `PuPu can store these ${count} values encrypted and send references instead, so they never reach the model or your chat history.`}
        </div>
      </div>

      <div
        className="scrollable"
        style={{ flex: 1, overflowY: "auto", padding: "16px 28px 4px" }}
      >
        {labels.map((label, index) => (
          <div
            key={`${requestId}-${index}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 0",
              borderBottom: `1px solid ${hairline}`,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontFamily,
                color: mutedColor,
                minWidth: 132,
              }}
            >
              {label}
            </div>
            <Input
              value={names[index] === undefined ? label : names[index]}
              set_value={(next) =>
                setNames((current) => {
                  const draft = [...current];
                  draft[index] = next;
                  return draft;
                })
              }
              input_ref={index === 0 ? firstInputRef : undefined}
              disabled={isStoring}
              placeholder="Name this secret"
              max_length={120}
              on_key_down={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitStore();
                }
              }}
              style={{
                flex: 1,
                fontSize: 12,
                fontFamily,
                borderRadius: 7,
                paddingVertical: 7,
                paddingHorizontal: 10,
              }}
            />
          </div>
        ))}
      </div>

      <div style={{ padding: "14px 28px 0" }}>
        <div
          style={{
            fontSize: 11.5,
            fontFamily,
            color: mutedColor,
            marginBottom: 8,
          }}
        >
          Where should this be usable?
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {SCOPE_OPTIONS.map((option) => {
            const active = scopeChoice === option.value;
            return (
              <Button
                key={option.value}
                label={option.title}
                title={option.hint}
                disabled={isStoring}
                onClick={() => onScopeChange?.(option.value)}
                style={{
                  flex: 1,
                  fontSize: 12,
                  fontFamily,
                  borderRadius: 8,
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  opacity: active ? 1 : 0.55,
                  fontWeight: active ? 600 : 450,
                }}
              />
            );
          })}
        </div>
      </div>

      <div
        style={{
          padding: "16px 28px 22px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Button
          label="Send as plain text"
          title="Send the message with the credential visible. Nothing is encrypted."
          disabled={isStoring}
          onClick={() => onConfirmPlain?.()}
          style={{
            fontSize: 11.5,
            fontFamily,
            borderRadius: 8,
            paddingVertical: 8,
            paddingHorizontal: 12,
            color: warnColor,
            opacity: 0.8,
          }}
        />
        <div style={{ flex: 1 }} />
        <Button
          label="Cancel"
          disabled={isStoring}
          onClick={onCancel}
          style={{
            fontSize: 12,
            fontFamily,
            borderRadius: 8,
            paddingVertical: 8,
            paddingHorizontal: 14,
            opacity: 0.65,
          }}
        />
        <Button
          label={isStoring ? "Storing…" : "Store securely and send"}
          disabled={isStoring}
          onClick={submitStore}
          style={{
            fontSize: 12,
            fontFamily,
            fontWeight: 600,
            borderRadius: 8,
            paddingVertical: 8,
            paddingHorizontal: 14,
            color: textColor,
          }}
        />
      </div>
    </Modal>
  );
};

export default SecretCaptureModal;
