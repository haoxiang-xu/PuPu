import React, { useCallback, useContext, useEffect, useMemo, useState } from "react";
import api from "../../../SERVICEs/api";
import {
  getDefaultToolkitSelection,
  setDefaultToolkitEnabled,
  removeInvalidToolkitIds,
} from "../../../SERVICEs/default_toolkit_store";
import { BASE_TOOLKIT_IDENTIFIERS } from "../constants";
import ToolkitRow from "../components/toolkit_row";
import SuspenseFallback from "../../../BUILTIN_COMPONENTs/suspense/suspense_fallback";
import PlaceholderBlock from "../components/placeholder_block";
import { Input } from "../../../BUILTIN_COMPONENTs/input/input";
import { isBuiltinToolkit } from "../utils/toolkit_helpers";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import useAsyncAction from "../../../BUILTIN_COMPONENTs/mini_react/use_async_action";

const isBaseById = (toolkitId) => {
  if (!toolkitId) return false;
  const lower = toolkitId.trim().toLowerCase();
  return (
    BASE_TOOLKIT_IDENTIFIERS.has(lower) ||
    lower.endsWith(".toolkit") ||
    lower.endsWith(".builtin_toolkit") ||
    lower.endsWith(".base_toolkit")
  );
};

const ToolkitInstalledPage = ({ isDark, onToolClick, onHandlersReady }) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const [toolkits, setToolkits] = useState([]);
  const [search, setSearch] = useState("");
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const { run: loadCatalog, pending, error: loadError } = useAsyncAction(
    useCallback(async () => {
      const payload = await api.unchain.listToolModalCatalog();
      const list = Array.isArray(payload?.toolkits) ? payload.toolkits : [];
      const visible = list.filter(
        (tk) =>
          tk.source !== "plugin" &&
          !tk.hidden &&
          !isBaseById(tk.toolkitId),
      );
      const validIds = visible.map((tk) => tk.toolkitId);
      removeInvalidToolkitIds("global", validIds);
      const enabledIds = new Set(getDefaultToolkitSelection("global"));
      return visible.map((tk) => ({
        ...tk,
        defaultEnabled: enabledIds.has(tk.toolkitId),
      }));
    }, []),
    { label: "toolkit_catalog_load", pendingDelayMs: 0, onError: () => {} },
  );

  const error = loadError ? (loadError.message || t("toolkit.load_catalog_failed")) : null;
  const loading = pending || !initialLoadDone;

  useEffect(() => {
    loadCatalog().then((result) => {
      if (result !== undefined) setToolkits(result);
      setInitialLoadDone(true);
    });
  }, [loadCatalog]);

  const handleToggleEnabled = useCallback((toolkitId, enabled) => {
    const nextIds = setDefaultToolkitEnabled("global", toolkitId, enabled);
    const enabledSet = new Set(nextIds);
    setToolkits((prev) =>
      prev.map((tk) => ({
        ...tk,
        defaultEnabled: enabledSet.has(tk.toolkitId),
      })),
    );
  }, []);

  const handleDelete = useCallback((toolkitId) => {
    // TODO: implement actual toolkit deletion when backend supports it
  }, []);

  /* Expose handlers so parent (detail panel) can call them */
  useEffect(() => {
    onHandlersReady?.({ handleToggleEnabled, handleDelete });
  }, [onHandlersReady, handleToggleEnabled, handleDelete]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return toolkits;
    return toolkits.filter((tk) => {
      const name = (tk.toolkitName || tk.toolkitId || "").toLowerCase();
      const desc = (tk.toolkitDescription || "").toLowerCase();
      const toolNames = (tk.tools || [])
        .map((t) => (t.title || t.name || "").toLowerCase())
        .join(" ");
      return name.includes(q) || desc.includes(q) || toolNames.includes(q);
    });
  }, [toolkits, search]);

  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";

  if (loading) return <SuspenseFallback minHeight={160} />;

  if (error) {
    return (
      <PlaceholderBlock
        icon="tool"
        title={t("toolkit.unchain_not_connected_title")}
        subtitle={t("toolkit.unchain_not_connected_subtitle")}
        isDark={isDark}
      />
    );
  }

  if (toolkits.length === 0) {
    return (
      <PlaceholderBlock
        icon="tool"
        title={t("toolkit.no_toolkits_title")}
        subtitle={t("toolkit.no_toolkits_subtitle")}
        isDark={isDark}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* ── Search ── */}
      <Input
        prefix_icon="search"
        value={search}
        set_value={(v) => setSearch(v)}
        placeholder={t("toolkit.search_placeholder")}
        style={{
          width: "100%",
          fontSize: 13,
          fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
          borderRadius: 7,
          color: isDark ? "#fff" : "#222",
          paddingVertical: 7,
          paddingHorizontal: 10,
        }}
      />

      {/* ── Header ── */}
      <span
        style={{
          fontSize: 12,
          fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
          fontWeight: 500,
          color: isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)",
          marginTop: 4,
          marginBottom: 2,
        }}
      >
        {filtered.length} toolkit{filtered.length !== 1 ? "s" : ""} installed
      </span>

      {/* ── List ── */}
      {filtered.map((tk, idx) => (
        <React.Fragment key={tk.toolkitId}>
          {idx > 0 && (
            <div
              style={{
                height: 1,
                background: isDark
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(0,0,0,0.06)",
                marginLeft: 14,
                marginRight: 14,
              }}
            />
          )}
          <ToolkitRow
            toolkit={tk}
            isDark={isDark}
            isBuiltin={isBuiltinToolkit(tk)}
            onToggleEnabled={handleToggleEnabled}
            onClick={(toolkitId) => onToolClick?.(toolkitId, null, tk)}
          />
        </React.Fragment>
      ))}

      {filtered.length === 0 && search.trim() && (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            fontSize: 12,
            fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
            color: mutedColor,
          }}
        >
          No toolkits matching "{search.trim()}"
        </div>
      )}
    </div>
  );
};

export default ToolkitInstalledPage;
