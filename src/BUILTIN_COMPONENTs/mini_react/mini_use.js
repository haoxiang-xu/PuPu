import {
  useState,
  useEffect,
  useRef,
  useLayoutEffect as reactUseLayoutEffect,
} from "react";

/* { BASIC HOOKs } ------------------------------------------------------------------------------------------------ */
const useLayoutEffect =
  typeof window !== "undefined" ? reactUseLayoutEffect : useEffect;
/* { BASIC HOOKs } ------------------------------------------------------------------------------------------------ */

/* { ENVIRONMENT LISTENERs } ------------------------------------------------------------------------------------ */
const detectWebBrowser = () => {
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  if (userAgent.includes("Firefox")) return "Firefox";
  if (userAgent.includes("Opera") || userAgent.includes("OPR")) return "Opera";
  if (userAgent.includes("Trident")) return "Internet Explorer";
  if (userAgent.includes("Edge")) return "Edge";
  if (userAgent.includes("Chrome")) return "Chrome";
  if (userAgent.includes("Safari")) return "Safari";
  return "Unknown";
};

const detectDeviceType = () => {
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    userAgent,
  )
    ? "mobile"
    : "desktop";
};

const useSystemTheme = () => {
  const [systemTheme, setSystemTheme] = useState(
    window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark_mode"
      : "light_mode",
  );
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e) => {
      setSystemTheme(e.matches ? "dark_mode" : "light_mode");
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);
  return systemTheme;
};
const useWindowSize = () => {
  const [windowSize, setWindowSize] = useState(() => ({
    width: window.innerWidth || 0,
    height: window.innerHeight || 0,
  }));
  useEffect(() => {
    let frameId = null;
    const commitSize = () => {
      frameId = null;
      const width = window.innerWidth;
      const height = window.innerHeight;
      setWindowSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    };
    const handleResize = () => {
      if (frameId != null) return;
      if (typeof window.requestAnimationFrame === "function") {
        frameId = window.requestAnimationFrame(commitSize);
      } else {
        commitSize();
      }
    };
    window.addEventListener("resize", handleResize);
    handleResize();
    return () => {
      window.removeEventListener("resize", handleResize);
      if (
        frameId != null &&
        typeof window.cancelAnimationFrame === "function"
      ) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, []);
  return windowSize;
};
const useMouse = () => {
  const [mouse, setMouse] = useState({
    x: -999,
    y: -999,
    vx: 0,
    vy: 0,
    leftKeyDown: false,
    rightKeyDown: false,
  });

  const lastRef = useRef({
    x: 0,
    y: 0,
    t: performance.now(),
  });
  const idleTimerRef = useRef(null);

  useEffect(() => {
    const onMove = (e) => {
      const now = performance.now();
      const dt = now - lastRef.current.t;

      const dx = e.clientX - lastRef.current.x;
      const dy = e.clientY - lastRef.current.y;

      const vx = dt > 0 ? (dx / dt) * 1000 : 0;
      const vy = dt > 0 ? (dy / dt) * 1000 : 0;

      lastRef.current = { x: e.clientX, y: e.clientY, t: now };

      setMouse((m) => ({ ...m, x: e.clientX, y: e.clientY, vx, vy }));

      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        setMouse((m) => ({ ...m, vx: 0, vy: 0 }));
      }, 60);
    };
    const onPointerDown = (e) => {
      if (e.button === 0) {
        setMouse((m) => ({ ...m, leftKeyDown: true }));
      } else if (e.button === 2) {
        setMouse((m) => ({ ...m, rightKeyDown: true }));
      }
    };
    const onPointerUp = (e) => {
      if (e.button === 0) {
        setMouse((m) => ({ ...m, leftKeyDown: false }));
      } else if (e.button === 2) {
        setMouse((m) => ({ ...m, rightKeyDown: false }));
      }
    };
    const onPointerCancel = () => {
      setMouse((m) => ({ ...m, leftKeyDown: false, rightKeyDown: false }));
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  return mouse;
};
const useWebBrowser = () => {
  const [webBrowser] = useState(detectWebBrowser);
  return webBrowser;
};
const useDeviceType = () => {
  const [deviceType] = useState(detectDeviceType);
  return deviceType;
};
const useRuntimePlatform = () => {
  const detectRuntimePlatform = () => {
    if (typeof window === "undefined") {
      return "web";
    }

    if (window.runtime?.isElectron === true) {
      return "electron";
    }

    const userAgent =
      typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
    const hasElectronUserAgent = userAgent.includes("Electron");
    const hasElectronProcess = Boolean(
      window.process &&
        window.process.versions &&
        window.process.versions.electron,
    );

    return hasElectronUserAgent || hasElectronProcess ? "electron" : "web";
  };

  const [platform, setPlatform] = useState(detectRuntimePlatform);

  useEffect(() => {
    setPlatform(detectRuntimePlatform());
  }, []);

  return platform;
};
/* { ENVIRONMENT LISTENERs } ------------------------------------------------------------------------------------ */

export {
  useLayoutEffect,
  detectWebBrowser,
  detectDeviceType,
  useSystemTheme,
  useWindowSize,
  useMouse,
  useWebBrowser,
  useDeviceType,
  useRuntimePlatform,
};
