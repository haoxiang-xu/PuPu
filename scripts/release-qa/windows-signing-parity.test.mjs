import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

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
  assert.match(action, /& \$appBuilder blockmap --input/);
  assert.match(action, /refresh-windows-updater-metadata\.mjs/);
  assert.ok(
    action.indexOf("Sign Windows installer with Artifact Signing") <
      action.indexOf("Rebuild updater blockmap and metadata from the signed installer"),
    "the updater metadata must be regenerated only after the installer is Authenticode-signed",
  );
  assert.match(action, /Get-AuthenticodeSignature/);
  assert.match(action, /Status -ne "Valid"/);
  assert.match(action, /unsigned_payload_exceptions/);
  assert.match(action, /signable_payload_file_count/);
  assert.match(action, /signer_subject/);
  assert.match(action, /signer_thumbprint/);
  assert.match(action, /canonicalize-windows-signing-evidence\.mjs/);
  assert.match(action, /--evidence "\$env:EVIDENCE_OUTPUT"/);
  assert.ok(
    action.indexOf("Set-Content -LiteralPath $env:EVIDENCE_OUTPUT") <
      action.indexOf("canonicalize-windows-signing-evidence.mjs"),
    "Windows signing evidence must be canonicalized only after the producer writes it",
  );
  assert.equal(
    count(action, /uses: azure\/artifact-signing-action@v2/g),
    2,
    "the shared action must sign exactly the payload catalogue and installer",
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
  assert.match(qualification, /environment: windows-signing-qualification/);
  assert.doesNotMatch(qualification, /environment: release-signing/);
});
