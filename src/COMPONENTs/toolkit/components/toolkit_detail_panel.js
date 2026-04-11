import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import api from "../../../SERVICEs/api";
import ToolkitIcon, {
  isBuiltinToolkitIcon,
  isFileToolkitIcon,
} from "./toolkit_icon";
import { SOURCE_CONFIG } from "../constants";
import LoadingDots from "./loading_dots";
import PlaceholderBlock from "./placeholder_block";
import Markdown from "../../../BUILTIN_COMPONENTs/markdown/markdown";
import { SettingsSection, SettingsRow } from "../../settings/appearance";
import { SemiSwitch } from "../../../BUILTIN_COMPONENTs/input/switch";
import Modal from "../../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import {
  isToolkitAutoApprove,
  setToolkitAutoApprove,
} from "../../../SERVICEs/toolkit_auto_approve_store";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";

const ToolkitAutoApproveConfirmModal = ({
  open,
  onClose,
  onConfirm,
  isDark,
}) => {
  const { t } = useTranslation();
  return (
  <Modal
    open={open}
    onClose={onClose}
    style={{
      width: 420,
      padding: "28px 28px 20px",
      backgroundColor: isDark ? "#1a1a1a" : "#ffffff",
      display: "flex",
      flexDirection: "column",
      gap: 0,
      borderRadius: 12,
    }}
  >
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: isDark
          ? "rgba(255,160,0,0.13)"
          : "rgba(200,120,0,0.09)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16,
        flexShrink: 0,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20ZM11 15H13V17H11V15ZM11 7H13V13H11V7Z"
          fill={isDark ? "rgba(255,180,60,0.9)" : "rgba(160,100,0,0.9)"}
        />
      </svg>
    </div>

    <div
      style={{
        fontSize: 15,
        fontWeight: 600,
        color: isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)",
        marginBottom: 8,
        lineHeight: 1.3,
      }}
    >
      Enable Auto Approve Tools?
    </div>

    <div
      style={{
        fontSize: 13,
        lineHeight: 1.6,
        color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
        marginBottom: 20,
      }}
    >
      All tools in this toolkit will be executed automatically without asking
      for your confirmation. This may pose security risks if the toolkit
      performs destructive or sensitive operations.
    </div>

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button
        label={t("common.cancel")}
        onClick={onClose}
        style={{
          fontSize: 13,
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 7,
          opacity: 0.65,
        }}
      />
      <Button
        label={t("toolkit.enable_auto_approve")}
        onClick={() => {
          onConfirm?.();
          onClose?.();
        }}
        style={{
          fontSize: 13,
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 7,
          backgroundColor: isDark
            ? "rgba(220,140,0,0.30)"
            : "rgba(200,120,0,0.12)",
          hoverBackgroundColor: isDark
            ? "rgba(220,140,0,0.48)"
            : "rgba(200,120,0,0.22)",
          color: isDark ? "rgba(255,200,80,1)" : "rgba(140,80,0,1)",
        }}
      />
    </div>
  </Modal>
  );
};

const ToolkitDeleteConfirmModal = ({
  open,
  onClose,
  onConfirm,
  isDark,
  toolkitLabel,
}) => {
  const { t } = useTranslation();
  return (
  <Modal
    open={open}
    onClose={onClose}
    style={{
      width: 360,
      padding: "28px 28px 20px",
      backgroundColor: isDark ? "#1a1a1a" : "#ffffff",
      display: "flex",
      flexDirection: "column",
      gap: 0,
      borderRadius: 12,
    }}
  >
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: isDark
          ? "rgba(220,50,50,0.15)"
          : "rgba(220,50,50,0.09)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16,
        flexShrink: 0,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M17 6H22V8H20V21C20 21.5523 19.5523 22 19 22H5C4.44772 22 4 21.5523 4 21V8H2V6H7V3C7 2.44772 7.44772 2 8 2H16C16.5523 2 17 2.44772 17 3V6ZM18 8H6V20H18V8ZM9 11H11V17H9V11ZM13 11H15V17H13V11ZM9 4V6H15V4H9Z"
          fill={isDark ? "rgba(255,100,100,0.85)" : "rgba(200,40,40,0.85)"}
        />
      </svg>
    </div>

    <div
      style={{
        fontSize: 15,
        fontWeight: 600,
        color: isDark ? "rgba(255,255,255,0.90)" : "rgba(0,0,0,0.85)",
        marginBottom: 8,
        lineHeight: 1.3,
      }}
    >
      Delete "{toolkitLabel}"?
    </div>

    <div
      style={{
        fontSize: 13,
        color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.45)",
        marginBottom: 24,
        lineHeight: 1.5,
      }}
    >
      This toolkit and all its tools will be permanently removed from your
      installation. This cannot be undone.
    </div>

    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <Button
        label={t("common.cancel")}
        onClick={onClose}
        style={{
          fontSize: 13,
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 7,
          opacity: 0.65,
        }}
      />
      <Button
        label={t("common.delete")}
        onClick={() => {
          onConfirm?.();
          onClose?.();
        }}
        style={{
          fontSize: 13,
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 7,
          backgroundColor: isDark
            ? "rgba(220,50,50,0.40)"
            : "rgba(220,50,50,0.12)",
          hoverBackgroundColor: isDark
            ? "rgba(220,50,50,0.58)"
            : "rgba(220,50,50,0.22)",
          color: isDark ? "rgba(255,140,140,1)" : "rgba(180,30,30,1)",
        }}
      />
    </div>
  </Modal>
  );
};

const ToolkitDetailPanel = ({
  toolkitId,
  toolName,
  tools,
  isDark,
  isBuiltin,
  defaultEnabled,
  onToggleEnabled,
  onDelete,
  onBack,
}) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  const toolList = useMemo(() => (Array.isArray(tools) ? tools : []), [tools]);

  /* ── Auto-approve state ── */
  const [autoApprove, setAutoApprove] = useState(() =>
    isToolkitAutoApprove(toolkitId),
  );
  const [showApproveConfirm, setShowApproveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    setAutoApprove(isToolkitAutoApprove(toolkitId));
  }, [toolkitId]);

  const handleAutoApproveToggle = useCallback(
    (val) => {
      if (val) {
        setShowApproveConfirm(true);
      } else {
        const toolNames = toolList.map((t) => t.name || t.title || "");
        setToolkitAutoApprove(toolkitId, false, toolNames);
        setAutoApprove(false);
      }
    },
    [toolkitId, toolList],
  );

  const confirmAutoApprove = useCallback(() => {
    const toolNames = toolList.map((t) => t.name || t.title || "");
    setToolkitAutoApprove(toolkitId, true, toolNames);
    setAutoApprove(true);
  }, [toolkitId, toolList]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api.unchain
      .getToolkitDetail(toolkitId, toolName)
      .then((payload) => {
        if (cancelled) return;
        setDetail(payload);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || t("toolkit.load_detail_failed"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [toolkitId, toolName, t]);

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
  const toolkitLabel = detail?.toolkitName || toolkitId;
  const showHeader = !loading && !error && detail;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          paddingRight: 24,
        }}
      >
        <div style={{ marginBottom: showHeader ? 12 : 0 }}>
          <Button
            prefix_icon="arrow_left"
            onClick={onBack}
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: isDark ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.68)",
              paddingVertical: 5,
              paddingHorizontal: 5,
              borderRadius: 8,
              root: {
                background: isDark
                  ? "rgba(255,255,255,0.05)"
                  : "rgba(0,0,0,0.04)",
              },
              hoverBackgroundColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.07)",
              activeBackgroundColor: isDark
                ? "rgba(255,255,255,0.12)"
                : "rgba(0,0,0,0.1)",
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

        {showHeader && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
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
                  fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
                  fontWeight: 600,
                  color: textColor,
                  display: "block",
                  marginBottom: 4,
                }}
              >
                {toolkitLabel}
              </span>

              {detail.toolkitDescription && (
                <p
                  style={{
                    fontSize: 12,
                    fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
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
        )}

        {showHeader && (
          <div
            style={{
              height: 1,
              backgroundColor: dividerColor,
              marginTop: 16,
            }}
          />
        )}
      </div>

      <div
        ref={scrollRef}
        className="scrollable"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 0 24px 0",
        }}
      >
        <div style={{ paddingRight: 24 }}>
          {loading && <LoadingDots isDark={isDark} />}

          {error && (
            <PlaceholderBlock
              icon="tool"
              title={t("toolkit.load_detail_title")}
              subtitle={error}
              isDark={isDark}
            />
          )}

          {!loading && !error && detail && (
            <>
              {/* ── Tools tags ── */}
              {toolList.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
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
                          fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
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

              {/* ── Settings ── */}
              <SettingsSection title={t("toolkit.settings_section")}>
                <SettingsRow
                  label={t("toolkit.auto_enable_label")}
                  description={t("toolkit.auto_enable_desc")}
                >
                  <SemiSwitch
                    on={Boolean(defaultEnabled)}
                    set_on={(val) => {
                      if (onToggleEnabled) onToggleEnabled(toolkitId, val);
                    }}
                    style={{ width: 56, height: 28 }}
                  />
                </SettingsRow>

                <SettingsRow
                  label={t("toolkit.auto_approve_label")}
                  description={t("toolkit.auto_approve_desc")}
                >
                  <SemiSwitch
                    on={autoApprove}
                    set_on={handleAutoApproveToggle}
                    style={{
                      width: 56,
                      height: 28,
                      backgroundColor_on: "#E5484D",
                    }}
                  />
                </SettingsRow>

                <SettingsRow
                  label={t("toolkit.delete_label")}
                  description={
                    isBuiltin
                      ? t("toolkit.delete_desc_builtin")
                      : t("toolkit.delete_desc")
                  }
                >
                  <Button
                    prefix_icon="delete"
                    label={t("common.delete")}
                    onClick={() => {
                      if (!isBuiltin) setShowDeleteConfirm(true);
                    }}
                    disabled={isBuiltin}
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: isBuiltin
                        ? isDark
                          ? "rgba(255,255,255,0.25)"
                          : "rgba(0,0,0,0.25)"
                        : "#E5484D",
                      paddingVertical: 6,
                      paddingHorizontal: 12,
                      borderRadius: 7,
                      gap: 5,
                      opacity: isBuiltin ? 0.5 : 1,
                      cursor: isBuiltin ? "not-allowed" : "pointer",
                      root: {
                        background: "transparent",
                        border: "none",
                      },
                      hoverBackgroundColor: isDark
                        ? "rgba(229,72,77,0.14)"
                        : "rgba(229,72,77,0.10)",
                      activeBackgroundColor: isDark
                        ? "rgba(229,72,77,0.22)"
                        : "rgba(229,72,77,0.16)",
                      content: {
                        icon: { width: 14, height: 14 },
                      },
                    }}
                  />
                </SettingsRow>
              </SettingsSection>

              {/* ── Auto-approve confirm modal ── */}
              <ToolkitAutoApproveConfirmModal
                open={showApproveConfirm}
                onClose={() => setShowApproveConfirm(false)}
                onConfirm={confirmAutoApprove}
                isDark={isDark}
              />

              {/* ── Delete confirm modal ── */}
              <ToolkitDeleteConfirmModal
                open={showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={() => {
                  onDelete?.(toolkitId);
                }}
                isDark={isDark}
                toolkitLabel={toolkitLabel}
              />

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
                  title={t("toolkit.no_documentation_title")}
                  subtitle={t("toolkit.no_documentation_subtitle")}
                  isDark={isDark}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ToolkitDetailPanel;
