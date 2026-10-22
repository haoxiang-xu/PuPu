import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import test from "node:test";
import { AST_GUARD, PATCHES, patchSource } from "./patch-security-dependencies.cjs";

const require = createRequire(import.meta.url);
const installerPath = path.join(import.meta.dirname, "patch-security-dependencies.cjs");
const originalSource = (patch) => [...patch.replacements].reverse().reduce(
  (text, [before, after]) => text.split(after).join(before),
  fs.readFileSync(require.resolve(`${patch.packageName}/${patch.file}`), "utf8"),
);
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-install-race-"));
  const packageRoot = path.join(root, "node_modules/braces");
  fs.mkdirSync(path.join(packageRoot, "lib"), { recursive: true });
  fs.writeFileSync(path.join(root, "package-lock.json"), JSON.stringify({ packages: { "node_modules/braces": { version: "3.0.3" } } }));
  fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({ version: "3.0.3" }));
  for (const patch of PATCHES.filter((p) => p.packageName === "braces")) fs.writeFileSync(path.join(packageRoot, patch.file), originalSource(patch));
  return { root, packageRoot, guard: path.join(packageRoot, "lib/pupu-depth-guard.js"), source: path.join(packageRoot, "lib/parse.js") };
}
function loadInstaller(overrides = {}) {
  const module = { exports: {} };
  const facade = { ...fs, ...overrides };
  vm.runInNewContext(fs.readFileSync(installerPath, "utf8"), {
    module, exports: module.exports, __dirname: import.meta.dirname, Buffer,
    console: { log() {} },
    require: (name) => name === "node:fs" ? facade : require(name),
  }, { filename: installerPath });
  return module.exports.installPatches;
}

test("a guard-file create racer cannot be overwritten", () => {
  const f = fixture();
  let raced = false;
  const race = (filename) => {
    if (filename === f.guard && !raced) { raced = true; fs.writeFileSync(f.guard, "RACER_GUARD"); }
  };
  const install = loadInstaller({
    openSync(filename, flags, ...args) { if (flags & fs.constants.O_CREAT) race(filename); return fs.openSync(filename, flags, ...args); },
    writeFileSync(filename, ...args) { if (typeof filename === "string") race(filename); return fs.writeFileSync(filename, ...args); },
  });
  try {
    assert.throws(() => install(f.root), /Unrecognized|guard|identity|symbolic|regular/i);
    assert.equal(raced, true);
    assert.equal(fs.readFileSync(f.guard, "utf8"), "RACER_GUARD");
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("replacing a verified source path cannot redirect the patch write", () => {
  const f = fixture();
  const held = `${f.source}.verified-original`;
  const descriptors = new Map();
  let raced = false;
  const install = loadInstaller({
    openSync(filename, ...args) { const fd = fs.openSync(filename, ...args); descriptors.set(fd, filename); return fd; },
    closeSync(fd) { descriptors.delete(fd); return fs.closeSync(fd); },
    readFileSync(filename, ...args) {
      const result = fs.readFileSync(filename, ...args);
      if ((descriptors.get(filename) || filename) === f.source && !raced) {
        raced = true; fs.renameSync(f.source, held); fs.writeFileSync(f.source, "UNVERIFIED_RACER_SOURCE");
      }
      return result;
    },
  });
  try {
    assert.throws(() => install(f.root), /identity|changed|regular/i);
    assert.equal(raced, true);
    assert.equal(fs.readFileSync(f.source, "utf8"), "UNVERIFIED_RACER_SOURCE");
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("existing guard verification is read-only and idempotent", () => {
  const f = fixture();
  const descriptors = new Map();
  const guardOpens = [];
  const guardWrites = [];
  fs.writeFileSync(f.guard, AST_GUARD);
  const install = loadInstaller({
    openSync(filename, flags, ...args) {
      const fd = fs.openSync(filename, flags, ...args); descriptors.set(fd, filename);
      if (filename === f.guard) guardOpens.push(flags);
      return fd;
    },
    closeSync(fd) { descriptors.delete(fd); return fs.closeSync(fd); },
    writeSync(fd, ...args) { if (descriptors.get(fd) === f.guard) guardWrites.push(fd); return fs.writeSync(fd, ...args); },
    writeFileSync(filename, ...args) { if ((descriptors.get(filename) || filename) === f.guard) guardWrites.push(filename); return fs.writeFileSync(filename, ...args); },
  });
  try {
    install(f.root); install(f.root);
    assert.equal(fs.readFileSync(f.guard, "utf8"), AST_GUARD);
    assert.deepEqual(guardWrites, []);
    assert.equal(guardOpens.length, 2);
    for (const flags of guardOpens) assert.equal(flags & (fs.constants.O_WRONLY | fs.constants.O_RDWR), fs.constants.O_RDONLY);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("guard symlinks and symlink-create racers leave outside targets untouched", (t) => {
  const f = fixture();
  const outside = path.join(f.root, "outside-sentinel");
  fs.writeFileSync(outside, AST_GUARD);
  try {
    try { fs.symlinkSync(outside, f.guard, "file"); }
    catch (error) { if (["EPERM", "EACCES", "ENOSYS"].includes(error.code)) { t.skip("OS does not permit unprivileged file symlinks"); return; } throw error; }
    assert.throws(() => loadInstaller()(f.root), /ELOOP|symbolic|regular|identity/i);
    assert.equal(fs.readFileSync(outside, "utf8"), AST_GUARD);
    // Exercise the Windows-style absence of O_NOFOLLOW using real native descriptors.
    assert.throws(() => loadInstaller({ constants: { ...fs.constants, O_NOFOLLOW: 0 } })(f.root), /symbolic|regular|identity/i);
    fs.unlinkSync(f.guard);
    fs.writeFileSync(outside, "OUTSIDE_SENTINEL");
    let raced = false;
    const race = (filename) => { if (filename === f.guard && !raced) { raced = true; fs.symlinkSync(outside, f.guard, "file"); } };
    const install = loadInstaller({
      openSync(filename, flags, ...args) { if (flags & fs.constants.O_CREAT) race(filename); return fs.openSync(filename, flags, ...args); },
      writeFileSync(filename, ...args) { if (typeof filename === "string") race(filename); return fs.writeFileSync(filename, ...args); },
    });
    assert.throws(() => install(f.root), /ELOOP|symbolic|regular|identity/i);
    assert.equal(raced, true);
    assert.equal(fs.readFileSync(outside, "utf8"), "OUTSIDE_SENTINEL");
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("a source symlink with valid digest bytes cannot redirect a patch outside the package", (t) => {
  const f = fixture();
  const outside = path.join(f.root, "outside-source");
  const original = fs.readFileSync(f.source, "utf8");
  try {
    fs.writeFileSync(outside, original); fs.unlinkSync(f.source);
    try { fs.symlinkSync(outside, f.source, "file"); }
    catch (error) { if (["EPERM", "EACCES", "ENOSYS"].includes(error.code)) { t.skip("OS does not permit unprivileged file symlinks"); return; } throw error; }
    assert.throws(() => loadInstaller()(f.root), /ELOOP|symbolic|regular|identity/i);
    assert.throws(() => loadInstaller({ constants: { ...fs.constants, O_NOFOLLOW: 0 } })(f.root), /symbolic|regular|identity/i);
    assert.equal(fs.readFileSync(outside, "utf8"), original);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("short native writes complete from position zero before truncating", () => {
  const f = fixture();
  const patch = PATCHES.find((p) => p.file === "lib/parse.js");
  const original = fs.readFileSync(f.source, "utf8");
  let writes = 0;
  const install = loadInstaller({
    writeSync(fd, bytes, offset, length, position) { writes++; return fs.writeSync(fd, bytes, offset, Math.min(length, 17), position); },
  });
  try {
    install(f.root);
    assert.ok(writes > 10);
    assert.equal(fs.readFileSync(f.source, "utf8"), patchSource(original, patch));
    assert.equal(fs.readFileSync(f.guard, "utf8"), AST_GUARD);
    install(f.root);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("zero-progress writes fail before truncation or a success verdict", () => {
  const f = fixture();
  const original = fs.readFileSync(f.source, "utf8");
  let truncations = 0;
  const install = loadInstaller({ writeSync() { return 0; }, ftruncateSync() { truncations++; } });
  try {
    assert.throws(() => install(f.root), /no valid progress/);
    assert.equal(truncations, 0);
    assert.equal(fs.readFileSync(f.source, "utf8"), original);
    assert.equal(fs.existsSync(f.guard), false);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("missing metadata in an installed package fails; an entirely omitted package remains allowed", () => {
  const f = fixture();
  const original = fs.readFileSync(f.source, "utf8");
  try {
    fs.unlinkSync(path.join(f.packageRoot, "package.json"));
    assert.throws(() => loadInstaller()(f.root), { code: "ENOENT" });
    assert.equal(fs.readFileSync(f.source, "utf8"), original);
    assert.equal(fs.existsSync(f.guard), false);
    fs.rmSync(f.packageRoot, { recursive: true });
    assert.doesNotThrow(() => loadInstaller()(f.root));
    assert.equal(fs.existsSync(f.packageRoot), false);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("metadata disappearing after its descriptor read cannot be mistaken for an omitted package", () => {
  const f = fixture();
  const metadata = path.join(f.packageRoot, "package.json");
  const descriptors = new Map();
  const original = fs.readFileSync(f.source, "utf8");
  let raced = false;
  const install = loadInstaller({
    openSync(filename, ...args) { const fd = fs.openSync(filename, ...args); descriptors.set(fd, filename); return fd; },
    closeSync(fd) { descriptors.delete(fd); return fs.closeSync(fd); },
    readFileSync(filename, ...args) {
      const result = fs.readFileSync(filename, ...args);
      if ((descriptors.get(filename) || filename) === metadata && !raced) { raced = true; fs.unlinkSync(metadata); }
      return result;
    },
  });
  try {
    assert.throws(() => install(f.root), { code: "EPATCH_IDENTITY" });
    assert.equal(raced, true);
    assert.equal(fs.readFileSync(f.source, "utf8"), original);
    assert.equal(fs.existsSync(f.guard), false);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});

test("a substituted FIFO is rejected without blocking", { skip: process.platform === "win32" }, () => {
  for (const target of ["source", "guard"]) {
    const f = fixture();
    try {
      if (target === "source") fs.unlinkSync(f.source);
      execFileSync("mkfifo", [f[target]]);
      assert.throws(() => execFileSync(process.execPath, ["-e", "require(process.argv[1]).installPatches(process.argv[2])", installerPath, f.root], { timeout: 2000, stdio: "pipe" }), (error) => {
        assert.equal(error.signal, null);
        assert.equal(error.status, 1);
        assert.match(String(error.stderr), /regular non-symbolic file/);
        return true;
      });
    } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
  }
});
