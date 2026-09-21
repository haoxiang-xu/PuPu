import { useContext, useMemo, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import { Input } from "../../../../BUILTIN_COMPONENTs/input/input";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import Select from "../../../../BUILTIN_COMPONENTs/select/select";
import ArcSpinner from "../../../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import CellSplitSpinner from "../../../../BUILTIN_COMPONENTs/spinner/cell_split_spinner";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { LIBRARY_CATEGORIES } from "../../../settings/model_providers/constants";
import { useOllamaLibrary } from "../../../settings/model_providers/hooks/use_ollama_library";
import {
  buildModelRef,
  isModelRefInstalled,
} from "../../../settings/model_providers/model_ref";
import ConfirmDeleteModal from "../../../settings/local_storage/components/confirm_delete_modal";
import { deleteOllamaModel } from "../../../settings/local_storage/utils/ollama_models";
import { emitModelCatalogRefresh } from "../../../../SERVICEs/model_catalog_refresh";
import featuredModels from "../../../../SERVICEs/ollama_featured_models.json";
import { useOllamaModelTags } from "./use_ollama_model_tags";

/**
 * OllamaStore — the Library tab of the Ollama pane (#204, design S3):
 * search first, pull from the row.
 *
 *   search    a tall field leads; a category Select and an Installed chip
 *             sit under it (no sort — project owner);
 *   try       while the search is empty, the curated picks
 *             (src/SERVICEs/ollama_featured_models.json) as chips that fill
 *             the search;
 *   rows      one line per model — name over a one-line description (the
 *             pick's reason for a featured model) — with a size Select and
 *             an icon Pull button. No expansion, no page. The size slot is
 *             a spinner until the tags page (BC-002) has answered — fetched
 *             when the pointer reaches the row — then the real tags with
 *             their GB appear once; nothing is pre-printed, so the menu
 *             never changes under the cursor. Progress + Cancel replace the
 *             controls while a pull runs; an installed tag shows a trash
 *             icon instead of Pull.
 *
 * Data and pulls go through the same `useOllamaLibrary` hook as before;
 * only the presentation is new.
 */

const PLAIN_TAG = (tag) => tag === "latest" || !tag.includes("-");

const anyTagInstalled = (installedNames, name) => {
  if (!installedNames) return false;
  for (const entry of installedNames) {
    if (entry === name || entry.startsWith(`${name}:`)) return true;
  }
  return false;
};

const formatPullError = (raw) =>
  String(raw || "")
    .replace(/^pull model manifest:\s*\d*:?\s*/i, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/* ── one row ─────────────────────────────────────────────────────────── */

const StoreRow = ({
  model,
  why,
  isDark,
  installedNames,
  pullingMap,
  onPull,
  onCancel,
  onDelete,
}) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const [touched, setTouched] = useState(false);
  const { state, tags } = useOllamaModelTags(touched ? model.name : null);

  /* Nothing is pre-printed: until the tags page has answered the size slot
     is a spinner (fetch starts when the pointer reaches the row, or on the
     first press), then the real tags — "latest" and every plain size with
     its GB — appear once, so the menu never changes under the cursor. The
     listing's size chips are only the fallback when the page cannot be
     parsed. */
  const options = useMemo(() => {
    if (state === "ready" && tags.length > 0) {
      const plain = tags.filter((tg) => PLAIN_TAG(tg.tag));
      return (plain.length > 0 ? plain : tags).map((tg) => ({
        value: tg.tag,
        label: tg.size_label ? `${tg.tag} · ${tg.size_label}` : tg.tag,
        /* the installed tags carry a check in the menu and on the trigger */
        icon: isModelRefInstalled(installedNames, model.name, tg.tag) ? "check" : undefined,
      }));
    }
    if (state === "error" || (state === "ready" && tags.length === 0)) {
      const sizes = Array.isArray(model.sizes) && model.sizes.length > 0 ? model.sizes : ["latest"];
      return sizes.map((sz) => ({
        value: sz,
        label: sz,
        icon: isModelRefInstalled(installedNames, model.name, sz) ? "check" : undefined,
      }));
    }
    return [];
  }, [state, tags, model.sizes, model.name, installedNames]);
  const sizesPending = options.length === 0;

  const [picked, setPicked] = useState(null);
  const effectiveTag =
    picked && options.some((o) => o.value === picked)
      ? picked
      : options.find((o) => !isModelRefInstalled(installedNames, model.name, o.value))?.value ||
        options[0]?.value ||
        "";
  const ref = effectiveTag ? buildModelRef(model.name, effectiveTag) : model.name;
  const pullState = pullingMap[ref] || null;
  const installed = effectiveTag
    ? isModelRefInstalled(installedNames, model.name, effectiveTag)
    : anyTagInstalled(installedNames, model.name);

  const mono = { fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 12.5 };
  const mutedColor = "var(--pupu-text-faint)";
  const iconBtn = {
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 5,
    opacity: 0.7,
    hoverBackgroundColor: "var(--pupu-overlay-hover)",
    content: { icon: { width: 14, height: 14 } },
  };

  return (
    <div
      data-testid={`store-row-${model.name}`}
      onMouseEnter={() => setTouched(true)}
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto auto",
        alignItems: "center",
        gap: 8,
        minHeight: 40,
        borderTop: "1px solid var(--pupu-border-subtle, var(--pupu-border))",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
        <span style={{ ...mono, color: "var(--pupu-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {model.name}
        </span>
        <span style={{ fontSize: 10.5, fontFamily, color: mutedColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {why || model.description}
        </span>
      </div>

      {pullState ? (
        <>
          <span style={{ fontSize: 11, fontFamily, color: pullState.status === "error" ? "var(--pupu-warning, #c2410c)" : mutedColor, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
            {pullState.status === "error"
              ? formatPullError(pullState.error)
              : `${effectiveTag} · ${pullState.status}${pullState.percent !== null ? ` ${pullState.percent}%` : ""}`}
          </span>
          <Button
            prefix_icon="close"
            ariaLabel={`Cancel ${ref}`}
            disabled={pullState.status === "error"}
            onClick={() => onCancel(ref)}
            style={iconBtn}
          />
        </>
      ) : (
        <>
          <span
            data-testid={`store-size-${model.name}`}
            data-pending={sizesPending ? "true" : "false"}
            onMouseDown={() => setTouched(true)}
            onFocus={() => setTouched(true)}
          >
            {sizesPending ? (
              <span
                role="status"
                aria-label={t("model_providers.store.tags_loading")}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 92,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                }}
              >
                {touched ? (
                  <ArcSpinner size={12} stroke_width={2} color={isDark ? "#aaa" : "#555"} />
                ) : (
                  <span style={{ fontSize: 11, color: mutedColor }}>…</span>
                )}
              </span>
            ) : (
              <Select
                options={options}
                value={effectiveTag}
                set_value={setPicked}
                variant="palette"
                filterable={false}
                style={{ minWidth: 92, fontSize: 11.5, paddingVertical: 2, paddingHorizontal: 8, backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)" }}
                dropdown_style={{ width: 180, maxHeight: 220 }}
                option_style={{ height: 24, borderRadius: 12 }}
              />
            )}
          </span>
          {installed ? (
            <Button
              prefix_icon="delete"
              ariaLabel={`Delete ${ref}`}
              title={t("model_providers.store.installed")}
              /* no tag known yet → no target to delete */
              disabled={sizesPending}
              onClick={() => onDelete(ref)}
              style={{ ...iconBtn, hoverBackgroundColor: isDark ? "rgba(255,80,80,0.15)" : "rgba(220,50,50,0.10)" }}
            />
          ) : (
            <Button
              prefix_icon="download"
              ariaLabel={`Pull ${ref}`}
              disabled={sizesPending || !effectiveTag}
              onClick={() => onPull(model.name, effectiveTag)}
              style={iconBtn}
            />
          )}
        </>
      )}
    </div>
  );
};

/* ── the tab ─────────────────────────────────────────────────────────── */

export const OllamaStore = ({ isDark, onInstalledChanged }) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const {
    category,
    setCategory,
    rawQuery,
    setRawQuery,
    debouncedQuery,
    models,
    loading,
    error,
    installedNames,
    pullingMap,
    handlePull,
    handleCancel,
    retrySearch,
    refreshInstalled,
  } = useOllamaLibrary();
  const [installedOnly, setInstalledOnly] = useState(false);
  const [confirmRef, setConfirmRef] = useState(null);

  /* Delete from a row: the Local Storage delete (same call, same catalog
     refresh), then both installed sets — this hook's and the pane's. */
  const handleConfirmedDelete = async () => {
    const ref = confirmRef;
    setConfirmRef(null);
    if (!ref) return;
    try {
      await deleteOllamaModel(ref);
      emitModelCatalogRefresh({ reason: "ollama_delete_completed", model: ref });
    } catch (_error) {
      return;
    }
    await refreshInstalled();
    onInstalledChanged?.(ref);
  };

  const visible = useMemo(
    () =>
      installedOnly
        ? models.filter((m) => anyTagInstalled(installedNames, m.name))
        : models,
    [models, installedOnly, installedNames],
  );

  const whyByName = useMemo(
    () => new Map(featuredModels.map((f) => [f.name, t(f.why_key)])),
    [t],
  );
  const isDefaultView = !debouncedQuery && !category && !installedOnly;

  const mutedColor = "var(--pupu-text-faint)";
  const captionStyle = {
    fontSize: 10,
    fontFamily,
    textTransform: "uppercase",
    letterSpacing: "1.5px",
    color: mutedColor,
    opacity: 0.7,
  };
  const chipStyle = (active) => ({
    fontSize: 11.5,
    fontFamily,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 999,
    backgroundColor: active ? "var(--pupu-overlay-active)" : "transparent",
    hoverBackgroundColor: "var(--pupu-overlay-hover)",
    color: active ? "var(--pupu-text-strong)" : "var(--pupu-text-secondary)",
    outline: `1px solid ${active ? (isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)") : "var(--pupu-border)"}`,
    outlineOffset: -1,
  });

  const rowProps = {
    isDark,
    installedNames,
    pullingMap,
    onPull: handlePull,
    onCancel: handleCancel,
    onDelete: (ref) => setConfirmRef(ref),
  };

  return (
    <div data-testid="ollama-store" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <ConfirmDeleteModal
        open={confirmRef !== null}
        onClose={() => setConfirmRef(null)}
        onConfirm={handleConfirmedDelete}
        target={confirmRef || ""}
        isDark={isDark}
      />
      <Input
        value={rawQuery}
        set_value={setRawQuery}
        placeholder={t("model_providers.store.search_count", { count: models.length })}
        prefix_icon="search"
        style={{ width: "100%", height: 38, fontSize: 13.5, fontFamily, borderRadius: 9, boxSizing: "border-box" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span data-testid="store-category-select">
          <Select
            options={LIBRARY_CATEGORIES.map((c) => ({
              value: c.value,
              label: c.value ? c.label : t("model_providers.store.all_categories"),
            }))}
            value={category}
            set_value={(v) => {
              setInstalledOnly(false);
              setCategory(v);
            }}
            variant="palette"
            filterable={false}
            style={{ minWidth: 130, fontSize: 11.5, paddingVertical: 3, paddingHorizontal: 9, backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)" }}
            dropdown_style={{ width: 170, maxHeight: 240 }}
            option_style={{ height: 24, borderRadius: 12 }}
          />
        </span>
        <Button
          label={t("model_providers.store.filter_installed")}
          dom_props={{ "data-testid": "store-category-installed" }}
          onClick={() => setInstalledOnly((v) => !v)}
          style={{ ...chipStyle(installedOnly), marginLeft: "auto" }}
        />
      </div>

      {isDefaultView && featuredModels.length > 0 && (
        <div data-testid="ollama-store-try" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <span style={{ ...captionStyle, marginRight: 2 }}>{t("model_providers.store.try")}</span>
          {featuredModels.map((f) => (
            <Button
              key={f.name}
              label={f.name}
              onClick={() => setRawQuery(f.name)}
              style={{ ...chipStyle(false), fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 11 }}
            />
          ))}
        </div>
      )}

      <div style={{ ...captionStyle, marginTop: 4 }}>
        {installedOnly
          ? t("model_providers.store.filter_installed")
          : debouncedQuery
            ? t("model_providers.store.results")
            : t("model_providers.store.popular")}
      </div>

      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "28px 0" }}>
          <CellSplitSpinner size={22} />
        </div>
      ) : error ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "24px 0" }}>
          <span style={{ fontSize: 12, fontFamily, color: mutedColor }}>{error}</span>
          <Button label={t("model_providers.retry")} onClick={retrySearch} style={{ fontSize: 12, height: 28, padding: "0 14px", borderRadius: 999 }} />
        </div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", fontSize: 12, fontFamily, color: mutedColor }}>
          {installedOnly ? t("model_providers.store.empty_installed") : t("model_providers.no_models_found")}
        </div>
      ) : (
        <div data-testid="ollama-store-list">
          {visible.map((model) => (
            <StoreRow key={model.name} model={model} why={whyByName.get(model.name) || null} {...rowProps} />
          ))}
        </div>
      )}
    </div>
  );
};

export default OllamaStore;
