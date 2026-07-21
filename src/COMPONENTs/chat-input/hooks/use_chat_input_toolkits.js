import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api from "../../../SERVICEs/api";
import { BASE_TOOLKIT_IDS } from "../constants";
import { filter_toolkits } from "../utils/filter_toolkits";
import { build_toolkit_options } from "../utils/build_toolkit_options";
import { subscribeToolkitCatalogRefresh } from "../../../SERVICEs/toolkit_catalog_refresh";
import { withMcpStoreIcon } from "../../../SERVICEs/mcp_toolkit_store";
import { filterToolkitsByCapabilities } from "../utils/filter_toolkits_by_capabilities";

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
const useChatInputToolkits = ({ selectedModelId } = {}) => {
  const [toolkits, setToolkits] = useState([]);
  const [modelCatalog, setModelCatalog] = useState(null);
  const [computerStatus, setComputerStatus] = useState(null);
  const [computerResolutionKnown, setComputerResolutionKnown] = useState(false);
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
      const { toolkits: list = [] } = await api.unchain.listToolModalCatalog();
      if (!mountedRef.current || requestId !== requestIdRef.current) {
        return;
      }

      setToolkits(
        filter_toolkits(list, BASE_TOOLKIT_IDS).map(withMcpStoreIcon),
      );
      hasSuccessfulLoadRef.current = true;
      setLoadFailed(false);

      const runtime = api.runtime;
      const catalogPromise =
        typeof api.unchain.getModelCatalog === "function"
          ? api.unchain.getModelCatalog()
          : Promise.resolve(null);
      const statusPromise =
        !runtime ||
        typeof runtime.getComputerUseStatus !== "function" ||
        runtime.isComputerUseStatusAvailable?.() === false
          ? Promise.resolve(null)
          : runtime.getComputerUseStatus();
      const [catalogResult, statusResult] = await Promise.allSettled([
        catalogPromise,
        statusPromise,
      ]);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      if (catalogResult.status === "fulfilled") {
        setModelCatalog(catalogResult.value);
      }
      if (statusResult.status === "fulfilled") {
        setComputerStatus(statusResult.value);
        setComputerResolutionKnown(true);
      }
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

  /* Re-pull the catalog when an MCP toolkit is installed / deleted elsewhere. */
  useEffect(() => {
    return subscribeToolkitCatalogRefresh(() => {
      refreshToolkits();
    });
  }, [refreshToolkits]);

  const selectedCapabilities = useMemo(() => {
    if (!modelCatalog) return {};
    return (
      modelCatalog.modelCapabilities?.[selectedModelId] ||
      (modelCatalog.activeModel === selectedModelId
        ? modelCatalog.activeCapabilities
        : {}) ||
      {}
    );
  }, [modelCatalog, selectedModelId]);

  const computerAvailable = Boolean(
    computerStatus?.enabled &&
      computerStatus?.capabilities?.screenshot &&
      selectedCapabilities?.computer_use?.supported,
  );
  const effectiveCapabilities = useMemo(
    () => ({
      ...selectedCapabilities,
      computer_use: {
        ...(selectedCapabilities?.computer_use || {}),
        supported: computerAvailable,
      },
    }),
    [selectedCapabilities, computerAvailable],
  );

  const toolkitOptions = useMemo(
    () => {
      const options = build_toolkit_options(
        filterToolkitsByCapabilities(toolkits, effectiveCapabilities),
      );
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
    [toolkits, effectiveCapabilities, loading, loadFailed],
  );

  return {
    toolkitOptions,
    toolkitLoading: loading,
    refreshToolkits,
    computerAvailable,
    computerResolutionKnown:
      computerResolutionKnown && modelCatalog !== null,
  };
};

export default useChatInputToolkits;
