import { useContext, useMemo, useState } from "react";
import { ConfigContext } from "../../../../CONTAINERs/config/context";
import Button from "../../../../BUILTIN_COMPONENTs/input/button";
import Icon from "../../../../BUILTIN_COMPONENTs/icon/icon";
import ArcSpinner from "../../../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import { useTranslation } from "../../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import {
  buildModelRef,
  isModelRefInstalled,
} from "../../../settings/model_providers/model_ref";
import { useOllamaModelTags } from "./use_ollama_model_tags";

/**
 * SizePicker — the right half of an expanded store card (#204, design O3).
 *
 * One row per tag: a selection dot, the tag in mono, its download size and
 * context on the right (from the tags page — BC-002), or a check when that
 * tag is already installed. One explicit action under the list: "Pull
 * <name>:<tag>". While the pull runs the button becomes the progress line
 * with Cancel, driven by the same pull_store the old cards used.
 *
 * Tag list policy: the tags page lists every quantisation ("8b-q4_K_M").
 * By default only the plain tags show (no "-" in the name, plus "latest");
 * "Show all N tags" reveals the rest. When the page could not be parsed the
 * picker falls back to the size tags the library list carried.
 */

const PLAIN_TAG = (tag) => tag === "latest" || !tag.includes("-");

const formatPullError = (raw) =>
  String(raw || "")
    .replace(/^pull model manifest:\s*\d*:?\s*/i, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const SizePicker = ({
  model,
  isDark,
  installedNames,
  pullingMap,
  onPull,
  onCancel,
}) => {
  const { theme } = useContext(ConfigContext);
  const { t } = useTranslation();
  const fontFamily = theme?.font?.fontFamily || "Jost, sans-serif";
  const { state, tags, retry } = useOllamaModelTags(model.name);
  const [showAll, setShowAll] = useState(false);

  /* Rows come from the tags page when it parsed; else from the list's size
     chips (no size / context to show). */
  const rows = useMemo(() => {
    if (state === "ready" && tags.length > 0) {
      const plain = tags.filter((tg) => PLAIN_TAG(tg.tag));
      const base = plain.length > 0 ? plain : tags;
      return showAll ? tags : base;
    }
    const sizes = Array.isArray(model.sizes) ? model.sizes : [];
    return sizes.map((sz) => ({ tag: sz, size_label: "", context: "" }));
  }, [state, tags, showAll, model.sizes]);

  const hiddenCount =
    state === "ready" && tags.length > 0 && !showAll
      ? tags.length - rows.length
      : 0;

  const [selectedTag, setSelectedTag] = useState(null);
  const effectiveTag =
    selectedTag && rows.some((r) => r.tag === selectedTag)
      ? selectedTag
      : rows.find((r) => !isModelRefInstalled(installedNames, model.name, r.tag))?.tag ||
        rows[0]?.tag ||
        "";

  const pullRef = effectiveTag ? buildModelRef(model.name, effectiveTag) : "";
  const pullState = pullRef ? pullingMap[pullRef] || null : null;
  const selectedInstalled =
    effectiveTag && isModelRefInstalled(installedNames, model.name, effectiveTag);

  const mutedColor = "var(--pupu-text-faint)";
  const rowStyle = (active) => ({
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: 28,
    padding: "0 6px",
    margin: "0 -6px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12.5,
    fontFamily,
    color: active ? "var(--pupu-text)" : "var(--pupu-text-secondary)",
    backgroundColor: active ? "var(--pupu-overlay-hover)" : "transparent",
  });
  const mono = {
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    fontSize: 12,
  };

  return (
    <div
      data-testid={`size-picker-${model.name}`}
      style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}
    >
      <div
        style={{
          fontSize: 10,
          fontFamily,
          textTransform: "uppercase",
          letterSpacing: "1.5px",
          color: mutedColor,
          marginBottom: 2,
        }}
      >
        {t("model_providers.store.choose_size")}
      </div>

      {state === "loading" && rows.length === 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: mutedColor, fontSize: 12, fontFamily }}>
          <ArcSpinner size={14} stroke_width={2} color={isDark ? "#aaa" : "#555"} />
          {t("model_providers.store.tags_loading")}
        </div>
      )}

      {rows.map((row) => {
        const installed = isModelRefInstalled(installedNames, model.name, row.tag);
        const active = row.tag === effectiveTag;
        return (
          <div
            key={row.tag}
            role="option"
            aria-selected={active}
            data-testid={`size-row-${row.tag}`}
            onClick={() => setSelectedTag(row.tag)}
            style={rowStyle(active)}
          >
            <span
              aria-hidden="true"
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                flex: "none",
                backgroundColor: installed
                  ? "var(--pupu-success, #5cc084)"
                  : active
                    ? "var(--pupu-text)"
                    : "var(--pupu-border)",
              }}
            />
            <span style={{ ...mono, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {row.tag}
            </span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: mutedColor, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
              {installed ? (
                <span style={{ color: "var(--pupu-success, #5cc084)", letterSpacing: ".06em", textTransform: "uppercase", fontSize: 10 }}>
                  {t("model_providers.store.installed")}
                </span>
              ) : (
                [row.size_label, row.context ? `${row.context} ctx` : ""].filter(Boolean).join(" · ")
              )}
            </span>
          </div>
        );
      })}

      {state === "error" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, color: mutedColor, fontFamily }}>
          {t("model_providers.store.tags_failed")}
          <Button
            label={t("model_providers.store.tags_retry")}
            onClick={retry}
            style={{ fontSize: 11.5, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 5, hoverBackgroundColor: "var(--pupu-overlay-hover)" }}
          />
        </div>
      )}

      {(hiddenCount > 0 || showAll) && (
        <Button
          label={
            showAll
              ? t("model_providers.store.show_fewer_tags")
              : t("model_providers.store.show_all_tags", { count: tags.length })
          }
          onClick={() => setShowAll((v) => !v)}
          style={{ fontSize: 11.5, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 5, alignSelf: "flex-start", color: mutedColor, hoverBackgroundColor: "var(--pupu-overlay-hover)" }}
        />
      )}

      <div style={{ marginTop: 6 }}>
        {pullState ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11.5, color: mutedColor, fontFamily }}>
              <span style={{ textTransform: "capitalize" }}>
                {pullState.status}
                {pullState.percent !== null ? ` ${pullState.percent}%` : ""}
              </span>
              {pullState.status !== "error" && (
                <Button
                  label="Cancel"
                  onClick={() => onCancel(pullRef)}
                  style={{ fontSize: 11.5, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 5, hoverBackgroundColor: "var(--pupu-overlay-hover)" }}
                />
              )}
            </div>
            <div style={{ height: 3, borderRadius: 2, backgroundColor: "var(--pupu-overlay-hover)", overflow: "hidden" }}>
              <div style={{ width: `${pullState.percent ?? 0}%`, height: "100%", backgroundColor: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)", transition: "width 0.2s ease" }} />
            </div>
            {pullState.error && (
              <div style={{ fontSize: 11, color: "var(--pupu-warning, #c2410c)", fontFamily }}>{formatPullError(pullState.error)}</div>
            )}
          </div>
        ) : selectedInstalled ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--pupu-success, #5cc084)", fontFamily }}>
            <Icon src="check" style={{ width: 13, height: 13 }} />
            {pullRef}
          </div>
        ) : (
          <Button
            prefix_icon="download"
            label={t("model_providers.store.pull_tag", { ref: pullRef || model.name })}
            disabled={!effectiveTag}
            onClick={() => onPull(model.name, effectiveTag)}
            style={{
              fontSize: 12.5,
              fontFamily,
              paddingVertical: 6,
              paddingHorizontal: 12,
              borderRadius: 7,
              color: "var(--pupu-text)",
              backgroundColor: "var(--pupu-overlay-active)",
              hoverBackgroundColor: "var(--pupu-overlay-hover)",
              content: { icon: { width: 13, height: 13 } },
            }}
          />
        )}
      </div>
    </div>
  );
};

export default SizePicker;
