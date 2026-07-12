import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import {
  readWorkspaces,
  writeWorkspaces,
  readWorkspaceRoot,
  writeWorkspaceRoot,
  makeWorkspaceId,
  validateWorkspaceRoot,
} from "../settings/runtime";
import { runtimeBridge } from "../../SERVICEs/bridges/unchain_bridge";
import { useTranslation } from "../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { themeHighlightColor } from "../../CONTAINERs/config/theme_highlight";
import Icon from "../../BUILTIN_COMPONENTs/icon/icon";
import SlidingHighlight from "../../BUILTIN_COMPONENTs/class/sliding_highlight";

/* Mono Editorial layout — no containers, underline fields, inline editing,
   keyboard-first (↩ save · esc cancel). Spec:
   docs/superpowers/specs/2026-07-11-workspace-mono-editorial-design.md */

const MONO_FONT = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

/* Row-number palette keyed by name hash. The chat-input workspace switcher
   is expected to reuse the same mapping for cross-surface recognition. */
const NUMBER_PALETTE = ["#8b5cf6", "#60a5fa", "#34d399", "#f59e0b"];
const workspaceHue = (seed) => {
  const str = String(seed || "");
  let sum = 0;
  for (let i = 0; i < str.length; i++) sum += str.charCodeAt(i);
  return NUMBER_PALETTE[sum % NUMBER_PALETTE.length];
};

/* ── Theme colours ───────────────────────────────────────────────────────── */

const useThemeColors = (isDark, theme) =>
  useMemo(
    () => ({
      text: isDark ? "rgba(255,255,255,0.89)" : "rgba(0,0,0,0.85)",
      muted: isDark ? "rgba(255,255,255,0.46)" : "rgba(0,0,0,0.48)",
      faint: isDark ? "rgba(255,255,255,0.30)" : "rgba(0,0,0,0.32)",
      line: isDark ? "rgba(255,255,255,0.075)" : "rgba(0,0,0,0.075)",
      hoverFill: isDark ? "rgba(255,255,255,0.055)" : "rgba(0,0,0,0.04)",
      danger: isDark ? "#f87171" : "#dc2626",
      dangerFill: isDark ? "rgba(248,113,113,0.10)" : "rgba(220,38,38,0.07)",
      success: isDark ? "#4ade80" : "#16a34a",
      successFill: isDark ? "rgba(74,222,128,0.10)" : "rgba(22,163,74,0.08)",
      accent: themeHighlightColor(theme),
    }),
    [isDark, theme],
  );

/* ── Building blocks ─────────────────────────────────────────────────────── */

const SectionLabel = ({ children, dirty, colors, fontFamily, style }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 7,
      fontSize: 10.5,
      fontFamily,
      letterSpacing: "1.6px",
      textTransform: "uppercase",
      fontWeight: 500,
      color: colors.faint,
      marginBottom: 12,
      userSelect: "none",
      ...style,
    }}
  >
    {children}
    {dirty && (
      <span
        data-testid="dirty-dot"
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          backgroundColor: colors.accent,
          flexShrink: 0,
        }}
      />
    )}
  </div>
);

/* Underline field: hairline at rest, accent on focus, danger on error.
   The 1.5px state line is drawn with boxShadow so the layout never shifts. */
const UnderlineInput = ({
  value,
  onChange,
  onKeyDown,
  placeholder,
  mono,
  fontSize,
  fontWeight,
  error,
  autoFocus,
  ariaLabel,
  colors,
  fontFamily,
}) => {
  const [focused, setFocused] = useState(false);
  const stateLine = error ? colors.danger : focused ? colors.accent : null;
  return (
    <input
      type="text"
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      style={{
        width: "100%",
        boxSizing: "border-box",
        padding: "0 0 10px",
        fontSize,
        fontWeight: fontWeight || 400,
        fontFamily: mono ? MONO_FONT : fontFamily,
        color: colors.text,
        background: "transparent",
        border: "none",
        outline: "none",
        borderRadius: 0,
        borderBottom: `1px solid ${colors.line}`,
        boxShadow: stateLine ? `0 1.5px 0 ${stateLine}` : "none",
        transition: "box-shadow 120ms",
      }}
    />
  );
};

/* Quiet action button — default builtin Button chrome (hover fill, press
   animation) kept intact; only sized down and tinted for the mono layout. */
const TextLink = ({
  label,
  onClick,
  disabled,
  tone = "muted",
  weight = 400,
  postfixIcon,
  colors,
  fontFamily,
}) => {
  const toneColor =
    tone === "accent"
      ? colors.accent
      : tone === "success"
        ? colors.success
        : tone === "danger"
          ? colors.danger
          : tone === "faint"
            ? colors.faint
            : colors.muted;
  return (
    <Button
      label={label}
      postfix_icon={postfixIcon}
      onClick={onClick}
      disabled={disabled}
      style={{
        gap: 5,
        content: { icon: { width: 12, height: 12, color: toneColor } },
        fontSize: 12,
        fontFamily,
        fontWeight: weight,
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 6,
        color: toneColor,
        hoverBackgroundColor:
          tone === "danger"
            ? colors.dangerFill
            : tone === "success"
              ? colors.successFill
              : colors.hoverFill,
      }}
    />
  );
};

const Hint = ({ children, colors, fontFamily }) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontSize: 12,
      fontFamily,
      color: colors.faint,
      userSelect: "none",
      whiteSpace: "nowrap",
    }}
  >
    {children}
  </span>
);

const ErrorLine = ({ children, colors }) => (
  <div
    style={{
      fontSize: 11,
      fontFamily: MONO_FONT,
      color: colors.danger,
      marginTop: 9,
      lineHeight: 1.5,
    }}
  >
    ✗ {children}
  </div>
);

const Caption = ({ children, colors, fontFamily, style }) => (
  <div
    style={{
      fontSize: 11,
      fontFamily,
      color: colors.faint,
      lineHeight: 1.5,
      ...style,
    }}
  >
    {children}
  </div>
);

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DefaultRootSection — the path IS the field
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const DefaultRootSection = ({ isDark }) => {
  const { theme } = useContext(ConfigContext);
  const colors = useThemeColors(isDark, theme);
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const { t } = useTranslation();

  const [value, setValue] = useState(() => readWorkspaceRoot());
  const [saved, setSaved] = useState(() => readWorkspaceRoot());
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const browseSupported = runtimeBridge.isWorkspacePickerAvailable();
  const openFolderSupported = runtimeBridge.isOpenRuntimeFolderAvailable();
  const isDirty = value.trim() !== saved.trim();

  const handleSave = useCallback(async () => {
    const candidate = value.trim();
    setBusy(true);
    setError("");
    setInfo("");
    const validation = await validateWorkspaceRoot(candidate);
    if (!validation.valid) {
      setError(validation.reason || "Invalid workspace root.");
      setBusy(false);
      return;
    }
    const nextPath = validation.resolvedPath || candidate;
    writeWorkspaceRoot(nextPath);
    setValue(nextPath);
    setSaved(nextPath);
    setInfo(nextPath ? "Saved." : "Cleared.");
    setBusy(false);
  }, [value]);

  const handleRevert = useCallback(() => {
    setValue(saved);
    setError("");
    setInfo("");
  }, [saved]);

  const handleClear = useCallback(() => {
    writeWorkspaceRoot("");
    setValue("");
    setSaved("");
    setError("");
    setInfo("Cleared.");
  }, []);

  const handleBrowse = useCallback(async () => {
    if (!browseSupported) return;
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const response = await runtimeBridge.pickWorkspaceRoot(
        value.trim() || saved.trim(),
      );
      if (
        !response?.canceled &&
        typeof response?.path === "string" &&
        response.path.trim()
      ) {
        setValue(response.path.trim());
      }
    } catch (err) {
      setError(err?.message || "Failed to open directory picker.");
    } finally {
      setBusy(false);
    }
  }, [browseSupported, value, saved]);

  const handleOpenFolder = useCallback(async () => {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const response = await runtimeBridge.openRuntimeFolder(saved.trim());
      if (!response?.ok) {
        setError(response?.error || "Failed to open folder.");
      }
    } catch (err) {
      setError(err?.message || "Failed to open folder.");
    } finally {
      setBusy(false);
    }
  }, [saved]);

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      if (isDirty && !busy) {
        event.preventDefault();
        handleSave();
      }
    } else if (event.key === "Escape") {
      /* Only swallow esc when there is an edit to cancel — a clean field
         lets it bubble so the modal can close. */
      if (isDirty || error) {
        event.preventDefault();
        event.stopPropagation();
        handleRevert();
      }
    }
  };

  const linkProps = { colors, fontFamily };

  return (
    <div style={{ marginTop: 22 }}>
      <SectionLabel
        dirty={isDirty || Boolean(error)}
        colors={colors}
        fontFamily={fontFamily}
      >
        {t("workspace.default_workspace")}
      </SectionLabel>

      <UnderlineInput
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError("");
          setInfo("");
        }}
        onKeyDown={handleKeyDown}
        placeholder={t("workspace.enter_path")}
        mono
        fontSize={15}
        error={Boolean(error)}
        ariaLabel="default-workspace-root"
        colors={colors}
        fontFamily={fontFamily}
      />

      {error && <ErrorLine colors={colors}>{error}</ErrorLine>}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginLeft: -8,
          marginTop: error ? 7 : 10,
          minHeight: 20,
        }}
      >
        {isDirty ? (
          <>
            <TextLink
              label={t("common.save")}
              postfixIcon="enter_key"
              tone="success"
              weight={500}
              onClick={handleSave}
              disabled={busy || Boolean(error)}
              {...linkProps}
            />
            <Hint {...linkProps}>{t("workspace.esc_to_cancel")}</Hint>
            {browseSupported && (
              <TextLink
                label={t("workspace.browse")}
                onClick={handleBrowse}
                disabled={busy}
                {...linkProps}
              />
            )}
          </>
        ) : (
          <>
            {browseSupported && (
              <TextLink
                label={t("workspace.browse")}
                onClick={handleBrowse}
                disabled={busy}
                {...linkProps}
              />
            )}
            {openFolderSupported && saved.trim() && (
              <TextLink
                label={t("workspace.open_in_explorer")}
                onClick={handleOpenFolder}
                disabled={busy}
                {...linkProps}
              />
            )}
            {saved.trim() && (
              <TextLink
                label={t("model_providers.clear")}
                tone="faint"
                onClick={handleClear}
                disabled={busy}
                {...linkProps}
              />
            )}
            {info && (
              <span
                style={{
                  fontSize: 11,
                  fontFamily: MONO_FONT,
                  color: colors.success,
                }}
              >
                {info}
              </span>
            )}
          </>
        )}
      </div>

      <Caption colors={colors} fontFamily={fontFamily} style={{ marginTop: 14 }}>
        {t("workspace.applied_desc")}
      </Caption>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   WorkspacesSection — numbered rows, inline edit, inline delete confirm
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const rowNumber = (index) => String(index + 1).padStart(2, "0");

const WorkspacesSection = ({ isDark }) => {
  const { theme } = useContext(ConfigContext);
  const colors = useThemeColors(isDark, theme);
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const { t } = useTranslation();

  const [items, setItems] = useState(() => readWorkspaces());
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({ name: "", path: "" });
  const [unsavedIds, setUnsavedIds] = useState(() => new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState("");
  /* One sliding hover pill glides between rows (same pattern as the
     builtin context menu) — refs are collected per row index. */
  const [hoverIndex, setHoverIndex] = useState(-1);
  const rowRefs = useRef([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const confirmRef = useRef(null);

  useEffect(() => {
    if (confirmDeleteId) confirmRef.current?.focus();
  }, [confirmDeleteId]);

  const browseSupported = runtimeBridge.isWorkspacePickerAvailable();
  const linkProps = { colors, fontFamily };

  const startEditing = useCallback((item) => {
    setConfirmDeleteId(null);
    setEditingId(item.id);
    setEditDraft({ name: item.name || "", path: item.path || "" });
    setEditError("");
  }, []);

  const cancelEditing = useCallback(() => {
    setItems((prev) =>
      unsavedIds.has(editingId) ? prev.filter((w) => w.id !== editingId) : prev,
    );
    setUnsavedIds((prev) => {
      const next = new Set(prev);
      next.delete(editingId);
      return next;
    });
    setEditingId(null);
    setEditDraft({ name: "", path: "" });
    setEditError("");
  }, [editingId, unsavedIds]);

  const addItem = useCallback(() => {
    const id = makeWorkspaceId();
    setConfirmDeleteId(null);
    setItems((prev) => [...prev, { id, name: "", path: "" }]);
    setUnsavedIds((prev) => new Set([...prev, id]));
    setEditingId(id);
    setEditDraft({ name: "", path: "" });
    setEditError("");
  }, []);

  const handleBrowse = useCallback(async () => {
    try {
      const response = await runtimeBridge.pickWorkspaceRoot(
        editDraft.path.trim() || "",
      );
      if (
        !response?.canceled &&
        typeof response?.path === "string" &&
        response.path.trim()
      ) {
        setEditDraft((d) => ({ ...d, path: response.path.trim() }));
      }
    } catch (_err) {}
  }, [editDraft.path]);

  const handleSaveItem = useCallback(async () => {
    setIsSaving(true);
    setEditError("");

    const rawPath = editDraft.path.trim();
    let resolvedPath = rawPath;

    if (rawPath) {
      const validation = await validateWorkspaceRoot(rawPath);
      if (!validation.valid) {
        setEditError(validation.reason || "Invalid path.");
        setIsSaving(false);
        return;
      }
      resolvedPath = validation.resolvedPath || rawPath;
    }

    const savedItem = {
      id: editingId,
      name: editDraft.name.trim(),
      path: resolvedPath,
    };

    setItems((prev) => prev.map((w) => (w.id === editingId ? savedItem : w)));
    setUnsavedIds((prev) => {
      const next = new Set(prev);
      next.delete(editingId);
      return next;
    });

    const next = items.map((w) => (w.id === editingId ? savedItem : w));
    writeWorkspaces(next.filter((w) => w.path || w.name));

    setEditingId(null);
    setEditDraft({ name: "", path: "" });
    setIsSaving(false);
  }, [editingId, editDraft, items]);

  const deleteItem = useCallback(
    (id) => {
      const next = items.filter((w) => w.id !== id);
      setItems(next);
      writeWorkspaces(next.filter((w) => w.path || w.name));
      setConfirmDeleteId(null);
      if (editingId === id) {
        setEditingId(null);
        setEditDraft({ name: "", path: "" });
        setEditError("");
      }
      setUnsavedIds((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    },
    [items, editingId],
  );

  const editKeyDown = (event) => {
    if (event.key === "Enter") {
      if (!isSaving) {
        event.preventDefault();
        handleSaveItem();
      }
    } else if (event.key === "Escape") {
      /* Cancel the row edit only — never let esc reach the modal's
         window-level close listener. */
      event.preventDefault();
      event.stopPropagation();
      cancelEditing();
    }
  };

  const dimOthers = editingId !== null;

  /* ── Row renderers ── */

  const renderEditRow = (item, index) => (
    <div
      key={item.id}
      ref={() => {
        rowRefs.current[index] = null;
      }}
      style={{
        display: "flex",
        gap: 14,
        padding: "12px 8px 14px",
        margin: "0 -8px",
        position: "relative",
        zIndex: 1,
      }}
    >
      <span
        style={{
          width: 26,
          flexShrink: 0,
          paddingTop: 3,
          fontSize: 11,
          fontFamily: MONO_FONT,
          color: unsavedIds.has(item.id)
            ? colors.faint
            : workspaceHue(item.name || item.path),
        }}
      >
        {rowNumber(index)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <UnderlineInput
          value={editDraft.name}
          onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
          onKeyDown={editKeyDown}
          placeholder={t("workspace.name_optional")}
          fontSize={13}
          fontWeight={500}
          autoFocus
          ariaLabel="workspace-name"
          colors={colors}
          fontFamily={fontFamily}
        />
        <div style={{ marginTop: 9 }}>
          <UnderlineInput
            value={editDraft.path}
            onChange={(e) =>
              setEditDraft((d) => ({ ...d, path: e.target.value }))
            }
            onKeyDown={editKeyDown}
            placeholder={t("workspace.path_placeholder")}
            mono
            fontSize={12}
            error={Boolean(editError)}
            ariaLabel="workspace-path"
            colors={colors}
            fontFamily={fontFamily}
          />
        </div>
        {editError && <ErrorLine colors={colors}>{editError}</ErrorLine>}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginLeft: -8,
            marginTop: 9,
          }}
        >
          <TextLink
            label={t("common.save")}
            postfixIcon="enter_key"
            tone="success"
            weight={500}
            onClick={handleSaveItem}
            disabled={isSaving}
            {...linkProps}
          />
          <Hint {...linkProps}>{t("workspace.esc_to_cancel")}</Hint>
          {browseSupported && (
            <TextLink
              label={t("workspace.browse")}
              onClick={handleBrowse}
              disabled={isSaving}
              {...linkProps}
            />
          )}
          <span style={{ flex: 1 }} />
          <Hint {...linkProps}>
            tab
            <Icon
              src="tab_key"
              color={colors.faint}
              style={{ width: 13, height: 13, display: "block" }}
            />
          </Hint>
        </div>
      </div>
    </div>
  );

  const renderConfirmRow = (item, index) => {
    const displayName = item.name?.trim() || item.path?.trim() || "Unnamed";
    return (
      <div
        key={item.id}
        data-testid="delete-confirm-row"
        ref={(el) => {
          confirmRef.current = el;
          rowRefs.current[index] = null;
        }}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            deleteItem(item.id);
          } else if (event.key === "Escape") {
            /* Dismiss the confirm only — keep esc away from the modal. */
            event.preventDefault();
            event.stopPropagation();
            setConfirmDeleteId(null);
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          height: 54,
          padding: "0 8px",
          margin: "0 -8px",
          borderRadius: 10,
          backgroundColor: colors.dangerFill,
          outline: "none",
          position: "relative",
          zIndex: 1,
        }}
      >
        <span
          style={{
            width: 26,
            flexShrink: 0,
            fontSize: 11,
            fontFamily: MONO_FONT,
            color: colors.danger,
          }}
        >
          {rowNumber(index)}
        </span>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12.5,
            fontFamily,
            color: colors.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {t("workspace.delete_confirm_inline", { name: displayName })}
          <span style={{ color: colors.muted }}>
            {" — "}
            {t("workspace.delete_confirm_note")}
          </span>
        </div>
        <TextLink
          label={t("common.delete")}
          postfixIcon="enter_key"
          tone="danger"
          weight={500}
          onClick={() => deleteItem(item.id)}
          {...linkProps}
        />
        <Hint {...linkProps}>esc</Hint>
      </div>
    );
  };

  const renderRow = (item, index) => {
    const displayName = item.name?.trim() || item.path?.trim() || "Unnamed";
    const hovered = hoverIndex === index && !dimOthers;
    return (
      <div
        key={item.id}
        ref={(el) => {
          rowRefs.current[index] = el;
        }}
        onMouseEnter={() => setHoverIndex(index)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          height: 54,
          padding: "0 8px",
          margin: "0 -8px",
          borderRadius: 10,
          position: "relative",
          zIndex: 1,
          opacity: dimOthers ? 0.4 : 1,
          transition: "opacity 120ms",
        }}
      >
        <span
          style={{
            width: 26,
            flexShrink: 0,
            fontSize: 11,
            fontFamily: MONO_FONT,
            color: workspaceHue(displayName),
          }}
        >
          {rowNumber(index)}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontFamily,
              fontWeight: 500,
              color: colors.text,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName}
          </div>
          {item.name?.trim() && item.path?.trim() && (
            <div
              style={{
                fontSize: 11,
                fontFamily: MONO_FONT,
                color: colors.muted,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {item.path.trim()}
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
            opacity: hovered ? 1 : 0,
            pointerEvents: hovered ? "auto" : "none",
            transition: "opacity 120ms",
          }}
        >
          <Button
            prefix_icon="folder_open"
            onClick={() => {
              if (item.path?.trim()) {
                runtimeBridge.openRuntimeFolder(item.path.trim());
              }
            }}
            disabled={dimOthers || !item.path?.trim()}
            style={{
              paddingVertical: 3,
              paddingHorizontal: 3,
              borderRadius: 5,
              color: colors.muted,
              content: { icon: { width: 14, height: 14, color: colors.muted } },
              hoverBackgroundColor: colors.hoverFill,
            }}
          />
          <Button
            prefix_icon="edit_pen"
            onClick={() => startEditing(item)}
            disabled={dimOthers}
            style={{
              paddingVertical: 3,
              paddingHorizontal: 3,
              borderRadius: 5,
              color: colors.muted,
              content: { icon: { width: 14, height: 14, color: colors.muted } },
              hoverBackgroundColor: colors.hoverFill,
            }}
          />
          <Button
            prefix_icon="delete"
            onClick={() => setConfirmDeleteId(item.id)}
            disabled={dimOthers}
            style={{
              paddingVertical: 3,
              paddingHorizontal: 3,
              borderRadius: 5,
              color: colors.muted,
              content: { icon: { width: 14, height: 14, color: colors.muted } },
              hoverBackgroundColor: isDark
                ? "rgba(248,113,113,0.14)"
                : "rgba(220,38,38,0.10)",
            }}
          />
        </div>
      </div>
    );
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          margin: "34px 0 8px",
        }}
      >
        <SectionLabel
          colors={colors}
          fontFamily={fontFamily}
          style={{ marginBottom: 0, flex: 1 }}
        >
          {t("workspace.title")}
        </SectionLabel>
        <span
          style={{ fontSize: 11, fontFamily: MONO_FONT, color: colors.faint }}
        >
          {items.length}
        </span>
      </div>

      {items.length === 0 && editingId === null ? (
        <Caption
          colors={colors}
          fontFamily={fontFamily}
          style={{ padding: "6px 0 2px", fontSize: 12 }}
        >
          {t("workspace.no_workspaces")}
        </Caption>
      ) : (
        <div
          style={{ borderTop: `1px solid ${colors.line}`, position: "relative" }}
          onMouseLeave={() => setHoverIndex(-1)}
        >
          <SlidingHighlight
            refs={rowRefs}
            index={dimOthers ? -1 : hoverIndex}
            color={colors.hoverFill}
            borderRadius={10}
            measureKey={`${items.length}:${editingId}:${confirmDeleteId}`}
          />
          {items.map((item, index) => {
            if (editingId === item.id) return renderEditRow(item, index);
            if (confirmDeleteId === item.id)
              return renderConfirmRow(item, index);
            return renderRow(item, index);
          })}
        </div>
      )}

      <div
        style={{ marginTop: 12, marginLeft: -8, opacity: dimOthers ? 0.4 : 1 }}
      >
        <TextLink
          label={t("workspace.add_workspace")}
          tone="accent"
          weight={500}
          onClick={addItem}
          disabled={dimOthers}
          {...linkProps}
        />
      </div>

      <Caption colors={colors} fontFamily={fontFamily} style={{ marginTop: 10 }}>
        {t("workspace.workspace_select_desc")}
      </Caption>
    </div>
  );
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   WorkspaceEditor — reusable composite (DefaultRoot + Workspaces list)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const WorkspaceEditor = ({ isDark }) => (
  <div style={{ display: "flex", flexDirection: "column" }}>
    <DefaultRootSection isDark={isDark} />
    <WorkspacesSection isDark={isDark} />
  </div>
);

export default WorkspaceEditor;
