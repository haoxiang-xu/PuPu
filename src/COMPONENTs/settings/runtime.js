import { useContext } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import WorkspaceEditor from "../workspace/workspace_editor";
import { runtimeBridge } from "../../SERVICEs/bridges/unchain_bridge";

const SETTINGS_STORAGE_KEY = "settings";

const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const readSettingsRoot = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}",
    );
    return isObject(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
};

export const readWorkspaceRoot = () => {
  const root = readSettingsRoot();
  const runtime = isObject(root.runtime) ? root.runtime : {};
  return typeof runtime.workspace_root === "string"
    ? runtime.workspace_root.trim()
    : "";
};

export const writeWorkspaceRoot = (workspaceRoot) => {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  const trimmed = typeof workspaceRoot === "string" ? workspaceRoot.trim() : "";
  const root = readSettingsRoot();
  const runtime = isObject(root.runtime) ? root.runtime : {};
  root.runtime = {
    ...runtime,
    workspace_root: trimmed,
  };
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(root));
};

export const readWorkspaces = () => {
  const root = readSettingsRoot();
  const runtime = isObject(root.runtime) ? root.runtime : {};
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
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  const root = readSettingsRoot();
  const runtime = isObject(root.runtime) ? root.runtime : {};
  root.runtime = { ...runtime, workspaces };
  window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(root));
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
