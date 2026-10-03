import { useState } from "react";
import { installStoreSkillPack } from "../utils/skill_pack_store_install";
import { emitToolkitCatalogRefresh } from "../../../SERVICEs/toolkit_catalog_refresh";
import { toast } from "../../../SERVICEs/toast";

/* The r1.2 error-code enum from the S6a download channel — each code has its
   own i18n key; anything outside the enum (facade timeouts, scan failures)
   falls back to the generic line. */
export const SKILL_PACK_ERROR_CODES = new Set([
  "invalid_payload",
  "network",
  "timeout",
  "not_found",
  "too_large",
  "malformed",
  "integrity",
  "fs",
]);

/* useSkillPackInstall — the store's one-click skill-pack install, shared by the
   category page and Discover. Packs have no registry entry, so they cannot use
   PluginInstallPill's machine; this is theirs. */
const useSkillPackInstall = ({ t }) => {
  const [installingPackIds, setInstallingPackIds] = useState(() => new Set());
  const [packError, setPackError] = useState(null);

  const installPack = async (pack) => {
    if (!pack || installingPackIds.has(pack.id)) return;
    setPackError(null);
    setInstallingPackIds((previous) => new Set(previous).add(pack.id));
    try {
      const installed = await installStoreSkillPack(pack);
      emitToolkitCatalogRefresh({ source: "skill_pack_store_install" });
      toast.success(
        t("toolkit.import_skills_success", {
          count: installed.skills.length,
          name: installed.toolkitName,
        }),
      );
    } catch (error) {
      setPackError(SKILL_PACK_ERROR_CODES.has(error?.code) ? error.code : "generic");
    } finally {
      setInstallingPackIds((previous) => {
        const next = new Set(previous);
        next.delete(pack.id);
        return next;
      });
    }
  };

  return { installingPackIds, packError, installPack };
};

export default useSkillPackInstall;
