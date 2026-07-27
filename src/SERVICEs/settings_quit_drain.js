// Renderer half of the settings quit handshake.
//
// A request closes admission in every settings-backed store synchronously,
// then awaits the already-queued FIFO tails. Success leaves the barriers held
// until the renderer exits. Main sends ABORT when quit/window-close is
// canceled (including a chat beforeunload veto), which makes the running app
// writable again.

import { settingsStorageBridge } from "./bridges/settings_storage_bridge";
import {
  beginSettingsQuitDrain,
  endSettingsQuitDrain,
} from "./settings_repository";
import {
  beginDefaultToolkitQuitDrain,
  endDefaultToolkitQuitDrain,
} from "./default_toolkit_store";
import {
  beginToolkitAutoApproveQuitDrain,
  endToolkitAutoApproveQuitDrain,
} from "./toolkit_auto_approve_store";
import {
  beginComputerUsePreferencesQuitDrain,
  endComputerUsePreferencesQuitDrain,
} from "./computer_use_preferences_sql";
import {
  beginProviderCredentialQuitDrain,
  endProviderCredentialQuitDrain,
} from "./provider_credential_persistence";
import {
  beginTokenUsageQuitDrain,
  endTokenUsageQuitDrain,
} from "../COMPONENTs/settings/token_usage/storage";
import {
  beginCustomMcpIconQuitDrain,
  endCustomMcpIconQuitDrain,
} from "./custom_mcp_icon_store";

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/;
const ERROR_CODE_PATTERN = /^[a-z0-9_]{1,80}$/;

const getErrorCode = (error) => {
  if (
    error &&
    typeof error.code === "string" &&
    ERROR_CODE_PATTERN.test(error.code)
  ) {
    return error.code;
  }
  return "settings_quit_drain_failed";
};

const DEFAULT_BEGIN_DRAINS = Object.freeze([
  beginSettingsQuitDrain,
  beginDefaultToolkitQuitDrain,
  beginToolkitAutoApproveQuitDrain,
  beginComputerUsePreferencesQuitDrain,
  beginProviderCredentialQuitDrain,
  beginTokenUsageQuitDrain,
  beginCustomMcpIconQuitDrain,
]);

const DEFAULT_END_DRAINS = Object.freeze([
  endSettingsQuitDrain,
  endDefaultToolkitQuitDrain,
  endToolkitAutoApproveQuitDrain,
  endComputerUsePreferencesQuitDrain,
  endProviderCredentialQuitDrain,
  endTokenUsageQuitDrain,
  endCustomMcpIconQuitDrain,
]);

export const createSettingsQuitDrainController = ({
  bridge = settingsStorageBridge,
  beginDrains = DEFAULT_BEGIN_DRAINS,
  endDrains = DEFAULT_END_DRAINS,
} = {}) => {
  let activeRequestId = null;
  let disposed = false;

  const releaseBarriers = (requestId) => {
    if (requestId && activeRequestId !== requestId) return false;
    if (activeRequestId === null) return false;
    activeRequestId = null;
    for (const endDrain of endDrains) {
      try {
        endDrain();
      } catch (_error) {
        // Releasing the remaining stores is more important than one cleanup
        // hook. This path never reports values or exception messages.
      }
    }
    return true;
  };

  const handleDrainRequest = (payload) => {
    const requestId =
      payload && typeof payload.requestId === "string"
        ? payload.requestId
        : "";
    if (!REQUEST_ID_PATTERN.test(requestId)) return;

    if (activeRequestId !== null) {
      if (activeRequestId !== requestId) {
        bridge.sendQuitDrainResult({
          requestId,
          ok: false,
          errorCode: "settings_quit_in_progress",
        });
      }
      return;
    }

    activeRequestId = requestId;
    let drains;
    try {
      // Do not defer these calls: every store closes mutation admission in
      // this same renderer turn, before any promise is awaited.
      drains = beginDrains.map((beginDrain) => beginDrain());
    } catch (error) {
      releaseBarriers(requestId);
      bridge.sendQuitDrainResult({
        requestId,
        ok: false,
        errorCode: getErrorCode(error),
      });
      return;
    }

    Promise.all(drains).then(
      () => {
        if (!disposed && activeRequestId === requestId) {
          bridge.sendQuitDrainResult({ requestId, ok: true });
        }
      },
      (error) => {
        if (!disposed && activeRequestId === requestId) {
          releaseBarriers(requestId);
          bridge.sendQuitDrainResult({
            requestId,
            ok: false,
            errorCode: getErrorCode(error),
          });
        }
      },
    );
  };

  const handleDrainAbort = (payload) => {
    const requestId =
      payload && typeof payload.requestId === "string"
        ? payload.requestId
        : "";
    if (REQUEST_ID_PATTERN.test(requestId)) {
      releaseBarriers(requestId);
    }
  };

  const unsubscribeRequest = bridge.onQuitDrainRequest(handleDrainRequest);
  const unsubscribeAbort = bridge.onQuitDrainAbort(handleDrainAbort);

  return {
    dispose: () => {
      disposed = true;
      releaseBarriers();
      if (typeof unsubscribeRequest === "function") unsubscribeRequest();
      if (typeof unsubscribeAbort === "function") unsubscribeAbort();
    },
    isDraining: () => activeRequestId !== null,
  };
};

let defaultController = null;
if (settingsStorageBridge.isQuitDrainAvailable()) {
  defaultController = createSettingsQuitDrainController();
}

export const disposeSettingsQuitDrainForTests = () => {
  if (defaultController) {
    defaultController.dispose();
    defaultController = null;
  }
};
