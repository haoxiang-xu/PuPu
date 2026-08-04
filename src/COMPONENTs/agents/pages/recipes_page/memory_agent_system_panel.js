import { useEffect, useMemo, useState } from "react";
import { api } from "../../../../SERVICEs/api";
import Select from "../../../../BUILTIN_COMPONENTs/select/select";
import { Input } from "../../../../BUILTIN_COMPONENTs/input/input";
import Icon from "../../../../BUILTIN_COMPONENTs/icon/icon";
import {
  readMemoryAgentSettings,
  updateMemoryAgentSettings,
  subscribeMemoryAgentSettings,
} from "../../../../SERVICEs/memory_agent_settings";
import { contextV2Bridge } from "../../../../SERVICEs/bridges/context_v2_bridge";

/* ── status model ──────────────────────────────────────────────────────────
   off      — runtime reachable but not ready (memory agent not running)
   shadow   — runtime ready; Memory V2 P0 runs in shadow mode
   canary   — active for the stable admitted chat cohort
   active   — reserved (runtime explicitly reports the agent as active)
   degraded — status / catalog request failed (runtime unreachable)          */
export const MEMORY_AGENT_STATUS_LABEL = {
  off: "Off",
  shadow: "Shadow",
  canary: "Canary",
  active: "Active",
  degraded: "Degraded",
};

export const deriveMemoryAgentSystemStatus = ({ status, statusError } = {}) => {
  if (statusError || !status) return "degraded";
  if (status.readOnlyDegraded === true) return "degraded";
  if (status.available !== true) return "degraded";
  const mode = String(status.rolloutMode || "off").trim().toLowerCase();
  if (mode === "all" || mode === "active") return "active";
  if (mode === "canary") return "canary";
  if (mode === "shadow") return "shadow";
  return "off";
};

/* Badge palette — always a light/dark pair, matching the builder's muted
   glass aesthetic. Shadow uses the agent-node indigo family. */
export const memoryAgentBadgePalette = (statusKey, isDark) => {
  switch (statusKey) {
    case "shadow":
      return isDark
        ? { background: "rgba(100,120,246,0.26)", color: "#aab6ff" }
        : { background: "rgba(100,120,246,0.13)", color: "#4a5bd8" };
    case "active":
      return isDark
        ? { background: "rgba(60,180,110,0.24)", color: "#7fe0a8" }
        : { background: "rgba(60,180,110,0.14)", color: "#1d7a46" };
    case "canary":
      return isDark
        ? { background: "rgba(60,180,110,0.18)", color: "#8be4b1" }
        : { background: "rgba(60,180,110,0.11)", color: "#246f47" };
    case "degraded":
      return isDark
        ? { background: "rgba(220,150,50,0.24)", color: "#ffcf8a" }
        : { background: "rgba(220,150,50,0.15)", color: "#9a6210" };
    case "off":
    default:
      return isDark
        ? { background: "rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.55)" }
        : { background: "rgba(0,0,0,0.06)", color: "rgba(0,0,0,0.5)" };
  }
};

const SECTION_LABEL = {
  fontSize: 11,
  fontWeight: 600,
  color: "#86868b",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const BASE_PROVIDERS = ["ollama", "openai", "anthropic"];

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  MemoryAgentSystemPanel — the System Agent card body (Memory V2 P0).      */
/*  Editable: display name, additional instructions, provider/model.         */
/*  Locked:   core prompt, toolkits, permissions — managed by PuPu.          */
/*  Not deletable, not part of any recipe graph.                             */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export default function MemoryAgentSystemPanel({ isDark }) {
  const [settings, setSettings] = useState(() => readMemoryAgentSettings());
  const [statusKey, setStatusKey] = useState("off");
  const [statusDetail, setStatusDetail] = useState("");
  const [catalog, setCatalog] = useState(null);
  const [saveError, setSaveError] = useState("");

  useEffect(() => subscribeMemoryAgentSettings(setSettings), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await contextV2Bridge.getStatus();
        if (cancelled) return;
        setStatusKey(deriveMemoryAgentSystemStatus({ status }));
        setStatusDetail(
          status?.readOnlyDegraded === true
            ? "Read-only degraded mode · 只读降级模式"
            : "",
        );
      } catch (_error) {
        if (cancelled) return;
        setStatusKey("degraded");
        setStatusDetail("Runtime unreachable · 运行时不可达");
      }
      try {
        const nextCatalog = await api.unchain.getModelCatalog();
        if (cancelled) return;
        setCatalog(nextCatalog);
      } catch (_error) {
        if (cancelled) return;
        setCatalog(null);
        setStatusKey("degraded");
        setStatusDetail("Model catalog unavailable · 模型目录不可用");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const commit = (patch) => {
    setSaveError("");
    updateMemoryAgentSettings(patch).catch((error) => {
      const detail =
        error && typeof error.message === "string" && error.message.trim()
          ? ` (${error.message})`
          : "";
      setSaveError(`Failed to save · 保存失败${detail}`);
    });
  };

  const providerOptions = useMemo(() => {
    const known = new Set(BASE_PROVIDERS);
    if (catalog?.providers) {
      Object.keys(catalog.providers).forEach((key) => known.add(key));
    }
    if (settings.provider) known.add(settings.provider);
    return [
      { value: "", label: "Provider default" },
      ...[...known].map((p) => ({ value: p, label: p })),
    ];
  }, [catalog, settings.provider]);

  const modelOptions = useMemo(() => {
    const fallbackLabel = settings.provider
      ? "Provider default model"
      : "Current chat model";
    const models = settings.provider
      ? catalog?.providers?.[settings.provider] || []
      : [];
    const list = [...models];
    if (settings.modelId && !list.includes(settings.modelId)) {
      list.unshift(settings.modelId);
    }
    return [
      { value: "", label: fallbackLabel },
      ...list.map((m) => ({ value: m, label: m })),
    ];
  }, [catalog, settings.provider, settings.modelId]);

  const muted = isDark ? "#9a9aa3" : "#86868b";
  const rowBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.025)";
  const badge = memoryAgentBadgePalette(statusKey, isDark);
  const inputStyle = {
    fontSize: 12,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
  };

  return (
    <div
      data-testid="memory-agent-system-panel"
      className="scrollable"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        padding: "16px 16px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* ── header: identity + status badge ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 7,
            background: "linear-gradient(135deg, #6478f6, #4a5bd8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon src="bot" color="#fff" style={{ width: 14, height: 14 }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.85)",
            }}
          >
            {settings.displayName}
          </div>
          <div style={{ fontSize: 11, color: muted, marginTop: 1 }}>
            System · Managed by PuPu
          </div>
        </div>
        <span
          data-testid="memory-agent-status-badge"
          data-status={statusKey}
          style={{
            flexShrink: 0,
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            padding: "3px 8px",
            borderRadius: 999,
            backgroundColor: badge.background,
            color: badge.color,
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
        >
          {MEMORY_AGENT_STATUS_LABEL[statusKey] || statusKey}
        </span>
      </div>

      {statusDetail && (
        <div
          data-testid="memory-agent-status-detail"
          style={{
            fontSize: 11,
            lineHeight: 1.5,
            padding: "6px 10px",
            borderRadius: 6,
            background: isDark
              ? "rgba(220,150,50,0.12)"
              : "rgba(220,150,50,0.09)",
            color: isDark ? "#ffcf8a" : "#9a6210",
          }}
        >
          {statusDetail}
        </div>
      )}

      {/* ── display name ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={SECTION_LABEL}>Display Name</span>
        <div data-testid="memory-agent-display-name">
          <Input
            value={settings.displayName}
            set_value={(v) => commit({ displayName: v })}
            style={inputStyle}
          />
        </div>
      </div>

      {/* ── additional instructions ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={SECTION_LABEL}>Additional Instructions</span>
        <textarea
          data-testid="memory-agent-additional-instructions"
          value={settings.additionalInstructions}
          onChange={(e) => commit({ additionalInstructions: e.target.value })}
          placeholder="Appended to the managed core prompt. 追加到托管核心提示词之后。"
          rows={4}
          style={{
            resize: "vertical",
            minHeight: 72,
            padding: "8px 10px",
            borderRadius: 6,
            border: isDark
              ? "1px solid rgba(255,255,255,0.10)"
              : "1px solid rgba(0,0,0,0.10)",
            outline: "none",
            background: rowBg,
            color: isDark ? "rgba(255,255,255,0.88)" : "rgba(0,0,0,0.82)",
            fontSize: 12,
            lineHeight: 1.5,
            fontFamily: "inherit",
          }}
        />
      </div>

      {/* ── model ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={SECTION_LABEL}>Model</span>
        <div data-testid="memory-agent-provider-select">
          <Select
            options={providerOptions}
            value={settings.provider}
            set_value={(v) => commit({ provider: v, modelId: "" })}
            filterable={false}
            style={inputStyle}
          />
        </div>
        <div data-testid="memory-agent-model-select">
          <Select
            options={modelOptions}
            value={settings.modelId}
            set_value={(v) => commit({ modelId: v })}
            filterable={false}
            style={inputStyle}
          />
        </div>
        <span style={{ fontSize: 10.5, color: muted, lineHeight: 1.5 }}>
          Empty = provider default / current chat model fallback.
          留空使用默认模型。
        </span>
      </div>

      {/* ── managed (locked) surface ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={SECTION_LABEL}>Managed by PuPu</span>
        <div
          data-testid="memory-agent-managed-note"
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            background: rowBg,
            border: isDark
              ? "1px dashed rgba(255,255,255,0.12)"
              : "1px dashed rgba(0,0,0,0.12)",
            fontSize: 11,
            lineHeight: 1.55,
            color: muted,
          }}
        >
          Core prompt, toolkits and permissions are managed by PuPu and cannot
          be edited. This system agent cannot be deleted.
          <br />
          核心提示词、工具与权限由 PuPu 托管，不可修改；该系统代理不可删除。
        </div>
      </div>

      {saveError && (
        <div
          data-testid="memory-agent-save-error"
          style={{
            fontSize: 11,
            lineHeight: 1.5,
            padding: "6px 10px",
            borderRadius: 6,
            background: isDark ? "rgba(90,30,30,0.55)" : "#fff2f0",
            border: isDark
              ? "1px solid rgba(255,120,120,0.28)"
              : "1px solid rgba(220,70,70,0.22)",
            color: isDark ? "#ffd6d6" : "#9f1d1d",
          }}
        >
          {saveError}
        </div>
      )}
    </div>
  );
}
