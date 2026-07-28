import { useEffect } from "react";

import { resyncComputerUseEnabledOnBoot } from "./enable_controller";
import { runtimeBridge } from "../../../SERVICEs/bridges/unchain_bridge";
import { isComputerUseLocalBetaPersisted } from "../../../SERVICEs/computer_use_local_beta_store";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*  ComputerUseBootSync — headless boot re-synchronizer                            */
/*                                                                                */
/*  Renders nothing. On the first renderer mount it re-pushes the persisted        */
/*  desired computer-use state to the sidecar (via the enable_controller, the      */
/*  single facade call site). localStorage survives a full app restart but the     */
/*  main process's in-memory desired-state cache does not, so without this the      */
/*  sidecar would come up off even though the user had enabled computer use.        */
/*                                                                                  */
/*  The controller pushes true ONLY when the persisted state is enabled AND        */
/*  consent is still valid — a CONSENT_VERSION bump means no push and the panel     */
/*  shows a re-consent-needed state. Fire-and-forget: any failure is self-healed    */
/*  on the next boot / main-side re-push and never blocks app start.                */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const ComputerUseBootSync = () => {
  useEffect(() => {
    // Fire-and-forget. The controller never throws (returns a result object),
    // but guard anyway so a bad state can never surface as an unhandled boot
    // rejection.
    resyncComputerUseEnabledOnBoot().catch(() => {});
    if (runtimeBridge.isComputerUseLocalBetaAvailable?.() === true) {
      // Push both ON and OFF. Local storage is the desktop app's desired state;
      // an absent/corrupt record resolves false and therefore fails closed.
      runtimeBridge
        .setComputerUseLocalBetaEnabled(isComputerUseLocalBetaPersisted())
        .catch(() => {});
    }
  }, []);

  return null;
};

export default ComputerUseBootSync;
