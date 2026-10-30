import { useEffect, useState } from "react";

import { windowStateBridge } from "../../SERVICEs/bridges/window_state_bridge";

const useWindowFullscreen = () => {
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !windowStateBridge.isAvailable()) {
      return undefined;
    }

    const unsubscribe = windowStateBridge.onWindowStateChange((payload) => {
      setIsFullScreen(payload?.isFullScreen === true);
    });
    windowStateBridge.sendWindowAction("get-state");
    return unsubscribe;
  }, []);

  return isFullScreen;
};

export default useWindowFullscreen;
