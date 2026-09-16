import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "../..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

test("candidate NSIS embeds pre-uninstall cleanup without modifying the legacy fixture", () => {
  const config = JSON.parse(read("package.json")).build;
  assert.equal(config.nsis.include, "installer/windows/installer.nsh");
  assert.notEqual(config.nsis.oneClick, false);
  const include = read(config.nsis.include);
  assert.match(include, /!ifndef ONE_CLICK\s+!error/);
  assert.match(include, /!macro customInit/);
  assert.doesNotMatch(include, /!macro customInstall\b/);
  for (const file of ["stop-installed-sidecars.ps1", "sidecar-cleanup.cs"]) {
    assert.match(include, new RegExp(`File .*\\$PLUGINSDIR[^\\n]*${file.replaceAll(".", "\\.")}`));
    assert.ok(fs.statSync(path.join(ROOT, "installer/windows", file)).isFile());
  }
  assert.match(include, /-File "\$PLUGINSDIR\\stop-installed-sidecars.ps1" -InstallDirectory "\$INSTDIR"/);
  assert.match(include, /nsExec::ExecToStack \/TIMEOUT=45000/);
  assert.match(include, /\$0 != 0[\s\S]*SetErrorLevel 2\s+Quit/);
  assert.doesNotMatch(include, /-Command\b|taskkill|\/IM\b/);

  const template = read("node_modules/app-builder-lib/templates/nsis/installer.nsi");
  assert.ok(template.indexOf("!insertmacro initMultiUser") < template.indexOf("!insertmacro customInit"));
  assert.ok(template.indexOf("!insertmacro customInit") < template.indexOf('Section "install"'));
  const install = read("node_modules/app-builder-lib/templates/nsis/installSection.nsh");
  assert.ok(install.indexOf("!insertmacro uninstallOldVersion") < install.indexOf("!insertmacro installApplicationFiles"));
  const signing = read(".github/actions/windows-artifact-signing/action.yml");
  const passes = signing.split("\n").filter((line) => /electron-builder.*--prepackaged/.test(line));
  assert.equal(passes.length, 2);
  passes.forEach((line) => assert.doesNotMatch(line, /--config(?:=|\s)|--config\.nsis\.include/, "both passes inherit source NSIS include"));
  assert.doesNotMatch(read(".github/workflows/_shared-release-windows-restart-update.yml"), /installer\/windows|stop-installed-sidecars/);
});

test("native Windows contract is blocking, scoped to Windows, and runs in the checkout before packaging", () => {
  const workflow = YAML.parseDocument(read(".github/workflows/_shared-release-package.yml"), { uniqueKeys: true });
  assert.deepEqual(workflow.errors, []);
  const jobs = Object.values(workflow.toJSON().jobs);
  assert.equal(jobs.length, 1);
  const steps = jobs[0].steps;
  const index = steps.findIndex((step) => step.name === "Verify native Windows installer sidecar cleanup");
  assert.ok(index >= 0);
  const probe = steps[index];
  assert.equal(probe.if, "inputs.target_id == 'windows-x64'");
  assert.equal(probe["working-directory"], "pupu");
  assert.equal(probe.shell, "pwsh");
  assert.deepEqual(probe.run.trim().split("\n"), [
    "./scripts/release-qa/test-windows-installer-sidecar-cleanup.ps1 -PowerShellArchitecture x64",
    "./scripts/release-qa/test-windows-installer-sidecar-cleanup.ps1 -PowerShellArchitecture x86",
  ]);
  assert.notEqual(probe["continue-on-error"], true);
  assert.ok(index < steps.findIndex((step) => step.name === "Build package"));
  assert.match(read("scripts/release-qa/test-windows-installer-sidecar-cleanup.ps1"), /WindowsPowerShell\/v1\.0\/powershell.exe/);
});

test("installer ownership is exact image/handle based, not an image-name kill or dead-parent sibling sweep", () => {
  const native = read("installer/windows/sidecar-cleanup.cs");
  assert.match(native, /QueryFullProcessImageName/);
  assert.match(native, /GetFinalPathNameByHandle/);
  assert.match(native, /Same\(CanonicalPath\(text.ToString\(\)\), expected\)/);
  assert.match(native, /TerminateProcess\(process.Handle, 0\)/);
  assert.match(native, /child.Birth < parent.Birth/);
  assert.match(native, /child.Birth > exit/);
  assert.match(native, /protectedIds.Contains\(process.Id\)/);
  assert.match(native, /while \(AppAlive\(Snapshot\(\), appPath\)\)/);
  assert.doesNotMatch(native, /Process\.Kill|taskkill|\.StartsWith\(root/);
  const launcher = read("installer/windows/stop-installed-sidecars.ps1");
  assert.match(launcher, /Add-Type -Path \(Join-Path \$PSScriptRoot "sidecar-cleanup.cs"\)/);
  assert.match(launcher, /\[PuPu.Installer.SidecarCleanup\]::Run\(\$InstallDirectory\)/);
  assert.match(launcher, /catch[\s\S]*exit 1/);
  assert.doesNotMatch(launcher, /Invoke-Expression|Start-Process|Stop-Process/);
});

// Optional only for local syntax verification; hosted Windows runs the actual
// native contract above. This compiles the real include and embedded sources,
// but deliberately never executes an installer on the developer machine.
test("real NSIS compiler accepts the production include and rejects assisted installs", (t) => {
  const nsisDir = process.env.PUPU_TEST_NSIS_DIR;
  if (!nsisDir) { t.skip("set PUPU_TEST_NSIS_DIR to the pinned electron-builder NSIS cache"); return; }
  const compiler = path.join(nsisDir, process.platform === "win32" ? "Bin/makensis.exe" : process.platform === "darwin" ? "mac/makensis" : "linux/makensis");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-installer-compile-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const compile = (oneClick) => {
    const source = path.join(temp, "probe.nsi");
    fs.writeFileSync(source, [
      "Unicode true", "RequestExecutionLevel user", '!include "LogicLib.nsh"',
      ...(oneClick ? ["!define ONE_CLICK"] : []),
      `OutFile "${path.join(temp, "probe.exe")}"`,
      `!include "${path.join(ROOT, "installer/windows/installer.nsh")}"`,
      "Function .onInit", "!insertmacro customInit", "FunctionEnd",
      'Section "empty"', "SectionEnd", "",
    ].join("\n"));
    return spawnSync(compiler, [process.platform === "win32" ? "/V2" : "-V2", source], {
      encoding: "utf8", timeout: 30_000,
      env: { ...process.env, NSISDIR: nsisDir },
    });
  };
  const accepted = compile(true);
  assert.equal(accepted.status, 0, `${accepted.error || ""}\n${accepted.stdout}\n${accepted.stderr}`);
  assert.ok(fs.statSync(path.join(temp, "probe.exe")).size > 0);
  const rejected = compile(false);
  assert.notEqual(rejected.status, 0);
  assert.match(`${rejected.stdout}\n${rejected.stderr}`, /requires the one-click installer contract/);
});
