import { useCallback, useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import Modal from "../../../../BUILTIN_COMPONENTs/modal/modal";
import { useModalLifecycle } from "../../../../BUILTIN_COMPONENTs/mini_react/use_modal_lifecycle";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import Input from "../../../../BUILTIN_COMPONENTs/input/input";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import api from "../../../../SERVICEs/api";
import { emitToolkitCatalogRefresh } from "../../../../SERVICEs/toolkit_catalog_refresh";

const buildRegistryPayload = ({ name, url, registryJson }) => ({
  ...(String(name || "").trim() ? { name: String(name || "").trim() } : {}),
  ...(String(url || "").trim()
    ? { url: String(url || "").trim() }
    : { registry: String(registryJson || "").trim() }),
});

const RegistrySourceRow = ({
  registry,
  isDark,
  fontFamily,
  onRefresh,
  onDelete,
}) => {
  const { t } = useTranslation();
  const textColor = isDark ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.72)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const canRefresh = registry.sourceType === "url";
  const riskCounts =
    registry.riskCounts && typeof registry.riskCounts === "object"
      ? registry.riskCounts
      : {};
  const riskMeta = ["low", "medium", "high", "critical"]
    .map((level) =>
      riskCounts[level]
        ? `${riskCounts[level]} ${t(`dev.mcp_registry_risk_${level}`)}`
        : "",
    )
    .filter(Boolean);
  const meta = [
    registry.sourceType || "inline",
    `${registry.entryCount || 0} ${t("dev.mcp_registry_entries")}`,
    registry.approvedCount
      ? `${registry.approvedCount} ${t("dev.mcp_registry_approved")}`
      : "",
    registry.staleApprovalCount
      ? `${registry.staleApprovalCount} ${t("dev.mcp_registry_stale")}`
      : "",
    ...riskMeta,
    registry.lastError ? t("dev.mcp_registry_error") : "",
  ]
    .filter(Boolean)
    .join(" / ");

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
          {registry.name || registry.registryId}
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
          {meta}
        </div>
      </div>
      {canRefresh && (
        <Button
          label={t("dev.mcp_registry_refresh")}
          onClick={() => onRefresh(registry)}
          style={{
            fontSize: 10.5,
            paddingVertical: 4,
            paddingHorizontal: 7,
            borderRadius: 5,
            opacity: 0.65,
          }}
        />
      )}
      <Button
        label={t("dev.mcp_registry_delete")}
        onClick={() => onDelete(registry)}
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

const McpRegistriesModal = ({ open, onClose, isDark }) => {
  useModalLifecycle("mcp-registries-modal", open);
  const context = useContext(ConfigContext) || {};
  const { t } = useTranslation();
  const fontFamily = context.theme?.font?.fontFamily || "Jost, sans-serif";

  const [sources, setSources] = useState([]);
  const [status, setStatus] = useState("loading");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [registryJson, setRegistryJson] = useState("");
  const [validation, setValidation] = useState(null);
  const [error, setError] = useState("");

  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const titleColor = isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.82)";
  const errorColor = isDark ? "#fdba74" : "#c2410c";
  const successColor = isDark ? "#86efac" : "#15803d";
  const hasSourceInput = Boolean(url.trim() || registryJson.trim());
  const busy =
    status === "loading" || status === "validating" || status === "importing";

  const loadSources = useCallback(async () => {
    setStatus("loading");
    try {
      const payload = await api.unchain.listMcpStoreRegistries();
      setSources(Array.isArray(payload?.registries) ? payload.registries : []);
      setError("");
      setStatus("ready");
    } catch (loadError) {
      setSources([]);
      setError(loadError?.code || "mcp_registry_load_failed");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    if (open) loadSources();
  }, [loadSources, open]);

  const currentPayload = useCallback(
    () => buildRegistryPayload({ name, url, registryJson }),
    [name, url, registryJson],
  );

  const handleValidate = useCallback(async () => {
    if (!hasSourceInput) return;
    setValidation(null);
    setError("");
    setStatus("validating");
    try {
      const result = await api.unchain.validateMcpStoreRegistry(currentPayload());
      setValidation(result && typeof result === "object" ? result : null);
      setStatus("ready");
    } catch (validateError) {
      setValidation({
        valid: false,
        diagnostics: [
          {
            code: validateError?.code || "mcp_registry_invalid",
            message: validateError?.message || "",
            path: "$",
            severity: "error",
          },
        ],
      });
      setStatus("ready");
    }
  }, [currentPayload, hasSourceInput]);

  const handleImport = useCallback(async () => {
    if (!hasSourceInput) return;
    setError("");
    setStatus("importing");
    try {
      await api.unchain.importMcpStoreRegistry(currentPayload());
      setName("");
      setUrl("");
      setRegistryJson("");
      setValidation(null);
      emitToolkitCatalogRefresh({ reason: "mcp_registry_import" });
      await loadSources();
    } catch (importError) {
      setError(importError?.code || "mcp_registry_import_failed");
      setStatus("ready");
    }
  }, [currentPayload, hasSourceInput, loadSources]);

  const handleRefresh = useCallback(
    async (registry) => {
      if (!registry?.registryId) return;
      setStatus("loading");
      try {
        await api.unchain.refreshMcpStoreRegistry(registry.registryId);
        emitToolkitCatalogRefresh({
          reason: "mcp_registry_refresh",
          registryId: registry.registryId,
        });
      } catch {
        /* loadSources below surfaces final source state */
      }
      loadSources();
    },
    [loadSources],
  );

  const handleDelete = useCallback(
    async (registry) => {
      if (!registry?.registryId) return;
      setStatus("loading");
      try {
        await api.unchain.deleteMcpStoreRegistry(registry.registryId);
        emitToolkitCatalogRefresh({
          reason: "mcp_registry_delete",
          registryId: registry.registryId,
        });
      } catch {
        /* loadSources below surfaces final source state */
      }
      loadSources();
    },
    [loadSources],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        width: 760,
        maxWidth: "92vw",
        height: 600,
        maxHeight: "84vh",
        padding: 0,
        overflow: "hidden",
        backgroundColor: isDark ? "#141414" : "#ffffff",
        color: isDark ? "#fff" : "#222",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Button
        prefix_icon="close"
        onClick={onClose}
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
          borderBottom: `1px solid ${
            isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"
          }`,
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 600,
            fontFamily: "NunitoSans, sans-serif",
            color: titleColor,
            paddingRight: 40,
          }}
        >
          {t("dev.mcp_registries")}
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
          {t("dev.mcp_registry_desc")}
        </div>
      </div>

      <div
        className="scrollable"
        data-sb-persist
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          padding: "14px 28px 24px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            paddingBottom: 12,
          }}
        >
          <Input
            value={name}
            set_value={setName}
            placeholder={t("dev.mcp_registry_name_placeholder")}
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
            value={url}
            set_value={setUrl}
            placeholder={t("dev.mcp_registry_url_placeholder")}
            style={{
              width: "100%",
              fontSize: 12,
              fontFamily,
              borderRadius: 7,
              paddingVertical: 7,
              paddingHorizontal: 10,
            }}
          />
          <textarea
            value={registryJson}
            onChange={(event) => setRegistryJson(event.target.value)}
            placeholder={t("dev.mcp_registry_json_placeholder")}
            style={{
              width: "100%",
              minHeight: 84,
              resize: "vertical",
              boxSizing: "border-box",
              borderRadius: 7,
              border: `1px solid ${
                isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"
              }`,
              background: isDark ? "rgba(255,255,255,0.04)" : "#fff",
              color: isDark ? "#fff" : "#222",
              fontSize: 12,
              fontFamily,
              padding: "8px 10px",
              outline: "none",
            }}
          />
          {validation && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontSize: 10.5,
                fontFamily,
                color: validation.valid ? successColor : errorColor,
              }}
            >
              {validation.valid ? (
                <span>
                  {t("dev.mcp_registry_valid")} {validation.count || 0}
                </span>
              ) : (
                (validation.diagnostics || []).map((diagnostic, index) => (
                  <span key={`${diagnostic.code}-${diagnostic.path}-${index}`}>
                    {[diagnostic.code, diagnostic.path, diagnostic.entryId]
                      .filter(Boolean)
                      .join(" / ")}
                  </span>
                ))
              )}
            </div>
          )}
          {error && (
            <div
              style={{
                fontSize: 10.5,
                fontFamily,
                color: errorColor,
              }}
            >
              {error}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <Button
              label={t("dev.mcp_registry_validate")}
              disabled={!hasSourceInput || busy}
              onClick={handleValidate}
              style={{
                fontSize: 11.5,
                paddingVertical: 5,
                paddingHorizontal: 10,
                borderRadius: 6,
                opacity: !hasSourceInput || busy ? 0.45 : 0.75,
              }}
            />
            <Button
              label={t("dev.mcp_registry_import")}
              disabled={!hasSourceInput || busy}
              onClick={handleImport}
              style={{
                fontSize: 11.5,
                paddingVertical: 5,
                paddingHorizontal: 10,
                borderRadius: 6,
                opacity: !hasSourceInput || busy ? 0.45 : 0.75,
              }}
            />
          </div>
        </div>

        <div style={{ marginTop: 6 }}>
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
            {t("dev.mcp_registry_sources")}
          </div>
          {sources.length > 0 ? (
            sources.map((registry) => (
              <RegistrySourceRow
                key={registry.registryId}
                registry={registry}
                isDark={isDark}
                fontFamily={fontFamily}
                onRefresh={handleRefresh}
                onDelete={handleDelete}
              />
            ))
          ) : (
            <div
              style={{
                textAlign: "center",
                padding: "18px 0",
                fontSize: 12,
                fontFamily,
                color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)",
              }}
            >
              {t("dev.mcp_registry_no_sources")}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default McpRegistriesModal;
