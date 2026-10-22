import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";

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

test("restart consumers read the exact candidate directory populated by the download", () => {
  for (const name of [
    "_shared-release-macos-restart-update.yml",
    "_shared-release-windows-restart-update.yml",
    "_shared-windows-upgrade-diagnostic.yml",
  ]) {
    const workflow = YAML.parse(fs.readFileSync(path.join(workflowDirectory, name), "utf8"));
    const job = Object.values(workflow.jobs)[0];
    const download = job.steps.find((step) => /gh run download/.test(step.run || ""));
    const resolve = (step, value) => path.posix.resolve(
      "/workspace",
      step["working-directory"] || "",
      value.replaceAll("$env:GITHUB_WORKSPACE", "/workspace").replaceAll("\\", "/"),
    );
    const destination = resolve(download, download.run.match(/--dir\s+(\S+)/)[1]);
    const cleanupPath = resolve(download, download.run.match(/--cleanup-path\s+(\S+)/)[1]);
    assert.equal(cleanupPath, destination, `${name}: retry cleanup must match download destination`);
    let consumers = 0;
    for (const step of job.steps) {
      for (const match of (step.run || "").matchAll(/--candidate-dir\s+(?:"([^"]+)"|(\S+))/g)) {
        consumers += 1;
        assert.equal(resolve(step, match[1] || match[2]), destination, `${name}: ${step.name}`);
      }
    }
    assert.ok(consumers > 0, `${name}: no candidate consumers were checked`);
  }
});

test("README network helpers come from its frozen tools checkout", () => {
  const workflow = YAML.parse(fs.readFileSync(`${workflowDirectory}/update-readme-download-links.yml`, "utf8"));
  const steps = workflow.jobs["update-readme"].steps;
  const toolsCheckout = steps.find((step) => step.with?.ref === "${{ github.sha }}");
  const expectedHelper = `${toolsCheckout.with.path}/scripts/release-qa/external-network-retry.mjs`;
  let helpers = 0;
  for (const step of steps) {
    for (const match of (step.run || "").matchAll(/node\s+(\S*external-network-retry\.mjs)/g)) {
      helpers += 1;
      assert.equal(match[1], expectedHelper, step.name);
    }
  }
  assert.equal(helpers, 2);
});

test("historical fixture dependency installs have an explicit npm retry policy", () => {
  for (const name of workflowFiles) {
    const workflow = YAML.parse(fs.readFileSync(path.join(workflowDirectory, name), "utf8"));
    for (const job of Object.values(workflow.jobs || {})) {
      for (const step of job.steps || []) {
        if (step["working-directory"] !== "fixture-source" || !/npm ci/.test(step.run || "")) continue;
        assert.match(step.run, /npm ci --fetch-retries=5/, name);
        assert.match(step.run, /--fetch-timeout=300000/, name);
      }
    }
  }
});

