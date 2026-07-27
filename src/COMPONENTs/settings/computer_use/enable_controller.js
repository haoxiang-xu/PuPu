/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  computer_use enable_controller                                                */
/*                                                                                */
/*  THE single renderer-layer call site of runtimeBridge.setComputerUseEnabled.   */
/*  Both legal producers of an enable=true push funnel through this module:        */
/*    1. the consent-gated Settings toggle  (enableComputerUse)                    */
/*    2. the consent-revalidated boot resync (resyncComputerUseEnabledOnBoot)      */
/*                                                                                */
/*  Keeping the facade call in one place lets a grep-level test assert the         */
/*  import-point is unique (see enable_controller.test.js). Do NOT call            */
/*  runtimeBridge.setComputerUseEnabled from anywhere else.                        */
/*                                                                                */
/*  SECURITY INVARIANT — fail-closed: pushEnabledToSidecar(true) re-verifies       */
/*  hasValidComputerUseConsent() before ANY enable push. There is no code path     */
/*  that pushes enable=true without a valid consent record on file, regardless     */
/*  of the caller. Disable pushes are always allowed (revoking never needs         */
/*  consent).                                                                       */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

import { runtimeBridge } from "../../../SERVICEs/bridges/unchain_bridge";
import { hasValidComputerUseConsent } from "../../../SERVICEs/computer_use_consent_store";
import {
  isComputerUseEnabledPersisted,
  writeComputerUseEnabled,
} from "../../../SERVICEs/computer_use_enabled_store";

/**
 * The ONE place that talks to runtimeBridge.setComputerUseEnabled.
 *
 * Returns a plain result object (never throws) so callers can render a
 * pending / failed state without try/catch noise:
 *   { pushed: boolean, ok?: bool, enabled?: bool, error?: string,
 *     blocked?: "no_consent", unavailable?: true }
 */
const pushEnabledToSidecar = async (enabled) => {
  const nextEnabled = Boolean(enabled);

  // Fail-closed: an enable push is only ever legal with valid consent on file.
  // This is the structural guarantee behind "enable=true has exactly two
  // legal sources" — both sources land here and both are re-checked.
  if (nextEnabled && !hasValidComputerUseConsent()) {
    return { pushed: false, blocked: "no_consent" };
  }

  // Bridge absent (web preview, or the electron B2 slice not yet present):
  // the desired state is still persisted in localStorage; the boot resync /
  // main-side re-push will reconcile once the bridge exists.
  if (!runtimeBridge.isComputerUseEnableAvailable()) {
    return { pushed: false, unavailable: true };
  }

  try {
    const result = await runtimeBridge.setComputerUseEnabled(nextEnabled);
    return {
      pushed: true,
      ok: Boolean(result?.ok),
      enabled:
        typeof result?.enabled === "boolean" ? result.enabled : nextEnabled,
      error: typeof result?.error === "string" ? result.error : "",
    };
  } catch (error) {
    return {
      pushed: false,
      error: error?.message || "set_computer_use_enabled_failed",
    };
  }
};

/**
 * Enable path. Caller MUST have obtained valid consent first (the Settings
 * toggle awaits requireComputerUseConsent()). Persists desired=true, then
 * pushes true (which re-verifies consent as a belt-and-braces guard).
 */
export const enableComputerUse = async () => {
  const written = writeComputerUseEnabled(true);
  try {
    await written?.persistence;
  } catch (error) {
    return {
      pushed: false,
      persistenceFailed: true,
      error,
    };
  }
  return pushEnabledToSidecar(true);
};

/**
 * Disable path. No consent needed to turn OFF. Persists desired=false and
 * pushes false. The consent record is intentionally left intact (per-install).
 */
export const disableComputerUse = async () => {
  const written = writeComputerUseEnabled(false);
  try {
    await written?.persistence;
  } catch (error) {
    return {
      pushed: false,
      persistenceFailed: true,
      error,
    };
  }
  return pushEnabledToSidecar(false);
};

/**
 * Boot resync. Runs once on renderer start: localStorage persists across a
 * full app restart but the main process's in-memory desired-state cache does
 * not, so the renderer re-establishes the desired state to the (default-off)
 * sidecar.
 *
 * Pushes true ONLY when BOTH hold:
 *   • the persisted desired state is enabled, AND
 *   • consent is still valid (a CONSENT_VERSION bump invalidates it → no push;
 *     the panel then shows a re-consent-needed state).
 * Otherwise it pushes nothing (the sidecar defaults to off — fail-closed).
 */
export const resyncComputerUseEnabledOnBoot = async () => {
  if (!isComputerUseEnabledPersisted()) {
    return { pushed: false, reason: "not_enabled" };
  }
  if (!hasValidComputerUseConsent()) {
    return { pushed: false, reason: "no_valid_consent" };
  }
  return pushEnabledToSidecar(true);
};
