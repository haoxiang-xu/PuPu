import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../../SERVICEs/api";
import {
  getDefaultToolkitSelection,
  setDefaultToolkitEnabled,
  removeInvalidToolkitIds,
} from "../../../SERVICEs/default_toolkit_store";
import { BASE_TOOLKIT_IDENTIFIERS } from "../constants";
import ToolkitRow from "../components/toolkit_row";
import LoadingDots from "../components/loading_dots";
import PlaceholderBlock from "../components/placeholder_block";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import { isBuiltinToolkit } from "../utils/toolkit_helpers";

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
  const [loading, setLoading] = useState(true);
  const [toolkits, setToolkits] = useState([]);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const payload = await api.miso.listToolModalCatalog();
      const list = Array.isArray(payload?.toolkits) ? payload.toolkits : [];

      const visible = list.filter(
        (tk) =>
          tk.source !== "core" &&
          tk.source !== "plugin" &&
          !tk.hidden &&
          !isBaseById(tk.toolkitId),
      );

      const validIds = visible.map((tk) => tk.toolkitId);
      removeInvalidToolkitIds("global", validIds);

      const enabledIds = new Set(getDefaultToolkitSelection("global"));
      const merged = visible.map((tk) => ({
        ...tk,
        defaultEnabled: enabledIds.has(tk.toolkitId),
      }));

      setToolkits(merged);
    } catch (err) {
      setError(err?.message || "Failed to load toolkit catalog");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
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

  if (loading) return <LoadingDots isDark={isDark} />;

  if (error) {
    return (
      <PlaceholderBlock
        icon="tool"
        title="Miso not connected"
        subtitle="Start the Miso runtime to load your tool catalog."
        isDark={isDark}
      />
    );
  }

  if (toolkits.length === 0) {
    return (
      <PlaceholderBlock
        icon="tool"
        title="No toolkits found"
        subtitle="No visible toolkits were registered in the connected Miso runtime."
        isDark={isDark}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* ── Search ── */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
        }}
      >
        <Icon
          src="search"
          style={{
            position: "absolute",
            left: 10,
            width: 14,
            height: 14,
            pointerEvents: "none",
            opacity: 0.35,
          }}
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search toolkits..."
          style={{
            width: "100%",
            padding: "7px 10px 7px 32px",
            fontSize: 13,
            fontFamily: "Jost",
            border: `1px solid ${
              isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"
            }`,
            borderRadius: 7,
            background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
            color: isDark ? "#fff" : "#222",
            outline: "none",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* ── Header ── */}
      <span
        style={{
          fontSize: 12,
          fontFamily: "Jost",
          fontWeight: 500,
          color: isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)",
        }}
      >
        {filtered.length} toolkit{filtered.length !== 1 ? "s" : ""} installed
      </span>

      {/* ── List ── */}
      {filtered.map((tk) => (
        <ToolkitRow
          key={tk.toolkitId}
          toolkit={tk}
          isDark={isDark}
          isBuiltin={isBuiltinToolkit(tk)}
          onToggleEnabled={handleToggleEnabled}
          onClick={(toolkitId) => onToolClick?.(toolkitId, null, tk)}
        />
      ))}

      {filtered.length === 0 && search.trim() && (
        <div
          style={{
            textAlign: "center",
            padding: 40,
            fontSize: 12,
            fontFamily: "Jost",
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
