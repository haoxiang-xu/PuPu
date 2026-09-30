import { useEffect } from "react";
import {
  startPluginSkillSync,
  startSkillInventorySync,
  resyncPluginSkills,
  resyncSkillInventory,
} from "../../../SERVICEs/plugin_skill_sync";

/**
 * Mount-once hook: registers toolkit-declared skills AND the backend skill
 * inventory (ticket #291 P4) as slash-commands, keeping both in sync with
 * the toolkit catalog / skill inventory for the lifetime of the chat page.
 * See plugin_skill_sync.js for the sync semantics — startPluginSkillSync
 * keeps the toolkit-catalog cleanup pass fresh on mount and on every
 * catalog-refresh broadcast; startSkillInventorySync (ticket #291 P1 +
 * "refresh gap" fix) owns the skill inventory's entire fetch lifecycle —
 * mount, catalog refresh, and workspace/settings/chat-selection changes —
 * so the two backend sources never race each other for a command name.
 * This hook only adds the ready-transition resync below.
 *
 * @param {boolean} [unchainReady] — the Flask sidecar's ready flag. On a
 *   cold app start the mount-time fetch can race the sidecar (it returns
 *   `{toolkits: []}`/an empty inventory as a "success" while status is still
 *   "starting"), so skills would silently never register for the whole
 *   session. Mirrors how chat.js already resyncs the model catalog on the
 *   ready transition (see chat.js's unchainStatus.ready effect).
 */
export const usePluginSkillSync = (unchainReady) => {
  useEffect(() => {
    const cleanupPluginSkillSync = startPluginSkillSync();
    const cleanupSkillInventorySync = startSkillInventorySync();
    return () => {
      if (typeof cleanupPluginSkillSync === "function") cleanupPluginSkillSync();
      if (typeof cleanupSkillInventorySync === "function") cleanupSkillInventorySync();
    };
  }, []);

  useEffect(() => {
    if (!unchainReady) return;
    resyncPluginSkills();
    resyncSkillInventory();
  }, [unchainReady]);
};

export default usePluginSkillSync;
