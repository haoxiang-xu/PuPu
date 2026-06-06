import { useCallback, useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../../../BUILTIN_COMPONENTs/icon/icon";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import api from "../../../../SERVICEs/api";
import { deleteMcpEntry } from "../../../../SERVICEs/mcp_install";
import { SettingsSection } from "../../appearance";
import { readWorkspaceRoot } from "../../runtime";
import ConfirmDeleteModal from "./confirm_delete_modal";

const FILESYSTEM_ID = "mcp.workspace.filesystem";

const statusKey = (status) => {
  if (status === "available") return "toolkit.store_status_available";
  if (status === "error") return "toolkit.store_status_error";
  return "toolkit.store_status_unknown";
};

/* "checked just now" / "checked 3m ago"; null when there is no timestamp. */
const formatLastChecked = (t, lastCheckedAt) => {
  if (!lastCheckedAt) return null;
  const ts =
    typeof lastCheckedAt === "number"
      ? lastCheckedAt
      : Date.parse(lastCheckedAt);
  if (!ts || Number.isNaN(ts)) return null;
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  let rel;
  if (sec < 45) rel = "just now";
  else if (sec < 3600) rel = `${Math.max(1, Math.round(sec / 60))}m ago`;
  else if (sec < 86400) rel = `${Math.round(sec / 3600)}h ago`;
  else rel = `${Math.round(sec / 86400)}d ago`;
  return `${t("local_storage.mcp_last_checked")} ${rel}`;
};

const McpToolkitRow = ({ toolkit, isDark, fontFamily, onDelete }) => {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);

  const textColor = isDark ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.72)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const status = toolkit.status || "unknown";
  const isError = status === "error";
  const tools = Array.isArray(toolkit.tools) ? toolkit.tools : [];
  const toolCount =
    typeof toolkit.toolCount === "number" ? toolkit.toolCount : tools.length;
  const iconName = toolkit.toolkitIcon?.name || "server";

  const statusColor = isError
    ? isDark
      ? "rgba(255,180,60,0.9)"
      : "rgba(160,90,0,0.9)"
    : status === "available"
      ? "#10b981"
      : mutedColor;
  const statusBg = isError
    ? isDark
      ? "rgba(255,160,0,0.12)"
      : "rgba(200,120,0,0.08)"
    : isDark
      ? "rgba(255,255,255,0.06)"
      : "rgba(0,0,0,0.05)";

  const metaParts = [
    `${toolCount} ${t("local_storage.mcp_tools_count")}`,
  ];
  if (toolkit.toolkitId === FILESYSTEM_ID && toolkit.workspaceRoot) {
    metaParts.push(`${t("local_storage.mcp_workspace")}: ${toolkit.workspaceRoot}`);
  }
  const lastChecked = formatLastChecked(t, toolkit.lastCheckedAt);
  if (lastChecked) {
    metaParts.push(lastChecked);
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "9px 0",
        borderBottom: `1px solid ${
          isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"
        }`,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: isDark
            ? "rgba(255,255,255,0.05)"
            : "rgba(0,0,0,0.04)",
        }}
      >
        <Icon
          src={iconName}
          style={{ width: 15, height: 15 }}
          color={isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)"}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 12.5,
              fontFamily,
              fontWeight: 500,
              color: textColor,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {toolkit.toolkitName || toolkit.toolkitId}
          </span>
          <span
            style={{
              fontSize: 10,
              fontFamily,
              fontWeight: 500,
              padding: "1px 7px",
              borderRadius: 999,
              backgroundColor: statusBg,
              color: statusColor,
              lineHeight: 1.7,
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {t(statusKey(status))}
          </span>
        </div>
        <div
          style={{
            fontSize: 11,
            fontFamily,
            color: mutedColor,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {metaParts.join(" · ")}
        </div>
        {toolkit.lastError && (
          <div
            style={{
              fontSize: 10.5,
              fontFamily,
              color: isDark ? "rgba(255,140,140,0.85)" : "rgba(200,40,40,0.85)",
              lineHeight: 1.4,
              marginTop: 2,
              wordBreak: "break-word",
            }}
          >
            {toolkit.lastError}
          </div>
        )}
      </div>

      <div style={{ opacity: hovered ? 1 : 0, transition: "opacity 0.15s" }}>
        <Button
          prefix_icon="delete"
          onClick={() => onDelete(toolkit)}
          style={{
            paddingVertical: 4,
            paddingHorizontal: 4,
            borderRadius: 5,
            opacity: 0.6,
            color: "#E5484D",
            hoverBackgroundColor: isDark
              ? "rgba(229,72,77,0.14)"
              : "rgba(229,72,77,0.10)",
            content: { icon: { width: 14, height: 14 } },
          }}
        />
      </div>
    </div>
  );
};

const McpToolkitsSection = ({ isDark }) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  const [status, setStatus] = useState("loading");
  const [items, setItems] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const payload = await api.unchain.listMcpToolkits();
      setItems(Array.isArray(payload?.toolkits) ? payload.toolkits : []);
      setStatus("ready");
    } catch {
      setItems([]);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleReloadAll = useCallback(async () => {
    setStatus("loading");
    try {
      await api.unchain.reloadMcpToolkits({
        workspaceRoot: readWorkspaceRoot(),
      });
    } catch {
      /* ignore — load() below surfaces final state */
    }
    load();
  }, [load]);

  const handleConfirmDelete = useCallback(async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    try {
      await deleteMcpEntry(target.toolkitId);
    } catch {
      /* ignore */
    }
    load();
  }, [deleteTarget, load]);

  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const countPill = (
    <span
      style={{
        fontSize: 11,
        fontFamily,
        fontWeight: 500,
        padding: "1px 8px",
        borderRadius: 999,
        border: `1px solid ${
          isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"
        }`,
        backgroundColor: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.05)",
        color: mutedColor,
        whiteSpace: "nowrap",
      }}
    >
      {items.length} {t("local_storage.section_mcp")}
    </span>
  );

  return (
    <SettingsSection title={t("local_storage.section_mcp")}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 0 6px",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {status === "ready" && items.length > 0 && countPill}
        </div>
        <Button
          label={t("local_storage.mcp_reload_all")}
          onClick={handleReloadAll}
          style={{
            fontSize: 12,
            paddingVertical: 5,
            paddingHorizontal: 10,
            borderRadius: 6,
            opacity: 0.45,
          }}
        />
      </div>

      {status === "ready" && items.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "28px 0",
            fontSize: 13,
            fontFamily,
            color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)",
          }}
        >
          {t("local_storage.mcp_no_installed")}
        </div>
      ) : (
        <div>
          {items.map((toolkit) => (
            <McpToolkitRow
              key={toolkit.toolkitId}
              toolkit={toolkit}
              isDark={isDark}
              fontFamily={fontFamily}
              onDelete={(tk) => setDeleteTarget(tk)}
            />
          ))}
        </div>
      )}

      <ConfirmDeleteModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        target={deleteTarget?.toolkitName || deleteTarget?.toolkitId}
        isDark={isDark}
      />
    </SettingsSection>
  );
};

export default McpToolkitsSection;
