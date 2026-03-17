import { useEffect, useRef, useState } from "react";
import api from "../../../SERVICEs/api";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import ToolkitIcon, {
  isBuiltinToolkitIcon,
} from "./toolkit_icon";
import LoadingDots from "./loading_dots";
import PlaceholderBlock from "./placeholder_block";
import Markdown from "../../../BUILTIN_COMPONENTs/markdown/markdown";

const ToolkitDetailPanel = ({ toolkitId, toolName, isDark, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.miso
      .getToolkitDetail(toolkitId, toolName)
      .then((payload) => {
        if (cancelled) return;
        setDetail(payload);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Failed to load toolkit detail");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [toolkitId, toolName]);

  // Auto-scroll to tool heading if toolName is provided
  useEffect(() => {
    if (!detail?.readmeMarkdown || !toolName || !scrollRef.current) return;

    const timeout = setTimeout(() => {
      const container = scrollRef.current;
      if (!container) return;

      const headings = container.querySelectorAll("h1, h2, h3, h4, h5, h6");
      for (const heading of headings) {
        const text = heading.textContent?.trim().toLowerCase() || "";
        if (text === toolName.toLowerCase()) {
          heading.scrollIntoView({ behavior: "smooth", block: "start" });
          break;
        }
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [detail, toolName]);

  const textColor = isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.38)";
  const builtinIconWrapSize = 32;
  const detailIconBackground = isBuiltinToolkitIcon(detail?.toolkitIcon)
    ? detail.toolkitIcon.backgroundColor
    : isDark
      ? "rgba(255,255,255,0.04)"
      : "rgba(0,0,0,0.03)";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* ── Header with back button ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "0 0 10px",
          flexShrink: 0,
        }}
      >
        <Button
          prefix_icon="arrow_left"
          onClick={onBack}
          style={{
            paddingVertical: 4,
            paddingHorizontal: 4,
            borderRadius: 6,
            opacity: 0.55,
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

        {detail && (
          <>
            <div
              data-testid="toolkit-detail-icon-wrap"
              style={{
                width: builtinIconWrapSize,
                height: builtinIconWrapSize,
                borderRadius: 9,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: detailIconBackground,
                flexShrink: 0,
              }}
            >
              <ToolkitIcon
                icon={detail.toolkitIcon}
                size={18}
                fallbackColor="#34d399"
              />
            </div>
            <span
              style={{
                fontSize: 14,
                fontFamily: "Jost",
                fontWeight: 600,
                color: textColor,
              }}
            >
              {detail.toolkitName || toolkitId}
            </span>
          </>
        )}
      </div>

      {/* ── Content ── */}
      <div
        ref={scrollRef}
        className="scrollable"
        style={{
          flex: 1,
          overflowY: "auto",
        }}
      >
        {loading && <LoadingDots isDark={isDark} />}

        {error && (
          <PlaceholderBlock
            icon="tool"
            title="Failed to load details"
            subtitle={error}
            isDark={isDark}
          />
        )}

        {!loading && !error && detail && (
          <>
            {detail.toolkitDescription && (
              <p
                style={{
                  fontSize: 12,
                  fontFamily: "Jost",
                  color: mutedColor,
                  margin: "0 0 12px",
                  lineHeight: 1.55,
                }}
              >
                {detail.toolkitDescription}
              </p>
            )}

            {detail.readmeMarkdown ? (
              <Markdown content={detail.readmeMarkdown} />
            ) : (
              <PlaceholderBlock
                icon="tool"
                title="No documentation"
                subtitle="This toolkit does not provide a README."
                isDark={isDark}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ToolkitDetailPanel;
