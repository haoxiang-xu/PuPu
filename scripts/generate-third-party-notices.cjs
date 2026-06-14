#!/usr/bin/env node
/*
 * Generates THIRD_PARTY_NOTICES.txt — the third-party attribution bundle that
 * ships inside the PuPu installer.
 *
 * PuPu (Apache-2.0) redistributes two sets of third-party code:
 *   - the production npm dependency graph (bundled into the React build/)
 *   - the Python deps frozen into the `unchain-server` PyInstaller binary
 *     (Flask/Werkzeug/httpx/mcp/openai/anthropic/qdrant-client + transitives)
 * Those permissive licenses (MIT/BSD/Apache/ISC/…) require us to preserve their
 * copyright + license text when we redistribute. This script aggregates them so
 * the obligation is satisfied in the shipped artifact.
 *
 * Third-party MCP servers are NOT covered here on purpose: they are fetched at
 * runtime via npx/uvx or called as remote endpoints, never bundled, so their
 * licenses do not bind our redistribution.
 *
 * Usage:
 *   node scripts/generate-third-party-notices.cjs            # generate + warn
 *   node scripts/generate-third-party-notices.cjs --check    # release gate: exit 1 on any problem
 *
 * Tooling (license-checker, pip-licenses) is invoked at build time only and is
 * NOT added to the dependency tree.
 */
const path = require("path");
const fs = require("fs");
const { execSync, execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const OUT = path.join(root, "THIRD_PARTY_NOTICES.txt");
const VENV =
  process.env.UNCHAIN_BUILD_VENV || path.join(root, ".venv-unchain-build");
const CHECK = process.argv.includes("--check");

// Build-time helper packages that get temporarily installed into the build venv
// to run pip-licenses; they are not part of the shipped artifact.
const PY_IGNORE = ["pip-licenses", "prettytable", "wcwidth", "pip", "setuptools"];

// First-party code (PuPu itself + the unchain core library we author) is covered
// by our own LICENSE/NOTICE, so it is excluded from third-party attribution and
// must not trip the gate on missing/UNLICENSED metadata.
const SELF_NAME = require(path.join(root, "package.json")).name;
const FIRST_PARTY_NODE = [SELF_NAME];
const FIRST_PARTY_PY = ["unchain"];

const problems = [];
const SEP = "=".repeat(78);

function header() {
  return [
    "PuPu — THIRD-PARTY SOFTWARE NOTICES AND INFORMATION",
    "",
    "This file aggregates the licenses and copyright notices of the third-party",
    "software redistributed inside the PuPu application. It is generated at build",
    "time by scripts/generate-third-party-notices.cjs and is not edited by hand.",
    "",
    "PuPu itself is licensed under Apache-2.0 (see LICENSE and NOTICE).",
    "",
    SEP,
    "",
  ].join("\n");
}

function collectNode() {
  console.log("[node] running license-checker over the production graph");
  let data;
  try {
    const raw = execSync("npx --yes license-checker --production --json", {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
    });
    data = JSON.parse(raw);
  } catch (e) {
    problems.push(`[node] license-checker failed: ${e.message}`);
    return [];
  }
  const pkgs = [];
  for (const [id, info] of Object.entries(data)) {
    const name = id.slice(0, id.lastIndexOf("@"));
    if (FIRST_PARTY_NODE.includes(name)) continue;
    const license = String(info.licenses || "UNKNOWN");
    if (!info.licenses || /unknown|unlicensed/i.test(license)) {
      problems.push(`[node] ${id}: unresolved license "${license}"`);
    }
    let text = "";
    if (info.licenseFile && fs.existsSync(info.licenseFile)) {
      try {
        text = fs.readFileSync(info.licenseFile, "utf8").trim();
      } catch {
        /* best-effort */
      }
    }
    pkgs.push({ id, license, publisher: info.publisher || "", text });
  }
  console.log(`  OK: ${pkgs.length} npm packages`);
  return pkgs;
}

function collectPython() {
  const py =
    process.platform === "win32"
      ? path.join(VENV, "Scripts", "python.exe")
      : path.join(VENV, "bin", "python");
  if (!fs.existsSync(py)) {
    const msg = `build venv not found at ${VENV} — run build:unchain before the license gate`;
    if (CHECK) {
      problems.push(`[python] ${msg}`);
    } else {
      console.warn(`[python] SKIPPED: ${msg}`);
    }
    return [];
  }
  console.log("[python] running pip-licenses over the build venv");
  let data;
  try {
    // pip-licenses must run inside the target venv to enumerate its packages;
    // install it as a transient build-time tool (the binary is already frozen,
    // so this does not change what PyInstaller shipped).
    execFileSync(
      py,
      ["-m", "pip", "install", "--quiet", "--disable-pip-version-check", "pip-licenses"],
      { cwd: root, stdio: "ignore" }
    );
    const raw = execFileSync(
      py,
      [
        "-m",
        "piplicenses",
        "--format=json",
        "--with-license-file",
        "--no-license-path",
        "--ignore-packages",
        ...PY_IGNORE,
      ],
      { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 }
    );
    data = JSON.parse(raw);
  } catch (e) {
    problems.push(`[python] pip-licenses failed: ${e.message}`);
    return [];
  }
  const pkgs = [];
  for (const p of data) {
    if (FIRST_PARTY_PY.includes(p.Name)) continue;
    const license = String(p.License || "UNKNOWN");
    const id = `${p.Name}@${p.Version}`;
    if (!p.License || /unknown|unlicensed/i.test(license)) {
      problems.push(`[python] ${id}: unresolved license "${license}"`);
    }
    const text = (p.LicenseText && p.LicenseText !== "UNKNOWN" ? p.LicenseText : "").trim();
    pkgs.push({ id, license, publisher: "", text });
  }
  console.log(`  OK: ${pkgs.length} python packages`);
  return pkgs;
}

function renderSection(title, pkgs) {
  const lines = [SEP, title, SEP, ""];
  for (const p of pkgs.sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`--- ${p.id} ---`);
    lines.push(`License: ${p.license}`);
    if (p.publisher) lines.push(`Publisher: ${p.publisher}`);
    if (p.text) {
      lines.push("");
      lines.push(p.text);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function main() {
  const node = collectNode();
  const python = collectPython();

  const body =
    header() +
    renderSection(`NPM PACKAGES (${node.length})`, node) +
    "\n" +
    renderSection(`PYTHON PACKAGES (${python.length})`, python);

  fs.writeFileSync(OUT, body, "utf8");
  console.log(`\nWrote ${path.relative(root, OUT)} (${node.length + python.length} packages)`);

  if (problems.length) {
    console.error(`\n${problems.length} license problem(s):`);
    for (const p of problems) console.error("  FAIL:", p);
    if (CHECK) {
      console.error("\nLicense gate FAILED — not safe to publish.");
      process.exit(1);
    }
    console.warn("\n(warnings only; run with --check to enforce as a release gate)");
  } else {
    console.log("\nLicense gate PASSED.");
  }
}

main();
