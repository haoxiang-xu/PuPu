#!/usr/bin/env node

/**
 * Rewrites download links in README.md to match the current package.json version.
 *
 * Asset filename templates (electron-builder defaults for this project):
 *   macOS ARM   → PuPu-{v}-arm64.dmg
 *   macOS Intel → PuPu-{v}-intel.dmg
 *   Windows     → PuPu.Setup.{v}.exe
 *   Linux AI    → PuPu-{v}.AppImage
 *   Linux deb   → PuPu_{v}.deb
 *
 * Called automatically at the end of prepare-build-version.cjs,
 * or run standalone:  node scripts/update-readme-links.cjs
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const README_PATH = path.join(ROOT, "README.md");
const PKG_PATH = path.join(ROOT, "package.json");

const readVersion = () => {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf8"));
  return pkg.version;
};

// Each pattern matches previous versions in the download URLs and replaces with new version.
// The regex captures everything around the version so we can reconstruct the URL.
const REPLACEMENTS = [
  // PuPu-{v}-arm64.dmg
  { re: /(PuPu-)[0-9]+\.[0-9]+\.[0-9]+(-arm64\.dmg)/g, tpl: "$1{v}$2" },
  // PuPu-{v}-intel.dmg
  { re: /(PuPu-)[0-9]+\.[0-9]+\.[0-9]+(-intel\.dmg)/g, tpl: "$1{v}$2" },
  // PuPu.Setup.{v}.exe
  { re: /(PuPu\.Setup\.)[0-9]+\.[0-9]+\.[0-9]+(\.exe)/g, tpl: "$1{v}$2" },
  // PuPu-{v}.AppImage
  { re: /(PuPu-)[0-9]+\.[0-9]+\.[0-9]+(\.AppImage)/g, tpl: "$1{v}$2" },
  // PuPu_{v}.deb
  { re: /(PuPu_)[0-9]+\.[0-9]+\.[0-9]+(\.deb)/g, tpl: "$1{v}$2" },
];

const updateReadme = (version) => {
  let content = fs.readFileSync(README_PATH, "utf8");
  let changed = false;

  for (const { re, tpl } of REPLACEMENTS) {
    const replacement = tpl.replace("{v}", version);
    const updated = content.replace(re, replacement);
    if (updated !== content) {
      changed = true;
      content = updated;
    }
  }

  if (changed) {
    fs.writeFileSync(README_PATH, content, "utf8");
    console.log(
      `[update-readme-links] Updated download links to version ${version}.`,
    );
  } else {
    console.log(
      `[update-readme-links] Links already at version ${version}; no changes.`,
    );
  }
};

const main = () => {
  const version = readVersion();
  if (!version) {
    console.error(
      "[update-readme-links] Could not read version from package.json.",
    );
    process.exit(1);
  }
  updateReadme(version);
};

main();
