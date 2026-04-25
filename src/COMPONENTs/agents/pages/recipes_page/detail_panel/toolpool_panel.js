import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../../../../SERVICEs/api";
import { Input } from "../../../../../BUILTIN_COMPONENTs/input/input";
import Switch from "../../../../../BUILTIN_COMPONENTs/input/switch";
import Button from "../../../../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../../../../BUILTIN_COMPONENTs/icon/icon";
import ToolkitIcon from "../../../../toolkit/components/toolkit_icon";

const SECTION_LABEL = {
  fontSize: 11,
  fontWeight: 600,
  color: "#86868b",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const TABS = [
  { key: "installed", label: "Installed", icon: "tool" },
  { key: "store", label: "Store", icon: "search" },
];

export default function ToolPoolPanel({ node, recipe, onChange, isDark }) {
  const [catalog, setCatalog] = useState([]);
  const [active_tab, setActiveTab] = useState("installed");
  const [search, setSearch] = useState("");
  const [pool_expanded, setPoolExpanded] = useState({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const payload = await api.unchain.listToolModalCatalog();
        const tks = Array.isArray(payload?.toolkits) ? payload.toolkits : [];
        if (!cancelled) setCatalog(tks);
      } catch (_exc) {
        if (!cancelled) setCatalog([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toolkits = Array.isArray(node.toolkits) ? node.toolkits : [];

  const added_set = useMemo(() => {
    const s = new Set();
    for (const t of toolkits) {
      if (t && typeof t.id === "string") s.add(t.id);
    }
    return s;
  }, [toolkits]);

  const meta_by_id = useMemo(() => {
    const map = {};
    for (const tk of catalog) {
      if (tk && typeof tk.toolkitId === "string") map[tk.toolkitId] = tk;
    }
    return map;
  }, [catalog]);

  const merge_on = node.merge_with_user_selected === true;

  function update_node(patch) {
    onChange({
      ...recipe,
      nodes: recipe.nodes.map((n) =>
        n.id === node.id ? { ...n, ...patch } : n,
      ),
    });
  }

  function set_merge(on) {
    update_node({ merge_with_user_selected: !!on });
  }

  function add_toolkit(tk_id) {
    if (added_set.has(tk_id)) return;
    update_node({ toolkits: [...toolkits, { id: tk_id, config: {} }] });
  }

  function remove_toolkit(tk_id) {
    update_node({ toolkits: toolkits.filter((t) => t.id !== tk_id) });
  }

  function toggle_pool_expanded(tk_id) {
    setPoolExpanded((p) => ({ ...p, [tk_id]: !p[tk_id] }));
  }

  const filtered_installed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog
      .filter((tk) => !added_set.has(tk.toolkitId))
      .filter((tk) => {
        if (!q) return true;
        const name = (tk.toolkitName || tk.toolkitId || "").toLowerCase();
        const desc = (tk.toolkitDescription || "").toLowerCase();
        if (name.includes(q) || desc.includes(q)) return true;
        const tools = Array.isArray(tk.tools) ? tk.tools : [];
        return tools.some((t) => (t.name || "").toLowerCase().includes(q));
      });
  }, [catalog, added_set, search]);

  const muted = isDark ? "#9a9aa3" : "#86868b";
  const accent = "#4a5bd8";
  const divider = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const row_bg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)";
  const chip_bg = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.045)";
  const chip_color = isDark ? "rgba(255,255,255,0.78)" : "rgba(0,0,0,0.7)";

  return (
    <div
      className="scrollable"
      data-sb-edge="14"
      style={{
        position: "relative",
        maxHeight: "100%",
        overflow: "auto",
        paddingTop: 14,
        paddingBottom: 6,
        paddingLeft: 2,
        paddingRight: 2,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: "linear-gradient(135deg, #f6a341, #ea7547)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          T
        </div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>ToolkitPool</div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "6px 8px",
          borderRadius: 6,
          background: row_bg,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            minWidth: 0,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 500 }}>
            Merge with user-selected
          </span>
          <span style={{ fontSize: 10.5, color: muted }}>
            {merge_on
              ? "This pool + user's chat-time selection"
              : "This pool only (ignore user selection)"}
          </span>
        </div>
        <Switch
          on={merge_on}
          set_on={set_merge}
          style={{ width: 32, height: 18 }}
        />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={SECTION_LABEL}>Pool</span>
          <span style={{ fontSize: 11, color: muted }}>
            {toolkits.length} toolkit{toolkits.length === 1 ? "" : "s"}
          </span>
        </div>
        {toolkits.length === 0 && (
          <span style={{ fontSize: 11, color: muted }}>
            Add toolkits from the list below.
          </span>
        )}
        {toolkits.map((entry) => {
          const tk = meta_by_id[entry.id] || {
            toolkitId: entry.id,
            toolkitName: entry.id,
            toolkitIcon: {},
            tools: [],
          };
          const tools = Array.isArray(tk.tools) ? tk.tools : [];
          const expanded = !!pool_expanded[entry.id];
          return (
            <div
              key={entry.id}
              style={{
                background: row_bg,
                borderRadius: 6,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                onClick={() => toggle_pool_expanded(entry.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 6px 6px 8px",
                  cursor: "pointer",
                }}
              >
                <Icon
                  src={expanded ? "arrow_down" : "arrow_right"}
                  style={{ width: 9, height: 9, opacity: 0.55 }}
                />
                <ToolkitIcon
                  icon={tk.toolkitIcon}
                  size={16}
                  fallbackColor={accent}
                />
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 12,
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tk.toolkitName || entry.id}
                </span>
                <span style={{ fontSize: 10.5, color: muted }}>
                  {tools.length}
                </span>
                <Button
                  prefix_icon="close"
                  onClick={(e) => {
                    if (e?.stopPropagation) e.stopPropagation();
                    remove_toolkit(entry.id);
                  }}
                  style={{
                    paddingVertical: 3,
                    paddingHorizontal: 3,
                    borderRadius: 4,
                    content: { icon: { width: 11, height: 11 } },
                  }}
                />
              </div>
              {expanded && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 4,
                    padding: "0 8px 8px 28px",
                  }}
                >
                  {tools.length === 0 && (
                    <span style={{ fontSize: 11, color: muted }}>
                      No tools.
                    </span>
                  )}
                  {tools.map((t) => (
                    <span
                      key={t.name}
                      style={{
                        fontSize: 10.5,
                        fontFamily: "ui-monospace, Menlo, monospace",
                        color: chip_color,
                        background: chip_bg,
                        padding: "2px 7px",
                        borderRadius: 999,
                      }}
                    >
                      {t.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          paddingTop: 6,
          borderTop: `1px solid ${divider}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {TABS.map((tab) => {
            const is_active = active_tab === tab.key;
            return (
              <Button
                key={tab.key}
                prefix_icon={tab.icon}
                label={tab.label}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  fontSize: 11.5,
                  fontWeight: 500,
                  opacity: is_active ? 1 : 0.5,
                  paddingVertical: 4,
                  paddingHorizontal: 8,
                  borderRadius: 6,
                  gap: 4,
                  content: { icon: { width: 12, height: 12 } },
                }}
              />
            );
          })}
        </div>

        {active_tab === "installed" && (
          <>
            <Input
              prefix_icon="search"
              value={search}
              set_value={setSearch}
              placeholder="Search tools..."
              style={{
                fontSize: 12,
                paddingVertical: 5,
                paddingHorizontal: 8,
                borderRadius: 6,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {filtered_installed.length === 0 && (
                <span style={{ fontSize: 11, color: muted }}>
                  {catalog.length === 0
                    ? "No toolkits installed."
                    : added_set.size === catalog.length
                      ? "All installed toolkits are in the pool."
                      : `No toolkits matching "${search.trim()}"`}
                </span>
              )}
              {filtered_installed.map((tk) => {
                const tools = Array.isArray(tk.tools) ? tk.tools : [];
                return (
                  <div
                    key={tk.toolkitId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: row_bg,
                    }}
                  >
                    <ToolkitIcon
                      icon={tk.toolkitIcon}
                      size={28}
                      fallbackColor={accent}
                      style={{ borderRadius: 8, flexShrink: 0 }}
                    />
                    <div
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tk.toolkitName || tk.toolkitId}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          color: muted,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tk.toolkitDescription || `${tools.length} tools`}
                      </span>
                    </div>
                    <Button
                      prefix_icon="add"
                      label="Add"
                      onClick={() => add_toolkit(tk.toolkitId)}
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                        borderRadius: 6,
                        gap: 3,
                        color: accent,
                        content: { icon: { width: 11, height: 11 } },
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}

        {active_tab === "store" && (
          <div
            style={{
              padding: "24px 12px",
              textAlign: "center",
              fontSize: 11.5,
              color: muted,
            }}
          >
            Tool Store coming soon.
          </div>
        )}
      </div>
    </div>
  );
}
