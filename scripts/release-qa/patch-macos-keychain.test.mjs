import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";
import { patchSource, REPLACEMENTS } from "./patch-macos-keychain.cjs";

const require = createRequire(import.meta.url);
const filename = require.resolve("app-builder-lib/out/codeSign/macCodeSign.js");
const installed = fs.readFileSync(filename, "utf8");
const original = REPLACEMENTS.reduce((text, [before, after]) => text.replace(after, before), installed);

// Run the actual dependency producer against a strict security-command consumer.
// P12 and keychain passwords intentionally differ, including installer signing.
async function exercise(source, rejectImport = false) {
  const calls = [];
  const keychainPassword = "random-keychain-password";
  const passwords = ["application-p12-password", "installer-p12-password"];
  const exec = async (command, args) => {
    assert.equal(command, "/usr/bin/security");
    calls.push(args);
    if (args[0] === "list-keychains") return '"/tmp/login.keychain"';
    if (["create-keychain", "unlock-keychain"].includes(args[0])) {
      assert.equal(args[2], keychainPassword);
    }
    if (args[0] === "import") {
      assert.equal(args[args.indexOf("-P") + 1], passwords[calls.filter((c) => c[0] === "import").length - 1]);
      if (rejectImport) throw new Error("P12 import rejected");
    }
    if (args[0] === "set-key-partition-list") {
      assert.equal(args[args.indexOf("-k") + 1], keychainPassword, "keychain unlock must not use the P12 password");
    }
    return "";
  };
  class Lazy { constructor(fn) { this.fn = fn; } get value() { return this.fn(); } }
  const sandbox = {
    exports: {}, __dirname: "/dependency/codeSign",
    process: { env: { TRAVIS: "true", APP_BUILDER_TMP_DIR: "/tmp" }, platform: "darwin" },
    require(name) {
      if (name === "builder-util") return { exec };
      if (name === "crypto") return { ...require("node:crypto"), randomBytes: () => ({ toString: () => keychainPassword }) };
      if (name === "lazy-val") return { Lazy };
      if (name === "./codesign") return { importCertificate: async (link) => `/tmp/${link}.p12` };
      if (["os", "path", "fs/promises"].includes(name)) return require(name);
      return {};
    },
  };
  vm.runInNewContext(source, sandbox);
  await sandbox.exports.createKeychain({
    tmpDir: {}, currentDir: "/build", cscLink: "application", cscKeyPassword: passwords[0],
    cscILink: "installer", cscIKeyPassword: passwords[1],
  });
  return calls;
}

test("unpatched dependency reproduces keychain password failure", async () => {
  await assert.rejects(exercise(original), /keychain unlock must not use the P12 password/);
});

test("patched real dependency uses separate passwords for both certificates", async () => {
  const calls = await exercise(patchSource(original));
  assert.equal(calls.filter((c) => c[0] === "set-key-partition-list").length, 2);
});

test("certificate import failures still fail closed", async () => {
  await assert.rejects(exercise(patchSource(original), true), /P12 import rejected/);
});

test("patch is idempotent and rejects changed or partially patched bytes", () => {
  const patched = patchSource(original);
  assert.equal(patchSource(patched), patched);
  assert.throws(() => patchSource(original + "\n"), /Unrecognized/);
  assert.throws(() => patchSource(original.replace(...REPLACEMENTS[0])), /Partially patched/);
});

test("normal dependency installation applies the patch", () => {
  assert.equal(require("../../package.json").scripts.postinstall, "node scripts/release-qa/patch-macos-keychain.cjs");
  assert.equal(installed, patchSource(installed));
});
