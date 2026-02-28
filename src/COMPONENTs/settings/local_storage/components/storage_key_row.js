import { useState } from "react";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import { formatBytes } from "../utils/storage_metrics";
import ConfirmDeleteModal from "./confirm_delete_modal";
import ConfirmResetSettingsModal from "./confirm_reset_settings_modal";
import StorageBar from "./storage_bar";

const StorageKeyRow = ({
  entry,
  maxSize,
  isDark,
  onDelete,
  attachmentCount = null,
}) => {
  const [hovered, setHovered] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const ratio = maxSize > 0 ? entry.size / maxSize : 0;

  const isSettings = entry.key === "settings";
  const isChats = entry.key === "chats";

  return (
    <>
      {isSettings ? (
        <ConfirmResetSettingsModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            onDelete(entry.key);
          }}
          isDark={isDark}
        />
      ) : (
        <ConfirmDeleteModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            onDelete(entry.key);
          }}
          target={entry.key}
          isDark={isDark}
        />
      )}
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
          transition: "opacity 0.15s",
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            gap: 6,
            overflow: "hidden",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              color: isDark ? "rgba(255,255,255,0.75)" : "rgba(0,0,0,0.70)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flexShrink: 1,
            }}
            title={entry.key}
          >
            {entry.key}
          </span>
          {isChats && attachmentCount !== null && (
            <span
              style={{
                flexShrink: 0,
                fontSize: 10,
                padding: "1px 6px",
                borderRadius: 99,
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.07)"
                  : "rgba(0,0,0,0.06)",
                color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {attachmentCount} cached {attachmentCount === 1 ? "file" : "files"}
            </span>
          )}
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
              width: 52,
              textAlign: "right",
              color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)",
              fontVariantNumeric: "tabular-nums",
              letterSpacing: "0.2px",
            }}
          >
            {formatBytes(entry.size)}
          </span>
        </div>

        <div style={{ opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}>
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
              content: {
                icon: { width: 11, height: 11 },
              },
            }}
          />
        </div>
      </div>
    </>
  );
};

export default StorageKeyRow;
