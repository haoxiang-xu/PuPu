import { useContext, useRef, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import Modal from "../../../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { toast } from "../../../../SERVICEs/toast";
import { findCustomProvider } from "../../../../SERVICEs/custom_provider_store";
import {
  parseImportText,
  validateImport,
  classifyConflict,
  commitImport,
} from "./import_pipeline";

const PROTOCOL_LABEL = {
  anthropic: "Anthropic",
  "openai-responses": "OpenAI Responses",
  ollama: "Ollama",
};
const AUTH_LABEL = {
  "x-api-key": "x-api-key",
  bearer: "Bearer",
  header: "Custom header",
  none: "None",
};

/**
 * Import modal (design §8.3). Two visual steps inside one modal:
 *   1. source — paste JSON / pick a file / drop a file, then Validate
 *   2. review — the review card + conflict resolution, then Import
 *
 * `presetSeed` lets the preset picker reuse this exact pipeline: when provided,
 * the modal jumps straight to validation of that object with source:"preset".
 */
const CustomProviderImportModal = ({
  open,
  onClose,
  onImported,
  presetSeed = null,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const fileRef = useRef(null);

  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  // review = { provider, diagnostics, conflict } once validation succeeds
  const [review, setReview] = useState(null);
  const [diagnostics, setDiagnostics] = useState([]);
  const source = presetSeed ? "preset" : "import";

  // Seed / reset per open. Preset seeds validate immediately.
  const [seedKey, setSeedKey] = useState("");
  const currentSeedKey = `${open}:${presetSeed ? presetSeed.__presetId || "preset" : "manual"}`;
  if (open && currentSeedKey !== seedKey) {
    setSeedKey(currentSeedKey);
    setText("");
    setDiagnostics([]);
    if (presetSeed) {
      const result = validateImport(presetSeed);
      if (result.ok) {
        setReview({
          provider: result.provider,
          diagnostics: result.diagnostics || [],
          conflict: classifyConflict(result.provider),
        });
      } else {
        setReview(null);
        setDiagnostics(result.diagnostics || []);
      }
    } else {
      setReview(null);
    }
  }

  const textColor = "var(--pupu-text-strong)";
  const mutedColor = "var(--pupu-text-faint)";
  const sectionColor = "var(--pupu-text-faint)";
  const borderColor = "var(--pupu-border)";
  const dividerColor = "var(--pupu-border)";
  const accentColor = isDark ? "#7c8cf8" : "#2563eb";
  const errorColor = isDark ? "#f87171" : "#dc2626";
  const warnColor = isDark ? "#fdba74" : "#c2410c";
  const actionBg = "var(--pupu-overlay-active)";
  const highlightBg = isDark ? "rgba(124,140,248,0.14)" : "rgba(37,99,235,0.08)";

  const sectionLabelStyle = {
    fontSize: 9.5,
    fontFamily,
    letterSpacing: "0.6px",
    textTransform: "uppercase",
    color: sectionColor,
    marginBottom: 9,
  };

  const close = () => {
    setText("");
    setReview(null);
    setDiagnostics([]);
    setSeedKey("");
    onClose?.();
  };

  /* ── validate step ── */

  const runValidate = (rawText) => {
    const parsed = parseImportText(rawText);
    if (!parsed.ok) {
      setReview(null);
      setDiagnostics(parsed.diagnostics);
      return;
    }
    const result = validateImport(parsed.data);
    if (!result.ok) {
      setReview(null);
      setDiagnostics(result.diagnostics || []);
      return;
    }
    setDiagnostics([]);
    setReview({
      provider: result.provider,
      diagnostics: result.diagnostics || [],
      conflict: classifyConflict(result.provider),
    });
  };

  const handlePickFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || "");
      setText(content);
      runValidate(content);
    };
    reader.onerror = () =>
      setDiagnostics([
        {
          code: "read_failed",
          path: "",
          message: t("model_providers.custom.import_read_failed"),
          severity: "error",
        },
      ]);
    reader.readAsText(file);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || "");
      setText(content);
      runValidate(content);
    };
    reader.onerror = () =>
      setDiagnostics([
        {
          code: "read_failed",
          path: "",
          message: t("model_providers.custom.import_read_failed"),
          severity: "error",
        },
      ]);
    reader.readAsText(file);
  };

  /* ── import step ── */

  const doImport = async (mode) => {
    if (!review) return;
    const result = await commitImport(review.provider, mode, { source });
    if (!result.ok) {
      setDiagnostics(result.diagnostics || []);
      return;
    }
    toast.success(
      t("model_providers.custom.import_success", {
        name: review.provider.display_name,
      }),
      { dedupeKey: `custom_provider_import_${result.slug}` },
    );
    onImported?.({
      slug: result.slug,
      requiresKey: result.requiresKey,
      endpointChanged: result.endpointChanged,
    });
    close();
  };

  if (!open) {
    return null;
  }

  /* ── render: source step ── */

  const renderSource = () => (
    <>
      <div style={sectionLabelStyle}>
        {t("model_providers.custom.import_source")}
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `1px dashed ${dragging ? accentColor : borderColor}`,
          borderRadius: 10,
          padding: 12,
          backgroundColor: dragging ? highlightBg : "transparent",
          transition: "background 0.12s, border-color 0.12s",
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("model_providers.custom.import_paste_placeholder")}
          style={{
            width: "100%",
            minHeight: 120,
            resize: "vertical",
            boxSizing: "border-box",
            border: "none",
            borderRadius: 8,
            padding: 4,
            backgroundColor: "transparent",
            color: textColor,
            fontFamily: "'SF Mono', 'Fira Code', monospace",
            fontSize: 11.5,
            outline: "none",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginTop: 8,
          }}
        >
          <Button
            label={t("model_providers.custom.import_choose_file")}
            prefix_icon="upload"
            onClick={() => fileRef.current?.click()}
            style={{
              fontSize: 11.5,
              fontFamily,
              paddingVertical: 4,
              paddingHorizontal: 12,
              borderRadius: 7,
              color: mutedColor,
              content: { icon: { width: 13, height: 13 } },
            }}
          />
          <span style={{ fontSize: 11, fontFamily, color: mutedColor }}>
            {t("model_providers.custom.import_drop_hint")}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            onChange={handlePickFile}
            style={{ display: "none" }}
          />
        </div>
      </div>

      {diagnostics.length > 0 && (
        <div style={{ marginTop: 14 }}>{renderDiagnostics(diagnostics)}</div>
      )}
    </>
  );

  /* ── render: review card ── */

  const renderReview = () => {
    const p = review.provider;
    const conflict = review.conflict;
    const headers = Object.entries(p.extra_headers || {});
    const existing = conflict.kind === "conflict" ? conflict.existing : null;

    return (
      <>
        <div style={sectionLabelStyle}>
          {t("model_providers.custom.import_review")}
        </div>

        <div
          style={{
            border: `1px solid ${borderColor}`,
            borderRadius: 10,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              fontSize: 14,
              fontFamily,
              fontWeight: 600,
              color: textColor,
            }}
          >
            {p.display_name}
          </div>

          {reviewRow(
            t("model_providers.custom.field_protocol"),
            PROTOCOL_LABEL[p.protocol] || p.protocol,
          )}

          {/* base_url — highlighted, full text */}
          <div>
            <div style={metaLabelStyle}>
              {t("model_providers.custom.field_base_url")}
            </div>
            <div
              style={{
                fontSize: 12,
                fontFamily: "'SF Mono', 'Fira Code', monospace",
                color: accentColor,
                backgroundColor: highlightBg,
                padding: "6px 9px",
                borderRadius: 6,
                wordBreak: "break-all",
              }}
            >
              {p.base_url}
            </div>
          </div>

          {reviewRow(
            t("model_providers.custom.field_auth_mode"),
            AUTH_LABEL[p.auth?.mode] || p.auth?.mode || "none",
          )}

          {headers.length > 0 && (
            <div>
              <div style={metaLabelStyle}>
                {t("model_providers.custom.field_extra_headers")}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {headers.map(([name, value]) => (
                  <div
                    key={name}
                    style={{
                      fontSize: 11.5,
                      fontFamily: "'SF Mono', 'Fira Code', monospace",
                      color: mutedColor,
                    }}
                  >
                    {name}: {value}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div style={metaLabelStyle}>
              {t("model_providers.custom.section_models")} (
              {(p.models || []).length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {(p.models || []).map((m) => (
                <span
                  key={m.id}
                  style={{
                    fontSize: 11,
                    fontFamily,
                    padding: "2px 8px",
                    borderRadius: 999,
                    backgroundColor: "var(--pupu-overlay-hover)",
                    color: mutedColor,
                  }}
                >
                  {m.display_name || m.id}
                </span>
              ))}
            </div>
          </div>

          {p.notes && (
            <div>
              <div style={metaLabelStyle}>
                {t("model_providers.custom.field_notes")}
              </div>
              <div
                style={{ fontSize: 11.5, fontFamily, color: mutedColor, lineHeight: 1.5 }}
              >
                {p.notes}
              </div>
            </div>
          )}
        </div>

        {/* warnings from normalize */}
        {review.diagnostics.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {renderDiagnostics(review.diagnostics)}
          </div>
        )}

        {/* fixed trust notice (§8.3) */}
        <div
          style={{
            marginTop: 12,
            padding: "9px 11px",
            borderRadius: 8,
            backgroundColor: isDark
              ? "rgba(253,186,116,0.10)"
              : "rgba(194,65,12,0.07)",
            fontSize: 11,
            fontFamily,
            color: warnColor,
            lineHeight: 1.5,
          }}
        >
          {t("model_providers.custom.import_trust_notice")}
        </div>

        {/* conflict handling */}
        {conflict.kind === "conflict" && (
          <div
            style={{
              marginTop: 12,
              padding: "10px 12px",
              borderRadius: 8,
              border: `1px solid ${borderColor}`,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontFamily,
                fontWeight: 500,
                color: textColor,
                marginBottom: 6,
              }}
            >
              {t("model_providers.custom.import_conflict_title", {
                id: p.id,
              })}
            </div>
            {conflict.changed ? (
              <>
                <div
                  style={{
                    fontSize: 11,
                    fontFamily,
                    color: warnColor,
                    lineHeight: 1.5,
                    marginBottom: 8,
                  }}
                >
                  {t("model_providers.custom.import_conflict_endpoint_changed")}
                </div>
                {existing && (
                  <div
                    style={{
                      fontSize: 11,
                      fontFamily: "'SF Mono', 'Fira Code', monospace",
                      color: mutedColor,
                      marginBottom: 8,
                      lineHeight: 1.6,
                    }}
                  >
                    <div style={{ color: errorColor }}>- {existing.base_url}</div>
                    <div style={{ color: accentColor }}>+ {p.base_url}</div>
                  </div>
                )}
              </>
            ) : (
              <div
                style={{
                  fontSize: 11,
                  fontFamily,
                  color: mutedColor,
                  lineHeight: 1.5,
                  marginBottom: 8,
                }}
              >
                {t("model_providers.custom.import_conflict_same_endpoint", {
                  oldRev: existing?.metadata?.revision ?? "—",
                  newRev: p.metadata?.revision ?? "—",
                })}
              </div>
            )}
          </div>
        )}
      </>
    );
  };

  const reviewRow = (label, value) => (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
      <span style={{ ...metaLabelStyle, marginBottom: 0, minWidth: 90 }}>
        {label}
      </span>
      <span style={{ fontSize: 12, fontFamily, color: textColor }}>{value}</span>
    </div>
  );

  const metaLabelStyle = {
    fontSize: 10,
    fontFamily,
    color: mutedColor,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: "0.4px",
  };

  const renderDiagnostics = (list) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {list.map((d, i) => (
        <div
          key={`${d.code}-${i}`}
          style={{
            fontSize: 11.5,
            fontFamily,
            color: d.severity === "warning" ? warnColor : errorColor,
            lineHeight: 1.5,
          }}
        >
          {d.path ? <span style={{ opacity: 0.7 }}>{d.path} · </span> : null}
          {d.message} ({d.code})
        </div>
      ))}
    </div>
  );

  /* ── footer buttons depend on step ── */

  const renderFooter = () => {
    if (!review) {
      return (
        <>
          <Button
            label={t("common.cancel")}
            onClick={close}
            style={footerSecondaryStyle}
          />
          <Button
            label={t("model_providers.custom.import_validate")}
            disabled={!text.trim()}
            onClick={() => runValidate(text)}
            style={footerPrimaryStyle(!!text.trim())}
          />
        </>
      );
    }

    const conflict = review.conflict;
    if (conflict.kind === "conflict") {
      return (
        <>
          <Button
            label={t("common.cancel")}
            onClick={close}
            style={footerSecondaryStyle}
          />
          <Button
            label={t("model_providers.custom.import_rename")}
            onClick={() => doImport("rename")}
            style={footerSecondaryStyle}
          />
          <Button
            label={t("model_providers.custom.import_overwrite")}
            onClick={() => doImport("overwrite")}
            style={footerPrimaryStyle(true)}
          />
        </>
      );
    }

    return (
      <>
        <Button
          label={t("common.cancel")}
          onClick={close}
          style={footerSecondaryStyle}
        />
        <Button
          label={t("model_providers.custom.import_confirm")}
          onClick={() => doImport("new")}
          style={footerPrimaryStyle(true)}
        />
      </>
    );
  };

  const footerSecondaryStyle = {
    fontSize: 12.5,
    fontFamily,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 8,
    opacity: 0.75,
  };
  const footerPrimaryStyle = (enabled) => ({
    fontSize: 12.5,
    fontFamily,
    fontWeight: 500,
    paddingVertical: 6,
    paddingHorizontal: 18,
    borderRadius: 8,
    color: enabled ? accentColor : mutedColor,
    root: { background: actionBg },
    state: { disabled: { root: { opacity: 0.6, cursor: "not-allowed" } } },
  });

  return (
    <Modal
      open={open}
      onClose={close}
      style={{
        width: 540,
        maxWidth: "92vw",
        maxHeight: "88vh",
        padding: 0,
        backgroundColor: "var(--pupu-background)",
        borderRadius: 14,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 22px 12px",
          flexShrink: 0,
        }}
      >
        <span
          style={{ fontSize: 15, fontFamily, fontWeight: 600, color: textColor }}
        >
          {presetSeed
            ? t("model_providers.custom.preset_add_title")
            : t("model_providers.custom.import_title")}
        </span>
        <Button
          ariaLabel={t("common.close")}
          prefix_icon="close"
          onClick={close}
          style={{
            paddingVertical: 4,
            paddingHorizontal: 4,
            borderRadius: 6,
            content: { icon: { width: 16, height: 16 } },
          }}
        />
      </div>

      <div
        className="scrollable"
        style={{ flex: 1, overflowY: "auto", padding: "4px 22px 12px" }}
      >
        {review ? renderReview() : renderSource()}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          padding: "12px 22px 16px",
          borderTop: `1px solid ${dividerColor}`,
          flexShrink: 0,
        }}
      >
        {renderFooter()}
      </div>
    </Modal>
  );
};

export default CustomProviderImportModal;
export { findCustomProvider };
