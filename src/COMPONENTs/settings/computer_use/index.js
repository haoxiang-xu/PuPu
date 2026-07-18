import { useCallback, useContext, useEffect, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { SemiSwitch } from "../../../BUILTIN_COMPONENTs/input/switch";
import { runtimeBridge } from "../../../SERVICEs/bridges/unchain_bridge";
import { isComputerUseEnabledPersisted } from "../../../SERVICEs/computer_use_enabled_store";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";
import { SettingsRow, SettingsSection } from "../appearance";
import { useComputerUseConsent } from "./consent_modal";
import { disableComputerUse, enableComputerUse } from "./enable_controller";

/* ────────────────────────────────────────────────────────────────────────── */
/*  Permission badge — granted / denied / unknown / not_applicable            */
/* ────────────────────────────────────────────────────────────────────────── */

export const permissionBadgePalette = (state, isDark) => {
  switch (state) {
    case "granted":
      return {
        color: isDark ? "#86efac" : "#2e7d32",
        background: isDark ? "rgba(134,239,172,0.14)" : "rgba(46,125,50,0.10)",
      };
    case "denied":
      return {
        color: isDark ? "#ff8a8a" : "#c62828",
        background: isDark ? "rgba(255,138,138,0.14)" : "rgba(198,40,40,0.10)",
      };
    case "not_applicable":
      return {
        color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.45)",
        background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
      };
    default:
      // unknown (and any unexpected value) → neutral gray
      return {
        color: isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.40)",
        background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
      };
  }
};

export const PermissionBadge = ({ state, isDark, fontFamily }) => {
  const { t } = useTranslation();
  const normalized =
    state === "granted" ||
    state === "denied" ||
    state === "not_applicable"
      ? state
      : "unknown";
  const palette = permissionBadgePalette(normalized, isDark);
  const labelKey = {
    granted: "computer_use.perm_granted",
    denied: "computer_use.perm_denied",
    not_applicable: "computer_use.perm_not_applicable",
    unknown: "computer_use.perm_unknown",
  }[normalized];

  return (
    <span
      data-testid={`perm-badge-${normalized}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontSize: 12,
        fontFamily: fontFamily || "inherit",
        color: palette.color,
        backgroundColor: palette.background,
        padding: "3px 10px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {t(labelKey)}
    </span>
  );
};

/* ────────────────────────────────────────────────────────────────────────── */
/*  Capability pill — supported / unsupported / neutral                       */
/* ────────────────────────────────────────────────────────────────────────── */

const CapabilityPill = ({ ok, text, isDark, fontFamily }) => {
  const color = ok
    ? isDark
      ? "#86efac"
      : "#2e7d32"
    : isDark
      ? "rgba(255,255,255,0.5)"
      : "rgba(0,0,0,0.45)";
  return (
    <span
      style={{
        fontSize: 12,
        fontFamily: fontFamily || "inherit",
        color,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
};

const isMacPlatform = (platform) =>
  platform === "macos" || platform === "darwin";

/* ────────────────────────────────────────────────────────────────────────── */
/*  ComputerUseSettings — status + capabilities + permissions panel           */
/* ────────────────────────────────────────────────────────────────────────── */

export const ComputerUseSettings = () => {
  const { theme, onThemeMode } = useContext(ConfigContext);
  const { t } = useTranslation();
  const isDark = onThemeMode === "dark_mode";
  const fontFamily = theme?.font?.fontFamily || "inherit";

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openError, setOpenError] = useState("");

  // Desired (expected) state from localStorage; server truth lives in `status`.
  const [expectedEnabled, setExpectedEnabled] = useState(() =>
    isComputerUseEnabledPersisted(),
  );
  const [toggleBusy, setToggleBusy] = useState(false);
  const [toggleError, setToggleError] = useState("");

  // One-time informed-consent gate. In dev this section lets us exercise the
  // consent flow; the real "enable" switch wires to requireComputerUseConsent
  // when the pre-release enablement path lands (see consent_modal.js).
  const { requireComputerUseConsent, resetConsent, consentRecord, consentModal } =
    useComputerUseConsent();

  const errorColor = isDark ? "#ff8a8a" : "#c62828";
  const mutedColor = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";

  const buttonStyle = {
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
      backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
    },
  };

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    if (!runtimeBridge.isComputerUseStatusAvailable()) {
      setStatus(null);
      setError(t("computer_use.unavailable"));
      setLoading(false);
      return;
    }
    try {
      const next = await runtimeBridge.getComputerUseStatus();
      setStatus(next);
    } catch (loadError) {
      setStatus(null);
      setError(loadError?.message || t("computer_use.load_failed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // The enable toggle. ON is consent-gated: consent is obtained BEFORE any
  // store write or bridge push, and a decline aborts the whole chain with
  // zero side effects. OFF needs no consent (revoking is always allowed).
  // After either action we re-read status so the displayed state reflects
  // server truth, never an optimistic "success".
  const handleToggle = useCallback(
    async (desiredEnabled) => {
      if (toggleBusy) return;
      setToggleError("");

      if (desiredEnabled) {
        setToggleBusy(true);
        // Consent FIRST — decline ⇒ no write, no push, nothing.
        let consented = false;
        try {
          consented = await requireComputerUseConsent();
        } catch (_consentError) {
          consented = false;
        }
        if (!consented) {
          setToggleBusy(false);
          return;
        }
        const result = await enableComputerUse();
        setExpectedEnabled(isComputerUseEnabledPersisted());
        if (!result.pushed) {
          setToggleError(t("computer_use.enable_failed"));
        }
        await loadStatus();
        setToggleBusy(false);
        return;
      }

      setToggleBusy(true);
      const result = await disableComputerUse();
      setExpectedEnabled(isComputerUseEnabledPersisted());
      if (!result.pushed && !result.unavailable) {
        setToggleError(t("computer_use.enable_failed"));
      }
      await loadStatus();
      setToggleBusy(false);
    },
    [toggleBusy, requireComputerUseConsent, loadStatus, t],
  );

  const handleOpenSettings = useCallback(
    async (target) => {
      setOpenError("");
      try {
        const result = await runtimeBridge.openComputerUsePrivacySettings(
          target,
        );
        if (!result.ok) {
          setOpenError(result.error || t("computer_use.open_failed"));
        }
      } catch (openException) {
        setOpenError(openException?.message || t("computer_use.open_failed"));
      }
    },
    [t],
  );

  const capabilities =
    status && status.capabilities && typeof status.capabilities === "object"
      ? status.capabilities
      : null;
  const platform = capabilities?.platform || "";
  const displayServer = capabilities?.display_server || "";
  const permissions =
    capabilities?.permissions && typeof capabilities.permissions === "object"
      ? capabilities.permissions
      : {};
  const isEnabled = Boolean(status?.enabled);
  const isEnableAvailable = runtimeBridge.isComputerUseEnableAvailable();
  // Server truth for the switch position — never optimistic.
  const effectiveEnabled = Boolean(status?.enabled);
  // Desired ≠ effective: the change is persisted but not yet in effect.
  const pendingMismatch = !loading && expectedEnabled !== effectiveEnabled;

  const successColor = isDark ? "#86efac" : "#2e7d32";

  return (
    <div>
      <SettingsSection title={t("computer_use.section")} icon="screenshot">
        <div
          style={{
            fontSize: 12,
            fontFamily,
            color: mutedColor,
            lineHeight: 1.5,
            padding: "8px 0 2px",
          }}
        >
          {t("computer_use.description")}
        </div>

        {isEnableAvailable ? (
          <SettingsRow
            label={t("computer_use.enable_label")}
            description={t("computer_use.enable_desc")}
          >
            <div
              data-testid="computer-use-enable-toggle"
              style={{
                opacity: toggleBusy || loading ? 0.5 : 1,
                pointerEvents: toggleBusy || loading ? "none" : "auto",
              }}
            >
              <SemiSwitch
                on={effectiveEnabled}
                set_on={(val) => handleToggle(val)}
                style={{ width: 56, height: 28 }}
              />
            </div>
          </SettingsRow>
        ) : (
          <SettingsRow
            label={
              isEnabled
                ? t("computer_use.status_enabled")
                : t("computer_use.status_disabled")
            }
            description={
              isEnabled
                ? t("computer_use.status_enabled_desc")
                : t("computer_use.status_disabled_desc")
            }
          >
            <Button
              label={t("computer_use.refresh")}
              onClick={loadStatus}
              style={{ ...buttonStyle, opacity: loading ? 0.6 : 1 }}
            />
          </SettingsRow>
        )}

        {isEnableAvailable && !loading && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              paddingBottom: 6,
            }}
          >
            <span
              data-testid="computer-use-effect-state"
              style={{
                fontSize: 12,
                fontFamily,
                color: effectiveEnabled ? successColor : mutedColor,
              }}
            >
              {effectiveEnabled
                ? t("computer_use.effect_active")
                : t("computer_use.effect_inactive")}
            </span>
            <Button
              label={t("computer_use.refresh")}
              onClick={loadStatus}
              style={buttonStyle}
            />
          </div>
        )}

        {pendingMismatch && (
          <div
            data-testid="computer-use-pending"
            style={{
              fontSize: 12,
              fontFamily,
              color: isDark ? "#f0c674" : "#8a6d1a",
              lineHeight: 1.5,
              paddingBottom: 10,
            }}
          >
            {t("computer_use.enable_pending")}
          </div>
        )}

        {toggleError && (
          <div
            style={{
              fontSize: 12,
              fontFamily,
              color: errorColor,
              paddingBottom: 10,
            }}
          >
            {toggleError}
          </div>
        )}

        {loading && (
          <div
            style={{
              fontSize: 12,
              fontFamily,
              color: mutedColor,
              paddingBottom: 10,
            }}
          >
            {t("computer_use.loading")}
          </div>
        )}

        {!loading && error && (
          <div
            style={{
              fontSize: 12,
              fontFamily,
              color: errorColor,
              paddingBottom: 10,
            }}
          >
            {error}
          </div>
        )}
      </SettingsSection>

      <SettingsSection title={t("computer_use.consent_section")} icon="shield">
        <SettingsRow
          label={
            consentRecord
              ? t("computer_use.consent_status_accepted")
              : t("computer_use.consent_status_none")
          }
          description={
            consentRecord
              ? t("computer_use.consent_status_accepted_desc", {
                  date: new Date(consentRecord.acceptedAt).toLocaleString(),
                })
              : t("computer_use.consent_status_none_desc")
          }
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Button
              label={t("computer_use.consent_review")}
              onClick={() => {
                requireComputerUseConsent();
              }}
              style={buttonStyle}
            />
            {consentRecord && (
              <Button
                label={t("computer_use.consent_reset")}
                onClick={resetConsent}
                style={buttonStyle}
              />
            )}
          </div>
        </SettingsRow>
      </SettingsSection>

      {!loading && capabilities && (
        <SettingsSection title={t("computer_use.capabilities")} icon="settings">
          <SettingsRow label={t("computer_use.platform")}>
            <CapabilityPill
              ok
              text={platform || "—"}
              isDark={isDark}
              fontFamily={fontFamily}
            />
          </SettingsRow>
          <SettingsRow label={t("computer_use.display_server")}>
            <CapabilityPill
              ok
              text={displayServer || "—"}
              isDark={isDark}
              fontFamily={fontFamily}
            />
          </SettingsRow>
          <SettingsRow label={t("computer_use.screenshot")}>
            <CapabilityPill
              ok={Boolean(capabilities.screenshot)}
              text={
                capabilities.screenshot
                  ? t("computer_use.supported")
                  : t("computer_use.unsupported")
              }
              isDark={isDark}
              fontFamily={fontFamily}
            />
          </SettingsRow>
          <SettingsRow label={t("computer_use.injection")}>
            <CapabilityPill
              ok={Boolean(capabilities.injection)}
              text={
                capabilities.injection
                  ? t("computer_use.supported")
                  : t("computer_use.unsupported")
              }
              isDark={isDark}
              fontFamily={fontFamily}
            />
          </SettingsRow>
          <SettingsRow label={t("computer_use.multi_display")}>
            <CapabilityPill
              ok={Boolean(capabilities.multi_display)}
              text={
                capabilities.multi_display
                  ? t("computer_use.supported")
                  : t("computer_use.primary_only")
              }
              isDark={isDark}
              fontFamily={fontFamily}
            />
          </SettingsRow>

          {capabilities.degradation_reason && (
            <div
              style={{
                fontSize: 12,
                fontFamily,
                color: errorColor,
                lineHeight: 1.5,
                padding: "6px 0 10px",
              }}
            >
              {capabilities.degradation_reason}
            </div>
          )}

          {displayServer === "wayland" && (
            <div
              style={{
                fontSize: 11,
                fontFamily,
                color: mutedColor,
                lineHeight: 1.5,
                paddingBottom: 10,
              }}
            >
              {t("computer_use.wayland_note")}
            </div>
          )}

          {platform === "windows" && (
            <div
              style={{
                fontSize: 11,
                fontFamily,
                color: mutedColor,
                lineHeight: 1.5,
                paddingBottom: 10,
              }}
            >
              {t("computer_use.windows_note")}
            </div>
          )}
        </SettingsSection>
      )}

      {!loading && capabilities && isMacPlatform(platform) && (
        <SettingsSection title={t("computer_use.permissions")} icon="shield">
          <SettingsRow label={t("computer_use.screen_recording")}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <PermissionBadge
                state={permissions.screen_recording}
                isDark={isDark}
                fontFamily={fontFamily}
              />
              {runtimeBridge.isComputerUsePrivacySettingsAvailable() && (
                <Button
                  label={t("computer_use.open_settings")}
                  onClick={() => handleOpenSettings("screen_recording")}
                  style={buttonStyle}
                />
              )}
            </div>
          </SettingsRow>

          <SettingsRow label={t("computer_use.accessibility")}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <PermissionBadge
                state={permissions.accessibility}
                isDark={isDark}
                fontFamily={fontFamily}
              />
              {runtimeBridge.isComputerUsePrivacySettingsAvailable() && (
                <Button
                  label={t("computer_use.open_settings")}
                  onClick={() => handleOpenSettings("accessibility")}
                  style={buttonStyle}
                />
              )}
            </div>
          </SettingsRow>

          {openError && (
            <div
              style={{
                fontSize: 12,
                fontFamily,
                color: errorColor,
                paddingBottom: 8,
              }}
            >
              {openError}
            </div>
          )}

          <div
            style={{
              fontSize: 11,
              fontFamily,
              color: mutedColor,
              lineHeight: 1.5,
              paddingBottom: 10,
            }}
          >
            {t("computer_use.permissions_hint")}
          </div>
        </SettingsSection>
      )}

      {consentModal}
    </div>
  );
};

export default ComputerUseSettings;
