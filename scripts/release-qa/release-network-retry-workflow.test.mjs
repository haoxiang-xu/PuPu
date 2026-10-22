import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const workflowDirectory = ".github/workflows";
const workflowFiles = fs
  .readdirSync(workflowDirectory)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"));
const workflowText = workflowFiles
  .map((name) => fs.readFileSync(path.join(workflowDirectory, name), "utf8"))
  .join("\n");

test("standalone Apple stapler validation uses the bounded read retry helper", () => {
  const packageWorkflow = fs.readFileSync(`${workflowDirectory}/_shared-release-package.yml`, "utf8");
  assert.match(
    packageWorkflow,
    /external-network-retry\.mjs[\s\\]*--profile apple-ticket[\s\S]*?--[\s\\]*xcrun stapler validate "\$APP_PATH"/,
  );
  const staplerCommand = packageWorkflow.match(/^\s*xcrun stapler validate "\$APP_PATH"/m);
  assert.ok(staplerCommand);
  const prefix = packageWorkflow.slice(Math.max(0, staplerCommand.index - 220), staplerCommand.index);
  assert.match(prefix, /external-network-retry\.mjs[\s\S]*--profile apple-ticket[\s\S]*--\s*\\?\s*$/);
});

test("release dependency downloads declare bounded npm and pip retry policies", () => {
  const npmConfig = fs.readFileSync(".npmrc", "utf8");
  assert.match(npmConfig, /^fetch-retries=5$/m);
  assert.match(npmConfig, /^fetch-retry-mintimeout=10000$/m);
  assert.match(npmConfig, /^fetch-retry-maxtimeout=120000$/m);
  assert.match(npmConfig, /^fetch-timeout=300000$/m);

  const pipLines = workflowText.split("\n").filter((line) => /python -m pip install/.test(line));
  const networkPipLines = pipLines.filter((line) => !/--force-reinstall --no-deps/.test(line));
  for (const line of networkPipLines) {
    assert.match(line, /--retries 5/);
    assert.match(line, /--timeout 60/);
  }
});

test("critical GitHub metadata and artifact reads use the bounded retry helper", () => {
  for (const workflowName of workflowFiles) {
    const workflow = fs.readFileSync(path.join(workflowDirectory, workflowName), "utf8");
    for (const match of workflow.matchAll(/^\s*gh (?:api|run download|release download)\b/gm)) {
      const prefix = workflow.slice(Math.max(0, match.index - 220), match.index);
      assert.match(
        prefix,
        /external-network-retry\.mjs[\s\S]*--profile github-read[\s\S]*--\s*(?:\\|`)?\s*$/,
        workflowName,
      );
    }
  }
});

test("generic network retry is not applied to publication or Azure signing mutations", () => {
  assert.doesNotMatch(
    workflowText,
    /external-network-retry\.mjs[\s\S]{0,300}(?:gh release (?:create|edit|upload)|azure\/artifact-signing-action)/,
  );
});

