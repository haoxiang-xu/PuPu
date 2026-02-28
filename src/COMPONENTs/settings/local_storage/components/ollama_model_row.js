import { useState } from "react";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import { deleteOllamaModel } from "../utils/ollama_models";
import { formatBytes } from "../utils/storage_metrics";
import ConfirmDeleteModal from "./confirm_delete_modal";
import StorageBar from "./storage_bar";

const OllamaModelRow = ({ model, maxSize, isDark, onDelete }) => {
  const [hovered, setHovered] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const ratio = maxSize > 0 ? model.size / maxSize : 0;

  const handleConfirmedDelete = async () => {
    setConfirmOpen(false);
    setDeleting(true);
    try {
      await deleteOllamaModel(model.name);
      onDelete(model.name);
    } catch {
      setDeleting(false);
    }
  };

  return (
    <>
      <ConfirmDeleteModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmedDelete}
        target={model.name}
        isDark={isDark}
      />
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "9px 0",
          borderBottom: `1px solid ${
            isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"
          }`,
          opacity: deleting ? 0.4 : 1,
          transition: "opacity 0.2s",
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12,
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            color: isDark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.70)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={model.name}
        >
          {model.name}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <StorageBar ratio={ratio} isDark={isDark} />
          <span
            style={{
              fontSize: 11,
              width: 60,
              textAlign: "right",
              color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "0.2px",
            }}
          >
            {formatBytes(model.size)}
          </span>
        </div>

        <div
          style={{
            opacity: hovered && !deleting ? 1 : 0,
            transition: "opacity 0.15s",
          }}
        >
          <Button
            prefix_icon="delete"
            onClick={() => setConfirmOpen(true)}
            style={{
              paddingVertical: 4,
              paddingHorizontal: 4,
              borderRadius: 5,
              opacity: 0.55,
              hoverBackgroundColor: isDark
                ? "rgba(255,80,80,0.15)"
                : "rgba(220,50,50,0.10)",
              content: { icon: { width: 11, height: 11 } },
            }}
          />
        </div>
      </div>
    </>
  );
};

export default OllamaModelRow;
