import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../../SERVICEs/api";
import { BASE_TOOLKIT_IDS } from "../constants";
import { filter_toolkits } from "../utils/filter_toolkits";
import { build_toolkit_options } from "../utils/build_toolkit_options";

const LOADING_TOOLKITS_OPTION = Object.freeze({
  value: "__toolkits_loading__",
  label: "Loading toolkits...",
  disabled: true,
});

const FAILED_TOOLKITS_OPTION = Object.freeze({
  value: "__toolkits_failed__",
  label: "Failed to load toolkits",
  disabled: true,
});

/**
 * Loads the toolkit catalog on demand and builds Select-compatible options.
 *
 * @returns {{ toolkitOptions: Array, toolkitLoading: boolean, refreshToolkits: Function }}
 */
const useChatInputToolkits = () => {
  const [toolkits, setToolkits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const hasSuccessfulLoadRef = useRef(false);
  const mountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshToolkits = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setLoading(true);
    setLoadFailed(false);

    try {
      const { toolkits: list = [] } = await api.miso.listToolModalCatalog();
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      setToolkits(filter_toolkits(list, BASE_TOOLKIT_IDS));
      hasSuccessfulLoadRef.current = true;
      setLoadFailed(false);
    } catch {
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      if (!hasSuccessfulLoadRef.current) {
        setLoadFailed(true);
      }
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const toolkitOptions = useMemo(
    () => {
      const options = build_toolkit_options(toolkits);
      if (options.length > 0) {
        return options;
      }
      if (loading) {
        return [LOADING_TOOLKITS_OPTION];
      }
      if (loadFailed) {
        return [FAILED_TOOLKITS_OPTION];
      }
      return [];
    },
    [toolkits, loading, loadFailed],
  );

  return {
    toolkitOptions,
    toolkitLoading: loading,
    refreshToolkits,
  };
};

export default useChatInputToolkits;
