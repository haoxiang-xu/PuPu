import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const validator = path.join(here, "validate-mcp-registry.cjs");
const realRegistry = path.join(here, "..", "src", "SERVICEs", "mcp_toolkit_registry.json");
const run = (arg) =>
  spawnSync("node", arg ? [validator, arg] : [validator], { encoding: "utf8" });

const runMutatedRegistry = (mutate) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-mcp-registry-"));
  const target = path.join(dir, "registry.json");
  try {
    const registry = JSON.parse(fs.readFileSync(realRegistry, "utf8"));
    mutate(registry);
    fs.writeFileSync(target, JSON.stringify(registry));
    return run(target);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
};

test("passes on the real in-repo registry", () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr);
});

test("fails on a registry with an illegal trustLevel", () => {
  const r = run(path.join(here, "fixtures", "registry-bad-trustlevel.json"));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /trustLevel "totally-bogus" not in/);
});

test("fails when a blocked OAuth entry is advertised as available", () => {
  const r = runMutatedRegistry((registry) => {
    registry.entries.find((entry) => entry.id === "dev.figma-remote").status = "available";
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /available entries must be installable or have release-ready OAuth/);
});

test("fails when an executable MCP package is not version-pinned", () => {
  const r = runMutatedRegistry((registry) => {
    registry.entries.find((entry) => entry.id === "browser.playwright").mcp.args = [
      "-y",
      "@playwright/mcp@latest",
    ];
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /stdio package must use an exact pinned version/);
});

test("rejects npm ranges, npm wildcards, Python wildcards, and Python URLs", () => {
  const cases = [
    ["browser.playwright", ["-y", "@playwright/mcp@^0.0.78"]],
    ["browser.chrome-devtools", ["-y", "chrome-devtools-mcp@1.x"]],
    ["devops.grafana", ["mcp-grafana==0.17.*"]],
    ["devops.grafana", ["mcp-grafana==https://evil.invalid/pkg.whl"]],
  ];

  for (const [entryId, args] of cases) {
    const r = runMutatedRegistry((registry) => {
      registry.entries.find((entry) => entry.id === entryId).mcp.args = args;
    });
    assert.equal(r.status, 1, `${entryId} ${args.join(" ")} should fail`);
    assert.match(r.stderr, /stdio package must use an exact pinned version/);
  }
});

test("fails when an executable MCP recipe omits the frozen dependency cutoff", () => {
  const r = runMutatedRegistry((registry) => {
    const entry = registry.entries.find((item) => item.id === "memory.memory");
    entry.mcp.args = entry.mcp.args.filter(
      (arg) => !arg.startsWith("--before="),
    );
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /stdio recipe must use dependency cutoff/);
});

test("fails when a packaged stdio entry claims the user must install a runtime", () => {
  const r = runMutatedRegistry((registry) => {
    registry.entries.find(
      (entry) => entry.id === "memory.memory",
    ).prerequisites = ["Node.js >= 18"];
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /must not require a user-installed runtime/);
});

test("fails when an upstream-unbounded MCP recipe drops its verified SDK pin", () => {
  const r = runMutatedRegistry((registry) => {
    const entry = registry.entries.find(
      (item) => item.id === "workspace.fetch",
    );
    entry.mcp.args = entry.mcp.args.filter(
      (arg) => arg !== "--with" && arg !== "mcp==1.28.0",
    );
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /pin the verified transitive SDK/);
});

test("fails when a needs-review entry is installable", () => {
  const r = runMutatedRegistry((registry) => {
    registry.entries.find((entry) => entry.id === "productivity.discord").installable = true;
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /needs_review entries must stay non-installable/);
});

test("fails when SQLite receives the workspace directory as its database path", () => {
  const r = runMutatedRegistry((registry) => {
    registry.entries.find((entry) => entry.id === "workspace.sqlite").mcp.args = [
      "mcp-server-sqlite==2025.4.25",
      "--db-path",
      "${WORKSPACE}",
    ];
  });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /SQLite --db-path must resolve to a file/);
});
