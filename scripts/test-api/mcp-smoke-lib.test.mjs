import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  maskSensitive,
  runMcpSmoke,
  summarizeOAuthStart,
  summarizeToolkit,
} from "./mcp-smoke-lib.mjs";

describe("mcp smoke helpers", () => {
  it("masks tokens, secrets, authorization headers, and auth urls", () => {
    const masked = maskSensitive({
      access_token: "access-123",
      clientSecret: "secret-123",
      secret_values: { OPENAI_API_KEY: "sk-secret" },
      secretStatus: [{ key: "OPENAI_API_KEY", configured: true }],
      Authorization: "Bearer github-token",
      authUrl: "https://github.com/login/oauth/authorize?client_id=abc",
      nested: [{ refresh_token: "refresh-123" }],
    });

    assert.equal(masked.access_token, "[masked]");
    assert.equal(masked.clientSecret, "[masked]");
    assert.equal(masked.secret_values, "[masked]");
    assert.deepEqual(masked.secretStatus, [{ key: "OPENAI_API_KEY", configured: true }]);
    assert.equal(masked.Authorization, "[masked]");
    assert.equal(masked.authUrl, "[masked]");
    assert.equal(masked.nested[0].refresh_token, "[masked]");
  });

  it("summarizes toolkits without leaking tool descriptions", () => {
    const summary = summarizeToolkit({
      entryId: "dev.github-remote",
      toolkitId: "mcp.dev.github-remote",
      status: "available",
      toolCount: 47,
      tools: [{ name: "secret_tool", description: "long docs" }],
      secretStatus: [{ key: "GITHUB_MCP_PAT", configured: true }],
    });

    assert.deepEqual(summary, {
      entryId: "dev.github-remote",
      toolkitId: "mcp.dev.github-remote",
      status: "available",
      toolCount: 47,
      lastError: "",
      authStatus: "",
      authProvider: "",
      secretStatus: [{ key: "GITHUB_MCP_PAT", configured: true }],
    });
  });

  it("summarizes oauth start by host and state presence only", () => {
    const summary = summarizeOAuthStart({
      entryId: "productivity.notion-remote",
      toolkitId: "mcp.productivity.notion-remote",
      authUrl: "https://mcp.notion.com/oauth/authorize?state=secret-state",
      state: "secret-state",
      expiresAt: 123,
    });

    assert.deepEqual(summary, {
      entryId: "productivity.notion-remote",
      toolkitId: "mcp.productivity.notion-remote",
      hasAuthUrl: true,
      authUrlHost: "mcp.notion.com",
      hasState: true,
      expiresAtType: "number",
    });
  });
});

describe("runMcpSmoke", () => {
  it("checks health, installed MCP, health reload, catalogs, oauth apps, and optional oauth start", async () => {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      const parsed = new URL(url);
      calls.push({
        method: init.method || "GET",
        path: parsed.pathname + parsed.search,
        auth: init.headers?.["x-unchain-auth"],
      });
      const body = JSON.parse(String(init.body || "{}"));
      const json = (status, payload) =>
        new Response(JSON.stringify(payload), {
          status,
          headers: { "content-type": "application/json" },
        });

      if (parsed.pathname === "/health") {
        return json(200, { status: "ok", model: "ollama:qwen" });
      }
      if (parsed.pathname === "/mcp/toolkits" && (init.method || "GET") === "GET") {
        return json(200, {
          toolkits: [
            {
              entryId: "dev.github-remote",
              toolkitId: "mcp.dev.github-remote",
              status: "available",
              toolCount: 47,
              secretStatus: [{ key: "GITHUB_MCP_PAT", configured: true }],
            },
          ],
        });
      }
      if (parsed.pathname === "/mcp/toolkits/mcp.dev.github-remote/health") {
        return json(200, {
          toolkit: {
            entryId: "dev.github-remote",
            toolkitId: "mcp.dev.github-remote",
            status: "available",
            toolCount: 47,
          },
        });
      }
      if (parsed.pathname === "/mcp/toolkits/reload") {
        return json(200, { toolkits: [] });
      }
      if (parsed.pathname === "/toolkits/catalog/v2") {
        return json(200, { toolkits: [{ id: "mcp.dev.github-remote" }] });
      }
      if (parsed.pathname === "/toolkits/catalog") {
        return json(200, { toolkits: [{ name: "mcp.dev.github-remote" }] });
      }
      if (parsed.pathname === "/mcp/oauth/apps") {
        return json(200, {
          apps: [
            {
              toolkitId: "mcp.dev.github-remote",
              provider: "github",
              configured: true,
              clientIdPreview: "abcd...wxyz",
            },
          ],
        });
      }
      if (parsed.pathname === "/mcp/oauth/status") {
        return json(200, {
          entryId: parsed.searchParams.get("entry_id"),
          authStatus: "missing",
        });
      }
      if (parsed.pathname === "/mcp/oauth/start" && body.entryId === "productivity.notion-remote") {
        return json(200, {
          entryId: "productivity.notion-remote",
          toolkitId: "mcp.productivity.notion-remote",
          authUrl: "https://mcp.notion.com/oauth?state=private",
          state: "private",
          expiresAt: 123,
        });
      }
      return json(404, { error: { code: "missing", message: parsed.pathname } });
    };

    const summary = await runMcpSmoke({
      baseUrl: "http://runtime.local",
      authToken: "runtime-token",
      fetchImpl,
      oauthStartEntry: "productivity.notion-remote",
      logger: () => {},
    });

    assert.equal(summary.health.status, "ok");
    assert.deepEqual(summary.installed.ids, ["mcp.dev.github-remote"]);
    assert.equal(summary.installed.healthChecks[0].status, "available");
    assert.equal(summary.catalog.v2HasInstalledMcp, true);
    assert.equal(summary.catalog.v1HasInstalledMcp, true);
    assert.equal(summary.oauthApps.apps[0].configured, true);
    assert.equal(summary.oauthStart.authUrlHost, "mcp.notion.com");
    assert.equal(JSON.stringify(summary).includes("runtime-token"), false);
    assert.equal(JSON.stringify(summary).includes("private"), false);
    assert.ok(calls.every((call) => call.auth === "runtime-token"));
  });

  it("can install Memory MCP, verify catalog presence, and delete it again", async () => {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      const parsed = new URL(url);
      calls.push({ method: init.method || "GET", path: parsed.pathname });
      const json = (status, payload) =>
        new Response(JSON.stringify(payload), {
          status,
          headers: { "content-type": "application/json" },
        });

      if (parsed.pathname === "/health") {
        return json(200, { status: "ok" });
      }
      if (parsed.pathname === "/mcp/toolkits" && (init.method || "GET") === "GET") {
        return json(200, { toolkits: [] });
      }
      if (parsed.pathname === "/mcp/toolkits/reload") {
        return json(200, { toolkits: [] });
      }
      if (parsed.pathname === "/mcp/toolkits/install") {
        return json(200, {
          toolkit: {
            entryId: "memory.memory",
            toolkitId: "mcp.memory.memory",
            status: "available",
            toolCount: 9,
          },
        });
      }
      if (parsed.pathname === "/mcp/toolkits/mcp.memory.memory") {
        return json(200, { ok: true, toolkitId: "mcp.memory.memory" });
      }
      if (parsed.pathname === "/toolkits/catalog/v2") {
        return json(200, { toolkits: [{ id: "mcp.memory.memory" }] });
      }
      if (parsed.pathname === "/toolkits/catalog") {
        return json(200, { toolkits: [{ name: "mcp.memory.memory" }] });
      }
      if (parsed.pathname === "/mcp/oauth/apps") {
        return json(200, { apps: [] });
      }
      if (parsed.pathname === "/mcp/oauth/status") {
        return json(200, { entryId: parsed.searchParams.get("entry_id"), authStatus: "missing" });
      }
      return json(404, { error: { code: "missing", message: parsed.pathname } });
    };

    const summary = await runMcpSmoke({
      baseUrl: "http://runtime.local",
      authToken: "runtime-token",
      fetchImpl,
      memoryInstallCleanup: true,
      logger: () => {},
    });

    assert.equal(summary.memoryInstall.install.status, "available");
    assert.equal(summary.memoryInstall.catalogV2HasMemory, true);
    assert.equal(summary.memoryInstall.catalogV1HasMemory, true);
    assert.equal(summary.memoryInstall.deleted, true);
    assert.deepEqual(
      calls.map((call) => `${call.method} ${call.path}`).filter((entry) => entry.includes("memory") || entry.includes("install")),
      [
        "POST /mcp/toolkits/install",
        "DELETE /mcp/toolkits/mcp.memory.memory",
      ],
    );
  });
});
