import { useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import WorkspaceEditor from "../workspace/workspace_editor";
import { runtimeBridge } from "../../SERVICEs/bridges/unchain_bridge";
import {
  readNamespace,
  updateNamespace,
} from "../../SERVICEs/settings_repository";

const RUNTIME_NAMESPACE = "runtime";

const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const readRuntime = () => {
  const runtime = readNamespace(RUNTIME_NAMESPACE, {});
  return isObject(runtime) ? runtime : {};
};

/* Merge into the runtime namespace so sibling keys survive. Legacy parity:
   the pre-repository writers called localStorage.setItem bare, so a
   synchronous write failure (quota) must keep throwing to the caller —
   throwSyncWriteErrors restores that in fallback mode. Everything else
   (SQL-mode async persistence, missing localStorage) stays silent via the
   noop catch, mirroring the legacy early-return/fire-and-forget behavior. */
const persistRuntime = (patch) => {
  updateNamespace(
    RUNTIME_NAMESPACE,
    (current) => {
      const runtime = isObject(current) ? current : {};
      return { ...runtime, ...patch };
    },
    { throwSyncWriteErrors: true },
  ).catch(() => {});
};

export const readWorkspaceRoot = () => {
  const runtime = readRuntime();
  return typeof runtime.workspace_root === "string"
    ? runtime.workspace_root.trim()
    : "";
};

export const writeWorkspaceRoot = (workspaceRoot) => {
  const trimmed = typeof workspaceRoot === "string" ? workspaceRoot.trim() : "";
  persistRuntime({ workspace_root: trimmed });
};

export const readWorkspaces = () => {
  const runtime = readRuntime();
  const list = Array.isArray(runtime.workspaces) ? runtime.workspaces : [];
  return list.filter(
    (w) =>
      isObject(w) &&
      typeof w.id === "string" &&
      w.id.trim() &&
      (typeof w.path === "string" || typeof w.name === "string"),
  );
};

export const writeWorkspaces = (workspaces) => {
  persistRuntime({ workspaces });
};

export const makeWorkspaceId = () =>
  `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;

export const validateWorkspaceRoot = async (workspaceRoot) => {
  const trimmed = typeof workspaceRoot === "string" ? workspaceRoot.trim() : "";
  if (!trimmed) {
    return { valid: true, resolvedPath: "", reason: "" };
  }

  if (!runtimeBridge.isWorkspaceValidationAvailable()) {
    return { valid: true, resolvedPath: trimmed, reason: "" };
  }

  try {
    const response = await runtimeBridge.validateWorkspaceRoot(trimmed);
    const valid = Boolean(response?.valid);
    const resolvedPath =
      typeof response?.resolvedPath === "string"
        ? response.resolvedPath.trim()
        : "";
    const reason = typeof response?.reason === "string" ? response.reason : "";
    return {
      valid,
      resolvedPath,
      reason,
    };
  } catch (error) {
    return {
      valid: false,
      resolvedPath: "",
      reason: error?.message || "Failed to validate workspace path",
    };
  }
};

export const RuntimeSettings = () => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  return <WorkspaceEditor isDark={isDark} />;
};
