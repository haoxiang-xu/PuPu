import { ComputerUseSettings } from "../settings/computer_use";

/**
 * Plugin-settings component registry (S1).
 *
 * Maps a plugin's `toolkitId` to the in-panel settings component the plugins
 * detail overlay (plugins_shell.js, `kind: "plugin_settings"`) mounts for it.
 * This is the extension point for builtin plugins that carry their own
 * configuration surface inside the plugins modal; today the only entry is the
 * builtin Computer tool → ComputerUseSettings.
 *
 * Design constraints (S1):
 *  - Keyed by EXACT toolkitId. There is deliberately NO source/prefix
 *    fallback — a plugin either has a bespoke settings surface registered here
 *    or it does not. Adding a fallback is a future decision, not built now.
 *  - Cross-domain import of `../settings/computer_use` follows the existing
 *    toolkit → `../settings/appearance` precedent (SettingsSection is imported
 *    the same way by plugins_installed_page.js). The computer_use directory is
 *    NOT modified — it is consumed as-is.
 *  - Component contract: `({ toolkitId, isDark, onRequestClose })`.
 *    ComputerUseSettings ignores all three (it reads `isDark` from
 *    ConfigContext and owns its own lifecycle); the props are declared for
 *    future registry entries that may need them.
 */

/**
 * Canonical toolkitId of the builtin Computer plugin. Matches the synthetic id
 * the sidecar funnel recognizes (`COMPUTER_TOOLKIT_ID` in
 * chat-input/utils/computer_use_toolkit_option.js). Kept local to the toolkit
 * surface so the registry + installed row share one source of truth without
 * reaching into the chat-input dev's module.
 */
export const BUILTIN_COMPUTER_TOOLKIT_ID = "builtin.computer";

export const PLUGIN_SETTINGS_REGISTRY = {
  [BUILTIN_COMPUTER_TOOLKIT_ID]: {
    Component: ComputerUseSettings,
    labelKey: "toolkit.builtin_computer_name",
    icon: "mouse",
  },
};

/**
 * Resolve the plugin-settings registry entry for a toolkitId, or null if none
 * is registered. Exact-match only; any non-string / empty / unknown id → null.
 *
 * @param {string} toolkitId
 * @returns {{ Component: Function, labelKey: string, icon: string } | null}
 */
export const getPluginSettingsEntry = (toolkitId) => {
  if (typeof toolkitId !== "string" || toolkitId === "") return null;
  return PLUGIN_SETTINGS_REGISTRY[toolkitId] || null;
};

export default getPluginSettingsEntry;
