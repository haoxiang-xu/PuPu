/**
 * MCP Server Management API Service
 *
 * Follows the same pattern as api.miso.js / api.ollama.js:
 *   1. If a real preload bridge method exists → call it.
 *   2. Otherwise → fall back to local mock data for UI development.
 *
 * Once the electron MCP bridge is wired, the mock fallback is
 * transparently skipped and every call goes through IPC.
 */
import {
  hasBridgeMethod,
  assertBridgeMethod,
  toFrontendApiError,
  withTimeout,
} from "./api.shared";
import { mcpMockApi } from "../COMPONENTs/toolkit/mcp/mock_data";

/* ── Helper: bridge-first, mock-fallback ── */
const callOrMock = async (methodName, mockFn, args = [], timeoutMs = 8000) => {
  if (hasBridgeMethod("mcpAPI", methodName)) {
    try {
      const method = assertBridgeMethod("mcpAPI", methodName);
      return await withTimeout(
        () => method(...args),
        timeoutMs,
        `mcp_${methodName}_timeout`,
        `MCP ${methodName} request timed out`,
      );
    } catch (error) {
      throw toFrontendApiError(
        error,
        `mcp_${methodName}_failed`,
        `MCP ${methodName} failed`,
      );
    }
  }
  /* Fallback to mock */
  return mockFn(...args);
};

/* ══════════════════════════════════════════════
   Public API
   ══════════════════════════════════════════════ */
export const createMcpApi = () => ({
  isBridgeAvailable: () => hasBridgeMethod("mcpAPI", "listCatalog"),

  listCatalog: (filters) =>
    callOrMock("listCatalog", mcpMockApi.listCatalog, [filters]),

  importClaudeConfig: (payload) =>
    callOrMock("importClaudeConfig", mcpMockApi.importClaudeConfig, [payload]),

  importGitHubRepo: (payload) =>
    callOrMock("importGitHubRepo", mcpMockApi.importGitHubRepo, [payload]),

  createManualDraft: (payload) =>
    callOrMock("createManualDraft", mcpMockApi.createManualDraft, [payload]),

  listInstalledServers: () =>
    callOrMock("listInstalledServers", mcpMockApi.listInstalledServers),

  testInstalledServer: (payload) =>
    callOrMock(
      "testInstalledServer",
      mcpMockApi.testInstalledServer,
      [payload],
      30000,
    ),

  enableInstalledServer: (payload) =>
    callOrMock("enableInstalledServer", mcpMockApi.enableInstalledServer, [
      payload,
    ]),

  disableInstalledServer: (payload) =>
    callOrMock("disableInstalledServer", mcpMockApi.disableInstalledServer, [
      payload,
    ]),

  saveInstalledServer: (payload) =>
    callOrMock("saveInstalledServer", mcpMockApi.saveInstalledServer, [
      payload,
    ]),
});

export default createMcpApi;
