import { useEffect, useState } from "react";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import api from "../../../SERVICEs/api";
import SectionLabel from "../components/section_label";
import ToolkitCard from "../components/toolkit_card";
import PlaceholderBlock from "../components/placeholder_block";
import LoadingDots from "../components/loading_dots";
import { isBaseToolkit, isBuiltinToolkit } from "../utils/toolkit_helpers";

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
        icon="tool"
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
        icon="tool"
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

export default ToolkitsPage;
