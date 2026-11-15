import { normalizeToolkitIdAlias } from "./toolkit_id_aliases";

/* How a skill-inventory entry is attributed wherever skills are listed: the
   slash palette registers it with these, and the Skill Read picker files it
   by the same, so one skill sits in one folder in both lists.
   A "toolkit" (a toolkit's embedded skills) or "skillpack" entry is
   toolkit-identified and gets its pack's folder; any other source (user or
   workspace skill directories) carries no toolkit identity. */
/* "command" is the same builtin icon category_chip.js and
   skill_pack_detail_page.js already use for the "skill" category — no
   per-entry icon field exists on a `pupu.skill_inventory.v1` row. */
export const SKILL_INVENTORY_ICON = "command";

export const skillSourceAttribution = (entry) => {
  const isToolkitSourced = entry?.source === "toolkit" || entry?.source === "skillpack";
  const sourceId = typeof entry?.source_id === "string" ? entry.source_id : "";
  return {
    sourceLabel: isToolkitSourced ? sourceId : typeof entry?.source === "string" ? entry.source : "",
    sourceToolkitId: isToolkitSourced ? normalizeToolkitIdAlias(sourceId) || sourceId : "",
  };
};
