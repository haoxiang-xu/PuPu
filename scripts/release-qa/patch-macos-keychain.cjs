// app-builder-lib 26.8.1 confuses the P12 password with the temporary
// keychain password. Keep this bounded patch until upgrading to an upstream fix.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { createRequire } = require("node:module");

const ORIGINAL_SHA256 = "74a57bbc40326ffe65e8efe47db0ffc4e4fc6b689a52bb0be3413d5a148d5823";
const REPLACEMENTS = [
  ["importCerts(keychainFile, certPaths, cscPasswords)", "importCerts(keychainFile, certPaths, cscPasswords, keychainPassword)"],
  ["async function importCerts(keychainFile, paths, keyPasswords)", "async function importCerts(keychainFile, paths, keyPasswords, keychainPassword)"],
  ['["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", password, keychainFile]', '["set-key-partition-list", "-S", "apple-tool:,apple:", "-s", "-k", keychainPassword, keychainFile]'],
];
const digest = (source) => createHash("sha256").update(source).digest("hex");

function patchSource(source) {
  // Recognize only the exact original bytes or our exact already-patched bytes.
  const original = REPLACEMENTS.reduce((text, [before, after]) => text.replace(after, before), source);
  if (digest(original) !== ORIGINAL_SHA256) {
    throw new Error("Unrecognized app-builder-lib macCodeSign bytes; review the keychain patch before upgrading");
  }
  const patched = REPLACEMENTS.reduce((text, [before, after]) => text.replace(before, after), original);
  if (source !== original && source !== patched) {
    throw new Error("Partially patched app-builder-lib macCodeSign; reinstall dependencies");
  }
  return patched;
}

function installPatch() {
  let builderPackage;
  try {
    builderPackage = require.resolve("electron-builder/package.json");
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
    // Production-only installs omit the development-only packaging tool.
    return;
  }
  const builderRequire = createRequire(builderPackage);
  const dependencyPackage = builderRequire.resolve("app-builder-lib/package.json");
  if (JSON.parse(fs.readFileSync(dependencyPackage, "utf8")).version !== "26.8.1") {
    throw new Error("Review macOS keychain password patch for the new app-builder-lib version");
  }
  const filename = path.join(path.dirname(dependencyPackage), "out/codeSign/macCodeSign.js");
  const source = fs.readFileSync(filename, "utf8");
  const patched = patchSource(source);
  if (source !== patched) fs.writeFileSync(filename, patched);
  console.log("[macos-keychain] Temporary keychain password fix verified");
}

module.exports = { patchSource, installPatch, REPLACEMENTS };
if (require.main === module) installPatch();
