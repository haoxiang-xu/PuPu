import { useEffect, useMemo, useState } from "react";
import api from "../../../SERVICEs/api";
import { BASE_TOOLKIT_IDS } from "../constants";
import { filter_toolkits } from "../utils/filter_toolkits";
import { build_toolkit_options } from "../utils/build_toolkit_options";

/**
 * Loads the toolkit catalog and builds Select-compatible options.
 *
 * @returns {{ toolkitOptions: Array, toolkitLoading: boolean }}
 */
const useChatInputToolkits = () => {
  const [toolkits, setToolkits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.miso
      .getToolkitCatalog()
      .then(({ toolkits: list = [] }) => {
        if (!cancelled) {
          setToolkits(filter_toolkits(list, BASE_TOOLKIT_IDS));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toolkitOptions = useMemo(
    () => build_toolkit_options(toolkits),
    [toolkits],
  );

  return { toolkitOptions, toolkitLoading: loading };
};

export default useChatInputToolkits;
