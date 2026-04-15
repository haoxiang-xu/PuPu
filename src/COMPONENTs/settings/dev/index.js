import { useCallback, useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { SemiSwitch } from "../../../BUILTIN_COMPONENTs/input/switch";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { runtimeBridge } from "../../../SERVICEs/bridges/unchain_bridge";
import {
  FEATURE_FLAG_DEFINITIONS,
  readFeatureFlags,
  subscribeFeatureFlags,
  writeFeatureFlags,
} from "../../../SERVICEs/feature_flags";
import { SettingsRow, SettingsSection } from "../appearance";
import { readDevSettings, writeDevSettings } from "./storage";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import UITestingModal from "../../ui-testing/ui_testing_modal";

export const DevSettings = () => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";

  const [chromeTerminalEnabled, setChromeTerminalEnabled] = useState(
    () => readDevSettings().chrome_terminal_enabled,
  );
  const [featureFlags, setFeatureFlags] = useState(() => readFeatureFlags());
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [featureFlagsSyncError, setFeatureFlagsSyncError] = useState("");
  const [showUITesting, setShowUITesting] = useState(false);

  const errorColor = isDark ? "#ff7f7f" : "#c62828";
  const successColor = isDark ? "#86efac" : "#2e7d32";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";

  useEffect(() => {
    setFeatureFlags(readFeatureFlags());
    return subscribeFeatureFlags(setFeatureFlags);
  }, []);

  useEffect(() => {
    let isUnmounted = false;

    const syncSnapshot = async () => {
      if (!runtimeBridge.isBuildFeatureFlagsSyncAvailable()) {
        return;
      }

      try {
        const response = await runtimeBridge.syncBuildFeatureFlagsSnapshot(
          featureFlags,
        );
        if (!response.ok) {
          throw new Error(
            response.error || "Failed to sync build feature flag snapshot.",
          );
        }
        if (!isUnmounted) {
          setFeatureFlagsSyncError("");
        }
      } catch (syncError) {
        if (!isUnmounted) {
          setFeatureFlagsSyncError(
            syncError?.message ||
              "Failed to sync build feature flag snapshot.",
          );
        }
      }
    };

    syncSnapshot();

    return () => {
      isUnmounted = true;
    };
  }, [featureFlags]);

  const handleToggle = useCallback(
    async (nextOpen) => {
      if (isUpdating) {
        return;
      }

      const previousOpen = chromeTerminalEnabled;
      setIsUpdating(true);
      setError("");
      setInfo("");

      setChromeTerminalEnabled(nextOpen);
      writeDevSettings({ chrome_terminal_enabled: nextOpen });

      try {
        const response = await runtimeBridge.setChromeTerminalOpen(nextOpen);
        if (!response.ok) {
          throw new Error(
            response.error || t("dev.chrome_toggle_failed"),
          );
        }
        setInfo(
          nextOpen ? t("dev.chrome_opened") : t("dev.chrome_closed"),
        );
      } catch (toggleError) {
        setChromeTerminalEnabled(previousOpen);
        writeDevSettings({ chrome_terminal_enabled: previousOpen });
        setError(toggleError?.message || t("dev.chrome_toggle_failed"));
      } finally {
        setIsUpdating(false);
      }
    },
    [chromeTerminalEnabled, isUpdating, t],
  );

  const handleFeatureFlagToggle = useCallback((flagKey, nextOpen) => {
    writeFeatureFlags({ [flagKey]: nextOpen });
  }, []);

  return (
    <div>
      <SettingsSection title="Developer" icon="terminal">
        <SettingsRow
          label={t("dev.chrome_terminal")}
          description={t("dev.chrome_terminal_desc")}
        >
          <SemiSwitch
            on={chromeTerminalEnabled}
            set_on={handleToggle}
            style={{
              width: 56,
              height: 28,
              opacity: isUpdating ? 0.6 : 1,
            }}
          />
        </SettingsRow>

        {error && (
          <div
            style={{
              fontSize: 12,
              fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
              color: errorColor,
              paddingBottom: 10,
            }}
          >
            {error}
          </div>
        )}

        {!error && info && (
          <div
            style={{
              fontSize: 12,
              fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
              color: successColor,
              paddingBottom: 10,
            }}
          >
            {info}
          </div>
        )}

        <div
          style={{
            fontSize: 11,
            fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
            color: mutedColor,
            lineHeight: 1.5,
            paddingBottom: 6,
          }}
        >
          {t("dev.electron_only")}
        </div>

        <SettingsRow
          label={t("dev.ui_testing")}
          description={t("dev.ui_testing_desc")}
        >
          <Button
            label={t("dev.open")}
            onClick={() => setShowUITesting(true)}
            style={{
              fontSize: 12,
              paddingVertical: 5,
              paddingHorizontal: 14,
              borderRadius: 6,
              hoverBackgroundColor: isDark
                ? "rgba(255,255,255,0.14)"
                : "rgba(0,0,0,0.10)",
              background: {
                hoverBackgroundColor: isDark
                  ? "rgba(255,255,255,0.14)"
                  : "rgba(0,0,0,0.10)",
              },
              root: {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.08)"
                  : "rgba(0,0,0,0.05)",
              },
            }}
          />
        </SettingsRow>
      </SettingsSection>

      <UITestingModal
        open={showUITesting}
        onClose={() => setShowUITesting(false)}
      />

      <SettingsSection title="Feature Flags" icon="flag">
        {Object.entries(FEATURE_FLAG_DEFINITIONS).map(([flagKey, definition]) => (
          <SettingsRow
            key={flagKey}
            label={flagKey}
            description={definition.description}
          >
            <SemiSwitch
              on={featureFlags[flagKey] === true}
              set_on={(nextOpen) =>
                handleFeatureFlagToggle(flagKey, nextOpen)
              }
              style={{ width: 56, height: 28 }}
            />
          </SettingsRow>
        ))}

        <div
          style={{
            fontSize: 11,
            fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
            color: mutedColor,
            lineHeight: 1.5,
            paddingBottom: featureFlagsSyncError ? 6 : 10,
          }}
        >
          Builds use the latest feature-flag snapshot synced from this page.
        </div>

        {featureFlagsSyncError && (
          <div
            style={{
              fontSize: 12,
              fontFamily: theme?.font?.fontFamily || "Jost, sans-serif",
              color: errorColor,
              paddingBottom: 10,
            }}
          >
            {featureFlagsSyncError}
          </div>
        )}
      </SettingsSection>
    </div>
  );
};

export default DevSettings;
