import { useContext, useState } from "react";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import api from "../../../SERVICEs/api";
import { runtimeBridge } from "../../../SERVICEs/bridges/unchain_bridge";
import {
  buildSkillPackFromScan,
  findCommandConflicts,
} from "../../../SERVICEs/skill_pack_import";
import { getCommand } from "../../../SERVICEs/command_registry";
import { emitToolkitCatalogRefresh } from "../../../SERVICEs/toolkit_catalog_refresh";
import { toast } from "../../../SERVICEs/toast";

/* ImportSkillsPage — S3 open-skill-ecosystem importer (phase 1, local dir).
 *
 * Pick a local directory -> main-process scan for SKILL.md files -> the pure JS
 * importer (skill_pack_import.js) builds a PURE-SKILL pack -> a preview of what
 * will import / was skipped / degraded / rejected + already-registered command
 * conflicts (surfaced, never swallowed) -> confirm -> backend skill_packs store
 * -> catalog v2 refresh so plugin_skill_sync registers each skill as a
 * /command. No MCP connection is ever attempted for a skill pack.
 *
 * GitHub-URL import is deferred (spec §4): it needs network + main-process
 * fetch/unpack. Phase 1 is local-directory only. */
const ImportSkillsPage = ({ isDark, onDone }) => {
  const context = useContext(ConfigContext) || {};
  const { t } = useTranslation();
  const fontFamily = context.theme?.font?.fontFamily || "Jost, sans-serif";

  const [phase, setPhase] = useState("idle"); // idle | scanning | preview | installing
  const [preview, setPreview] = useState(null); // { pack, conflicts }
  const [error, setError] = useState(null);

  const textColor = isDark
    ? "rgba(var(--pupu-text-rgb),0.86)"
    : "rgba(var(--pupu-text-rgb),0.82)";
  const mutedColor = isDark
    ? "rgba(var(--pupu-text-rgb),0.45)"
    : "rgba(var(--pupu-text-rgb),0.50)";
  const sectionColor = "rgba(var(--pupu-text-rgb),0.34)";
  const dividerColor = isDark
    ? "rgba(var(--pupu-text-rgb),0.07)"
    : "rgba(var(--pupu-text-rgb),0.06)";
  const accentColor = isDark ? "#7c8cf8" : "#2563eb";
  const warningColor = isDark ? "#fdba74" : "#c2410c";
  const actionBg = isDark
    ? "rgba(var(--pupu-text-rgb),0.10)"
    : "rgba(var(--pupu-text-rgb),0.055)";

  const pack = preview?.pack || null;
  const conflicts = preview?.conflicts || [];
  const importable = pack ? pack.skills.length : 0;

  const handlePickFolder = async () => {
    setError(null);
    let dialogResult;
    try {
      dialogResult = await runtimeBridge.showOpenDialog({
        properties: ["openDirectory"],
      });
    } catch (_) {
      setError("skill_dir_scan_failed");
      return;
    }
    const picked = String(dialogResult?.filePaths?.[0] || "").trim();
    if (dialogResult?.canceled || !picked) return;

    setPhase("scanning");
    try {
      const scan = await api.unchain.scanSkillDir(picked);
      if (!scan || scan.ok === false) {
        setError("skill_dir_scan_failed");
        setPhase("idle");
        return;
      }
      const built = buildSkillPackFromScan({
        dirName: scan.dirName,
        files: scan.files,
      });
      const nextConflicts = findCommandConflicts(
        built.skills,
        (command) => !!getCommand(command),
      );
      setPreview({ pack: built, conflicts: nextConflicts });
      setPhase("preview");
    } catch (e) {
      setError(e?.code || "skill_dir_scan_failed");
      setPhase("idle");
    }
  };

  const handleInstall = async () => {
    if (!pack || importable === 0 || phase === "installing") return;
    setPhase("installing");
    setError(null);
    try {
      await api.unchain.installSkillPack(pack);
      emitToolkitCatalogRefresh({ source: "skill_pack_import" });
      toast.success(
        t("toolkit.import_skills_success", {
          count: importable,
          name: pack.toolkitName,
        }),
      );
      onDone?.();
      setPhase("idle");
      setPreview(null);
    } catch (e) {
      setError(e?.code || "skill_pack_install_failed");
      setPhase("preview");
    }
  };

  const sectionLabelStyle = {
    fontSize: 9.5,
    fontFamily,
    letterSpacing: "0.6px",
    textTransform: "uppercase",
    color: sectionColor,
    marginBottom: 9,
  };

  const reportRow = (labelKey, count, color) =>
    count > 0 ? (
      <div
        key={labelKey}
        style={{ fontSize: 12, fontFamily, color, lineHeight: 1.6 }}
      >
        {t(labelKey, { count })}
      </div>
    ) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={sectionLabelStyle}>{t("toolkit.import_skills_section")}</div>
      <div
        style={{
          fontSize: 12.5,
          fontFamily,
          color: mutedColor,
          lineHeight: 1.6,
          marginBottom: 16,
        }}
      >
        {t("toolkit.import_skills_intro")}
      </div>

      <Button
        label={
          phase === "scanning"
            ? t("toolkit.import_skills_scanning")
            : t("toolkit.import_skills_pick")
        }
        disabled={phase === "scanning" || phase === "installing"}
        onClick={handlePickFolder}
        style={{
          fontSize: 12,
          fontFamily,
          fontWeight: 500,
          paddingVertical: 7,
          paddingHorizontal: 16,
          borderRadius: 999,
          width: "fit-content",
          color: textColor,
          root: { background: actionBg },
        }}
      />

      {pack && (
        <div
          style={{
            marginTop: 18,
            paddingTop: 16,
            borderTop: `1px solid ${dividerColor}`,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontFamily,
              fontWeight: 500,
              color: textColor,
              marginBottom: 4,
            }}
          >
            {t("toolkit.import_skills_preview_title", { name: pack.toolkitName })}
          </div>

          <div style={{ fontSize: 13, fontFamily, color: accentColor }}>
            {t("toolkit.import_skills_importable", { count: importable })}
          </div>

          {reportRow(
            "toolkit.import_skills_degraded",
            pack.degraded.length,
            warningColor,
          )}
          {reportRow(
            "toolkit.import_skills_skipped",
            pack.skipped.length,
            mutedColor,
          )}
          {reportRow(
            "toolkit.import_skills_rejected",
            pack.rejected.length,
            mutedColor,
          )}

          {conflicts.length > 0 && (
            <div
              style={{
                fontSize: 12,
                fontFamily,
                color: warningColor,
                lineHeight: 1.6,
                marginTop: 6,
              }}
            >
              {t("toolkit.import_skills_conflicts", {
                count: conflicts.length,
                commands: conflicts.map((c) => c.command).join(", "),
              })}
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              marginTop: 14,
            }}
          >
            <div
              style={{
                minHeight: 16,
                fontSize: 11,
                lineHeight: 1.4,
                color: warningColor,
                fontFamily,
              }}
            >
              {error ? t("toolkit.import_skills_error") : ""}
            </div>
            <Button
              label={
                phase === "installing"
                  ? t("toolkit.store_installing")
                  : t("toolkit.import_skills_install", { count: importable })
              }
              disabled={importable === 0 || phase === "installing"}
              onClick={handleInstall}
              style={{
                fontSize: 11.5,
                fontFamily,
                fontWeight: 500,
                paddingVertical: 5,
                paddingHorizontal: 16,
                borderRadius: 999,
                color:
                  importable > 0 && phase !== "installing"
                    ? accentColor
                    : mutedColor,
                root: { background: actionBg },
                state: {
                  disabled: {
                    root: { opacity: 0.7, cursor: "not-allowed" },
                    background: {},
                  },
                },
              }}
            />
          </div>
        </div>
      )}

      {error && !pack && (
        <div
          style={{
            marginTop: 14,
            fontSize: 11.5,
            fontFamily,
            color: warningColor,
          }}
        >
          {t("toolkit.import_skills_error")}
        </div>
      )}
    </div>
  );
};

export default ImportSkillsPage;
