import { useContext, useMemo, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import { Input } from "../../../../BUILTIN_COMPONENTs/input/input";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import CellSplitSpinner from "../../../../BUILTIN_COMPONENTs/spinner/cell_split_spinner";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import SegmentedControl from "../../../toolkit/components/segmented_control";
import { LIBRARY_CATEGORIES } from "../../../settings/model_providers/constants";
import { useOllamaLibrary } from "../../../settings/model_providers/hooks/use_ollama_library";
import featuredModels from "../../../../SERVICEs/ollama_featured_models.json";
import { StoreCard } from "./store_card";

/**
 * OllamaStore — the library as a store (#204, design O3).
 *
 *   toolbar   search · Popular / Newest (BC-003) · category chips · Installed
 *   featured  a short curated row (src/SERVICEs/ollama_featured_models.json,
 *             a product decision: PuPu's own picks, not ollama.com's ranking),
 *             only on the untouched default view;
 *   grid      3-across cards that expand in place to a size picker.
 *
 * Data and pulls go through the same `useOllamaLibrary` hook the old card
 * list used, so progress / cancel / installed state are unchanged; only the
 * presentation is new. The Installed chip is a client-side filter over the
 * current results — the library has no such facet.
 */

const anyTagInstalled = (installedNames, name) => {
  if (!installedNames) return false;
  for (const entry of installedNames) {
    if (entry === name || entry.startsWith(`${name}:`)) return true;
  }
  return false;
};

export const OllamaStore = ({ isDark }) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const {
    category,
    setCategory,
    sort,
    setSort,
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
  } = useOllamaLibrary();

  const [installedOnly, setInstalledOnly] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const toggle = (name) => setExpanded((cur) => (cur === name ? null : name));

  const visible = useMemo(
    () =>
      installedOnly
        ? models.filter((m) => anyTagInstalled(installedNames, m.name))
        : models,
    [models, installedOnly, installedNames],
  );

  const isDefaultView =
    !debouncedQuery && !category && !sort && !installedOnly;

  /* Featured entries resolve to the library's own record when the default
     listing has it (description, tags, sizes); otherwise a bare card that
     still expands — the picker fetches its sizes on its own. */
  const featured = useMemo(() => {
    if (!isDefaultView) return [];
    const byName = new Map(models.map((m) => [m.name, m]));
    return featuredModels
      .filter((f) => f && typeof f.name === "string")
      .map((f) => ({
        model: byName.get(f.name) || {
          name: f.name,
          description: "",
          tags: [],
          sizes: [],
          pulls: "",
        },
        why: t(f.why_key),
      }));
  }, [isDefaultView, models, t]);

  const featuredNames = new Set(featured.map((f) => f.model.name));

  const mutedColor = "var(--pupu-text-faint)";
  const captionStyle = {
    fontSize: 10,
    fontFamily,
    textTransform: "uppercase",
    letterSpacing: "1.5px",
    color: mutedColor,
    opacity: 0.7,
    margin: "14px 0 6px",
  };
  /* Category / Installed chips: BUILTIN Button in its default form, dressed
     as the pill the Settings library browser used (no bare <button>). */
  const pillStyle = (active) => ({
    fontSize: 11,
    fontFamily,
    fontWeight: 500,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: active ? "var(--pupu-overlay-active)" : "transparent",
    hoverBackgroundColor: "var(--pupu-overlay-hover)",
    color: active
      ? "var(--pupu-text-strong)"
      : isDark
        ? "rgba(255,255,255,0.45)"
        : "rgba(0,0,0,0.42)",
    outline: `1px solid ${active ? (isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.15)") : "transparent"}`,
    outlineOffset: -1,
  });
  const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: 10,
  };

  const cardProps = {
    isDark,
    installedNames,
    pullingMap,
    onPull: handlePull,
    onCancel: handleCancel,
  };

  return (
    <div data-testid="ollama-store">
      {/* ── toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <Input
            value={rawQuery}
            set_value={setRawQuery}
            placeholder={t("model_providers.store.search")}
            prefix_icon="search"
            style={{
              width: "100%",
              height: 32,
              fontSize: 13,
              fontFamily,
              borderRadius: 8,
              boxSizing: "border-box",
            }}
          />
        </div>
        <div data-testid="ollama-store-sort">
          <SegmentedControl
            sections={[
              { key: "", label: t("model_providers.store.sort_popular") },
              { key: "newest", label: t("model_providers.store.sort_newest") },
            ]}
            selected={sort}
            onChange={setSort}
            isDark={isDark}
            buttonFontWeight={500}
          />
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, padding: "8px 0 2px" }}>
        {LIBRARY_CATEGORIES.map((cat) => {
          const active = !installedOnly && category === cat.value;
          return (
            <Button
              key={cat.value || "all"}
              label={cat.label}
              dom_props={{ "data-testid": `store-category-${cat.value || "all"}` }}
              onClick={() => {
                setInstalledOnly(false);
                setCategory(cat.value);
              }}
              style={pillStyle(active)}
            />
          );
        })}
        <Button
          label={t("model_providers.store.filter_installed")}
          dom_props={{ "data-testid": "store-category-installed" }}
          onClick={() => setInstalledOnly((v) => !v)}
          style={pillStyle(installedOnly)}
        />
      </div>

      {/* ── featured ── */}
      {featured.length > 0 && (
        <>
          <div style={captionStyle}>{t("model_providers.store.featured")}</div>
          <div data-testid="ollama-store-featured" style={gridStyle}>
            {featured.map(({ model, why }) => (
              <StoreCard
                key={`featured-${model.name}`}
                model={model}
                why={why}
                expanded={expanded === model.name}
                onToggle={toggle}
                {...cardProps}
              />
            ))}
          </div>
        </>
      )}

      {/* ── library ── */}
      <div style={captionStyle}>
        {t("model_providers.store.library")}
        {isDefaultView && ` · ${t("model_providers.store.sort_popular")}`}
      </div>
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "32px 0" }}>
          <CellSplitSpinner size={22} />
        </div>
      ) : error ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "28px 0" }}>
          <span style={{ fontSize: 12, fontFamily, color: mutedColor }}>{error}</span>
          <Button
            label={t("model_providers.retry")}
            onClick={retrySearch}
            style={{ fontSize: 12, height: 28, padding: "0 14px", borderRadius: 999 }}
          />
        </div>
      ) : visible.length === 0 ? (
        <div style={{ textAlign: "center", padding: "28px 0", fontSize: 12, fontFamily, color: mutedColor }}>
          {installedOnly
            ? t("model_providers.store.empty_installed")
            : t("model_providers.no_models_found")}
        </div>
      ) : (
        <div data-testid="ollama-store-grid" style={gridStyle}>
          {visible
            .filter((m) => !(isDefaultView && featuredNames.has(m.name)))
            .map((model) => (
              <StoreCard
                key={model.name}
                model={model}
                expanded={expanded === model.name}
                onToggle={toggle}
                {...cardProps}
              />
            ))}
        </div>
      )}
    </div>
  );
};

export default OllamaStore;
