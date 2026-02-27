import { useCallback, useContext, useMemo, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import { Input } from "../../BUILTIN_COMPONENTs/input/input";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { SettingsSection } from "./appearance";

const SETTINGS_STORAGE_KEY = "settings";

const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const readSettingsRoot = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return {};
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}");
    return isObject(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
};

const readWorkspaceRoot = () => {
  const root = readSettingsRoot();
  const runtime = isObject(root.runtime) ? root.runtime : {};
  return typeof runtime.workspace_root === "string"
    ? runtime.workspace_root.trim()
    : "";
};

const writeWorkspaceRoot = (workspaceRoot) => {
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

const validateWorkspaceRoot = async (workspaceRoot) => {
  const trimmed = typeof workspaceRoot === "string" ? workspaceRoot.trim() : "";
  if (!trimmed) {
    return { valid: true, resolvedPath: "", reason: "" };
  }

  const method =
    typeof window !== "undefined" && typeof window.misoAPI?.validateWorkspaceRoot === "function"
      ? window.misoAPI.validateWorkspaceRoot
      : null;

  if (!method) {
    return { valid: true, resolvedPath: trimmed, reason: "" };
  }

  try {
    const response = await method(trimmed);
    const valid = Boolean(response?.valid);
    const resolvedPath =
      typeof response?.resolvedPath === "string" ? response.resolvedPath.trim() : "";
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
  const [workspaceRoot, setWorkspaceRoot] = useState(() => readWorkspaceRoot());
  const [savedWorkspaceRoot, setSavedWorkspaceRoot] = useState(() =>
    readWorkspaceRoot(),
  );
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isBrowsing, setIsBrowsing] = useState(false);

  const browseSupported =
    typeof window !== "undefined" &&
    typeof window.misoAPI?.pickWorkspaceRoot === "function";

  const isDirty = useMemo(
    () => workspaceRoot.trim() !== savedWorkspaceRoot.trim(),
    [workspaceRoot, savedWorkspaceRoot],
  );

  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
  const errorColor = isDark ? "#ff7f7f" : "#c62828";
  const successColor = isDark ? "#86efac" : "#2e7d32";

  const handleSave = useCallback(async () => {
    const candidate = workspaceRoot.trim();
    setIsSaving(true);
    setError("");
    setInfo("");

    const validation = await validateWorkspaceRoot(candidate);
    if (!validation.valid) {
      setError(validation.reason || "Invalid workspace root.");
      setIsSaving(false);
      return;
    }

    const nextPath = validation.resolvedPath || candidate;
    writeWorkspaceRoot(nextPath);
    setWorkspaceRoot(nextPath);
    setSavedWorkspaceRoot(nextPath);
    setInfo(nextPath ? "Workspace root saved." : "Workspace root cleared.");
    setIsSaving(false);
  }, [workspaceRoot]);

  const handleClear = useCallback(() => {
    writeWorkspaceRoot("");
    setWorkspaceRoot("");
    setSavedWorkspaceRoot("");
    setError("");
    setInfo("Workspace root cleared.");
  }, []);

  const handleBrowse = useCallback(async () => {
    if (!browseSupported) {
      setError("Directory picker is only available in Electron runtime.");
      return;
    }

    setIsBrowsing(true);
    setError("");
    setInfo("");

    try {
      const response = await window.misoAPI.pickWorkspaceRoot(
        workspaceRoot.trim() || savedWorkspaceRoot.trim(),
      );
      if (!response?.canceled && typeof response?.path === "string" && response.path.trim()) {
        setWorkspaceRoot(response.path.trim());
      }
    } catch (error) {
      setError(error?.message || "Failed to open directory picker.");
    } finally {
      setIsBrowsing(false);
    }
  }, [browseSupported, workspaceRoot, savedWorkspaceRoot]);

  return (
    <div>
      <SettingsSection title="Miso Workspace" icon="terminal">
        <div
          style={{
            padding: "14px 0",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <Input
            label="Workspace Root"
            placeholder="/path/to/workspace"
            value={workspaceRoot}
            set_value={(value) => {
              setWorkspaceRoot(value);
              setError("");
              setInfo("");
            }}
            style={{ width: "100%", fontSize: 14, height: 38 }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Button
              label={isBrowsing ? "Browsing..." : "Browse"}
              onClick={handleBrowse}
              disabled={!browseSupported || isBrowsing || isSaving}
              style={{
                fontSize: 13,
                paddingVertical: 7,
                paddingHorizontal: 14,
                borderRadius: 7,
              }}
            />
            <Button
              label={isSaving ? "Saving..." : "Save"}
              onClick={handleSave}
              disabled={isSaving || isBrowsing || !isDirty}
              style={{
                fontSize: 13,
                paddingVertical: 7,
                paddingHorizontal: 14,
                borderRadius: 7,
              }}
            />
            <Button
              label="Clear"
              onClick={handleClear}
              disabled={isSaving || isBrowsing || !savedWorkspaceRoot.trim()}
              style={{
                fontSize: 13,
                paddingVertical: 7,
                paddingHorizontal: 14,
                borderRadius: 7,
              }}
            />
          </div>

          {error && (
            <div
              style={{
                fontSize: 12,
                fontFamily: "Jost, sans-serif",
                color: errorColor,
              }}
            >
              {error}
            </div>
          )}

          {!error && info && (
            <div
              style={{
                fontSize: 12,
                fontFamily: "Jost, sans-serif",
                color: successColor,
              }}
            >
              {info}
            </div>
          )}

          <div
            style={{
              fontSize: 11,
              fontFamily: "Jost, sans-serif",
              color: mutedColor,
              lineHeight: 1.5,
            }}
          >
            This root is sent with each Miso request and used as
            <code style={{ marginLeft: 4, marginRight: 4 }}>workspace_root</code>
            when workspace toolkit is enabled.
          </div>
        </div>
      </SettingsSection>
    </div>
  );
};

