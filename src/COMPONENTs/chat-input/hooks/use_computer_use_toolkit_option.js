import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import api from "../../../SERVICEs/api";
import {
  buildComputerToolkitOption,
  isComputerModelSupported,
} from "../utils/computer_use_toolkit_option";

/**
 * Provides the synthetic "Computer" toolkit option for the chat toolkit menu.
 *
 * Visibility follows the computer-use master switch (server truth): the option
 * only exists when `getComputerUseStatus().enabled` is true. When the current
 * model is not in the sidecar's supported set the option is present but
 * disabled with a hint. When the switch is off, the bridge is unavailable, or
 * the status read fails, the option is null — the caller renders nothing, so
 * the menu is byte-for-byte unchanged (zero-exposure invariant).
 *
 * Model capability is computed client-side from the cached prefix list, so it
 * updates reactively as the user switches models without another fetch.
 *
 * @param {{ selectedModelId?: string }} params
 * @returns {{ computerOption: (object|null), refreshComputerStatus: Function }}
 */
const useComputerUseToolkitOption = ({ selectedModelId } = {}) => {
  const { isDark } = useContext(ConfigContext);
  const { t } = useTranslation();

  const [status, setStatus] = useState(null);
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
      if (mountedRef.current) setStatus(null);
      return;
    }
    if (
      typeof runtime.isComputerUseStatusAvailable === "function" &&
      !runtime.isComputerUseStatusAvailable()
    ) {
      if (mountedRef.current) setStatus(null);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    try {
      const next = await runtime.getComputerUseStatus();
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setStatus({
        enabled: Boolean(next?.enabled),
        supportedModelPrefixes: Array.isArray(next?.supportedModelPrefixes)
          ? next.supportedModelPrefixes
          : [],
      });
    } catch {
      /* A failed / unavailable status read must not leak a broken entry into
         the menu — collapse to "no option" rather than showing a stale one. */
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    void refreshComputerStatus();
  }, [refreshComputerStatus]);

  const computerOption = useMemo(() => {
    if (!status?.enabled) return null;
    return buildComputerToolkitOption({
      t,
      isDark,
      supported: isComputerModelSupported(
        selectedModelId,
        status.supportedModelPrefixes,
      ),
    });
  }, [status, selectedModelId, t, isDark]);

  return { computerOption, refreshComputerStatus };
};

export default useComputerUseToolkitOption;
