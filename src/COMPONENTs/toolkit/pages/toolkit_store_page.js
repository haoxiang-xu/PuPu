import { useContext, useMemo, useState } from "react";
import { Input } from "../../../BUILTIN_COMPONENTs/input/input";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import ArcSpinner from "../../../BUILTIN_COMPONENTs/spinner/arc_spinner";
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
}) => {
  const context = useContext(ConfigContext) || {};
  const { t } = useTranslation();
  const fontFamily = context.theme?.font?.fontFamily || "Jost, sans-serif";
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

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
        <span
          title={
            metadataRefreshing
              ? t("toolkit.store_refreshing_metadata")
              : t("toolkit.store_refresh_metadata")
          }
          style={{ display: "inline-flex", alignItems: "center" }}
        >
          {metadataRefreshing ? (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 4,
              }}
            >
              <ArcSpinner
                size={14}
                stroke_width={2}
                color={
                  isDark ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.58)"
                }
              />
            </span>
          ) : (
            <Button
              prefix_icon="update"
              ariaLabel={t("toolkit.store_refresh_metadata")}
              title={t("toolkit.store_refresh_metadata")}
              onClick={onRefreshMetadata}
              style={{
                paddingVertical: 4,
                paddingHorizontal: 4,
                borderRadius: 999,
                color: isDark
                  ? "rgba(255,255,255,0.62)"
                  : "rgba(0,0,0,0.58)",
                hoverBackgroundColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.06)",
                content: { icon: { width: 14, height: 14 } },
              }}
            />
          )}
        </span>
      </div>

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

      <div
        style={{
          fontSize: 10.5,
          lineHeight: 1.5,
          fontFamily,
          color: isDark ? "rgba(255,255,255,0.34)" : "rgba(0,0,0,0.36)",
          marginTop: 4,
          paddingTop: 8,
        }}
      >
        {t("toolkit.store_trademark_disclaimer")}
      </div>
    </div>
  );
};

export default ToolkitStorePage;
