import { useCallback, useContext, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import { SemiSwitch } from "../../../BUILTIN_COMPONENTs/input/switch";
import { runtimeBridge } from "../../../SERVICEs/bridges/miso_bridge";
import { SettingsRow, SettingsSection } from "../appearance";
import { readDevSettings, writeDevSettings } from "./storage";

export const DevSettings = () => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const [chromeTerminalEnabled, setChromeTerminalEnabled] = useState(
    () => readDevSettings().chrome_terminal_enabled,
  );
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const errorColor = isDark ? "#ff7f7f" : "#c62828";
  const successColor = isDark ? "#86efac" : "#2e7d32";
  const mutedColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";

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
            response.error || "Failed to toggle Chrome terminal.",
          );
        }
        setInfo(
          nextOpen ? "Chrome terminal opened." : "Chrome terminal closed.",
        );
      } catch (toggleError) {
        setChromeTerminalEnabled(previousOpen);
        writeDevSettings({ chrome_terminal_enabled: previousOpen });
        setError(toggleError?.message || "Failed to toggle Chrome terminal.");
      } finally {
        setIsUpdating(false);
      }
    },
    [chromeTerminalEnabled, isUpdating],
  );

  return (
    <div>
      <SettingsSection title="Developer" icon="terminal">
        <SettingsRow
          label="Chrome Terminal"
          description="Toggle Chromium DevTools for the main Electron window."
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
              fontFamily: "Jost, sans-serif",
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
              fontFamily: "Jost, sans-serif",
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
            fontFamily: "Jost, sans-serif",
            color: mutedColor,
            lineHeight: 1.5,
            paddingBottom: 6,
          }}
        >
          This setting is available only in Electron development runtime.
        </div>
      </SettingsSection>
    </div>
  );
};

export default DevSettings;
