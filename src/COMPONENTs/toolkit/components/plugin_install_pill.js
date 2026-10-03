import Button from "../../../BUILTIN_COMPONENTs/input/button";
import ArcSpinner from "../../../BUILTIN_COMPONENTs/spinner/arc_spinner";
import { usePluginInstallState } from "../hooks/use_plugin_install_state";

/* PluginInstallPill — the Get/Open pill used as a plugin_list_row right slot
   on Discover and Categories (T3). Behavior ported verbatim from the
   retired plugin_tile.js's handlePillClick: an installed entry's pill opens
   detail (if a click handler is wired), an `opensSetup` entry (secrets /
   http-secret / custom recipe) also opens detail instead of firing a
   secretless install, and everything else installs directly through
   usePluginInstallState. M6: a 12px ArcSpinner renders beside the label
   while installing — ported from plugin_tile.js's own spinner, which this
   pill dropped when it replaced the tile as the list-row right slot. */
/* The store carries no colour fills (SPEC rule 1): an action reads as an action
   by being a filled neutral pill, not by being blue. Exported so the two pages
   that draw their own skill-pack Get button speak in the same voice. Colours
   are alphas over --pupu-text-rgb, so they follow the theme without a branch. */
const PILL_METRICS = {
  fontSize: 11,
  fontWeight: 500,
  paddingVertical: 3,
  paddingHorizontal: 13,
  borderRadius: 999,
  state: {
    disabled: { root: { opacity: 0.6, cursor: "not-allowed" }, background: {} },
  },
};

export const ACTION_PILL_STYLE = {
  ...PILL_METRICS,
  color: "rgba(var(--pupu-text-rgb),0.82)",
  root: { background: "rgba(var(--pupu-text-rgb),0.08)" },
};

export const QUIET_PILL_STYLE = {
  ...PILL_METRICS,
  color: "rgba(var(--pupu-text-rgb),0.50)",
  root: { background: "rgba(var(--pupu-text-rgb),0.05)" },
};

const PluginInstallPill = ({
  entry,
  isDark,
  installedIds,
  forceInstalled = false,
  installing = false,
  onInstall,
  onOAuthConnect,
  onCancelOAuth,
  onOpenDetail,
  t,
}) => {
  const installMachine = usePluginInstallState({
    entry,
    installedIds,
    installing,
    forceInstalled,
    onInstall,
    onOAuthConnect,
    onCancelOAuth,
    t,
  });

  const isOpen = installMachine.installState === "installed";
  const pillEnabled = isOpen || installMachine.canInstall;

  const handleClick = (event) => {
    event.stopPropagation();
    if (isOpen) {
      onOpenDetail?.();
      return;
    }
    if (installMachine.opensSetup) {
      onOpenDetail?.();
      return;
    }
    installMachine.onInstall();
  };

  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {installMachine.installing && (
        <ArcSpinner
          size={12}
          stroke_width={2}
          color={isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)"}
        />
      )}
      <Button
        label={installMachine.stateLabel}
        disabled={!pillEnabled}
        onClick={handleClick}
        style={isOpen ? QUIET_PILL_STYLE : ACTION_PILL_STYLE}
      />
    </span>
  );
};

export default PluginInstallPill;
