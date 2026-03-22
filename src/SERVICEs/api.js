import { createMisoApi } from "./api.miso";
import { createOllamaApi } from "./api.ollama";
import { createSystemApi } from "./api.system";
import {
  EMPTY_MODEL_CATALOG,
  FrontendApiError,
  OLLAMA_BASE,
  assertBridgeMethod,
  normalizeModelCatalog,
  safeJson,
  withTimeout,
} from "./api.shared";

const system = createSystemApi();

// Compatibility facade: keep legacy `api` shape while delegating to domain modules.
export const api = {
  appInfo: system.appInfo,
  appUpdate: system.appUpdate,
  system,
  runtime: system.runtime,
  theme: system.theme,
  windowState: system.windowState,
  miso: createMisoApi(),
  ollama: createOllamaApi(),
};

export {
  EMPTY_MODEL_CATALOG,
  FrontendApiError,
  OLLAMA_BASE,
  withTimeout,
  safeJson,
  assertBridgeMethod,
  normalizeModelCatalog,
};

export default api;
