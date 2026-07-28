import { useEffect } from "react";
import {
  startPluginSkillSync,
  resyncPluginSkills,
} from "../../../SERVICEs/plugin_skill_sync";

/**
 * Mount-once hook: registers toolkit-declared skills as slash-commands and
 * keeps them in sync with the toolkit catalog for the lifetime of the chat
 * page. See plugin_skill_sync.js for the sync semantics.
 *
 * @param {boolean} [unchainReady] — the Flask sidecar's ready flag. On a
 *   cold app start the mount-time fetch can race the sidecar (it returns
 *   `{toolkits: []}` as a "success" while status is still "starting"), so
 *   skills would silently never register for the whole session. Mirrors
 *   how chat.js already resyncs the model catalog on the ready transition
 *   (see chat.js's unchainStatus.ready effect).
 */
export const usePluginSkillSync = (unchainReady) => {
  useEffect(() => {
    const cleanup = startPluginSkillSync();
    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  }, []);

  useEffect(() => {
    if (!unchainReady) return;
    resyncPluginSkills();
  }, [unchainReady]);
};

export default usePluginSkillSync;
