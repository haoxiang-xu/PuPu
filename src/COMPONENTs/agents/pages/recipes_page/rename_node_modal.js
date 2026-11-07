import React, { useEffect, useRef, useState } from "react";
import Modal from "../../../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../BUILTIN_COMPONENTs/input/input";
import { is_valid_node_label } from "./node_display_labels";

export default function RenameNodeModal({ initialValue, onConfirm, onClose, disabledReason, isDark }) {
  const [value, setValue] = useState(initialValue);
  const [problem, setProblem] = useState(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => {
    /* Input mounts inside Modal's portal on its next render. */
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const escape = (event) => {
      if (event.key !== "Escape") return;
      const hosts = document.querySelectorAll("[data-pupu-modal-overlay-host]");
      const top = hosts[hosts.length - 1];
      if (!top?.contains(panelRef.current)) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); onClose();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [onClose]);
  const confirm = () => {
    if (disabledReason) return;
    if (!is_valid_node_label(value)) { setProblem("Node label must be non-blank."); return; }
    const result = onConfirm(value);
    if (result?.ok === false) setProblem(result.problem?.message || "This rename was refused.");
  };
  return <Modal open onClose={onClose} ariaLabel="Rename node" style={{
    width: 380, maxWidth: "calc(100vw - 32px)", minWidth: 0, padding: 24,
    backgroundColor: "var(--pupu-background)", color: isDark ? "#f0f0f3" : "#1d1d22",
  }}>
    <div ref={panelRef}>
      <Button prefix_icon="close" ariaLabel="Close Rename" onClick={onClose} style={{
        position: "absolute", top: 12, right: 12, paddingVertical: 6, paddingHorizontal: 6,
        borderRadius: 6, opacity: 0.45, zIndex: 2,
        content: { prefixIconWrap: { display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 0 }, icon: { width: 14, height: 14 } },
      }} />
      <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "NunitoSans, sans-serif", marginBottom: 20 }}>Rename node</div>
      <label>
        <span style={{ display: "block", fontSize: 12, marginBottom: 6 }}>Node name</span>
        <Input placeholder="Node name" value={value} input_ref={inputRef} set_value={(next) => { setValue(next); setProblem(null); }}
          on_key_down={(event) => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); confirm(); } }}
          style={{ width: "100%", boxSizing: "border-box", fontSize: 14 }} />
      </label>
      {(problem || disabledReason) && <div role="alert" style={{ marginTop: 10, fontSize: 12, color: isDark ? "#ff9999" : "#b52c2c" }}>{problem || disabledReason}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
        <Button label="Cancel" onClick={onClose} />
        <Button label="Rename" disabled={!!disabledReason} onClick={confirm} />
      </div>
    </div>
  </Modal>;
}
