import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import YAML from "yaml";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CLI = path.join(ROOT, "scripts/release-qa/regenerate-windows-blockmap.mjs");
const sha512 = (bytes) => crypto.createHash("sha512").update(bytes).digest("base64");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-blockmap-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, "signed 输出 with spaces");
  fs.mkdirSync(directory);
  const installer = path.join(directory, "PuPu-0.2.0-windows-x64-setup.exe");
  // Bounded dummy bytes, not an Authenticode signature or real installer.
  const bytes = Buffer.alloc(256 * 1024 + 37);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 31 + (i >>> 8)) % 256;
  fs.writeFileSync(installer, bytes);
  const metadata = path.join(directory, "latest.yml");
  const oldHash = sha512(Buffer.from("old unsigned fixture"));
  fs.writeFileSync(metadata, YAML.stringify({ version: "0.2.0",
    path: path.basename(installer), sha512: oldHash,
    files: [{ url: path.basename(installer), sha512: oldHash, size: 1 }] }));
  return { root, directory, installer, bytes, metadata, blockmap: `${installer}.blockmap` };
}

function inspectBlockmap(f) {
  assert.deepEqual(fs.readFileSync(f.installer), f.bytes);
  const map = JSON.parse(gunzipSync(fs.readFileSync(f.blockmap)));
  assert.deepEqual(Object.keys(map).sort(), ["files", "version"]);
  assert.equal(map.version, "2");
  assert.equal(map.files.length, 1);
  const file = map.files[0];
  assert.deepEqual(Object.keys(file).sort(), ["checksums", "name", "offset", "sizes"]);
  assert.equal(file.name, "file");
  assert.equal(file.offset, 0);
  assert.ok(file.sizes.length > 1, "exercise multiple real producer chunks");
  assert.equal(file.sizes.length, file.checksums.length);
  assert.ok(file.sizes.every((size) => Number.isSafeInteger(size) && size > 0 && size <= 32768));
  assert.equal(file.sizes.reduce((sum, size) => sum + size, 0), f.bytes.length);
  assert.ok(file.checksums.every((value) => Buffer.from(value, "base64").length === 18));
  assert.equal(fs.readdirSync(f.directory).some((name) => name.startsWith(".pupu-blockmap-")), false);
}

test("real locked producer emits external gzip v2 map while preserving installer bytes and identity", async (t) => {
  const f = fixture(t);
  const { regenerateWindowsBlockmap } = await import("./regenerate-windows-blockmap.mjs");
  const result = await regenerateWindowsBlockmap({ installerPath: f.installer });
  inspectBlockmap(f);
  assert.deepEqual(result, { installer_name: path.basename(f.installer),
    blockmap_path: f.blockmap, size: f.bytes.length, sha512: sha512(f.bytes) });
  const first = fs.readFileSync(f.blockmap);
  fs.writeFileSync(f.blockmap, "stale map from before signing");
  await regenerateWindowsBlockmap({ installerPath: f.installer });
  assert.deepEqual(fs.readFileSync(f.blockmap), first);
  inspectBlockmap(f);
});

test("replacing an output hardlink never truncates or appends to the installer", async (t) => {
  const f = fixture(t);
  fs.linkSync(f.installer, f.blockmap);
  const { regenerateWindowsBlockmap } = await import("./regenerate-windows-blockmap.mjs");
  await regenerateWindowsBlockmap({ installerPath: f.installer });
  inspectBlockmap(f);
});

test("output replacement failure preserves installer and metadata and removes temporary files", async (t) => {
  const f = fixture(t);
  fs.mkdirSync(f.blockmap);
  const metadataBefore = fs.readFileSync(f.metadata);
  const { regenerateWindowsBlockmap } = await import("./regenerate-windows-blockmap.mjs");
  await assert.rejects(regenerateWindowsBlockmap({ installerPath: f.installer }));
  const result = spawnSync(process.execPath, [CLI, "--installer", f.installer], { encoding: "utf8" });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /\[windows-blockmap\]/);
  assert.deepEqual(fs.readFileSync(f.installer), f.bytes);
  assert.deepEqual(fs.readFileSync(f.metadata), metadataBefore);
  assert.equal(fs.readdirSync(f.directory).some((name) => name.startsWith(".pupu-blockmap-")), false);
});

test("missing and non-file installers fail before producing a blockmap", async (t) => {
  const f = fixture(t);
  const { regenerateWindowsBlockmap } = await import("./regenerate-windows-blockmap.mjs");
  for (const installerPath of ["", path.join(f.directory, "missing.exe"), f.directory]) {
    await assert.rejects(regenerateWindowsBlockmap({ installerPath }), /required|missing|regular file/);
    if (installerPath) assert.equal(fs.existsSync(`${installerPath}.blockmap`), false);
  }
  assert.deepEqual(fs.readFileSync(f.installer), f.bytes);
});

test("CLI accepts exactly one installer argument and fails without touching artifacts", (t) => {
  const f = fixture(t);
  for (const args of [[], ["--installer"], ["--unknown", f.installer],
    ["--installer", f.installer, "--installer", f.installer],
    ["--installer", f.installer, "--output", f.installer]]) {
    const result = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /usage:/);
    assert.equal(fs.existsSync(f.blockmap), false);
    assert.deepEqual(fs.readFileSync(f.installer), f.bytes);
  }
});

test("shared action's real Node commands generate a map then refresh metadata from signed bytes", (t) => {
  const f = fixture(t);
  const legacyPackage = path.join(f.directory, "package.json");
  const legacyBytes = '{"name":"legacy-fixture","version":"0.1.13"}\n';
  fs.writeFileSync(legacyPackage, legacyBytes);
  const wrongProducer = path.join(f.directory, "node_modules/app-builder-lib/out/targets/blockmap/blockmap.js");
  fs.mkdirSync(path.dirname(wrongProducer), { recursive: true });
  fs.writeFileSync(wrongProducer, 'throw new Error("fixture dependency must not be used");\n');
  const action = YAML.parse(fs.readFileSync(path.join(ROOT,
    ".github/actions/windows-artifact-signing/action.yml"), "utf8"));
  const step = action.runs.steps.find((item) =>
    item.name === "Rebuild updater blockmap and metadata from the signed installer");
  const script = step.run.replace(/`\s*\r?\n\s*/g, " ");
  const commands = [...script.matchAll(/^\s*node\s+("\$env:SIGNING_HELPER_ROOT\/[^\"]+"|scripts\/\S+\.mjs)\s+([^\r\n]+)/gm)];
  const scriptPath = (command) => command[1].replace(/^"|"$/g, "");
  assert.deepEqual(commands.map((command) => scriptPath(command)
    .replace("$env:SIGNING_HELPER_ROOT/", "scripts/release-qa/")), [
    "scripts/release-qa/regenerate-windows-blockmap.mjs",
    "scripts/release-qa/refresh-windows-updater-metadata.mjs",
  ]);
  // Static PowerShell guard check; this host executes the real Node commands,
  // not a replacement PowerShell interpreter.
  const betweenCommands = script.slice(commands[0].index, commands[1].index);
  assert.match(betweenCommands, /if \(\$LASTEXITCODE -ne 0 -or -not \(Test-Path -LiteralPath \$blockmapPath -PathType Leaf\)\) \{\s*throw /);
  for (const command of commands) {
    const args = command[2].match(/"[^"]*"|\S+/g).map((value) => value.replace(/^"|"$/g, ""))
      .map((value) => value === "$installerPath" ? f.installer : value === "$metadataPath" ? f.metadata : value);
    // Resolve only the declared tools environment variable. A relative script
    // remains relative to the legacy cwd, exactly as the real Node invocation.
    const entrypoint = scriptPath(command).replace("$env:SIGNING_HELPER_ROOT", path.join(ROOT, "scripts/release-qa"));
    const result = spawnSync(process.execPath, [entrypoint, ...args], {
      cwd: f.directory, encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
  }
  assert.equal(step.env.SIGNING_HELPER_ROOT, "${{ github.action_path }}/../../../scripts/release-qa");
  assert.equal(fs.readFileSync(legacyPackage, "utf8"), legacyBytes);
  assert.equal(fs.existsSync(path.join(f.directory, "scripts")), false);
  inspectBlockmap(f);
  const metadata = YAML.parse(fs.readFileSync(f.metadata, "utf8"));
  assert.equal(metadata.sha512, sha512(f.bytes));
  assert.deepEqual(metadata.files, [{ url: path.basename(f.installer),
    sha512: sha512(f.bytes), size: f.bytes.length }]);
});
