import { resetSettings } from "../../../SERVICEs/settings_repository";
import {
  beginDefaultToolkitSettingsReset,
  endDefaultToolkitSettingsReset,
  resetDefaultToolkitMirrorForSettingsReset,
} from "../../../SERVICEs/default_toolkit_store";
import {
  beginToolkitAutoApproveSettingsReset,
  endToolkitAutoApproveSettingsReset,
  resetToolkitAutoApproveMirrorForSettingsReset,
} from "../../../SERVICEs/toolkit_auto_approve_store";
import {
  beginComputerUsePreferencesSettingsReset,
  endComputerUsePreferencesSettingsReset,
  resetComputerUsePreferencesMirrorForSettingsReset,
} from "../../../SERVICEs/computer_use_preferences_sql";
import { disableComputerUse } from "../computer_use/enable_controller";

const isConfirmedDisabled = (result) =>
  result?.pushed === true &&
  result?.ok === true &&
  result?.enabled === false;

let resetInFlight = null;

/**
 * Security-sensitive settings reset coordinator.
 *
 * 1. Start the fail-closed sidecar disable (which synchronously admits OFF).
 * 2. Admit the complete operation into the settings repository FIFO.
 * 3. Confirm OFF, close the structured-store queues, and drain prior writes.
 * 4. Reset SQL and legacy settings.
 * 5. Empty the bootstrap-seeded mirrors before reopening writes.
 */
const performSettingsReset = async () => {
  // disableComputerUse() synchronously enqueues desired=false before its first
  // await. resetSettings() is then admitted in this same turn, so a concurrent
  // quit drain waits for both tails and cannot truncate the accepted reset.
  const disabling = disableComputerUse();
  let resetBarriersStarted = false;

  try {
    const result = await resetSettings({
      beforeReset: async () => {
        const disabled = await disabling;
        if (!isConfirmedDisabled(disabled)) {
          const error = new Error(
            "[computer_use_disable_not_confirmed] settings reset aborted",
          );
          error.code = "computer_use_disable_not_confirmed";
          throw error;
        }
        // Each begin call flips its reset barrier synchronously before
        // returning the drain promise.
        const drains = [
          beginDefaultToolkitSettingsReset(),
          beginToolkitAutoApproveSettingsReset(),
          beginComputerUsePreferencesSettingsReset(),
        ];
        resetBarriersStarted = true;
        await Promise.all(drains);
      },
    });
    resetDefaultToolkitMirrorForSettingsReset();
    resetToolkitAutoApproveMirrorForSettingsReset();
    resetComputerUsePreferencesMirrorForSettingsReset();
    return result;
  } finally {
    if (resetBarriersStarted) {
      endDefaultToolkitSettingsReset();
      endToolkitAutoApproveSettingsReset();
      endComputerUsePreferencesSettingsReset();
    }
  }
};

export const resetAllSettingsSafely = () => {
  if (resetInFlight) return resetInFlight;
  const operation = performSettingsReset();
  const tracked = operation.finally(() => {
    if (resetInFlight === tracked) {
      resetInFlight = null;
    }
  });
  resetInFlight = tracked;
  return tracked;
};
