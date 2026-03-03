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
      <SectionLabel isDark={isDark}>Built-in</SectionLabel>
      {visibleToolkits.map((tk, idx) => (
        <ToolkitCard key={idx} toolkit={tk} isDark={isDark} />
      ))}
    </div>
  );
};

export default ToolkitsPage;
