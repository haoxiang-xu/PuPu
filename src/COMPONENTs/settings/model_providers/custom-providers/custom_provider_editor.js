import { useContext, useRef, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import Modal from "../../../../BUILTIN_COMPONENTs/modal/modal";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import { Input } from "../../../../BUILTIN_COMPONENTs/input/input";
import Icon from "../../../../BUILTIN_COMPONENTs/icon/icon";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { api } from "../../../../SERVICEs/api";
import { toast } from "../../../../SERVICEs/toast";
import {
  addCustomProvider,
  updateCustomProvider,
  findCustomProvider,
  normalizeCustomProvider,
  setCustomProviderSecret,
  getCustomProviderSecret,
  setCustomProviderEnabled,
} from "../../../../SERVICEs/custom_provider_store";

/* ── protocol / auth option tables ─────────────────────────────────────── */

const PROTOCOL_OPTIONS = [
  { value: "anthropic", labelKey: "model_providers.custom.protocol_anthropic" },
  {
    value: "openai-responses",
    labelKey: "model_providers.custom.protocol_openai_responses",
  },
  { value: "ollama", labelKey: "model_providers.custom.protocol_ollama" },
];

const AUTH_OPTIONS = [
  { value: "x-api-key", labelKey: "model_providers.custom.auth_x_api_key" },
  { value: "bearer", labelKey: "model_providers.custom.auth_bearer" },
  { value: "header", labelKey: "model_providers.custom.auth_header" },
  { value: "none", labelKey: "model_providers.custom.auth_none" },
];

/* The five capability toggles/values surfaced in the model row editor (§2.1). */
const CAPABILITY_BOOLEANS = [
  { key: "supports_tools", labelKey: "model_providers.custom.cap_tools" },
  { key: "supports_vision", labelKey: "model_providers.custom.cap_vision" },
  { key: "supports_reasoning", labelKey: "model_providers.custom.cap_reasoning" },
];
const CAPABILITY_NUMBERS = [
  { key: "max_tokens", labelKey: "model_providers.custom.cap_max_tokens" },
  {
    key: "max_context_window_tokens",
    labelKey: "model_providers.custom.cap_max_context",
  },
];

/**
 * Soft UI cap on extra-header rows, mirroring the schema's maxProperties: 10
 * (§2.1). This is a UX signal only — the authoritative enforcement lives in the
 * store's normalizeCustomProvider / schema (C3 belongs to the store). We only
 * grey out the "Add header" button and show a hint so the user can't blow past
 * the limit and hit a confusing validation error later.
 */
const MAX_EXTRA_HEADER_ROWS = 10;

let modelRowSeq = 1;
const nextRowId = () => `mrow-${modelRowSeq++}`;

const awaitDefinitionPersistence = async (result) => {
  const persistence = result?.persistence;
  if (!persistence || typeof persistence.then !== "function") {
    const error = new Error("Provider definition write was not acknowledged");
    error.code = "provider_definition_write_failed";
    throw error;
  }
  await persistence;
};

/** Blank editable model row. */
const emptyModelRow = () => ({
  rowId: nextRowId(),
  id: "",
  display_name: "",
  capabilities: {},
  default_payload_text: "",
});

/** Blank extra-header row. */
const emptyHeaderRow = () => ({ rowId: nextRowId(), name: "", value: "" });

/**
 * Turn a stored/normalized provider definition into editor form state.
 * Returns the blank form when `def` is null (create mode).
 */
const defToForm = (def) => {
  if (!def) {
    return {
      id: "",
      display_name: "",
      description: "",
      notes: "",
      protocol: "anthropic",
      base_url: "",
      timeout_seconds: "",
      extra_headers: [emptyHeaderRow()],
      auth_mode: "x-api-key",
      auth_header_name: "",
      auth_key_label: "",
      auth_key_hint: "",
      models: [emptyModelRow()],
      default_model: "",
      // Opaque pass-through fields with no UI: carried verbatim so an
      // edit/Save round-trip never drops them (C4). null = absent.
      metadata: null,
    };
  }
  const headerRows = Object.entries(def.extra_headers || {}).map(
    ([name, value]) => ({ rowId: nextRowId(), name, value: String(value) }),
  );
  return {
    id: def.id || "",
    display_name: def.display_name || "",
    description: def.description || "",
    notes: def.notes || "",
    protocol: def.protocol || "anthropic",
    base_url: def.base_url || "",
    timeout_seconds:
      def.timeout_seconds != null ? String(def.timeout_seconds) : "",
    extra_headers: headerRows.length > 0 ? headerRows : [emptyHeaderRow()],
    auth_mode: def.auth?.mode || "none",
    auth_header_name: def.auth?.header_name || "",
    auth_key_label: def.auth?.key_label || "",
    auth_key_hint: def.auth?.key_hint || "",
    models: (def.models || []).map((m) => ({
      rowId: nextRowId(),
      id: m.id || "",
      display_name: m.display_name || "",
      capabilities: { ...(m.capabilities || {}) },
      default_payload_text:
        m.default_payload && Object.keys(m.default_payload).length > 0
          ? JSON.stringify(m.default_payload, null, 0)
          : "",
    })),
    // §2.3: default_model is one of the model ids (surfaced as a per-row radio).
    default_model:
      typeof def.default_model === "string" ? def.default_model : "",
    // metadata (e.g. { revision }) has no editor UI but MUST survive the
    // round-trip (C4): carry the whole object through verbatim.
    metadata:
      def.metadata && typeof def.metadata === "object" ? def.metadata : null,
  };
};

/**
 * Assemble a RAW provider object (pre-normalize) from editor form state, so we
 * can feed it straight into normalizeCustomProvider (single source of truth for
 * validation, shared with the import path). default_payload JSON is parsed here
 * only to surface a friendly per-row parse error; normalize does the real work.
 */
const formToRaw = (form) => {
  const extraHeaders = {};
  for (const row of form.extra_headers) {
    const name = (row.name || "").trim();
    if (name) {
      extraHeaders[name] = row.value || "";
    }
  }

  const models = form.models.map((row) => {
    const model = { id: (row.id || "").trim() };
    const displayName = (row.display_name || "").trim();
    if (displayName) {
      model.display_name = displayName;
    }
    const caps = {};
    for (const { key } of CAPABILITY_BOOLEANS) {
      if (row.capabilities[key] === true) {
        caps[key] = true;
      }
    }
    for (const { key } of CAPABILITY_NUMBERS) {
      const raw = row.capabilities[key];
      if (raw !== undefined && raw !== "" && Number.isFinite(Number(raw))) {
        caps[key] = Math.floor(Number(raw));
      }
    }
    if (Object.keys(caps).length > 0) {
      model.capabilities = caps;
    }
    const payloadText = (row.default_payload_text || "").trim();
    if (payloadText) {
      try {
        model.default_payload = JSON.parse(payloadText);
      } catch (_error) {
        // Leave it out; the caller flags a per-row JSON error separately.
        model.default_payload = { __invalid_json: true };
      }
    }
    return model;
  });

  const raw = {
    id: (form.id || "").trim(),
    display_name: (form.display_name || "").trim(),
    protocol: form.protocol,
    base_url: (form.base_url || "").trim(),
    auth: { mode: form.auth_mode },
    models,
  };
  if ((form.description || "").trim()) {
    raw.description = form.description.trim();
  }
  if (form.auth_mode === "header" && (form.auth_header_name || "").trim()) {
    raw.auth.header_name = form.auth_header_name.trim();
  }
  if ((form.auth_key_label || "").trim()) {
    raw.auth.key_label = form.auth_key_label.trim();
  }
  if ((form.auth_key_hint || "").trim()) {
    raw.auth.key_hint = form.auth_key_hint.trim();
  }
  if (Object.keys(extraHeaders).length > 0) {
    raw.extra_headers = extraHeaders;
  }
  const timeout = (form.timeout_seconds || "").trim();
  if (timeout && Number.isFinite(Number(timeout))) {
    raw.timeout_seconds = Math.floor(Number(timeout));
  }
  // default_model: emit only when it still names one of the current model ids
  // (normalize re-checks this too and clears it with a warning otherwise).
  const defaultModel = (form.default_model || "").trim();
  if (defaultModel && models.some((m) => m.id === defaultModel)) {
    raw.default_model = defaultModel;
  }
  // metadata pass-through (no UI) — carried verbatim so a form round-trip
  // preserves e.g. metadata.revision (C4). normalize whitelists its contents.
  if (form.metadata && typeof form.metadata === "object") {
    raw.metadata = form.metadata;
  }
  if ((form.notes || "").trim()) {
    raw.notes = form.notes.trim();
  }
  return raw;
};

/** Detect a model row whose default_payload text is present but not valid JSON. */
const hasInvalidPayloadJson = (form) =>
  form.models.some((row) => {
    const text = (row.default_payload_text || "").trim();
    if (!text) {
      return false;
    }
    try {
      const parsed = JSON.parse(text);
      return (
        parsed == null || typeof parsed !== "object" || Array.isArray(parsed)
      );
    } catch (_error) {
      return true;
    }
  });

/* ──────────────────────────────────────────────────────────────────────── */

const CustomProviderEditor = ({
  open,
  slug,
  onClose,
  onSaved,
  // C12 / §6.2(c) / §8.3: when the editor is opened right after importing a
  // provider that needs a key, scroll to + focus the API-key input so the user
  // lands on the one field they still have to fill.
  autoFocusKey = false,
}) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  const isEdit = !!slug;

  // Seed form once per open/slug change.
  const [form, setForm] = useState(() =>
    defToForm(slug ? findCustomProvider(slug) : null),
  );
  const [seedKey, setSeedKey] = useState(`${open}:${slug || ""}`);
  const currentSeedKey = `${open}:${slug || ""}`;
  if (open && currentSeedKey !== seedKey) {
    // Re-seed when the modal is (re)opened for a different provider.
    setForm(defToForm(slug ? findCustomProvider(slug) : null));
    setSeedKey(currentSeedKey);
  }

  const [secret, setSecret] = useState(() =>
    slug ? getCustomProviderSecret(slug) : "",
  );
  const [secretSeedKey, setSecretSeedKey] = useState(`${open}:${slug || ""}`);
  if (open && currentSeedKey !== secretSeedKey) {
    setSecret(slug ? getCustomProviderSecret(slug) : "");
    setSecretSeedKey(currentSeedKey);
  }

  const [secretVisible, setSecretVisible] = useState(false);
  const [diagnostics, setDiagnostics] = useState([]);
  const [testState, setTestState] = useState(null); // {ok, latency_ms} | {error}
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  /* ── C12: scroll to + focus the API-key input on request ── */
  // The key input lives inside Modal, which mounts its children on a LATER tick
  // than the editor (Modal flips its own `mounted` state after mount), and that
  // internal Modal state change does NOT re-render this editor. So a plain
  // effect can't reliably see the input. Instead a "focus pending" flag is
  // armed once per open, and a ref CALLBACK on the input fires exactly when the
  // DOM node is inserted — the one moment we're guaranteed the node exists.
  const keyInputRef = useRef(null);
  const focusPendingRef = useRef(false);
  const [focusSeedKey, setFocusSeedKey] = useState(null);
  if (
    open &&
    autoFocusKey &&
    form.auth_mode !== "none" &&
    focusSeedKey !== currentSeedKey
  ) {
    // Arm exactly once per (open, slug) — subsequent renders won't re-arm.
    focusPendingRef.current = true;
    setFocusSeedKey(currentSeedKey);
  }

  const focusKeyInputNode = (node) => {
    if (!node) {
      return;
    }
    if (typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    if (typeof node.focus === "function") {
      node.focus();
    }
  };

  // Ref callback for the API-key input: focus on the mount that follows an arm.
  const setKeyInputRef = (node) => {
    keyInputRef.current = node;
    if (node && focusPendingRef.current) {
      focusPendingRef.current = false;
      focusKeyInputNode(node);
    }
  };

  /* ── palette ── */
  const textColor = "var(--pupu-text-strong)";
  const mutedColor = "var(--pupu-text-faint)";
  const sectionColor = "var(--pupu-text-faint)";
  const borderColor = "var(--pupu-border)";
  const dividerColor = "var(--pupu-border)";
  const accentColor = isDark ? "#7c8cf8" : "#2563eb";
  const errorColor = isDark ? "#f87171" : "#dc2626";
  const warnColor = isDark ? "#fdba74" : "#c2410c";
  const successColor = "#4CAF50";
  const segOnBg = "var(--pupu-overlay-active)";
  const actionBg = "var(--pupu-overlay-active)";

  const inputStyle = {
    width: "100%",
    fontSize: 12.5,
    fontFamily,
    borderRadius: 8,
    color: textColor,
    paddingVertical: 7,
    paddingHorizontal: 10,
  };
  const sectionLabelStyle = {
    fontSize: 9.5,
    fontFamily,
    letterSpacing: "0.6px",
    textTransform: "uppercase",
    color: sectionColor,
    marginBottom: 9,
  };
  const dividerStyle = {
    height: 1,
    backgroundColor: dividerColor,
    margin: "16px 0 14px",
  };
  const fieldLabelStyle = {
    fontSize: 11,
    fontFamily,
    color: mutedColor,
    marginBottom: 5,
    display: "block",
  };
  const segItemStyle = (active) => ({
    fontSize: 11.5,
    fontFamily,
    fontWeight: 500,
    paddingVertical: 4,
    paddingHorizontal: 14,
    borderRadius: 999,
    color: active ? textColor : mutedColor,
    root: { background: active ? segOnBg : "transparent" },
  });

  /* ── field setters ── */
  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const setModelField = (rowId, key, value) =>
    setForm((f) => {
      const prevRow = f.models.find((row) => row.rowId === rowId);
      const next = {
        ...f,
        models: f.models.map((row) =>
          row.rowId === rowId ? { ...row, [key]: value } : row,
        ),
      };
      // Keep default_model pinned to a row even as its id text is edited: if the
      // renamed row WAS the default, follow the id to its new value (C4).
      if (
        key === "id" &&
        prevRow &&
        f.default_model &&
        f.default_model === (prevRow.id || "").trim()
      ) {
        next.default_model = (value || "").trim();
      }
      return next;
    });
  const setModelCapability = (rowId, capKey, value) =>
    setForm((f) => ({
      ...f,
      models: f.models.map((row) =>
        row.rowId === rowId
          ? { ...row, capabilities: { ...row.capabilities, [capKey]: value } }
          : row,
      ),
    }));
  // §2.3: mark one model row as the provider default (a single-choice toggle —
  // clicking the current default clears it back to "no explicit default").
  const setDefaultModel = (rowId) =>
    setForm((f) => {
      const row = f.models.find((r) => r.rowId === rowId);
      const id = row ? (row.id || "").trim() : "";
      return { ...f, default_model: f.default_model === id ? "" : id };
    });
  const addModelRow = () =>
    setForm((f) => ({ ...f, models: [...f.models, emptyModelRow()] }));
  const removeModelRow = (rowId) =>
    setForm((f) => {
      if (f.models.length <= 1) {
        return f;
      }
      const removed = f.models.find((row) => row.rowId === rowId);
      const models = f.models.filter((row) => row.rowId !== rowId);
      const next = { ...f, models };
      // Clear default_model if the row that held it was removed (C4 / §2.3).
      if (
        removed &&
        f.default_model &&
        f.default_model === (removed.id || "").trim()
      ) {
        next.default_model = "";
      }
      return next;
    });

  const setHeaderField = (rowId, key, value) =>
    setForm((f) => ({
      ...f,
      extra_headers: f.extra_headers.map((row) =>
        row.rowId === rowId ? { ...row, [key]: value } : row,
      ),
    }));
  const addHeaderRow = () =>
    setForm((f) =>
      f.extra_headers.length >= MAX_EXTRA_HEADER_ROWS
        ? f // soft cap; store/schema is the authority
        : { ...f, extra_headers: [...f.extra_headers, emptyHeaderRow()] },
    );
  const removeHeaderRow = (rowId) =>
    setForm((f) => ({
      ...f,
      extra_headers: f.extra_headers.filter((row) => row.rowId !== rowId),
    }));

  /* ── derived gating ── */
  const invalidPayload = hasInvalidPayloadJson(form);
  const hasAtLeastOneModel = form.models.some((m) => (m.id || "").trim());
  const requiresKey = form.auth_mode !== "none";
  const atHeaderCap = form.extra_headers.length >= MAX_EXTRA_HEADER_ROWS;
  const canSave =
    (form.id || "").trim() &&
    (form.display_name || "").trim() &&
    (form.base_url || "").trim() &&
    hasAtLeastOneModel &&
    !invalidPayload;

  const canTest =
    canSave && typeof api?.unchain?.testCustomProvider === "function";

  const errorDiagnostics = diagnostics.filter((d) => d.severity !== "warning");
  const warningDiagnostics = diagnostics.filter(
    (d) => d.severity === "warning",
  );

  /* ── actions ── */

  const runNormalize = () => {
    const raw = formToRaw(form);
    return normalizeCustomProvider(raw);
  };

  const handleTest = async () => {
    if (!canTest || testing) {
      return;
    }
    const result = runNormalize();
    if (!result.ok) {
      setDiagnostics(result.diagnostics || []);
      return;
    }
    setDiagnostics(result.diagnostics || []);
    setTesting(true);
    setTestState(null);
    try {
      const response = await api.unchain.testCustomProvider(
        result.provider,
        requiresKey ? secret : "",
      );
      setTestState(response || { ok: false, error: { code: "unknown" } });
    } catch (error) {
      setTestState({
        ok: false,
        error: { code: error?.code || "unknown", message: error?.message },
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    const result = runNormalize();
    setDiagnostics(result.diagnostics || []);
    if (!result.ok) {
      return;
    }
    const provider = result.provider;
    let savedSlug = provider.id;

    setSaving(true);
    try {
      // Persist the new endpoint disabled before touching its credential.
      // This closes the old-endpoint/new-key window: even if a later step
      // fails or the process exits, the changed/new definition cannot run.
      const disabledProvider = { ...provider, enabled: false };
      const definitionResult = isEdit
        ? updateCustomProvider(slug, disabledProvider)
        : addCustomProvider(disabledProvider);
      await awaitDefinitionPersistence(definitionResult);
      savedSlug = isEdit ? slug : provider.id;

      // auth:none performs an explicit delete so a re-created slug cannot
      // inherit a credential left by an older build.
      const trimmed = requiresKey ? (secret || "").trim() : "";
      const credentialResult = await setCustomProviderSecret(
        savedSlug,
        trimmed,
      );
      if (!credentialResult || credentialResult.ok !== true) {
        setDiagnostics([
          {
            code:
              credentialResult?.errorCode || "credential_write_failed",
            path: "provider.api_key",
            message: t("model_providers.custom.save_failed"),
            severity: "error",
          },
        ]);
        toast.error(t("model_providers.custom.save_failed"), {
          dedupeKey: `custom_provider_credential_failed_${savedSlug}`,
        });
        return;
      }

      // Required-key providers with an empty key must be disabled. A valid key
      // (or auth:none) enables only after credential persistence succeeded.
      const autoEnabled = !requiresKey || !!trimmed;
      const enabledResult = setCustomProviderEnabled(savedSlug, autoEnabled);
      await awaitDefinitionPersistence(enabledResult);

      if (autoEnabled) {
        toast.success(
          t("model_providers.custom.auto_enabled", {
            name: provider.display_name,
          }),
          { dedupeKey: `custom_provider_enabled_${savedSlug}` },
        );
      } else {
        toast.success(t("model_providers.custom.saved"), {
          dedupeKey: `custom_provider_saved_${savedSlug}`,
        });
      }

      onSaved?.(savedSlug);
      onClose?.();
    } catch (error) {
      // Surface store-level failures (e.g. provider_id_exists) as a diagnostic.
      setDiagnostics([
        {
          code: error?.code || "save_failed",
          path: "provider.id",
          message: error?.message || t("model_providers.custom.save_failed"),
          severity: "error",
        },
      ]);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return null;
  }

  /* ── render helpers ── */

  const renderSegmented = (options, value, onChange) => (
    <div
      style={{
        display: "flex",
        gap: 2,
        border: `1px solid ${borderColor}`,
        borderRadius: 999,
        padding: 2,
        width: "fit-content",
      }}
    >
      {options.map((opt) => (
        <Button
          key={opt.value}
          label={t(opt.labelKey)}
          onClick={() => onChange(opt.value)}
          style={segItemStyle(value === opt.value)}
        />
      ))}
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      style={{
        width: 560,
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
      {/* Header */}
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
          style={{
            fontSize: 15,
            fontFamily,
            fontWeight: 600,
            color: textColor,
          }}
        >
          {isEdit
            ? t("model_providers.custom.editor_title_edit")
            : t("model_providers.custom.editor_title_add")}
        </span>
        <Button
          ariaLabel={t("common.close")}
          prefix_icon="close"
          onClick={onClose}
          style={{
            paddingVertical: 4,
            paddingHorizontal: 4,
            borderRadius: 6,
            content: { icon: { width: 16, height: 16 } },
          }}
        />
      </div>

      {/* Scrollable body */}
      <div
        className="scrollable"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "4px 22px 8px",
        }}
      >
        {/* ── IDENTITY ── */}
        <div style={sectionLabelStyle}>
          {t("model_providers.custom.section_identity")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div>
            <label style={fieldLabelStyle}>
              {t("model_providers.custom.field_id")}
            </label>
            <Input
              value={form.id}
              set_value={(v) => setField("id", v)}
              disabled={isEdit}
              placeholder={t("model_providers.custom.field_id_placeholder")}
              style={{ ...inputStyle, opacity: isEdit ? 0.6 : 1 }}
            />
            {!isEdit && (
              <span
                style={{
                  fontSize: 10.5,
                  fontFamily,
                  color: mutedColor,
                  marginTop: 4,
                  display: "block",
                  lineHeight: 1.4,
                }}
              >
                {t("model_providers.custom.field_id_hint")}
              </span>
            )}
          </div>
          <div>
            <label style={fieldLabelStyle}>
              {t("model_providers.custom.field_display_name")}
            </label>
            <Input
              value={form.display_name}
              set_value={(v) => setField("display_name", v)}
              placeholder={t(
                "model_providers.custom.field_display_name_placeholder",
              )}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={fieldLabelStyle}>
              {t("model_providers.custom.field_description")}
            </label>
            <Input
              value={form.description}
              set_value={(v) => setField("description", v)}
              placeholder={t(
                "model_providers.custom.field_description_placeholder",
              )}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={fieldLabelStyle}>
              {t("model_providers.custom.field_notes")}
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setField("notes", e.target.value)}
              placeholder={t("model_providers.custom.field_notes_placeholder")}
              style={{
                width: "100%",
                minHeight: 48,
                resize: "vertical",
                boxSizing: "border-box",
                border: `1px solid ${borderColor}`,
                borderRadius: 8,
                padding: "8px 10px",
                backgroundColor: "transparent",
                color: textColor,
                fontFamily,
                fontSize: 12.5,
                outline: "none",
              }}
            />
          </div>
        </div>

        <div style={dividerStyle} />

        {/* ── CONNECTION ── */}
        <div style={sectionLabelStyle}>
          {t("model_providers.custom.section_connection")}
        </div>
        <label style={fieldLabelStyle}>
          {t("model_providers.custom.field_protocol")}
        </label>
        {renderSegmented(PROTOCOL_OPTIONS, form.protocol, (v) =>
          setField("protocol", v),
        )}
        {form.protocol === "openai-responses" && (
          <div
            style={{
              marginTop: 9,
              padding: "8px 10px",
              borderRadius: 8,
              backgroundColor: isDark
                ? "rgba(253,186,116,0.12)"
                : "rgba(194,65,12,0.08)",
              fontSize: 11,
              fontFamily,
              color: warnColor,
              lineHeight: 1.5,
            }}
          >
            {t("model_providers.custom.responses_api_hint")}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <label style={fieldLabelStyle}>
            {t("model_providers.custom.field_base_url")}
          </label>
          <Input
            value={form.base_url}
            set_value={(v) => setField("base_url", v)}
            placeholder="http://localhost:6655/anthropic"
            style={inputStyle}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={fieldLabelStyle}>
            {t("model_providers.custom.field_timeout")}
          </label>
          <Input
            value={form.timeout_seconds}
            set_value={(v) => setField("timeout_seconds", v)}
            placeholder="600"
            style={{ ...inputStyle, width: 140 }}
          />
        </div>

        {/* extra_headers key/value rows */}
        <div style={{ marginTop: 14 }}>
          <label style={fieldLabelStyle}>
            {t("model_providers.custom.field_extra_headers")}
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {form.extra_headers.map((row) => (
              <div
                key={row.rowId}
                style={{ display: "flex", gap: 7, alignItems: "center" }}
              >
                <Input
                  value={row.name}
                  set_value={(v) => setHeaderField(row.rowId, "name", v)}
                  placeholder={t(
                    "model_providers.custom.header_name_placeholder",
                  )}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <Input
                  value={row.value}
                  set_value={(v) => setHeaderField(row.rowId, "value", v)}
                  placeholder={t(
                    "model_providers.custom.header_value_placeholder",
                  )}
                  style={{ ...inputStyle, flex: 1 }}
                />
                <Button
                  ariaLabel={t("model_providers.custom.remove_header")}
                  prefix_icon="delete"
                  onClick={() => removeHeaderRow(row.rowId)}
                  style={{
                    paddingVertical: 4,
                    paddingHorizontal: 4,
                    borderRadius: 6,
                    content: { icon: { width: 14, height: 14 } },
                  }}
                />
              </div>
            ))}
          </div>
          <Button
            label={t("model_providers.custom.add_header")}
            prefix_icon="add"
            disabled={atHeaderCap}
            onClick={addHeaderRow}
            title={
              atHeaderCap
                ? t("model_providers.custom.header_cap_hint", {
                    max: MAX_EXTRA_HEADER_ROWS,
                  })
                : undefined
            }
            style={{
              marginTop: 8,
              fontSize: 11.5,
              fontFamily,
              paddingVertical: 4,
              paddingHorizontal: 10,
              borderRadius: 7,
              color: mutedColor,
              content: { icon: { width: 13, height: 13 } },
              state: {
                disabled: { root: { opacity: 0.5, cursor: "not-allowed" } },
              },
            }}
          />
          {atHeaderCap && (
            <span
              style={{
                fontSize: 10.5,
                fontFamily,
                color: mutedColor,
                marginTop: 5,
                display: "block",
                lineHeight: 1.4,
              }}
            >
              {t("model_providers.custom.header_cap_hint", {
                max: MAX_EXTRA_HEADER_ROWS,
              })}
            </span>
          )}
        </div>

        <div style={dividerStyle} />

        {/* ── AUTH ── */}
        <div style={sectionLabelStyle}>
          {t("model_providers.custom.section_auth")}
        </div>
        <label style={fieldLabelStyle}>
          {t("model_providers.custom.field_auth_mode")}
        </label>
        {renderSegmented(AUTH_OPTIONS, form.auth_mode, (v) =>
          setField("auth_mode", v),
        )}

        {form.auth_mode === "header" && (
          <div style={{ marginTop: 12 }}>
            <label style={fieldLabelStyle}>
              {t("model_providers.custom.field_header_name")}
            </label>
            <Input
              value={form.auth_header_name}
              set_value={(v) => setField("auth_header_name", v)}
              placeholder="X-Custom-Auth"
              style={{ ...inputStyle, width: 220 }}
            />
          </div>
        )}

        {(form.auth_key_label || form.auth_key_hint) && (
          <div
            style={{
              marginTop: 12,
              padding: "8px 10px",
              borderRadius: 8,
              backgroundColor: "var(--pupu-overlay-ghost)",
            }}
          >
            {form.auth_key_label && (
              <div
                style={{
                  fontSize: 12,
                  fontFamily,
                  color: textColor,
                  fontWeight: 500,
                }}
              >
                {form.auth_key_label}
              </div>
            )}
            {form.auth_key_hint && (
              <div
                style={{
                  fontSize: 11,
                  fontFamily,
                  color: mutedColor,
                  marginTop: 3,
                  lineHeight: 1.5,
                }}
              >
                {form.auth_key_hint}
              </div>
            )}
          </div>
        )}

        {requiresKey && (
          <div style={{ marginTop: 12 }}>
            <label style={fieldLabelStyle}>
              {form.auth_key_label || t("model_providers.custom.field_api_key")}
            </label>
            <Input
              input_ref={setKeyInputRef}
              value={secret}
              set_value={setSecret}
              type={secretVisible ? "text" : "password"}
              placeholder={t("model_providers.custom.field_api_key_placeholder")}
              postfix_component={
                <Button
                  ariaLabel={t("model_providers.custom.toggle_key_visibility")}
                  prefix_icon={secretVisible ? "eye_closed" : "eye_open"}
                  onClick={() => setSecretVisible((v) => !v)}
                  style={{
                    paddingVertical: 2,
                    paddingHorizontal: 4,
                    borderRadius: 4,
                    content: { icon: { width: 16, height: 16 } },
                  }}
                />
              }
              style={inputStyle}
            />
            <span
              style={{
                fontSize: 10.5,
                fontFamily,
                color: mutedColor,
                marginTop: 5,
                display: "block",
                lineHeight: 1.4,
              }}
            >
              {t("model_providers.custom.key_storage_hint")}
            </span>
          </div>
        )}

        <div style={dividerStyle} />

        {/* ── MODELS ── */}
        <div style={sectionLabelStyle}>
          {t("model_providers.custom.section_models")}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {form.models.map((row, idx) => {
            const payloadText = (row.default_payload_text || "").trim();
            let payloadInvalid = false;
            if (payloadText) {
              try {
                const parsed = JSON.parse(payloadText);
                payloadInvalid =
                  parsed == null ||
                  typeof parsed !== "object" ||
                  Array.isArray(parsed);
              } catch (_error) {
                payloadInvalid = true;
              }
            }
            return (
              <div
                key={row.rowId}
                style={{
                  border: `1px solid ${borderColor}`,
                  borderRadius: 10,
                  padding: 11,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 9,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontFamily,
                      color: mutedColor,
                    }}
                  >
                    {t("model_providers.custom.model_index", { index: idx + 1 })}
                  </span>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 6 }}
                  >
                    {(() => {
                      const rowId = (row.id || "").trim();
                      const isDefault =
                        !!rowId && form.default_model === rowId;
                      return (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={isDefault}
                          disabled={!rowId}
                          title={t(
                            "model_providers.custom.set_default_model_hint",
                          )}
                          onClick={() =>
                            rowId && setDefaultModel(row.rowId)
                          }
                          style={{
                            fontSize: 10.5,
                            fontFamily,
                            fontWeight: 500,
                            padding: "3px 9px",
                            borderRadius: 999,
                            border: `1px solid ${
                              isDefault ? accentColor : borderColor
                            }`,
                            backgroundColor: isDefault
                              ? isDark
                                ? "rgba(124,140,248,0.16)"
                                : "rgba(37,99,235,0.10)"
                              : "transparent",
                            color: isDefault
                              ? accentColor
                              : rowId
                                ? mutedColor
                                : sectionColor,
                            cursor: rowId ? "pointer" : "not-allowed",
                            opacity: rowId ? 1 : 0.55,
                            outline: "none",
                          }}
                        >
                          {isDefault
                            ? t("model_providers.custom.default_model_on")
                            : t("model_providers.custom.set_default_model")}
                        </button>
                      );
                    })()}
                    {form.models.length > 1 && (
                      <Button
                        ariaLabel={t("model_providers.custom.remove_model")}
                        prefix_icon="delete"
                        onClick={() => removeModelRow(row.rowId)}
                        style={{
                          paddingVertical: 3,
                          paddingHorizontal: 3,
                          borderRadius: 6,
                          content: { icon: { width: 13, height: 13 } },
                        }}
                      />
                    )}
                  </div>
                </div>
                <div
                  style={{ display: "flex", gap: 7, marginBottom: 9 }}
                >
                  <Input
                    value={row.id}
                    set_value={(v) => setModelField(row.rowId, "id", v)}
                    placeholder={t("model_providers.custom.model_id_placeholder")}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <Input
                    value={row.display_name}
                    set_value={(v) =>
                      setModelField(row.rowId, "display_name", v)
                    }
                    placeholder={t(
                      "model_providers.custom.model_display_name_placeholder",
                    )}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                </div>

                {/* capability booleans */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginBottom: 9,
                  }}
                >
                  {CAPABILITY_BOOLEANS.map((cap) => {
                    const active = row.capabilities[cap.key] === true;
                    return (
                      <button
                        key={cap.key}
                        onClick={() =>
                          setModelCapability(row.rowId, cap.key, !active)
                        }
                        style={{
                          fontSize: 11,
                          fontFamily,
                          fontWeight: 500,
                          padding: "3px 10px",
                          borderRadius: 999,
                          border: `1px solid ${
                            active ? accentColor : borderColor
                          }`,
                          backgroundColor: active
                            ? isDark
                              ? "rgba(124,140,248,0.16)"
                              : "rgba(37,99,235,0.10)"
                            : "transparent",
                          color: active ? accentColor : mutedColor,
                          cursor: "pointer",
                          outline: "none",
                        }}
                      >
                        {t(cap.labelKey)}
                      </button>
                    );
                  })}
                </div>

                {/* capability numbers */}
                <div style={{ display: "flex", gap: 7, marginBottom: 9 }}>
                  {CAPABILITY_NUMBERS.map((cap) => (
                    <div key={cap.key} style={{ flex: 1 }}>
                      <label
                        style={{
                          fontSize: 10,
                          fontFamily,
                          color: mutedColor,
                          marginBottom: 4,
                          display: "block",
                        }}
                      >
                        {t(cap.labelKey)}
                      </label>
                      <Input
                        value={
                          row.capabilities[cap.key] != null
                            ? String(row.capabilities[cap.key])
                            : ""
                        }
                        set_value={(v) =>
                          setModelCapability(row.rowId, cap.key, v)
                        }
                        placeholder="—"
                        style={{ ...inputStyle, width: "100%" }}
                      />
                    </div>
                  ))}
                </div>

                {/* default_payload */}
                <label
                  style={{
                    fontSize: 10,
                    fontFamily,
                    color: mutedColor,
                    marginBottom: 4,
                    display: "block",
                  }}
                >
                  {t("model_providers.custom.model_default_payload")}
                </label>
                <textarea
                  value={row.default_payload_text}
                  onChange={(e) =>
                    setModelField(
                      row.rowId,
                      "default_payload_text",
                      e.target.value,
                    )
                  }
                  placeholder='{"temperature": 0.7}'
                  style={{
                    width: "100%",
                    minHeight: 36,
                    resize: "vertical",
                    boxSizing: "border-box",
                    border: `1px solid ${
                      payloadInvalid ? errorColor : borderColor
                    }`,
                    borderRadius: 8,
                    padding: "7px 9px",
                    backgroundColor: "transparent",
                    color: textColor,
                    fontFamily: "'SF Mono', 'Fira Code', monospace",
                    fontSize: 11.5,
                    outline: "none",
                  }}
                />
                {payloadInvalid && (
                  <span
                    style={{
                      fontSize: 10.5,
                      fontFamily,
                      color: errorColor,
                      marginTop: 4,
                      display: "block",
                    }}
                  >
                    {t("model_providers.custom.model_payload_invalid")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <Button
          label={t("model_providers.custom.add_model")}
          prefix_icon="add"
          onClick={addModelRow}
          style={{
            marginTop: 10,
            fontSize: 11.5,
            fontFamily,
            paddingVertical: 5,
            paddingHorizontal: 12,
            borderRadius: 7,
            color: accentColor,
            content: { icon: { width: 13, height: 13 } },
            root: { background: actionBg },
          }}
        />

        {/* ── diagnostics + test result ── */}
        {(errorDiagnostics.length > 0 ||
          warningDiagnostics.length > 0 ||
          testState) && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            {errorDiagnostics.map((d, i) => (
              <div
                key={`err-${i}`}
                style={{
                  fontSize: 11.5,
                  fontFamily,
                  color: errorColor,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ opacity: 0.7 }}>{d.path || "provider"}</span> ·{" "}
                {d.message} ({d.code})
              </div>
            ))}
            {warningDiagnostics.map((d, i) => (
              <div
                key={`warn-${i}`}
                style={{
                  fontSize: 11.5,
                  fontFamily,
                  color: warnColor,
                  lineHeight: 1.5,
                }}
              >
                <span style={{ opacity: 0.7 }}>{d.path || "provider"}</span> ·{" "}
                {d.message} ({d.code})
              </div>
            ))}
            {testState && (
              <div
                style={{
                  fontSize: 12,
                  fontFamily,
                  color: testState.ok ? successColor : errorColor,
                  lineHeight: 1.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon
                  src={testState.ok ? "check" : "error"}
                  color={testState.ok ? successColor : errorColor}
                  style={{ width: 14, height: 14 }}
                />
                {testState.ok
                  ? t("model_providers.custom.test_ok", {
                      ms: testState.latency_ms ?? "?",
                    })
                  : t("model_providers.custom.test_failed", {
                      code: testState.error?.code || "unknown",
                    })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "12px 22px 16px",
          borderTop: `1px solid ${dividerColor}`,
          flexShrink: 0,
        }}
      >
        <Button
          label={
            testing
              ? t("model_providers.custom.testing")
              : t("model_providers.custom.test_connection")
          }
          prefix_icon="link"
          disabled={!canTest || testing}
          onClick={handleTest}
          title={
            canTest ? undefined : t("model_providers.custom.test_unavailable")
          }
          style={{
            fontSize: 12,
            fontFamily,
            paddingVertical: 6,
            paddingHorizontal: 14,
            borderRadius: 8,
            color: mutedColor,
            content: { icon: { width: 14, height: 14 } },
            state: {
              disabled: { root: { opacity: 0.5, cursor: "not-allowed" } },
            },
          }}
        />
        <div style={{ display: "flex", gap: 8 }}>
          <Button
            label={t("common.cancel")}
            onClick={onClose}
            style={{
              fontSize: 12.5,
              fontFamily,
              paddingVertical: 6,
              paddingHorizontal: 16,
              borderRadius: 8,
              opacity: 0.7,
            }}
          />
          <Button
            label={t("model_providers.custom.save")}
            disabled={!canSave || saving}
            onClick={handleSave}
            style={{
              fontSize: 12.5,
              fontFamily,
              fontWeight: 500,
              paddingVertical: 6,
              paddingHorizontal: 18,
              borderRadius: 8,
              color: canSave ? accentColor : mutedColor,
              root: { background: actionBg },
              state: {
                disabled: { root: { opacity: 0.6, cursor: "not-allowed" } },
              },
            }}
          />
        </div>
      </div>
    </Modal>
  );
};

export default CustomProviderEditor;
export { defToForm, formToRaw, hasInvalidPayloadJson };
