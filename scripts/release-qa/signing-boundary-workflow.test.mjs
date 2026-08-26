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

  assert.match(gitignore, /^\*\.p12$/m);
  assert.match(gitignore, /^\*\.pfx$/m);
  assert.match(gitignore, /^AuthKey_\*\.p8$/m);

  assert.match(windowsQualification, /environment: windows-signing-qualification/);
  assert.doesNotMatch(windowsQualification, /environment: release-signing/);
  assert.match(windowsQualification, /persist-credentials: false/);
  assert.match(windowsQualification, /secret-material-denylist\.mjs/);
  assert.doesNotMatch(windowsQualification, /contents: write/);

  const nonWindowsPackages = releaseQa.slice(
    releaseQa.indexOf("  package-non-windows:"),
    releaseQa.indexOf("  package-windows:"),
  );
  const windowsPackage = releaseQa.slice(
    releaseQa.indexOf("  package-windows:"),
    releaseQa.indexOf("  package-matrix:"),
  );
  const packageMatrix = releaseQa.slice(releaseQa.indexOf("  package-matrix:"));
  assert.match(nonWindowsPackages, /permissions:\s+contents: read\s+actions: read/);
  assert.doesNotMatch(nonWindowsPackages, /id-token: write/);
  assert.match(windowsPackage, /permissions:\s+contents: read\s+actions: read\s+id-token: write/);
  assert.match(packageMatrix, /if: \$\{\{ always\(\) && .*inputs\.qa_mode != 'lite'/);
  assert.match(sharedPackage, /persist-credentials: false/);
});
