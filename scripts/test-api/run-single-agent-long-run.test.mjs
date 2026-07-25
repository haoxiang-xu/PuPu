import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseArgs,
  prepareIsolatedHome,
  usage,
} from "./run-single-agent-long-run.mjs";

test("parses the single-root runner contract without accepting hidden modes", () => {
  assert.deepEqual(parseArgs([]), {
    profile: "quick",
    reportDir: "",
    python: "",
    webPort: "2918",
    headed: false,
    help: false,
  });
  assert.deepEqual(
    parseArgs([
      "--profile",
      "full",
      "--report-dir",
      "/tmp/agent-run",
      "--python",
      "/tmp/python",
      "--web-port",
      "3999",
      "--headed",
    ]),
    {
      profile: "full",
      reportDir: "/tmp/agent-run",
      python: "/tmp/python",
      webPort: "3999",
      headed: true,
      help: false,
    },
  );
  assert.throws(() => parseArgs(["--multi-agent-only"]), /unknown argument/);
  assert.throws(() => parseArgs(["--web-port", "0"]), /between 1 and 65535/);
  assert.match(usage(), /exactly one root attempt/);
  assert.match(usage(), /full keeps each root alive >=20m/);
});

test("writes delegate/worker templates and one isolated Default recipe", (t) => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "pupu-single-agent-runner-"),
  );
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const result = prepareIsolatedHome(tempDir);
  const templates = fs
    .readdirSync(result.subagentDir)
    .filter((name) => name.endsWith(".skeleton"))
    .sort();
  assert.deepEqual(templates, [
    "soak-explore-a.skeleton",
    "soak-explore-b.skeleton",
    "soak-explore-c.skeleton",
  ]);
  for (const filename of templates) {
    const value = JSON.parse(
      fs.readFileSync(path.join(result.subagentDir, filename), "utf8"),
    );
    assert.deepEqual(value.allowed_modes, ["delegate", "worker"]);
    assert.equal(value.parallel_safe, true);
  }

  const recipe = JSON.parse(
    fs.readFileSync(path.join(result.recipeDir, "Default.recipe"), "utf8"),
  );
  assert.equal(recipe.name, "Default");
  assert.deepEqual(
    recipe.subagent_pool.map((entry) => entry.template_name),
    ["soak-explore-a", "soak-explore-b", "soak-explore-c"],
  );
});
