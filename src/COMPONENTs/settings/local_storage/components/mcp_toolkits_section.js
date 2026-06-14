import { useCallback, useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../BUILTIN_COMPONENTs/input/input";
import Icon from "../../../../BUILTIN_COMPONENTs/icon/icon";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import api from "../../../../SERVICEs/api";
import { deleteMcpEntry } from "../../../../SERVICEs/mcp_install";
import { withMcpStoreIcon } from "../../../../SERVICEs/mcp_toolkit_store";
import { emitToolkitCatalogRefresh } from "../../../../SERVICEs/toolkit_catalog_refresh";
import { SettingsSection } from "../../appearance";
import { readWorkspaceRoot } from "../../runtime";
import ConfirmDeleteModal from "./confirm_delete_modal";

const statusKey = (status) => {
  if (status === "available") return "toolkit.store_status_available";
  if (status === "error") return "toolkit.store_status_error";
  return "toolkit.store_status_unknown";
};

const oauthStatusKey = (status) => {
  if (status === "connected") return "local_storage.mcp_auth_connected";
  if (status === "expired") return "local_storage.mcp_auth_expired";
  if (status === "error") return "local_storage.mcp_auth_error";
  return "local_storage.mcp_auth_missing";
};

const OAuthAppRow = ({
  app,
  isDark,
  fontFamily,
  onUpdate,
  onDelete,
}) => {
  const { t } = useTranslation();
  const textColor = isDark ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.72)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 0",
        borderBottom: `1px solid ${
          isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"
        }`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 12.5,
            fontFamily,
            fontWeight: 500,
            color: textColor,
          }}
        >
          {app.providerLabel || app.provider || app.toolkitId}
        </div>
        <div
          style={{
            fontSize: 11,
            fontFamily,
            color: mutedColor,
          }}
        >
          {app.configured
            ? `${t("local_storage.mcp_oauth_app_configured")} · ${app.clientIdPreview || ""}`
            : t("local_storage.mcp_oauth_app_missing")}
        </div>
      </div>
      <Button
        label={t("local_storage.mcp_oauth_app_update")}
        onClick={() => onUpdate(app)}
        style={{
          fontSize: 10.5,
          paddingVertical: 4,
          paddingHorizontal: 7,
          borderRadius: 5,
          opacity: 0.65,
        }}
      />
      <Button
        label={t("local_storage.mcp_oauth_app_delete")}
        onClick={() => onDelete(app)}
        style={{
          fontSize: 10.5,
          paddingVertical: 4,
          paddingHorizontal: 7,
          borderRadius: 5,
          opacity: 0.65,
        }}
      />
    </div>
  );
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

const McpToolkitRow = ({
  toolkit,
  isDark,
  fontFamily,
  onDelete,
  onRecheck,
  onUpdateSecrets,
  onReconnectOAuth,
  onDisconnectOAuth,
}) => {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);

  const textColor = isDark ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.72)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const status = toolkit.status || "unknown";
  const isOAuth = toolkit.authType === "oauth";
  const authStatus = toolkit.authStatus || "missing";
  const isError = status === "error";
  const tools = Array.isArray(toolkit.tools) ? toolkit.tools : [];
  const toolCount =
    typeof toolkit.toolCount === "number" ? toolkit.toolCount : tools.length;
  const iconName = toolkit.toolkitIcon?.type === "builtin"
    ? toolkit.toolkitIcon?.name || "mcp"
    : "mcp";
  const secretKeys = Array.isArray(toolkit.secretKeys)
    ? toolkit.secretKeys.filter(Boolean)
    : [];
  const secretStatus = Array.isArray(toolkit.secretStatus)
    ? toolkit.secretStatus
    : [];
  const requiresSecrets =
    Boolean(toolkit.requiresSecrets) ||
    secretKeys.length > 0 ||
    secretStatus.length > 0;
  const missingSecrets =
    secretStatus.some((secret) => secret && secret.configured === false) ||
    (isError &&
      secretKeys.some((key) => String(toolkit.lastError || "").includes(key)));

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
  if (requiresSecrets) {
    metaParts.push(
      t(
        missingSecrets
          ? "local_storage.mcp_secrets_missing"
          : "local_storage.mcp_secrets_configured",
      ),
    );
  }
  if (isOAuth) {
    metaParts.push(t(oauthStatusKey(authStatus)));
  }
  if (toolkit.requiresWorkspace && toolkit.workspaceRoot) {
    metaParts.push(`${t("local_storage.mcp_workspace")}: ${toolkit.workspaceRoot}`);
  } else if (toolkit.requiresWorkspace) {
    metaParts.push(t("local_storage.mcp_workspace_missing"));
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

      <div
        style={{
          opacity: hovered ? 1 : 0,
          transition: "opacity 0.15s",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {requiresSecrets && (
          <Button
            label={t("local_storage.mcp_update_secrets")}
            onClick={() => onUpdateSecrets(toolkit)}
            style={{
              fontSize: 10.5,
              paddingVertical: 4,
              paddingHorizontal: 7,
              borderRadius: 5,
              opacity: 0.65,
            }}
          />
        )}
        {isOAuth && (
          <>
            <Button
              label={t("local_storage.mcp_reconnect")}
              onClick={() => onReconnectOAuth(toolkit)}
              style={{
                fontSize: 10.5,
                paddingVertical: 4,
                paddingHorizontal: 7,
                borderRadius: 5,
                opacity: 0.65,
              }}
            />
            <Button
              label={t("local_storage.mcp_disconnect")}
              onClick={() => onDisconnectOAuth(toolkit)}
              style={{
                fontSize: 10.5,
                paddingVertical: 4,
                paddingHorizontal: 7,
                borderRadius: 5,
                opacity: 0.65,
              }}
            />
          </>
        )}
        <Button
          label={t("local_storage.mcp_recheck")}
          onClick={() => onRecheck(toolkit)}
          style={{
            fontSize: 10.5,
            paddingVertical: 4,
            paddingHorizontal: 7,
            borderRadius: 5,
            opacity: 0.65,
          }}
        />
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
  const [oauthApps, setOauthApps] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [secretTarget, setSecretTarget] = useState(null);
  const [secretValues, setSecretValues] = useState({});
  const [oauthAppTarget, setOauthAppTarget] = useState(null);
  const [oauthAppValues, setOauthAppValues] = useState({
    clientId: "",
    clientSecret: "",
  });

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const [payload, appsPayload] = await Promise.all([
        api.unchain.listMcpToolkits(),
        api.unchain.listMcpOAuthApps(),
      ]);
      setItems(
        Array.isArray(payload?.toolkits)
          ? payload.toolkits.map(withMcpStoreIcon)
          : [],
      );
      setOauthApps(Array.isArray(appsPayload?.apps) ? appsPayload.apps : []);
      setStatus("ready");
    } catch {
      setItems([]);
      setOauthApps([]);
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
      emitToolkitCatalogRefresh({ reason: "mcp_reload" });
    } catch {
      /* ignore — load() below surfaces final state */
    }
    load();
  }, [load]);

  const handleRecheck = useCallback(async (toolkit) => {
    if (!toolkit?.toolkitId) return;
    setStatus("loading");
    try {
      await api.unchain.checkMcpToolkitHealth(toolkit.toolkitId, {
        workspaceRoot: readWorkspaceRoot(),
      });
      emitToolkitCatalogRefresh({ reason: "mcp_health", toolkitId: toolkit.toolkitId });
    } catch {
      /* ignore — load() below surfaces final state */
    }
    load();
  }, [load]);

  const openSecretForm = useCallback((toolkit) => {
    setSecretTarget(toolkit);
    const next = {};
    const keys = Array.isArray(toolkit?.secretKeys) ? toolkit.secretKeys : [];
    for (const key of keys) {
      if (key) next[key] = "";
    }
    setSecretValues(next);
  }, []);

  const handleSaveSecrets = useCallback(async () => {
    const target = secretTarget;
    if (!target?.toolkitId) return;
    const secrets = {};
    for (const [key, value] of Object.entries(secretValues)) {
      const cleanValue = String(value || "").trim();
      if (key && cleanValue) secrets[key] = cleanValue;
    }
    setStatus("loading");
    try {
      await api.unchain.configureMcpToolkit(target.toolkitId, {
        workspaceRoot: readWorkspaceRoot(),
        secrets,
      });
      emitToolkitCatalogRefresh({ reason: "mcp_configure", toolkitId: target.toolkitId });
      setSecretTarget(null);
      setSecretValues({});
    } catch {
      /* ignore — load() below surfaces final state */
    }
    load();
  }, [secretTarget, secretValues, load]);

  const handleReconnectOAuth = useCallback(async (toolkit) => {
    const entryId = toolkit?.entryId || toolkit?.entry_id || toolkit?.toolkitId;
    if (!entryId) return;
    setStatus("loading");
    try {
      await api.unchain.startMcpOAuth(entryId);
      emitToolkitCatalogRefresh({ reason: "mcp_oauth_start", toolkitId: toolkit.toolkitId });
    } catch {
      /* ignore — load() below surfaces final state */
    }
    load();
  }, [load]);

  const handleDisconnectOAuth = useCallback(async (toolkit) => {
    if (!toolkit?.toolkitId) return;
    setStatus("loading");
    try {
      await api.unchain.disconnectMcpOAuth(toolkit.toolkitId);
      emitToolkitCatalogRefresh({ reason: "mcp_oauth_disconnect", toolkitId: toolkit.toolkitId });
    } catch {
      /* ignore — load() below surfaces final state */
    }
    load();
  }, [load]);

  const openOAuthAppForm = useCallback((app) => {
    setOauthAppTarget(app);
    setOauthAppValues({ clientId: "", clientSecret: "" });
  }, []);

  const handleSaveOAuthApp = useCallback(async () => {
    const target = oauthAppTarget;
    if (!target?.toolkitId) return;
    setStatus("loading");
    try {
      await api.unchain.configureMcpOAuthApp({
        toolkitId: target.toolkitId,
        clientId: String(oauthAppValues.clientId || "").trim(),
        clientSecret: String(oauthAppValues.clientSecret || "").trim(),
        scopes: Array.isArray(target.scopes) ? target.scopes : [],
      });
      emitToolkitCatalogRefresh({ reason: "mcp_oauth_app_configure", toolkitId: target.toolkitId });
      setOauthAppTarget(null);
      setOauthAppValues({ clientId: "", clientSecret: "" });
    } catch {
      /* ignore — load() below surfaces final state */
    }
    load();
  }, [oauthAppTarget, oauthAppValues, load]);

  const handleDeleteOAuthApp = useCallback(async (app) => {
    if (!app?.toolkitId) return;
    setStatus("loading");
    try {
      await api.unchain.deleteMcpOAuthApp(app.toolkitId);
      emitToolkitCatalogRefresh({ reason: "mcp_oauth_app_delete", toolkitId: app.toolkitId });
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
              onRecheck={handleRecheck}
              onUpdateSecrets={openSecretForm}
              onReconnectOAuth={handleReconnectOAuth}
              onDisconnectOAuth={handleDisconnectOAuth}
            />
          ))}
        </div>
      )}

      {oauthApps.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontSize: 11,
              fontFamily,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              color: mutedColor,
              marginBottom: 4,
            }}
          >
            {t("local_storage.mcp_oauth_apps")}
          </div>
          {oauthApps.map((app) => (
            <OAuthAppRow
              key={app.toolkitId}
              app={app}
              isDark={isDark}
              fontFamily={fontFamily}
              onUpdate={openOAuthAppForm}
              onDelete={handleDeleteOAuthApp}
            />
          ))}
        </div>
      )}

      {oauthAppTarget && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 8,
            backgroundColor: isDark
              ? "rgba(255,255,255,0.04)"
              : "rgba(0,0,0,0.035)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontFamily,
              fontWeight: 500,
              color: isDark ? "rgba(255,255,255,0.76)" : "rgba(0,0,0,0.72)",
            }}
          >
            {t("local_storage.mcp_oauth_app_update")}
          </div>
          <Input
            value={oauthAppValues.clientId}
            set_value={(value) =>
              setOauthAppValues((prev) => ({ ...prev, clientId: value }))
            }
            placeholder="client_id"
            style={{
              width: "100%",
              fontSize: 12,
              fontFamily,
              borderRadius: 7,
              paddingVertical: 7,
              paddingHorizontal: 10,
            }}
          />
          <Input
            type="password"
            value={oauthAppValues.clientSecret}
            set_value={(value) =>
              setOauthAppValues((prev) => ({ ...prev, clientSecret: value }))
            }
            placeholder="client_secret"
            style={{
              width: "100%",
              fontSize: 12,
              fontFamily,
              borderRadius: 7,
              paddingVertical: 7,
              paddingHorizontal: 10,
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <Button
              label={t("local_storage.mcp_cancel")}
              onClick={() => {
                setOauthAppTarget(null);
                setOauthAppValues({ clientId: "", clientSecret: "" });
              }}
              style={{
                fontSize: 11.5,
                paddingVertical: 5,
                paddingHorizontal: 10,
                borderRadius: 6,
                opacity: 0.6,
              }}
            />
            <Button
              label={t("local_storage.mcp_oauth_app_save")}
              onClick={handleSaveOAuthApp}
              style={{
                fontSize: 11.5,
                paddingVertical: 5,
                paddingHorizontal: 10,
                borderRadius: 6,
                opacity: 0.75,
              }}
            />
          </div>
        </div>
      )}

      {secretTarget && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            borderRadius: 8,
            backgroundColor: isDark
              ? "rgba(255,255,255,0.04)"
              : "rgba(0,0,0,0.035)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontFamily,
              fontWeight: 500,
              color: isDark ? "rgba(255,255,255,0.76)" : "rgba(0,0,0,0.72)",
            }}
          >
            {t("local_storage.mcp_update_secrets")}
          </div>
          {(Array.isArray(secretTarget.secretKeys) ? secretTarget.secretKeys : []).map((key) => (
            <Input
              key={key}
              type="password"
              value={secretValues[key] || ""}
              set_value={(value) =>
                setSecretValues((prev) => ({ ...prev, [key]: value }))
              }
              placeholder={key}
              style={{
                width: "100%",
                fontSize: 12,
                fontFamily,
                borderRadius: 7,
                color: isDark ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.72)",
                paddingVertical: 7,
                paddingHorizontal: 10,
              }}
            />
          ))}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <Button
              label={t("local_storage.mcp_cancel")}
              onClick={() => {
                setSecretTarget(null);
                setSecretValues({});
              }}
              style={{
                fontSize: 11.5,
                paddingVertical: 5,
                paddingHorizontal: 10,
                borderRadius: 6,
                opacity: 0.6,
              }}
            />
            <Button
              label={t("local_storage.mcp_save_secrets")}
              onClick={handleSaveSecrets}
              style={{
                fontSize: 11.5,
                paddingVertical: 5,
                paddingHorizontal: 10,
                borderRadius: 6,
                opacity: 0.75,
              }}
            />
          </div>
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
