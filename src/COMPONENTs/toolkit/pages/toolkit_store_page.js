import { useContext, useMemo, useState } from "react";
import { Input } from "../../../BUILTIN_COMPONENTs/input/input";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import {
  listMcpStoreEntries,
  searchMcpStoreEntries,
} from "../../../SERVICEs/mcp_toolkit_store";
import { STORE_CATEGORY_CONFIG } from "../constants";
import PlaceholderBlock from "../components/placeholder_block";
import StoreToolkitCard from "../components/store_toolkit_card";

const ToolkitStorePage = ({
  isDark,
  onEntryClick,
  installedIds,
  onInstall,
  installingId,
  installError,
  metadataRefreshing = false,
  metadataError = null,
  onRefreshMetadata,
  registryImporting = false,
  registryError = null,
  onImportRegistry,
  onValidateRegistry,
}) => {
  const context = useContext(ConfigContext) || {};
  const { t } = useTranslation();
  const fontFamily = context.theme?.font?.fontFamily || "Jost, sans-serif";
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [showImport, setShowImport] = useState(false);
  const [registryUrl, setRegistryUrl] = useState("");
  const [registryName, setRegistryName] = useState("");
  const [registryJson, setRegistryJson] = useState("");
  const [registryValidating, setRegistryValidating] = useState(false);
  const [registryValidation, setRegistryValidation] = useState(null);

  const categorySections = useMemo(
    () =>
      STORE_CATEGORY_CONFIG.map((item) => ({
        ...item,
        label: t(item.labelKey),
      })),
    [t],
  );

  const entries = listMcpStoreEntries();
  const filtered = useMemo(
    () => searchMcpStoreEntries(entries, search, category),
    [entries, search, category],
  );

  /* Category pill group — mirrors the Ollama model library browser
     (settings → model providers): flat wrap-able pills, active pill gets a
     filled background + 1px border, inactive pills are transparent. */
  const pillActiveBg = isDark ? "rgba(255,255,255,0.11)" : "rgba(0,0,0,0.08)";
  const pillHoverBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const pillActiveTxt = isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)";
  const pillInactiveTxt = isDark
    ? "rgba(255,255,255,0.45)"
    : "rgba(0,0,0,0.42)";
  const activePillBorder = isDark
    ? "rgba(255,255,255,0.15)"
    : "rgba(0,0,0,0.15)";
  const importDisabled =
    registryImporting || (!registryUrl.trim() && !registryJson.trim());
  const validateDisabled =
    registryValidating || (!registryUrl.trim() && !registryJson.trim());
  const buildRegistryPayload = () => ({
    ...(registryName.trim() ? { name: registryName.trim() } : {}),
    ...(registryUrl.trim()
      ? { url: registryUrl.trim() }
      : { registry: registryJson.trim() }),
  });
  const handleValidate = async () => {
    if (validateDisabled || !onValidateRegistry) return;
    setRegistryValidation(null);
    setRegistryValidating(true);
    try {
      const result = await onValidateRegistry(buildRegistryPayload());
      setRegistryValidation(result && typeof result === "object" ? result : null);
    } catch (error) {
      setRegistryValidation({
        valid: false,
        diagnostics: [
          {
            code: error?.code || "mcp_registry_invalid",
            message: error?.message || "",
            path: "$",
            severity: "error",
          },
        ],
      });
    } finally {
      setRegistryValidating(false);
    }
  };
  const handleImport = async () => {
    if (importDisabled || !onImportRegistry) return;
    const payload = buildRegistryPayload();
    try {
      await onImportRegistry(payload);
      setRegistryUrl("");
      setRegistryName("");
      setRegistryJson("");
      setRegistryValidation(null);
      setShowImport(false);
    } catch {
      /* parent renders stable error */
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Input
        prefix_icon="search"
        value={search}
        set_value={(value) => setSearch(value)}
        placeholder={t("toolkit.store_search_placeholder")}
        style={{
          width: "100%",
          fontSize: 13,
          fontFamily,
          borderRadius: 7,
          color: isDark ? "#fff" : "#222",
          paddingVertical: 7,
          paddingHorizontal: 10,
        }}
      />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {categorySections.map((cat) => {
          const active = category === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              style={{
                fontSize: 11,
                fontFamily,
                fontWeight: 500,
                padding: "3px 10px",
                borderRadius: 999,
                border: `1px solid ${
                  active ? activePillBorder : "transparent"
                }`,
                backgroundColor: active ? pillActiveBg : "transparent",
                color: active ? pillActiveTxt : pillInactiveTxt,
                cursor: "pointer",
                outline: "none",
                transition: "background 0.12s, color 0.12s",
              }}
              onMouseEnter={(e) => {
                if (!active)
                  e.currentTarget.style.backgroundColor = pillHoverBg;
              }}
              onMouseLeave={(e) => {
                if (!active)
                  e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              {cat.label}
            </button>
          );
        })}
        <Button
          label={
            metadataRefreshing
              ? t("toolkit.store_refreshing_metadata")
              : t("toolkit.store_refresh_metadata")
          }
          disabled={metadataRefreshing}
          onClick={onRefreshMetadata}
          style={{
            fontSize: 11,
            fontFamily,
            fontWeight: 500,
            paddingVertical: 3,
            paddingHorizontal: 10,
            borderRadius: 999,
            color: isDark ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.58)",
            root: {
              background: isDark
                ? "rgba(255,255,255,0.05)"
                : "rgba(0,0,0,0.035)",
              border: `1px solid ${
                isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"
              }`,
            },
            state: {
              disabled: {
                root: { opacity: 0.55, cursor: "not-allowed" },
                background: {},
              },
            },
          }}
        />
        <Button
          label={t("toolkit.store_import_registry")}
          onClick={() => setShowImport((value) => !value)}
          style={{
            fontSize: 11,
            fontFamily,
            fontWeight: 500,
            paddingVertical: 3,
            paddingHorizontal: 10,
            borderRadius: 999,
            color: isDark ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.58)",
            root: {
              background: isDark
                ? "rgba(255,255,255,0.05)"
                : "rgba(0,0,0,0.035)",
              border: `1px solid ${
                isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"
              }`,
            },
          }}
        />
      </div>

      {showImport && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            padding: "10px 12px",
            borderRadius: 8,
            backgroundColor: isDark
              ? "rgba(255,255,255,0.04)"
              : "rgba(0,0,0,0.035)",
          }}
        >
          <Input
            value={registryName}
            set_value={(value) => setRegistryName(value)}
            placeholder={t("toolkit.store_registry_name_placeholder")}
            style={{
              width: "100%",
              fontSize: 12,
              fontFamily,
              borderRadius: 7,
              color: isDark ? "#fff" : "#222",
              paddingVertical: 7,
              paddingHorizontal: 10,
            }}
          />
          <Input
            value={registryUrl}
            set_value={(value) => setRegistryUrl(value)}
            placeholder={t("toolkit.store_registry_url_placeholder")}
            style={{
              width: "100%",
              fontSize: 12,
              fontFamily,
              borderRadius: 7,
              color: isDark ? "#fff" : "#222",
              paddingVertical: 7,
              paddingHorizontal: 10,
            }}
          />
          <textarea
            value={registryJson}
            onChange={(event) => setRegistryJson(event.target.value)}
            placeholder={t("toolkit.store_registry_json_placeholder")}
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
          {registryValidation && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontSize: 10.5,
                fontFamily,
                color: registryValidation.valid
                  ? isDark
                    ? "#86efac"
                    : "#15803d"
                  : isDark
                    ? "#fdba74"
                    : "#c2410c",
              }}
            >
              {registryValidation.valid ? (
                <span>
                  {t("toolkit.store_registry_valid")}{" "}
                  {registryValidation.count || 0}
                </span>
              ) : (
                (registryValidation.diagnostics || []).map((diagnostic, index) => (
                  <span key={`${diagnostic.code}-${diagnostic.path}-${index}`}>
                    {[diagnostic.code, diagnostic.path, diagnostic.entryId]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                ))
              )}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <Button
              label={t("toolkit.store_registry_cancel")}
              onClick={() => setShowImport(false)}
              style={{
                fontSize: 11.5,
                paddingVertical: 5,
                paddingHorizontal: 10,
                borderRadius: 6,
                opacity: 0.6,
              }}
            />
            <Button
              label={
                registryValidating
                  ? t("toolkit.store_registry_validating")
                  : t("toolkit.store_registry_validate")
              }
              disabled={validateDisabled}
              onClick={handleValidate}
              style={{
                fontSize: 11.5,
                paddingVertical: 5,
                paddingHorizontal: 10,
                borderRadius: 6,
                opacity: validateDisabled ? 0.45 : 0.75,
              }}
            />
            <Button
              label={
                registryImporting
                  ? t("toolkit.store_registry_importing")
                  : t("toolkit.store_registry_import")
              }
              disabled={importDisabled}
              onClick={handleImport}
              style={{
                fontSize: 11.5,
                paddingVertical: 5,
                paddingHorizontal: 10,
                borderRadius: 6,
                opacity: importDisabled ? 0.45 : 0.75,
              }}
            />
          </div>
        </div>
      )}

      {metadataError && (
        <div
          style={{
            fontSize: 10.5,
            fontFamily,
            color: isDark ? "#fdba74" : "#c2410c",
            marginTop: -6,
          }}
        >
          {t("toolkit.store_metadata_error")}
        </div>
      )}

      {registryError && (
        <div
          style={{
            fontSize: 10.5,
            fontFamily,
            color: isDark ? "#fdba74" : "#c2410c",
            marginTop: -6,
          }}
        >
          {t("toolkit.store_registry_error")}
        </div>
      )}

      {filtered.length > 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          {filtered.map((entry) => (
            <StoreToolkitCard
              key={entry.id}
              entry={entry}
              isDark={isDark}
              onClick={onEntryClick}
              installedIds={installedIds}
              onInstall={onInstall}
              installing={installingId === entry.id}
              installError={
                installError?.entryId === entry.id ? installError : null
              }
            />
          ))}
        </div>
      ) : (
        <PlaceholderBlock
          icon="search"
          title={t("toolkit.store_empty_search")}
          subtitle={search.trim()}
          isDark={isDark}
        />
      )}
    </div>
  );
};

export default ToolkitStorePage;
