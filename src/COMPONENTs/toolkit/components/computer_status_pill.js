import { useEffect, useState } from "react";
import { runtimeBridge } from "../../../SERVICEs/bridges/unchain_bridge";
import { useTranslation } from "../../../BUILTIN_COMPONENTs/mini_react/use_translation";

/**
 * ComputerStatusPill — read-only runtime status indicator for the synthetic
 * Computer plugin row on the Installed screen (S1).
 *
 * Reads the sidecar's authoritative computer-use runtime status once on mount
 * (`runtimeBridge.getComputerUseStatus()`) and shows Enabled / Disabled. This
 * is a STATUS indicator only, never a control: the actual on/off toggle lives
 * exclusively in the Computer settings detail page (ComputerUseSettings),
 * which is the single surface carrying the consent gate. Putting a switch here
 * would let a user flip computer use on from a list row without ever passing
 * the consent point — hence pill, not switch.
 *
 * Fail-closed: a failed / unavailable read (older sidecar, bridge missing,
 * sidecar down) is NOT surfaced as an error — it collapses to Disabled, which
 * matches the runtime contract where an unreachable sidecar means the tool is
 * not in effect.
 */
export const ComputerStatusPill = ({ isDark = false }) => {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    runtimeBridge
      .getComputerUseStatus()
      .then((status) => {
        if (!cancelled) setEnabled(Boolean(status?.enabled));
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const palette = enabled
    ? {
        color: isDark ? "#86efac" : "#2e7d32",
        background: isDark ? "rgba(134,239,172,0.14)" : "rgba(46,125,50,0.10)",
      }
    : {
        color: isDark
          ? "rgba(var(--pupu-text-rgb),0.5)"
          : "rgba(var(--pupu-text-rgb),0.45)",
        background: isDark
          ? "rgba(var(--pupu-text-rgb),0.08)"
          : "rgba(var(--pupu-text-rgb),0.05)",
      };

  return (
    <span
      data-testid="computer-status-pill"
      style={{
        fontSize: 10.5,
        fontWeight: 500,
        letterSpacing: "0.02em",
        color: palette.color,
        background: palette.background,
        borderRadius: 999,
        padding: "3px 9px",
        whiteSpace: "nowrap",
      }}
    >
      {enabled
        ? t("computer_use.status_enabled")
        : t("computer_use.status_disabled")}
    </span>
  );
};

export default ComputerStatusPill;
