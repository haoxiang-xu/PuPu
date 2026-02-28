import { useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Modal from "../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import api from "../../SERVICEs/api";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Config                                                                                                                     */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const SECTIONS = [
  { key: "toolkits", icon: "hammer", label: "Toolkits" },
  { key: "skills", icon: "education", label: "Skills" },
  { key: "mcp", icon: "mcp", label: "MCP" },
];

const BASE_TOOLKIT_IDENTIFIERS = new Set([
  "base",
  "toolkit",
  "builtin_toolkit",
  "base_toolkit",
]);

const KIND_CONFIG = {
  core: {
    label: "Core",
    color: "#a78bfa",
    bg: "rgba(167,139,250,0.13)",
    border: "rgba(167,139,250,0.22)",
  },
  builtin: {
    label: "Built-in",
    color: "#34d399",
    bg: "rgba(52,211,153,0.12)",
    border: "rgba(52,211,153,0.20)",
  },
  integration: {
    label: "Integration",
    color: "#fb923c",
    bg: "rgba(251,146,60,0.12)",
    border: "rgba(251,146,60,0.20)",
  },
};

const kindConfig = (kind) =>
  KIND_CONFIG[kind] || {
    label: kind || "Unknown",
    color: "#94a3b8",
    bg: "rgba(148,163,184,0.12)",
    border: "rgba(148,163,184,0.20)",
  };

/** "BuiltinToolkit" → "Builtin Toolkit", "PythonWorkspaceToolkit" → "Python Workspace Toolkit" */
const toDisplayName = (toolkit) => {
  const raw = toolkit.class_name || toolkit.name || "Unknown Toolkit";
  return raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
};

const isBuiltinToolkit = (toolkit) =>
  String(toolkit?.kind || "")
    .trim()
    .toLowerCase() === "builtin";

const isBaseToolkit = (toolkit) => {
  const candidates = [toolkit?.name, toolkit?.class_name, toolkit?.module]
    .map((value) =>
      typeof value === "string" ? value.trim().toLowerCase() : "",
    )
    .filter(Boolean);

  return candidates.some(
    (value) =>
      BASE_TOOLKIT_IDENTIFIERS.has(value) ||
      value.endsWith(".toolkit") ||
      value.endsWith(".builtin_toolkit") ||
      value.endsWith(".base_toolkit"),
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Small helpers                                                                                                              */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const SectionLabel = ({ children, isDark }) => (
  <div
    style={{
      fontSize: 10,
      textTransform: "uppercase",
      letterSpacing: "1.6px",
      fontFamily: "Jost, sans-serif",
      color: isDark ? "#fff" : "#222",
      opacity: 0.3,
      padding: "20px 0 10px",
      userSelect: "none",
    }}
  >
    {children}
  </div>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ToolkitCard                                                                                                                */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ToolkitCard = ({ toolkit, isDark }) => {
  const kc = kindConfig(toolkit.kind);
  const displayName = toDisplayName(toolkit);
  const tools = Array.isArray(toolkit.tools) ? toolkit.tools : [];

  return (
    <div
      style={{
        padding: "13px 16px",
        borderRadius: 10,
        background: isDark ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.025)",
        border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"}`,
        marginBottom: 8,
      }}
    >
      {/* ── header row ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* Kind-coloured icon bubble */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 9,
            background: kc.bg,
            border: `1px solid ${kc.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon src="hammer" style={{ width: 17, height: 17 }} color={kc.color} />
        </div>

        {/* Name + module */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "NunitoSans, sans-serif",
              color: isDark ? "#f0f0f0" : "#1a1a1a",
              marginBottom: 3,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {displayName}
          </div>
          <div
            style={{
              fontSize: 11,
              fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
              color: isDark ? "rgba(255,255,255,0.32)" : "rgba(0,0,0,0.35)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {toolkit.module || toolkit.name}
          </div>
        </div>

        {/* Kind badge */}
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.6px",
            fontFamily: "Jost, sans-serif",
            color: kc.color,
            background: kc.bg,
            border: `1px solid ${kc.border}`,
            padding: "3px 9px",
            borderRadius: 5,
            flexShrink: 0,
          }}
        >
          {kc.label}
        </div>
      </div>

      {/* ── tools chips ── */}
      {tools.length > 0 && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
            display: "flex",
            flexWrap: "wrap",
            gap: 5,
          }}
        >
          {tools.map((tool, idx) => (
            <div
              key={idx}
              title={tool.description || tool.name}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 9px",
                borderRadius: 5,
                background: isDark
                  ? "rgba(255,255,255,0.055)"
                  : "rgba(0,0,0,0.045)",
                border: `1px solid ${isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.07)"}`,
                cursor: "default",
              }}
            >
              <div
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: kc.color,
                  flexShrink: 0,
                  opacity: 0.7,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
                  color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)",
                  whiteSpace: "nowrap",
                }}
              >
                {tool.name}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  Empty / loading / error states                                                                                             */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const PlaceholderBlock = ({ icon, title, subtitle, isDark }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 24px",
      gap: 12,
      textAlign: "center",
    }}
  >
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        background: isDark ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.045)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 4,
      }}
    >
      <Icon
        src={icon}
        style={{ width: 22, height: 22 }}
        color={isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.28)"}
      />
    </div>
    <div
      style={{
        fontSize: 14,
        fontWeight: 600,
        fontFamily: "NunitoSans, sans-serif",
        color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)",
      }}
    >
      {title}
    </div>
    {subtitle && (
      <div
        style={{
          fontSize: 12,
          fontFamily: "Jost, sans-serif",
          color: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.3)",
          maxWidth: 280,
          lineHeight: 1.55,
        }}
      >
        {subtitle}
      </div>
    )}
  </div>
);

const LoadingDots = ({ isDark }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "56px 0",
      gap: 6,
    }}
  >
    {[0, 1, 2].map((i) => (
      <div
        key={i}
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: isDark ? "rgba(255,255,255,0.28)" : "rgba(0,0,0,0.25)",
          animation: "toolkit-dot-pulse 1.1s ease-in-out infinite",
          animationDelay: `${i * 0.18}s`,
        }}
      />
    ))}
    <style>{`
      @keyframes toolkit-dot-pulse {
        0%, 80%, 100% { transform: scale(0.7); opacity: 0.4; }
        40% { transform: scale(1); opacity: 1; }
      }
    `}</style>
  </div>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ToolkitsPage                                                                                                               */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ToolkitsPage = ({ isDark }) => {
  const [loading, setLoading] = useState(true);
  const [toolkits, setToolkits] = useState([]);
  const [error, setError] = useState(null);
  const [source, setSource] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.miso
      .getToolkitCatalog()
      .then((payload) => {
        if (cancelled) return;
        const list = Array.isArray(payload?.toolkits) ? payload.toolkits : [];
        setToolkits(list);
        setSource(payload?.source || "");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Failed to load toolkit catalog");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <LoadingDots isDark={isDark} />;

  if (error) {
    return (
      <PlaceholderBlock
        icon="hammer"
        title="Miso not connected"
        subtitle="Start the Miso runtime to load your tool catalog."
        isDark={isDark}
      />
    );
  }

  const visibleToolkits = toolkits.filter(
    (toolkit) => isBuiltinToolkit(toolkit) && !isBaseToolkit(toolkit),
  );

  if (visibleToolkits.length === 0) {
    return (
      <PlaceholderBlock
        icon="hammer"
        title="No built-in toolkits found"
        subtitle="No visible built-in toolkits were registered in the connected Miso runtime."
        isDark={isDark}
      />
    );
  }

  return (
    <div>
      {source && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 16,
            padding: "8px 12px",
            borderRadius: 8,
            background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)"}`,
          }}
        >
          <Icon
            src="link"
            style={{ width: 13, height: 13, flexShrink: 0 }}
            color={isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)"}
          />
          <span
            style={{
              fontSize: 11,
              fontFamily: "'JetBrains Mono', 'Fira Mono', monospace",
              color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {source}
          </span>
        </div>
      )}

      <SectionLabel isDark={isDark}>Built-in</SectionLabel>
      {visibleToolkits.map((tk, idx) => (
        <ToolkitCard key={idx} toolkit={tk} isDark={isDark} />
      ))}
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ComingSoonPage                                                                                                             */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ComingSoonPage = ({ icon, isDark }) => (
  <PlaceholderBlock
    icon={icon}
    title="Coming soon"
    subtitle="This section is not yet available."
    isDark={isDark}
  />
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  SegmentedControl                                                                                                           */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const SegmentedControl = ({ sections, selected, onChange, isDark }) => {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: 3,
        borderRadius: 10,
        background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
      }}
    >
      {sections.map((s) => {
        const isActive = s.key === selected;
        return (
          <button
            key={s.key}
            onClick={() => onChange(s.key)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "5px 13px",
              borderRadius: 7,
              border: "none",
              cursor: "pointer",
              fontFamily: "Jost, sans-serif",
              fontSize: 13,
              fontWeight: isActive ? 600 : 400,
              letterSpacing: "0.1px",
              color: isActive
                ? isDark
                  ? "#fff"
                  : "#111"
                : isDark
                  ? "rgba(255,255,255,0.42)"
                  : "rgba(0,0,0,0.42)",
              background: isActive
                ? isDark
                  ? "rgba(255,255,255,0.10)"
                  : "rgba(255,255,255,0.92)"
                : "transparent",
              boxShadow: isActive
                ? isDark
                  ? "0 1px 4px rgba(0,0,0,0.45)"
                  : "0 1px 4px rgba(0,0,0,0.10)"
                : "none",
              transition:
                "background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease",
              outline: "none",
              whiteSpace: "nowrap",
            }}
          >
            <Icon
              src={s.icon}
              style={{ width: 13, height: 13, flexShrink: 0 }}
              color={
                isActive
                  ? isDark
                    ? "#fff"
                    : "#111"
                  : isDark
                    ? "rgba(255,255,255,0.38)"
                    : "rgba(0,0,0,0.38)"
              }
            />
            {s.label}
          </button>
        );
      })}
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ToolkitModal                                                                                                               */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export const ToolkitModal = ({ open, onClose }) => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const [selectedSection, setSelectedSection] = useState("toolkits");

  const activeSection = SECTIONS.find((s) => s.key === selectedSection);

  const renderContent = () => {
    if (selectedSection === "toolkits") return <ToolkitsPage isDark={isDark} />;
    return (
      <ComingSoonPage icon={activeSection?.icon || "hammer"} isDark={isDark} />
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        minWidth: 600,
        height: 600,
        maxHeight: "80vh",
        padding: 0,
        backgroundColor: isDark ? "#141414" : "#ffffff",
        color: isDark ? "#fff" : "#222",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* ── Close button (absolute, matches Settings) ──────────────────────────── */}
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

      {/* ── Segmented control ──────────────────────────────────────────────────── */}
      <div style={{ padding: "16px 16px 16px", flexShrink: 0 }}>
        <SegmentedControl
          sections={SECTIONS}
          selected={selectedSection}
          onChange={setSelectedSection}
          isDark={isDark}
        />
      </div>

      {/* ── Scrollable content ─────────────────────────────────────────────────── */}
      <div
        className="scrollable"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 24px 24px",
        }}
      >
        {renderContent()}
      </div>
    </Modal>
  );
};
