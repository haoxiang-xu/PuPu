import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { Input } from "../../../BUILTIN_COMPONENTs/input/input";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import CellSplitSpinner from "../../../BUILTIN_COMPONENTs/spinner/cell_split_spinner";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import useReducedMotion from "../../../BUILTIN_COMPONENTs/mini_react/use_reduced_motion";
import ModelCard from "./components/model_card";
import { LIBRARY_CATEGORIES } from "./constants";
import { useOllamaLibrary } from "./hooks/use_ollama_library";
import ProviderKeySection from "./components/provider_key_section";
import { CustomProviderRow } from "./custom-providers/custom_provider_list";
import CustomProviderEditor from "./custom-providers/custom_provider_editor";
import CustomProviderImportModal from "./custom-providers/custom_provider_import_modal";
import PresetPicker from "./custom-providers/preset_picker";
import { exportCustomProvider } from "./custom-providers/export_provider";
import { findCustomProvider } from "../../../SERVICEs/custom_provider_store";
import { toast } from "../../../SERVICEs/toast";
import { subscribeModelCatalogRefresh } from "../../../SERVICEs/model_catalog_refresh";
import { useOllamaInstalled } from "../local_storage/hooks/use_ollama_installed";
import {
  RAIL_KIND,
  buildProviderRailEntries,
  customRailId,
} from "../../model-providers/rail_entries";

export const OllamaLibraryBrowser = ({ isDark }) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const {
    category,
    setCategory,
    rawQuery,
    setRawQuery,
    models,
    loading,
    error,
    installedNames,
    pullingMap,
    handlePull,
    handleCancel,
    retrySearch,
  } = useOllamaLibrary();

  const mutedColor = "var(--pupu-text-faint)";
  const pillActiveBg = "var(--pupu-overlay-active)";
  const pillHoverBg = "var(--pupu-overlay-selected)";
  const pillActiveTxt = "var(--pupu-text-strong)";
  const pillInactiveTxt = isDark
    ? "rgba(255,255,255,0.45)"
    : "rgba(0,0,0,0.42)";
  const activePillBorder = isDark
    ? "rgba(255,255,255,0.15)"
    : "rgba(0,0,0,0.15)";

  return (
    <>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 5,
          padding: "10px 0 6px",
        }}
      >
        {LIBRARY_CATEGORIES.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setCategory(cat.value)}
            style={{
              fontSize: 11,
              fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
              fontWeight: 500,
              padding: "3px 10px",
              borderRadius: 999,
              border: `1px solid ${
                category === cat.value ? activePillBorder : "transparent"
              }`,
              backgroundColor:
                category === cat.value ? pillActiveBg : "transparent",
              color: category === cat.value ? pillActiveTxt : pillInactiveTxt,
              cursor: "pointer",
              outline: "none",
              transition: "background 0.12s, color 0.12s",
            }}
            onMouseEnter={(e) => {
              if (category !== cat.value)
                e.currentTarget.style.backgroundColor = pillHoverBg;
            }}
            onMouseLeave={(e) => {
              if (category !== cat.value)
                e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div style={{ margin: "4px 0 10px" }}>
        <Input
          value={rawQuery}
          set_value={setRawQuery}
          placeholder={t("model_providers.search_models")}
          prefix_icon="search"
          style={{
            width: "100%",
            height: 34,
            fontSize: 13,
            fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
            borderRadius: 8,
            boxSizing: "border-box",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 7,
          paddingBottom: 4,
        }}
      >
        {loading ? (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "32px 0",
            }}
          >
            <CellSplitSpinner size={22} />
          </div>
        ) : error ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              padding: "28px 0",
            }}
          >
            <span
              style={{ fontSize: 12, fontFamily: theme?.font?.fontFamily || "Jost, sans-serif", color: mutedColor }}
            >
              {error}
            </span>
            <Button
              label={t("model_providers.retry")}
              onClick={retrySearch}
              style={{
                fontSize: 12,
                height: 28,
                padding: "0 14px",
                borderRadius: 999,
              }}
            />
          </div>
        ) : models.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "28px 0",
              fontSize: 12,
              fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
              color: mutedColor,
            }}
          >
            {t("model_providers.no_models_found")}
          </div>
        ) : (
          models.map((model) => (
            <ModelCard
              key={model.name}
              model={model}
              isDark={isDark}
              installedNames={installedNames}
              pullingMap={pullingMap}
              onPull={handlePull}
              onCancel={handleCancel}
            />
          ))
        )}
      </div>
    </>
  );
};

/* ── N1: the narrow Settings → Model Providers accordion (#204 R5) ────────
   Rows share `buildProviderRailEntries()` with the wide layer's rail (S1),
   so a row and its dot never disagree with the Model Providers modal. Each
   row is 38px, collapsed by default; expanding one closes whichever other
   row was open — the body reuses the same pane pieces the wide layer's
   panes wire up (`ProviderKeySection`, `CustomProviderRow` +
   `CustomProviderEditor`, the Add-provider actions), just without a second
   page heading, since the row itself already carries the icon and title. */

const DOT_ON = "var(--pupu-success, #5cc084)";
const DOT_OFF = "var(--pupu-border)";

const OLLAMA_STATUS_TEXT_KEY = {
  ready: "model_providers.page.ollama_running",
  offline: "local_storage.offline",
  not_found: "local_storage.not_installed",
  starting: "local_storage.starting",
  loading: "local_storage.loading",
};

/** The faint status word at the row's right edge — the same wording a rail
 *  dot would imply, spelled out. */
const rowStatusKey = (entry, ollamaStatus) => {
  if (entry.kind === RAIL_KIND.ADD_CUSTOM) {
    return null;
  }
  if (entry.kind === RAIL_KIND.OLLAMA) {
    return OLLAMA_STATUS_TEXT_KEY[ollamaStatus] || OLLAMA_STATUS_TEXT_KEY.loading;
  }
  if (entry.kind === RAIL_KIND.CUSTOM) {
    return entry.configured ? "model_providers.custom.key_set" : "model_providers.custom.key_unset";
  }
  // native / shipped
  return entry.configured ? "model_providers.settings.ready" : "model_providers.custom.key_unset";
};

/* Expand / collapse animate with the grid-rows trick the app already uses
   (turn_mutation_quarantine, the palette footer): 0fr ↔ 1fr on the wrapper,
   overflow hidden on the inner box, so the height tweens without measuring.
   The body mounts on first open and stays mounted so the collapse can play
   (and a half-typed key survives a fold). Chevron turns 90° in step. */
const ACCORDION_CURVE = "cubic-bezier(0.32, 0.72, 0, 1)";

const AccordionRow = ({ entry, label, open, onToggle, statusKey, fontFamily, children }) => {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const mountedRef = useRef(open);
  if (open) mountedRef.current = true;
  return (
    <div>
      <div
        data-testid={`model-providers-settings-row-${entry.id}`}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          height: 38,
          /* Breathing room at both ends: the dot no longer starts at the
             content edge and the hover wash has an inset (owner). */
          padding: "0 12px",
          cursor: "pointer",
          userSelect: "none",
          borderRadius: 6,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "var(--pupu-overlay-hover)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "transparent";
        }}
      >
        {entry.kind !== RAIL_KIND.ADD_CUSTOM && (
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              backgroundColor: entry.configured ? DOT_ON : DOT_OFF,
              flexShrink: 0,
            }}
          />
        )}
        <Icon src={entry.icon} style={{ width: 16, height: 16, opacity: 0.85, flexShrink: 0 }} />
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            fontFamily,
            color: "var(--pupu-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
        {statusKey && (
          <span
            style={{
              fontSize: 11,
              fontFamily,
              color: "var(--pupu-text-faint)",
              opacity: 0.75,
              flexShrink: 0,
            }}
          >
            {t(statusKey)}
          </span>
        )}
        <Icon
          src="arrow_right"
          style={{
            width: 10,
            height: 10,
            opacity: 0.45,
            flexShrink: 0,
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: reducedMotion ? "none" : `transform 0.22s ${ACCORDION_CURVE}`,
          }}
        />
      </div>
      <div
        data-testid={`model-providers-settings-body-${entry.id}`}
        data-open={open ? "true" : "false"}
        aria-hidden={!open}
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          opacity: open ? 1 : 0,
          transition: reducedMotion
            ? "none"
            : `grid-template-rows 0.26s ${ACCORDION_CURVE}, opacity 0.2s ease`,
        }}
      >
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          {mountedRef.current && (
            <div style={{ padding: "2px 12px 14px 32px" }}>{children}</div>
          )}
        </div>
      </div>
    </div>
  );
};

/** native / shipped body — the one key control, control-only (no second
 *  page heading; the row above already carries the title). */
const KeyRowBody = ({ entry }) => {
  const provider = entry.provider;
  if (entry.kind === RAIL_KIND.SHIPPED) {
    return (
      <ProviderKeySection
        heading="none"
        title={provider.title}
        icon={provider.icon}
        sites={provider.sites}
        placeholder={provider.placeholder}
        key_url={provider.key_url}
      />
    );
  }
  return (
    <ProviderKeySection
      heading="none"
      title={provider.title}
      icon={provider.icon}
      storage_key={provider.storage_key}
      credential_id={provider.credential_id}
      placeholder={provider.placeholder}
      key_url={provider.key_url}
    />
  );
};

/** Ollama body — status line plus a hand-off to the wide layer, which is
 *  where installed models and the library live (project owner decision 1). */
const OllamaRowBody = ({ status, statusKey, onOpenModelProviders, fontFamily }) => {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, padding: "4px 0 10px" }}>
      <span style={{ fontSize: 12.5, fontFamily, color: "var(--pupu-text-secondary)" }}>
        {statusKey ? t(statusKey) : ""}
      </span>
      <span style={{ fontSize: 11.5, fontFamily, color: "var(--pupu-text-faint)", lineHeight: 1.4 }}>
        {t("model_providers.settings.ollama_hint")}
      </span>
      <Button
        label={t("model_providers.settings.open_in_models")}
        onClick={() => onOpenModelProviders?.("ollama")}
        style={{
          fontSize: 12,
          fontFamily,
          paddingVertical: 4,
          paddingHorizontal: 10,
          borderRadius: 6,
          color: "var(--pupu-text-secondary)",
          hoverBackgroundColor: "var(--pupu-overlay-hover)",
        }}
      />
    </div>
  );
};

/** Custom provider body — the Settings list row (toggle / edit / export /
 *  delete) plus its editor, wired exactly as the wide layer's
 *  `CustomProviderPane` does, minus the page heading it no longer needs. */
const CustomRowBody = ({ entry, onDeleted, isDark }) => {
  const { t } = useTranslation();
  const [editorOpen, setEditorOpen] = useState(false);

  const provider = findCustomProvider(entry.provider.id) || entry.provider;

  const handleExport = async (slug) => {
    const result = await exportCustomProvider(slug);
    if (result.ok) {
      toast.success(t("model_providers.custom.export_success"), {
        dedupeKey: `custom_provider_export_${slug}`,
      });
    } else if (result.error !== "canceled") {
      toast.error(t("model_providers.custom.export_failed"), {
        dedupeKey: `custom_provider_export_fail_${slug}`,
      });
    }
  };

  const handleChanged = () => {
    if (!findCustomProvider(entry.provider.id)) {
      onDeleted?.();
    }
  };

  return (
    <div data-testid={`model-providers-settings-custom-body-${provider.id}`}>
      <CustomProviderRow
        provider={provider}
        isDark={isDark}
        onEdit={() => setEditorOpen(true)}
        onExport={handleExport}
        onChanged={handleChanged}
      />
      <CustomProviderEditor
        open={editorOpen}
        slug={provider.id}
        onClose={() => setEditorOpen(false)}
        onSaved={() => {}}
      />
    </div>
  );
};

/** "Add provider" body — the same three ways in as the wide layer's
 *  `AddProviderPane` (Add / From preset / Import), driving the same
 *  modals. Creating one hands the new row's id back so the accordion opens
 *  on it, same as the rail landing on a freshly created provider. */
const AddCustomRowBody = ({ onCreated, fontFamily }) => {
  const { t } = useTranslation();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSlug, setEditingSlug] = useState(null);
  const [editorAutoFocusKey, setEditorAutoFocusKey] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetSeed, setPresetSeed] = useState(null);

  const openAdd = () => {
    setEditingSlug(null);
    setEditorAutoFocusKey(false);
    setEditorOpen(true);
  };
  const closeEditor = () => {
    setEditorOpen(false);
    setEditingSlug(null);
    setEditorAutoFocusKey(false);
  };
  const openImport = () => {
    setPresetSeed(null);
    setImportOpen(true);
  };
  const closeImport = () => {
    setImportOpen(false);
    setPresetSeed(null);
  };
  const handlePresetSelect = (envelope) => {
    setPresetOpen(false);
    setPresetSeed(envelope);
    setImportOpen(true);
  };
  const handleImported = ({ slug, requiresKey }) => {
    if (requiresKey) {
      setEditingSlug(slug);
      setEditorAutoFocusKey(true);
      setEditorOpen(true);
      return;
    }
    onCreated?.(customRailId(slug));
  };
  const handleSaved = (slug) => {
    if (typeof slug === "string" && slug) {
      onCreated?.(customRailId(slug));
    }
  };

  const buttonStyle = {
    fontSize: 12.5,
    fontFamily,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 7,
    color: "var(--pupu-text-secondary)",
    hoverBackgroundColor: "var(--pupu-overlay-hover)",
    content: { icon: { width: 13, height: 13 } },
  };

  return (
    <div data-testid="model-providers-settings-add-body">
      <p
        style={{
          margin: "0 0 10px",
          fontSize: 12.5,
          fontFamily,
          color: "var(--pupu-text-faint)",
          lineHeight: 1.5,
        }}
      >
        {t("model_providers.custom.section_desc")}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <Button
          label={t("model_providers.custom.add")}
          prefix_icon="add"
          onClick={openAdd}
          style={{ ...buttonStyle, backgroundColor: "var(--pupu-overlay-active)" }}
        />
        <Button
          label={t("model_providers.custom.add_from_preset")}
          prefix_icon="add"
          onClick={() => setPresetOpen(true)}
          style={buttonStyle}
        />
        <Button
          label={t("model_providers.custom.import")}
          prefix_icon="download"
          onClick={openImport}
          style={buttonStyle}
        />
      </div>

      <CustomProviderEditor
        open={editorOpen}
        slug={editingSlug}
        autoFocusKey={editorAutoFocusKey}
        onClose={closeEditor}
        onSaved={handleSaved}
      />
      <CustomProviderImportModal
        open={importOpen}
        presetSeed={presetSeed}
        onClose={closeImport}
        onImported={handleImported}
      />
      <PresetPicker
        open={presetOpen}
        onClose={() => setPresetOpen(false)}
        onSelect={handlePresetSelect}
      />
    </div>
  );
};

export const ModelProvidersSettings = ({ onOpenModelProviders }) => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";

  const ollama = useOllamaInstalled();
  const ollamaReady = ollama.status === "ready";

  const [tick, setTick] = useState(0);
  useEffect(() => subscribeModelCatalogRefresh(() => setTick((n) => n + 1)), []);

  const entries = useMemo(
    () => buildProviderRailEntries({ ollamaReady }),
    // `tick` is the catalog-refresh signal the builder's readers depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ollamaReady, tick],
  );

  const [openId, setOpenId] = useState(null);
  const toggle = (id) => setOpenId((cur) => (cur === id ? null : id));

  const providers = entries.filter(
    (e) => e.kind !== RAIL_KIND.CUSTOM && e.kind !== RAIL_KIND.ADD_CUSTOM,
  );
  const custom = entries.filter(
    (e) => e.kind === RAIL_KIND.CUSTOM || e.kind === RAIL_KIND.ADD_CUSTOM,
  );

  const renderBody = (entry) => {
    if (entry.kind === RAIL_KIND.NATIVE || entry.kind === RAIL_KIND.SHIPPED) {
      return <KeyRowBody entry={entry} />;
    }
    if (entry.kind === RAIL_KIND.OLLAMA) {
      return (
        <OllamaRowBody
          status={ollama.status}
          statusKey={rowStatusKey(entry, ollama.status)}
          onOpenModelProviders={onOpenModelProviders}
          fontFamily={fontFamily}
        />
      );
    }
    if (entry.kind === RAIL_KIND.CUSTOM) {
      return (
        <CustomRowBody
          entry={entry}
          isDark={isDark}
          onDeleted={() => setOpenId(null)}
        />
      );
    }
    return (
      <AddCustomRowBody
        onCreated={(railId) => setOpenId(railId)}
        fontFamily={fontFamily}
      />
    );
  };

  return (
    <div data-testid="model-providers-settings">
      <div style={{ borderTop: "1px solid var(--pupu-border)", margin: "0 0 8px" }} />

      {providers.map((entry) => (
        <AccordionRow
          key={entry.id}
          entry={entry}
          label={entry.title}
          open={openId === entry.id}
          onToggle={() => toggle(entry.id)}
          statusKey={rowStatusKey(entry, ollama.status)}
          fontFamily={fontFamily}
        >
          {renderBody(entry)}
        </AccordionRow>
      ))}

      {custom.length > 0 && (
        <>
          <div
            style={{
              fontSize: 10,
              fontFamily,
              textTransform: "uppercase",
              letterSpacing: "1.5px",
              color: "var(--pupu-text)",
              opacity: 0.3,
              padding: "16px 0 6px",
            }}
          >
            {t("model_providers.page.rail_custom")}
          </div>
          {custom.map((entry) => (
            <AccordionRow
              key={entry.id}
              entry={entry}
              label={
                entry.kind === RAIL_KIND.ADD_CUSTOM
                  ? t("model_providers.page.add_provider")
                  : entry.title
              }
              open={openId === entry.id}
              onToggle={() => toggle(entry.id)}
              statusKey={rowStatusKey(entry, ollama.status)}
              fontFamily={fontFamily}
            >
              {renderBody(entry)}
            </AccordionRow>
          ))}
        </>
      )}

      {/* Foot: the whole page, not one provider — opens the Models layer on
          its default selection (project owner). */}
      <div style={{ display: "flex", justifyContent: "flex-start", padding: "18px 12px 4px" }}>
        <Button
          prefix_icon="pentagon"
          label={t("model_providers.settings.open_models_page")}
          ariaLabel={t("model_providers.settings.open_models_page")}
          onClick={() => onOpenModelProviders?.()}
          style={{
            fontSize: 12,
            fontFamily,
            paddingVertical: 5,
            paddingHorizontal: 10,
            borderRadius: 6,
            color: "var(--pupu-text-secondary)",
            hoverBackgroundColor: "var(--pupu-overlay-hover)",
            content: { icon: { width: 14, height: 14 } },
          }}
        />
      </div>
    </div>
  );
};

export default ModelProvidersSettings;
