import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import Button from "../../BUILTIN_COMPONENTs/input/button";
import { SemiSwitch } from "../../BUILTIN_COMPONENTs/input/switch";
import { api } from "../../SERVICEs/api";
import { SettingsRow, SettingsSection } from "./appearance";

const toProgress = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  if (numeric <= 0) {
    return 0;
  }
  if (numeric >= 100) {
    return 100;
  }
  return Math.round(numeric);
};

export const AppUpdateSettings = () => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";
  const updateBridgeAvailable = api.appUpdate.isBridgeAvailable();
  const [actionPending, setActionPending] = useState(false);
  const [autoUpdte, setAutoUpdte] = useState(false);
  const [updateState, setUpdateState] = useState({
    stage: "idle",
    currentVersion: "",
  });

  const refreshState = useCallback(async () => {
    try {
      const [version, state] = await Promise.all([
        api.appInfo.getVersion().catch(() => ""),
        updateBridgeAvailable ? api.appUpdate.getState() : Promise.resolve({}),
      ]);

      setUpdateState((prev) => ({
        ...prev,
        stage: typeof state?.stage === "string" ? state.stage : prev.stage,
        currentVersion:
          typeof state?.currentVersion === "string" && state.currentVersion
            ? state.currentVersion
            : version || prev.currentVersion,
        latestVersion:
          typeof state?.latestVersion === "string"
            ? state.latestVersion
            : prev.latestVersion,
        progress:
          Number.isFinite(Number(state?.progress)) || state?.progress === 0
            ? toProgress(state.progress)
            : prev.progress,
        message:
          typeof state?.message === "string" && state.message
            ? state.message
            : prev.message,
      }));
    } catch (error) {
      setUpdateState((prev) => ({
        ...prev,
        stage: "error",
        message: error?.message || "Failed to load update state.",
      }));
    }
  }, [updateBridgeAvailable]);

  useEffect(() => {
    let isUnmounted = false;
    refreshState();

    if (!updateBridgeAvailable) {
      return () => {
        isUnmounted = true;
      };
    }

    const unsubscribe = api.appUpdate.onStateChange((state) => {
      if (isUnmounted) {
        return;
      }
      setUpdateState((prev) => ({
        ...prev,
        ...state,
        currentVersion: state?.currentVersion || prev.currentVersion,
      }));
      setActionPending(false);
    });

    return () => {
      isUnmounted = true;
      unsubscribe();
    };
  }, [refreshState, updateBridgeAvailable]);

  const handleCheckAndDownload = useCallback(async () => {
    if (!updateBridgeAvailable) {
      setUpdateState((prev) => ({
        ...prev,
        stage: "error",
        message: "In-app updates are unavailable in the current runtime.",
      }));
      return;
    }

    setActionPending(true);
    try {
      const result = await api.appUpdate.checkAndDownload();
      if (!result?.started) {
        await refreshState();
      }
    } catch (error) {
      setUpdateState((prev) => ({
        ...prev,
        stage: "error",
        message: error?.message || "Failed to check for updates.",
      }));
    } finally {
      setActionPending(false);
    }
  }, [refreshState, updateBridgeAvailable]);

  const handleInstallNow = useCallback(async () => {
    if (!updateBridgeAvailable) {
      setUpdateState((prev) => ({
        ...prev,
        stage: "error",
        message: "In-app updates are unavailable in the current runtime.",
      }));
      return;
    }

    setActionPending(true);
    try {
      const result = await api.appUpdate.installNow();
      if (!result?.started) {
        await refreshState();
      }
    } catch (error) {
      setUpdateState((prev) => ({
        ...prev,
        stage: "error",
        message: error?.message || "Failed to start update installation.",
      }));
    } finally {
      setActionPending(false);
    }
  }, [refreshState, updateBridgeAvailable]);

  const stage = updateState.stage || "idle";
  const progress = toProgress(updateState.progress);
  const message =
    typeof updateState.message === "string" ? updateState.message : "";
  const versionLabel = updateState.currentVersion || "Unknown";
  const latestVersionLabel =
    typeof updateState.latestVersion === "string" && updateState.latestVersion
      ? updateState.latestVersion
      : "";

  const buttonLabel = useMemo(() => {
    if (stage === "downloaded") {
      return "Restart to install";
    }
    if (stage === "checking") {
      return "Checking...";
    }
    if (stage === "downloading") {
      return `Downloading ${progress}%`;
    }
    if (stage === "no_update") {
      return "Up to date";
    }
    if (stage === "error") {
      return "Retry";
    }
    return "Check for updates";
  }, [progress, stage]);

  const buttonDisabled =
    !updateBridgeAvailable ||
    actionPending ||
    stage === "checking" ||
    stage === "downloading";
  const latestVersionDisplay = latestVersionLabel || "-";
  const statusColor =
    stage === "error"
      ? isDark
        ? "#ff8f8f"
        : "#c62828"
      : isDark
        ? "rgba(255,255,255,0.55)"
        : "rgba(0,0,0,0.55)";

  return (
    <div>
      <SettingsSection title="udpate" icon="update">
        <SettingsRow
          label="auto updte"
          description="Automatically check for app updates"
        >
          <SemiSwitch
            on={autoUpdte}
            set_on={setAutoUpdte}
            style={{ width: 56, height: 28 }}
          />
        </SettingsRow>

        <SettingsRow
          label="Current Version"
          description="Installed application version"
        >
          <span
            style={{
              fontSize: 12,
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              opacity: 0.8,
            }}
          >
            {versionLabel}
          </span>
        </SettingsRow>

        <SettingsRow
          label="Latest Version"
          description="Latest version from release channel"
        >
          <span
            style={{
              fontSize: 12,
              fontFamily: "'SF Mono', 'Fira Code', monospace",
              opacity: 0.8,
            }}
          >
            {latestVersionDisplay}
          </span>
        </SettingsRow>

        <SettingsRow
          label="Update Action"
          description="Check, download, and install updates from GitHub Releases"
        >
          <Button
            prefix_icon="update"
            label={buttonLabel}
            disabled={buttonDisabled}
            onClick={
              stage === "downloaded" ? handleInstallNow : handleCheckAndDownload
            }
            style={{
              fontSize: 13,
              paddingVertical: 7,
              paddingHorizontal: 14,
              borderRadius: 7,
            }}
          />
        </SettingsRow>

        <div
          style={{
            padding: "4px 0 14px",
            fontSize: 12,
            color: statusColor,
            lineHeight: 1.45,
          }}
        >
          {message ||
            (!updateBridgeAvailable
              ? "In-app updates are unavailable in this runtime."
              : "Use the button above to check for app updates.")}
        </div>
      </SettingsSection>
    </div>
  );
};
