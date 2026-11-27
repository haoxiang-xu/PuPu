import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const count = (source, pattern) => [...source.matchAll(pattern)].length;

const assertSharedActionContract = (action) => {
  assert.match(action, /name: Windows Artifact Signing/);
  assert.match(action, /unsupported Windows signing evidence schema/);
  assert.match(action, /signing path must remain inside the isolated root/);
  assert.match(action, /pupu\.windows-release-candidate-signing\.v1/);
  assert.match(action, /pupu\.windows-signing-qualification\.v1/);
  assert.match(action, /resources\\mcp_runtime\\python\\DLLs\\tcl86t\.dll/);
  assert.match(action, /resources\\mcp_runtime\\python\\DLLs\\tk86t\.dll/);
  assert.match(action, /the controlled unsigned payload exception set did not match exactly/);
  assert.match(action, /\$signableFiles \| ForEach-Object \{ \$_\.IsReadOnly = \$false \}/);
  assert.match(action, /contains read-only \.exe or \.dll files/);
  assert.match(action, /files-catalog:/);
  assert.doesNotMatch(action, /files-folder:/);
  assert.match(action, /\$installerName = \[System\.IO\.Path\]::GetFileName\(\$installerPath\)/);
  assert.match(action, /--config\.nsis\.artifactName="\$installerName"/);
  assert.match(action, /--config\.nsis\.packElevateHelper=false/);
  assert.match(action, /Rebuild updater blockmap and metadata from the signed installer/);
  assert.match(action, /node "\$env:SIGNING_HELPER_ROOT\/regenerate-windows-blockmap\.mjs" --installer "\$installerPath"/);
  assert.doesNotMatch(action, /app-builder-bin|& \$appBuilder blockmap/);
  assert.match(action, /refresh-windows-updater-metadata\.mjs/);
  assert.ok(
    action.indexOf("Sign Windows installer with Artifact Signing") <
      action.indexOf("Rebuild updater blockmap and metadata from the signed installer"),
    "the updater metadata must be regenerated only after the installer is Authenticode-signed",
  );
  assert.match(action, /Get-AuthenticodeSignature/);
  assert.match(action, /Status -ne "Valid"/);
  assert.match(action, /payload_path = if/);
  assert.match(action, /files = @\(\$observations\)/);
  assert.match(action, /GetTempFileName\(\)/);
  assert.match(action, /finally \{\s*Remove-Item -LiteralPath \$observationPath/);
  assert.match(action, /signer_subject/);
  assert.match(action, /signer_thumbprint/);
  assert.match(action, /build-windows-signing-evidence\.mjs/);
  assert.match(action, /Windows signing evidence classification failed/);
  assert.match(action, /canonicalize-windows-signing-evidence\.mjs/);
  assert.match(action, /--evidence "\$env:EVIDENCE_OUTPUT"/);
  assert.ok(
    action.indexOf("build-windows-signing-evidence.mjs") <
      action.indexOf("canonicalize-windows-signing-evidence.mjs"),
    "the real projector must write evidence before canonicalization and publication",
  );
  assert.ok(action.indexOf("canonicalize-windows-signing-evidence.mjs") <
    action.indexOf('"evidence_path='));
  assert.doesNotMatch(action, /reason = "upstream Tcl\/Tk DLL rejected/);
  const projector = read("scripts/release-qa/build-windows-signing-evidence.mjs");
  assert.match(projector, /unsigned_payload_exceptions/);
  assert.match(projector, /signable_payload_file_count/);
  const document = YAML.parseDocument(action, { uniqueKeys: true });
  assert.deepEqual(document.errors.map((error) => error.message), []);
  for (const step of YAML.parse(action).runs.steps.filter((item) => item.run?.includes("SIGNING_HELPER_ROOT/"))) {
    assert.equal(step.env.SIGNING_HELPER_ROOT, "${{ github.action_path }}/../../../scripts/release-qa");
    assert.equal(step["working-directory"], "${{ inputs.working-directory }}");
  }
  assert.doesNotMatch(action, /node scripts\/release-qa\//,
    "maintained tool entrypoints must not be looked up in the older fixture checkout");
  assert.equal(
    count(action, /uses: azure\/artifact-signing-action@[0-9a-f]{40} # v2/g),
    3,
    "the shared action must sign dependencies, the resealed launcher, and installer separately",
  );
};

const assertCallerUsesOnlySharedAction = ({ workflow, label, actionPath, evidenceSchema, evidenceOutput }) => {
  assert.equal(
    count(workflow, new RegExp(`uses: ${actionPath}`, "g")),
    1,
    label + " must call the shared signing action exactly once",
  );
  assert.match(workflow, new RegExp("evidence-schema: " + evidenceSchema));
  assert.match(workflow, new RegExp("evidence-output: " + evidenceOutput));
  assert.doesNotMatch(
    workflow,
    /uses: azure\/(?:login|artifact-signing-action)/,
    label + " must not retain a second Azure signing implementation",
  );
  assert.doesNotMatch(workflow, /Get-AuthenticodeSignature/);
  assert.doesNotMatch(workflow, /the controlled unsigned payload exception set did not match exactly/);
};

test("formal candidate and qualification signing share one guarded implementation", () => {
  const action = read(".github/actions/windows-artifact-signing/action.yml");
  const qualification = read(".github/workflows/windows-signing-qualification.yml");
  const candidate = read(".github/workflows/_shared-release-package.yml");

  assertSharedActionContract(action);
  assertCallerUsesOnlySharedAction({
    workflow: qualification,
    label: "Windows signing qualification",
    actionPath: "\\.\\/\\.github\\/actions\\/windows-artifact-signing",
    evidenceSchema: "pupu\\.windows-signing-qualification\\.v1",
    evidenceOutput: "windows-signing-qualification\\.v1\\.json",
  });
  assertCallerUsesOnlySharedAction({
    workflow: candidate,
    label: "release candidate Windows signing",
    actionPath: "\\.\\/pupu\\/\\.github\\/actions\\/windows-artifact-signing",
    evidenceSchema: "pupu\\.windows-release-candidate-signing\\.v1",
    evidenceOutput: "windows-signing-evidence\\.v1\\.json",
  });
  assert.match(candidate, /steps\.windows_artifact_signing\.outcome/);
  const gateStart = candidate.indexOf("windows)\n              node scripts/release-qa/windows-release-candidate-signing.mjs");
  assert.ok(gateStart > 0, "the package must execute the assembler's strict signing validator");
  const gate = candidate.slice(gateStart, candidate.indexOf(";;", gateStart));
  for (const flag of ["--evidence", "--installer", "--version", "--run-id", "--commit"]) {
    assert.ok(gate.includes(flag), "strict package gate needs " + flag);
  }
  assert.doesNotMatch(gate, /unsigned_payload_exceptions\.map/);
  for (const file of [".github/workflows/_shared-release-windows-restart-update.yml",
    ".github/workflows/_shared-windows-upgrade-diagnostic.yml"]) {
    const workflow = read(file);
    assert.equal(count(workflow, /uses: \.\/pupu\/\.github\/actions\/windows-artifact-signing/g), 1);
    assert.doesNotMatch(workflow, /app-builder-bin|uses: azure\/artifact-signing-action/);
  }
  assert.match(qualification, /environment: windows-signing-qualification/);
  assert.doesNotMatch(qualification, /environment: release-signing/);
});
