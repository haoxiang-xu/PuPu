import Button from "../../../BUILTIN_COMPONENTs/input/button";
import { usePluginInstallState } from "../hooks/use_plugin_install_state";

/* PluginInstallPill — the Get/Open pill used as a plugin_list_row right slot
   on Discover and Categories (T3). Behavior ported verbatim from the
   retired plugin_tile.js's handlePillClick: an installed entry's pill opens
   detail (if a click handler is wired), an `opensSetup` entry (secrets /
   http-secret / custom recipe) also opens detail instead of firing a
   secretless install, and everything else installs directly through
   usePluginInstallState. */
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
  const chipColor = isDark ? "#9aa8ff" : "#2563eb";
  const pillBg = isDark ? "rgba(124,140,248,0.12)" : "rgba(37,99,235,0.08)";
  const pillOpenColor = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.50)";
  const pillOpenBg = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";

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
    <Button
      label={installMachine.stateLabel}
      disabled={!pillEnabled}
      onClick={handleClick}
      style={{
        fontSize: 11,
        fontWeight: 700,
        paddingVertical: 3,
        paddingHorizontal: 13,
        borderRadius: 999,
        color: isOpen ? pillOpenColor : chipColor,
        root: { background: isOpen ? pillOpenBg : pillBg },
        state: {
          disabled: { root: { opacity: 0.6, cursor: "not-allowed" }, background: {} },
        },
      }}
    />
  );
};

export default PluginInstallPill;
