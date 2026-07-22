import { useContext, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import ArcSpinner from "../../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { SettingsSection } from "../../settings/appearance";
import { toast } from "../../../SERVICEs/toast";
import { emitToolkitCatalogRefresh } from "../../../SERVICEs/toolkit_catalog_refresh";
import { installStoreSkillPack } from "../utils/skill_pack_store_install";

/* SkillPackDetailPage — the detail surface for a NOT-yet-installed store
   skill pack (S6b follow-up; design: 2026-07-21 skillpack-detail mockup,
   option B "provenance strip", CEO-approved).

   Settings-isomorphic like plugin_detail_page.js — back link, 48px icon
   header with the GET action, then a quiet one-line provenance strip
   (pinned repo@sha / SHA-256 verified / reviewed·license) and a scrollable
   Commands → About body. An INSTALLED pack never routes here: the store
   drops its pack row in favor of the catalog row (plugins_categories_page
   dedupe), which opens the regular catalog detail with Permission et al.

   The install machine is local (same orchestration the store row's GET pill
   uses): installStoreSkillPack → catalog refresh → success toast; on
   success the header action flips to a quiet Installed label. Error codes
   map to the shared toolkit.skillpack_err_* copy. */

const SKILL_PACK_ERROR_CODES = new Set([
  "invalid_payload",
  "network",
  "timeout",
  "not_found",
  "too_large",
  "malformed",
  "integrity",
  "fs",
]);

const SKILL_TINT = "#6478f6";
const SKILL_CHIP = "#9aa8ff";

const SkillPackDetailPage = ({ pack, isDark = false, onBack }) => {
  const context = useContext(ConfigContext) || {};
  const { t, locale } = useTranslation();
  const fontFamily = context.theme?.font?.fontFamily || "Jost, sans-serif";
  const zhLocale = String(locale || "").toLowerCase().startsWith("zh");

  const [installState, setInstallState] = useState("idle"); // idle | installing | installed
  const [errorCode, setErrorCode] = useState(null);

  const title = (zhLocale && pack?.titleZh) || pack?.title || "";
  const blurb = (zhLocale && pack?.blurbZh) || pack?.blurb || "";
  const shortSha = String(pack?.source?.sha || "").slice(0, 7);
  const previews = Array.isArray(pack?.commandPreviews)
    ? pack.commandPreviews
    : (pack?.subset || []).map((path) => ({
        name: String(path).split("/").pop(),
        description: "",
      }));

  const textColor = isDark ? "rgba(var(--pupu-text-rgb),0.90)" : "rgba(var(--pupu-text-rgb),0.85)";
  const mutedColor = isDark ? "rgba(var(--pupu-text-rgb),0.55)" : "rgba(var(--pupu-text-rgb),0.55)";
  const warningColor = isDark ? "#fdba74" : "#c2410c";
  const goodColor = isDark ? "#4cbe8b" : "#188554";
  const chipColor = isDark ? SKILL_CHIP : "#2563eb";

  const handleInstall = async () => {
    if (installState !== "idle") return;
    setErrorCode(null);
    setInstallState("installing");
    try {
      const installed = await installStoreSkillPack(pack);
      emitToolkitCatalogRefresh({ source: "skill_pack_store_install" });
      toast.success(
        t("toolkit.import_skills_success", {
          count: installed.skills.length,
          name: installed.toolkitName,
        }),
      );
      setInstallState("installed");
    } catch (error) {
      setErrorCode(SKILL_PACK_ERROR_CODES.has(error?.code) ? error.code : "generic");
      setInstallState("idle");
    }
  };

  const provBadge = (iconName, content, color) => (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 10.5,
        fontFamily,
        color: mutedColor,
        minWidth: 0,
      }}
    >
      <Icon
        src={iconName}
        color={color || (isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.42)")}
        style={{ width: 12, height: 12, flexShrink: 0 }}
      />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{content}</span>
    </span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* ── Fixed header — back, ⌘ icon, title + skill-pack pill, GET ── */}
      <div style={{ flexShrink: 0, paddingRight: 24 }}>
        <div style={{ marginBottom: 4 }}>
          <Button
            prefix_icon="arrow_left"
            onClick={onBack}
            style={{
              fontSize: 12,
              fontWeight: 500,
              color: isDark ? "rgba(var(--pupu-text-rgb),0.72)" : "rgba(var(--pupu-text-rgb),0.68)",
              paddingVertical: 5,
              paddingHorizontal: 5,
              borderRadius: 8,
              root: { background: isDark ? "rgba(var(--pupu-text-rgb),0.05)" : "rgba(var(--pupu-text-rgb),0.04)" },
              hoverBackgroundColor: isDark ? "rgba(var(--pupu-text-rgb),0.08)" : "rgba(var(--pupu-text-rgb),0.07)",
              activeBackgroundColor: isDark ? "rgba(var(--pupu-text-rgb),0.12)" : "rgba(var(--pupu-text-rgb),0.1)",
              content: {
                prefixIconWrap: { display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 0 },
                icon: { width: 14, height: 14 },
              },
            }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 13, padding: "10px 0 14px" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: isDark ? "rgba(100,120,246,0.13)" : "rgba(100,120,246,0.10)",
            }}
          >
            <Icon src="command" color={SKILL_TINT} style={{ width: 23, height: 23 }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 500, letterSpacing: "-0.01em", fontFamily, color: textColor }}>
                {title}
              </span>
              <span
                style={{
                  fontSize: 9.5,
                  fontWeight: 500,
                  letterSpacing: "0.4px",
                  textTransform: "lowercase",
                  padding: "1px 7px",
                  borderRadius: 999,
                  color: chipColor,
                  background: isDark ? "rgba(100,120,246,0.14)" : "rgba(100,120,246,0.10)",
                  flexShrink: 0,
                }}
              >
                {t("toolkit.source_skillpack")}
              </span>
            </div>
            <div
              style={{
                fontSize: 11,
                color: mutedColor,
                marginTop: 2,
                fontFamily,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {blurb}
            </div>
          </div>

          <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {installState === "installing" && (
                <ArcSpinner
                  size={12}
                  stroke_width={2}
                  color={isDark ? "rgba(255,255,255,0.62)" : "rgba(0,0,0,0.58)"}
                />
              )}
              {installState === "installed" ? (
                <Button
                  label={t("toolkit.nav_installed")}
                  disabled
                  style={{
                    fontSize: 11.5,
                    fontWeight: 500,
                    fontFamily,
                    color: mutedColor,
                    paddingVertical: 6,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    root: { background: "transparent" },
                    state: { disabled: { root: { cursor: "default" }, background: {} } },
                  }}
                />
              ) : (
                <Button
                  label={t("toolkit.pill_get")}
                  disabled={installState === "installing"}
                  onClick={handleInstall}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 500,
                    fontFamily,
                    paddingVertical: 6,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    color: "#fff",
                    root: { background: "var(--pupu-accent)" },
                    state: { disabled: { root: { opacity: 0.45, cursor: "not-allowed" }, background: {} } },
                  }}
                />
              )}
            </div>
            {errorCode && (
              <div
                style={{
                  fontSize: 10.5,
                  color: warningColor,
                  maxWidth: 190,
                  lineHeight: 1.4,
                  textAlign: "right",
                  fontFamily,
                }}
              >
                {t(`toolkit.skillpack_err_${errorCode}`)}
              </div>
            )}
          </div>
        </div>

        {/* ── Provenance strip — pinned source, fingerprint gate, review ── */}
        <div
          data-testid="skillpack-provenance"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "8px 12px",
            marginRight: 24,
            marginBottom: 12,
            borderRadius: 9,
            background: isDark ? "rgba(var(--pupu-text-rgb),0.035)" : "rgba(var(--pupu-text-rgb),0.03)",
          }}
        >
          {provBadge(
            "github",
            <>
              {pack?.source?.repo}
              <span style={{ fontFamily: "ui-monospace, Menlo, monospace" }}> @ {shortSha}</span>
            </>,
          )}
          {provBadge("shield", t("toolkit.skillpack_badge_verified"), goodColor)}
          {provBadge(
            "eye_open",
            `${t("toolkit.skillpack_badge_reviewed", { date: pack?.review?.reviewedAt || "" })} · ${pack?.source?.license || ""}`,
          )}
        </div>
      </div>

      {/* ── Scrollable body — Commands → About ── */}
      <div className="scrollable" style={{ flex: 1, overflowY: "auto", padding: "0 24px 22px 0" }}>
        <SettingsSection
          title={`${t("toolkit.section_commands")}${previews.length > 1 ? ` · ${previews.length}` : ""}`}
        >
          {previews.map((command) => (
            <div key={command.name} style={{ padding: "9px 0" }}>
              <div
                style={{
                  fontFamily: "ui-monospace, Menlo, monospace",
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: chipColor,
                }}
              >
                /{command.name}
              </div>
              {(zhLocale && command.descriptionZh) || command.description ? (
                <div style={{ fontSize: 11, color: mutedColor, marginTop: 1, lineHeight: 1.45, fontFamily }}>
                  {(zhLocale && command.descriptionZh) || command.description}
                </div>
              ) : null}
            </div>
          ))}
        </SettingsSection>

        <SettingsSection title={t("toolkit.store_about")}>
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.6,
              color: isDark ? "rgba(var(--pupu-text-rgb),0.72)" : "rgba(var(--pupu-text-rgb),0.70)",
              padding: "9px 0",
              fontFamily,
            }}
          >
            {blurb}
          </div>
        </SettingsSection>
      </div>
    </div>
  );
};

export default SkillPackDetailPage;
