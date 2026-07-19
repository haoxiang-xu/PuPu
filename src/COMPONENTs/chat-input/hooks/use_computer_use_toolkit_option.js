import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import api from "../../../SERVICEs/api";
import {
  buildComputerToolkitOption,
  isComputerModelSupported,
} from "../utils/computer_use_toolkit_option";

/**
 * Provides the synthetic "Computer" toolkit option for the chat toolkit menu,
 * plus a reconcile signal so a residual selection can be stripped when the
 * entry is no longer selectable.
 *
 * Visibility follows the computer-use master switch (server truth): the option
 * only exists when `getComputerUseStatus().enabled` is true. When the current
 * model is not in the sidecar's supported set the option is present but
 * disabled with a hint. When the switch is off, the bridge is unavailable, or
 * the status read fails, the option is null — the caller renders nothing, so
 * the menu is byte-for-byte unchanged (zero-exposure invariant).
 *
 * `resolution` captures a DEFINITIVE status answer so nothing acts while the
 * async read is still in flight (which would wrongly strip a supported+enabled
 * session on every mount):
 *   - null                                → unknown (initial load, or a read
 *     error) — render nothing, never reconcile
 *   - { available: false }                → bridge unavailable — reconcile-strip
 *   - { available: true, enabled: false } → switch off — reconcile-strip
 *   - { available: true, enabled: true, supportedModelPrefixes } → switch on
 *
 * Model capability is computed client-side from the cached prefix list, so it
 * updates reactively as the user switches models without another fetch.
 *
 * @param {{ selectedModelId?: string }} params
 * @returns {{
 *   computerOption: (object|null),
 *   shouldDeselectComputer: boolean,
 *   refreshComputerStatus: Function,
 * }}
 */
const useComputerUseToolkitOption = ({ selectedModelId } = {}) => {
  const { isDark } = useContext(ConfigContext);
  const { t } = useTranslation();

  const [resolution, setResolution] = useState(null);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshComputerStatus = useCallback(async () => {
    const runtime = api.runtime;
    if (!runtime || typeof runtime.getComputerUseStatus !== "function") {
      if (mountedRef.current) setResolution({ available: false });
      return;
    }
    if (
      typeof runtime.isComputerUseStatusAvailable === "function" &&
      !runtime.isComputerUseStatusAvailable()
    ) {
      if (mountedRef.current) setResolution({ available: false });
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      const next = await runtime.getComputerUseStatus();
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setResolution({
        available: true,
        enabled: Boolean(next?.enabled),
        supportedModelPrefixes: Array.isArray(next?.supportedModelPrefixes)
          ? next.supportedModelPrefixes
          : [],
      });
    } catch {
      /* A failed read is UNKNOWN, not "off": keep the prior resolution (no
         flicker) and — critically — do NOT reconcile away a selection over a
         transient sidecar hiccup. Leaving `resolution` untouched keeps
         shouldDeselectComputer stable. */
    }
  }, []);

  useEffect(() => {
    void refreshComputerStatus();
  }, [refreshComputerStatus]);

  const supportedForModel = useMemo(
    () =>
      resolution?.available && resolution?.enabled
        ? isComputerModelSupported(
            selectedModelId,
            resolution.supportedModelPrefixes,
          )
        : false,
    [resolution, selectedModelId],
  );

  const computerOption = useMemo(() => {
    if (!resolution?.available || !resolution?.enabled) return null;
    return buildComputerToolkitOption({
      t,
      isDark,
      supported: supportedForModel,
    });
  }, [resolution, supportedForModel, t, isDark]);

  /* Reconcile only on a DEFINITIVE answer: bridge unavailable, switch off, or
     switch-on-but-current-model-unsupported. `null` (loading / read error)
     must not strip. */
  const shouldDeselectComputer = useMemo(() => {
    if (!resolution) return false;
    if (!resolution.available) return true;
    if (!resolution.enabled) return true;
    return !supportedForModel;
  }, [resolution, supportedForModel]);

  return { computerOption, shouldDeselectComputer, refreshComputerStatus };
};

export default useComputerUseToolkitOption;
