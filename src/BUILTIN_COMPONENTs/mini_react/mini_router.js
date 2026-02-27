import {
  BrowserRouter,
  HashRouter,
  Routes as ReactRoutes,
  Route as ReactRoute,
} from "react-router-dom";

/* { ROUTER ADAPTER } -------------------------------------------------------------------------------------------- */
const ROUTER_MODE = {
  AUTO: "auto",
  BROWSER: "browser",
  HASH: "hash",
};

let registeredRouterAdapter = null;

const isElectronRuntime = () => {
  if (typeof window === "undefined") {
    return false;
  }

  const hasPreloadBridge = window.runtime?.isElectron === true;
  const userAgent =
    typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const hasElectronUserAgent = userAgent.indexOf("Electron") >= 0;
  const hasElectronProcess =
    typeof window.process !== "undefined" &&
    window.process &&
    window.process.versions &&
    window.process.versions.electron;

  return Boolean(hasPreloadBridge || hasElectronUserAgent || hasElectronProcess);
};

const resolveRouterMode = (mode = ROUTER_MODE.AUTO) => {
  const runtimeMode =
    typeof window !== "undefined" &&
    window.__MINI_UI_ROUTER_MODE__ &&
    typeof window.__MINI_UI_ROUTER_MODE__ === "string"
      ? window.__MINI_UI_ROUTER_MODE__
      : null;

  const envMode =
    typeof process !== "undefined" &&
    process.env &&
    process.env.REACT_APP_ROUTER_MODE
      ? process.env.REACT_APP_ROUTER_MODE
      : null;

  const normalizedMode =
    typeof mode === "string" ? mode.toLowerCase().trim() : ROUTER_MODE.AUTO;
  const normalizedRuntimeMode =
    typeof runtimeMode === "string" ? runtimeMode.toLowerCase().trim() : null;
  const normalizedEnvMode =
    typeof envMode === "string" ? envMode.toLowerCase().trim() : null;

  const selectedMode =
    normalizedMode !== ROUTER_MODE.AUTO
      ? normalizedMode
      : normalizedRuntimeMode || normalizedEnvMode || ROUTER_MODE.AUTO;

  if (selectedMode === ROUTER_MODE.HASH) {
    return ROUTER_MODE.HASH;
  }
  if (selectedMode === ROUTER_MODE.BROWSER) {
    return ROUTER_MODE.BROWSER;
  }
  return isElectronRuntime() ? ROUTER_MODE.HASH : ROUTER_MODE.BROWSER;
};

const registerRouterAdapter = (adapter) => {
  if (typeof adapter !== "function") {
    throw new Error("router adapter must be a React component.");
  }
  registeredRouterAdapter = adapter;
};

const resetRouterAdapter = () => {
  registeredRouterAdapter = null;
};

const Router = ({ children, mode = ROUTER_MODE.AUTO, ...routerProps }) => {
  if (registeredRouterAdapter) {
    const RegisteredRouterAdapter = registeredRouterAdapter;
    return (
      <RegisteredRouterAdapter mode={mode} {...routerProps}>
        {children}
      </RegisteredRouterAdapter>
    );
  }

  const resolvedMode = resolveRouterMode(mode);
  if (resolvedMode === ROUTER_MODE.HASH) {
    return <HashRouter {...routerProps}>{children}</HashRouter>;
  }
  return <BrowserRouter {...routerProps}>{children}</BrowserRouter>;
};

const Routes = ReactRoutes;
const Route = ReactRoute;
/* { ROUTER ADAPTER } -------------------------------------------------------------------------------------------- */

export {
  ROUTER_MODE,
  isElectronRuntime,
  resolveRouterMode,
  registerRouterAdapter,
  resetRouterAdapter,
  Router,
  Routes,
  Route,
};
