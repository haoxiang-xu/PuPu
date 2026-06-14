import { readFileSync } from "node:fs";

const DEFAULT_BASE_URL = "http://127.0.0.1:5879";
const REGISTRY_URL = new URL(
  "../../src/SERVICEs/mcp_toolkit_registry.json",
  import.meta.url,
);

const readRegistryEntries = () => {
  const payload = JSON.parse(readFileSync(REGISTRY_URL, "utf8"));
  return Array.isArray(payload.entries) ? payload.entries : [];
};

const registryEntries = readRegistryEntries();

const oauthStatusEntryIds = () =>
  registryEntries
    .filter((entry) => entry?.auth?.oauth && entry.id)
    .map((entry) => entry.id);

const installCleanupEntry = () =>
  registryEntries.find((entry) => entry?.smoke?.installCleanup) ||
  registryEntries.find(
    (entry) =>
      entry?.installable &&
      entry?.mcp?.transport === "stdio" &&
      !(entry.secrets || []).length &&
      !entry?.workspace?.required,
  );

const isSensitiveKey = (key) => {
  const normalized = String(key || "").toLowerCase();
  const compact = normalized.replace(/[-_]/g, "");
  return (
    compact.includes("token") ||
    compact === "secret" ||
    compact === "clientsecret" ||
    compact === "secretvalue" ||
    compact === "secretvalues" ||
    normalized === "authorization" ||
    normalized === "authurl" ||
    normalized === "state" ||
    normalized === "password" ||
    normalized === "private"
  );
};

export const maskSensitive = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => maskSensitive(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    out[key] = isSensitiveKey(key) ? "[masked]" : maskSensitive(raw);
  }
  return out;
};

export const summarizeToolkit = (toolkit = {}) => ({
  entryId: toolkit.entryId || "",
  toolkitId: toolkit.toolkitId || "",
  status: toolkit.status || "",
  toolCount: Number(toolkit.toolCount || 0),
  lastError: toolkit.lastError || "",
  authStatus: toolkit.authStatus || "",
  authProvider: toolkit.authProvider || "",
  secretStatus: Array.isArray(toolkit.secretStatus)
    ? toolkit.secretStatus.map((item) => ({
        key: item.key || "",
        configured: Boolean(item.configured),
      }))
    : [],
});

export const summarizeOAuthStart = (payload = {}) => {
  let authUrlHost = "";
  try {
    authUrlHost = payload.authUrl ? new URL(payload.authUrl).host : "";
  } catch {
    authUrlHost = "";
  }
  return {
    entryId: payload.entryId || "",
    toolkitId: payload.toolkitId || "",
    hasAuthUrl: Boolean(payload.authUrl),
    authUrlHost,
    hasState: Boolean(payload.state),
    expiresAtType: typeof payload.expiresAt,
  };
};

const normalizeBaseUrl = (baseUrl = DEFAULT_BASE_URL) =>
  String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");

const parseJsonOrText = async (res) => {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const createRuntimeClient = ({ baseUrl, authToken, fetchImpl = globalThis.fetch }) => {
  if (!authToken) {
    throw new Error("UNCHAIN_AUTH_TOKEN is required for MCP smoke");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch implementation is required for MCP smoke");
  }
  const root = normalizeBaseUrl(baseUrl);
  const request = async (method, path, body) => {
    const init = {
      method,
      headers: {
        "x-unchain-auth": authToken,
        ...(body == null ? {} : { "content-type": "application/json" }),
      },
      body: body == null ? undefined : JSON.stringify(body),
    };
    const res = await fetchImpl(`${root}${path}`, init);
    const payload = await parseJsonOrText(res);
    if (!res.ok) {
      const error = new Error(
        payload?.error?.message || payload?.message || `HTTP ${res.status}`,
      );
      error.status = res.status;
      error.body = payload;
      throw error;
    }
    return payload;
  };
  return {
    GET: (path) => request("GET", path),
    POST: (path, body) => request("POST", path, body),
    DELETE: (path) => request("DELETE", path),
  };
};

const safeCall = async (name, fn) => {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return {
      ok: false,
      value: {
        name,
        status: error.status || 0,
        error: maskSensitive(error.body?.error || { message: error.message }),
      },
    };
  }
};

export const runMcpSmoke = async ({
  baseUrl = DEFAULT_BASE_URL,
  authToken,
  fetchImpl = globalThis.fetch,
  logger = console.log,
  checkHealth = true,
  oauthStartEntry = "",
  memoryInstallCleanup = false,
} = {}) => {
  const log = (...args) => logger("[mcp-smoke]", ...args);
  const client = createRuntimeClient({ baseUrl, authToken, fetchImpl });

  log("checking runtime health");
  const health = await client.GET("/health");

  log("listing installed MCP toolkits");
  const installedPayload = await client.GET("/mcp/toolkits");
  const installedToolkits = Array.isArray(installedPayload?.toolkits)
    ? installedPayload.toolkits
    : [];
  const installedIds = installedToolkits
    .map((toolkit) => toolkit.toolkitId)
    .filter(Boolean);
  const installed = {
    count: installedToolkits.length,
    ids: installedIds,
    toolkits: installedToolkits.map(summarizeToolkit),
    healthChecks: [],
  };

  if (checkHealth) {
    for (const toolkitId of installedIds) {
      log("checking MCP health", toolkitId);
      const result = await safeCall(`health:${toolkitId}`, () =>
        client.POST(`/mcp/toolkits/${encodeURIComponent(toolkitId)}/health`, {}),
      );
      installed.healthChecks.push(
        result.ok
          ? summarizeToolkit(result.value?.toolkit || {})
          : maskSensitive(result.value),
      );
    }
  }

  log("reloading installed MCP toolkits");
  const reload = await safeCall("reload", () => client.POST("/mcp/toolkits/reload", {}));

  log("checking toolkit catalogs");
  const [catalogV2, catalogV1] = await Promise.all([
    client.GET("/toolkits/catalog/v2"),
    client.GET("/toolkits/catalog"),
  ]);
  const v2Ids = (catalogV2?.toolkits || [])
    .map((toolkit) => toolkit.id || toolkit.toolkitId || toolkit.name)
    .filter(Boolean);
  const v1Ids = (catalogV1?.toolkits || [])
    .map((toolkit) => toolkit.id || toolkit.toolkitId || toolkit.name)
    .filter(Boolean);

  log("checking OAuth app slots and statuses");
  const oauthAppsPayload = await client.GET("/mcp/oauth/apps");
  const oauthStatuses = [];
  for (const entryId of oauthStatusEntryIds()) {
    const result = await safeCall(`oauth-status:${entryId}`, () =>
      client.GET(`/mcp/oauth/status?entry_id=${encodeURIComponent(entryId)}`),
    );
    oauthStatuses.push(
      result.ok
        ? {
            entryId: result.value.entryId || entryId,
            toolkitId: result.value.toolkitId || "",
            authStatus: result.value.authStatus || "",
            authProvider: result.value.authProvider || "",
            lastError: result.value.lastError || "",
          }
        : result.value,
    );
  }

  let oauthStart = null;
  if (oauthStartEntry) {
    log("starting OAuth flow", oauthStartEntry);
    const result = await safeCall(`oauth-start:${oauthStartEntry}`, () =>
      client.POST("/mcp/oauth/start", { entryId: oauthStartEntry }),
    );
    oauthStart = result.ok ? summarizeOAuthStart(result.value) : result.value;
  }

  let memoryInstall = null;
  if (memoryInstallCleanup) {
    const cleanupEntry = installCleanupEntry();
    if (!cleanupEntry?.id || !cleanupEntry?.toolkitId) {
      memoryInstall = {
        skippedInstall: true,
        reason: "no_registry_cleanup_entry",
        deleted: false,
      };
    } else if (installedIds.includes(cleanupEntry.toolkitId)) {
      log("Cleanup MCP already installed; checking health without cleanup");
      const result = await safeCall("cleanup-existing-health", () =>
        client.POST(
          `/mcp/toolkits/${encodeURIComponent(cleanupEntry.toolkitId)}/health`,
          {},
        ),
      );
      memoryInstall = {
        skippedInstall: true,
        reason: "already_installed",
        health: result.ok ? summarizeToolkit(result.value?.toolkit || {}) : result.value,
        deleted: false,
      };
    } else {
      log("installing cleanup MCP", cleanupEntry.toolkitId);
      const installResult = await client.POST("/mcp/toolkits/install", {
        entryId: cleanupEntry.id,
      });
      const install = summarizeToolkit(installResult?.toolkit || {});
      const [afterInstallV2, afterInstallV1] = await Promise.all([
        client.GET("/toolkits/catalog/v2"),
        client.GET("/toolkits/catalog"),
      ]);
      const afterInstallV2Ids = (afterInstallV2?.toolkits || [])
        .map((toolkit) => toolkit.id || toolkit.toolkitId || toolkit.name)
        .filter(Boolean);
      const afterInstallV1Ids = (afterInstallV1?.toolkits || [])
        .map((toolkit) => toolkit.id || toolkit.toolkitId || toolkit.name)
        .filter(Boolean);
      log("deleting cleanup MCP install", cleanupEntry.toolkitId);
      const deleted = await client.DELETE(
        `/mcp/toolkits/${encodeURIComponent(cleanupEntry.toolkitId)}`,
      );
      memoryInstall = {
        skippedInstall: false,
        install,
        catalogV2HasMemory: afterInstallV2Ids.includes(cleanupEntry.toolkitId),
        catalogV1HasMemory: afterInstallV1Ids.includes(cleanupEntry.toolkitId),
        deleted: Boolean(deleted?.ok),
      };
    }
  }

  return maskSensitive({
    baseUrl: normalizeBaseUrl(baseUrl),
    health: {
      status: health?.status || "",
      model: health?.model || "",
      version: health?.version || "",
      threaded: Boolean(health?.threaded),
    },
    installed,
    reload: reload.ok
      ? {
          ok: true,
          count: Array.isArray(reload.value?.toolkits)
            ? reload.value.toolkits.length
            : Number(reload.value?.count || 0),
        }
      : reload.value,
    catalog: {
      v2HasInstalledMcp: installedIds.every((id) => v2Ids.includes(id)),
      v1HasInstalledMcp: installedIds.every((id) => v1Ids.includes(id)),
      v2McpIds: v2Ids.filter((id) => String(id).startsWith("mcp.")),
      v1McpIds: v1Ids.filter((id) => String(id).startsWith("mcp.")),
    },
    oauthApps: {
      count: Number(oauthAppsPayload?.count || oauthAppsPayload?.apps?.length || 0),
      apps: (oauthAppsPayload?.apps || []).map((app) => ({
        provider: app.provider || "",
        providerLabel: app.providerLabel || "",
        toolkitId: app.toolkitId || "",
        entryId: app.entryId || "",
        configured: Boolean(app.configured),
        clientIdPreview: app.clientIdPreview || "",
        scopes: Array.isArray(app.scopes) ? app.scopes : [],
      })),
    },
    oauthStatuses,
    oauthStart,
    memoryInstall,
  });
};

export const DEFAULT_MCP_SMOKE_BASE_URL = DEFAULT_BASE_URL;
