import { useEffect, useRef, useState } from "react";
import api from "../../../SERVICEs/api";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import ToolkitIcon, {
  isBuiltinToolkitIcon,
  isFileToolkitIcon,
} from "./toolkit_icon";
import { SOURCE_CONFIG } from "../constants";
import LoadingDots from "./loading_dots";
import PlaceholderBlock from "./placeholder_block";
import Markdown from "../../../BUILTIN_COMPONENTs/markdown/markdown";

const ToolkitDetailPanel = ({ toolkitId, toolName, tools, isDark, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  const toolList = Array.isArray(tools) ? tools : [];

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
  const tagBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const tagColor = isDark ? "rgba(255,255,255,0.50)" : "rgba(0,0,0,0.45)";
  const dividerColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const iconWrapSize = 48;
  const hasFileIcon = detail ? isFileToolkitIcon(detail.toolkitIcon) : false;
  const detailIconBackground = isBuiltinToolkitIcon(detail?.toolkitIcon)
    ? detail.toolkitIcon.backgroundColor
    : isDark
      ? "rgba(255,255,255,0.04)"
      : "rgba(0,0,0,0.03)";
  const sc = SOURCE_CONFIG[detail?.source] || SOURCE_CONFIG.builtin;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      {/* ── Back button ── */}
      <div
        style={{
          padding: "0 0 8px",
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
      </div>

      {/* ── Scrollable content ── */}
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
            {/* ── Icon + Name + Description header ── */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
                marginBottom: 16,
              }}
            >
              {hasFileIcon ? (
                <ToolkitIcon
                  icon={detail.toolkitIcon}
                  size={iconWrapSize}
                  fallbackColor={sc.color}
                  style={{ borderRadius: 12, flexShrink: 0 }}
                />
              ) : (
                <div
                  data-testid="toolkit-detail-icon-wrap"
                  style={{
                    width: iconWrapSize,
                    height: iconWrapSize,
                    borderRadius: 12,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: detailIconBackground,
                    flexShrink: 0,
                  }}
                >
                  <ToolkitIcon
                    icon={detail.toolkitIcon}
                    size={28}
                    fallbackColor="#34d399"
                  />
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 16,
                    fontFamily: "Jost",
                    fontWeight: 600,
                    color: textColor,
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  {detail.toolkitName || toolkitId}
                </span>

                {detail.toolkitDescription && (
                  <p
                    style={{
                      fontSize: 12,
                      fontFamily: "Jost",
                      color: mutedColor,
                      margin: 0,
                      lineHeight: 1.55,
                    }}
                  >
                    {detail.toolkitDescription}
                  </p>
                )}
              </div>
            </div>

            {/* ── Tools tags ── */}
            {toolList.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: "Jost",
                    fontWeight: 500,
                    color: mutedColor,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    display: "block",
                    marginBottom: 8,
                  }}
                >
                  {toolList.length} Tool{toolList.length !== 1 ? "s" : ""}
                </span>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                  }}
                >
                  {toolList.map((tool, idx) => (
                    <span
                      key={tool.name || idx}
                      style={{
                        fontSize: 11.5,
                        fontFamily: "Jost",
                        fontWeight: 500,
                        color: tagColor,
                        backgroundColor: tagBg,
                        padding: "3px 10px",
                        borderRadius: 6,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {tool.title || tool.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Divider ── */}
            <div
              style={{
                height: 1,
                backgroundColor: dividerColor,
                marginBottom: 16,
              }}
            />

            {/* ── README markdown ── */}
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
