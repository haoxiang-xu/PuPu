import { useMemo, useState, useEffect } from "react";
import { readWorkspaces } from "../../settings/runtime";
import { build_workspace_options } from "../utils/build_workspace_options";

/**
 * Loads workspace list and builds Select-compatible options.
 *
 * @returns {{ workspaceOptions: Array }}
 */
const useChatInputWorkspaces = () => {
  const [workspaces, setWorkspaces] = useState([]);

  useEffect(() => {
    setWorkspaces(readWorkspaces());
  }, []);

  const workspaceOptions = useMemo(
    () => build_workspace_options(workspaces),
    [workspaces],
  );

  return { workspaceOptions };
};

export default useChatInputWorkspaces;
