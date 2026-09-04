import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

test("signing workflows isolate standalone credentials and OIDC to Windows jobs", () => {
  const gitignore = read(".gitignore");
  const windowsQualification = read(".github/workflows/windows-signing-qualification.yml");
  const releaseQa = read(".github/workflows/release-qa.yml");
  const sharedPackage = read(".github/workflows/_shared-release-package.yml");

  for (const [label, source] of [
    ["Windows signing qualification", windowsQualification],
    ["Release QA", releaseQa],
    ["shared release package", sharedPackage],
  ]) {
    const document = YAML.parseDocument(source, { uniqueKeys: true });
    assert.deepEqual(document.errors.map((error) => error.message), [], `${label} must be valid YAML`);
  }

  const releaseDocument = YAML.parse(releaseQa);

  assert.match(gitignore, /^\*\.p12$/m);
  assert.match(gitignore, /^\*\.pfx$/m);
  assert.match(gitignore, /^AuthKey_\*\.p8$/m);

  assert.match(windowsQualification, /environment: windows-signing-qualification/);
  assert.doesNotMatch(windowsQualification, /environment: release-signing/);
  assert.match(windowsQualification, /persist-credentials: false/);
  assert.match(windowsQualification, /secret-material-denylist\.mjs/);
  assert.doesNotMatch(windowsQualification, /contents: write/);

  const macosPackages = releaseDocument.jobs["package-macos"];
  const linuxPackage = releaseDocument.jobs["package-linux"];
  const windowsPackageJob = releaseDocument.jobs["package-windows"];
  const packageMatrixJob = releaseDocument.jobs["package-matrix"];
  assert.ok(macosPackages, "formal macOS packages must have a dedicated reusable-workflow caller");
  assert.ok(linuxPackage, "Linux packaging must remain isolated from signing secrets");
  assert.equal(macosPackages.secrets, "inherit");
  assert.equal(windowsPackageJob.secrets, "inherit");
  assert.equal(linuxPackage.secrets, undefined);
  assert.deepEqual(
    macosPackages.strategy.matrix.include.map(({ target_id, signing_platform }) => ({
      target_id,
      signing_platform,
    })),
    [
      { target_id: "macos-arm64", signing_platform: "macos" },
      { target_id: "macos-x64", signing_platform: "macos" },
    ],
  );
  assert.equal(linuxPackage.with.target_id, "linux-x64");
  assert.equal(linuxPackage.with.signing_platform, "linux");
  assert.deepEqual(packageMatrixJob.needs, [
    "deterministic-checks",
    "release-candidate-environment-preflight",
    "package-macos",
    "package-linux",
    "package-windows",
  ]);
  assert.deepEqual(packageMatrixJob.steps[0].env, {
    MACOS_RESULT: "${{ needs.package-macos.result }}",
    LINUX_RESULT: "${{ needs.package-linux.result }}",
    WINDOWS_RESULT: "${{ needs.package-windows.result }}",
  });
  assert.match(packageMatrixJob.steps[0].run, /MACOS_RESULT.*LINUX_RESULT.*WINDOWS_RESULT/s);

  const macosPackageSource = releaseQa.slice(
    releaseQa.indexOf("  package-macos:"),
    releaseQa.indexOf("  package-linux:"),
  );
  const linuxPackageSource = releaseQa.slice(
    releaseQa.indexOf("  package-linux:"),
    releaseQa.indexOf("  package-windows:"),
  );
  const windowsPackage = releaseQa.slice(
    releaseQa.indexOf("  package-windows:"),
    releaseQa.indexOf("  package-matrix:"),
  );
  const packageMatrix = releaseQa.slice(releaseQa.indexOf("  package-matrix:"));
  assert.match(macosPackageSource, /permissions:\s+contents: read\s+actions: read/);
  assert.match(macosPackageSource, /secrets: inherit/);
  assert.doesNotMatch(macosPackageSource, /id-token: write/);
  assert.match(linuxPackageSource, /permissions:\s+contents: read\s+actions: read/);
  assert.doesNotMatch(linuxPackageSource, /id-token: write|secrets: inherit/);
  assert.match(windowsPackage, /permissions:\s+contents: read\s+actions: read\s+id-token: write/);
  assert.match(windowsPackage, /secrets: inherit/);
  assert.match(packageMatrix, /- package-macos/);
  assert.match(packageMatrix, /- package-linux/);
  assert.match(packageMatrix, /- package-windows/);
  assert.match(packageMatrix, /if: \$\{\{ always\(\) && .*inputs\.qa_mode != 'lite'/);
  assert.match(sharedPackage, /persist-credentials: false/);
  assert.match(
    sharedPackage,
    /environment: \$\{\{ inputs\.qa_mode == 'release-candidate' && inputs\.signing_platform != 'linux' && 'release-signing' \|\| 'release-qa' \}\}/,
  );
  assert.equal(YAML.parse(sharedPackage).jobs.package.permissions, undefined);
});
