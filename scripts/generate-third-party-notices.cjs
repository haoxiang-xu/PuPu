#!/usr/bin/env node
/*
 * Generates THIRD_PARTY_NOTICES.txt — the third-party attribution bundle that
 * ships inside the PuPu installer.
 *
 * PuPu (Apache-2.0) redistributes four sets of third-party code:
 *   - the production npm dependency graph (bundled into the React build/)
 *   - the Python deps frozen into the `unchain-server` PyInstaller binary
 *     (Flask/Werkzeug/httpx/mcp/openai/anthropic/qdrant-client + transitives)
 *   - the pinned Node/uv/CPython runtimes bundled for local MCP servers
 *   - small, explicitly pinned vendored-source adapters
 * Those permissive licenses (MIT/BSD/Apache/ISC/…) require us to preserve their
 * copyright + license text when we redistribute. This script aggregates them so
 * the obligation is satisfied in the shipped artifact.
 *
 * Third-party MCP server packages are NOT covered here on purpose: they are
 * fetched at runtime via npx/uvx or called as remote endpoints, never bundled.
 * The Node/uv/CPython executors that PuPu itself ships ARE covered here.
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
const MCP_RUNTIME_DIR =
  process.env.PUPU_MCP_RUNTIME_NOTICES_DIR ||
  path.join(root, "unchain_runtime", "mcp_runtime");
const MCP_RUNTIME_PINS = path.join(
  root,
  "unchain_runtime",
  "mcp_runtime_pins.json"
);
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

// ── Copyleft source-availability (LGPL/GPL §4/§6) ─────────────────────────────
// Permissive licenses (MIT/BSD/Apache/ISC/…) are satisfied by preserving their
// text (handled by --with-license-file above). Copyleft components additionally
// grant the user the right to obtain the component's *source* and to
// modify/replace it. The sidecar ships as a PyInstaller --onefile binary
// (opaque), so for each copyleft dependency we attach a WRITTEN OFFER naming the
// upstream source + version, satisfying LGPL-3.0 §4 (replaceability) / §6 (source
// availability). Note: some copyleft addenda (e.g. LGPL-3.0) incorporate a base
// license (GPL-3.0) by reference; the upstream source named in the offer carries
// the complete corresponding license text.
const COPYLEFT_LICENSE_RE = /gpl|mpl|epl|cddl|eupl/i;

// name (as reported by the license tooling) -> upstream source repository.
// A copyleft component NOT registered here fails the --check gate, so a new
// copyleft dependency cannot ship without a source offer.
const COPYLEFT_SOURCE_OFFERS = {
  // pynput (LGPL-3.0) — dynamic import only, unmodified; C1 computer-control dep.
  pynput: "https://github.com/moses-palmer/pynput",
  "axe-core": "https://github.com/dequelabs/axe-core",
  "harmony-reflect": "https://github.com/tvcutsem/harmony-reflect",
  "node-forge": "https://github.com/digitalbazaar/forge",
  certifi: "https://github.com/certifi/python-certifi",
  pyinstaller: "https://github.com/pyinstaller/pyinstaller",
  "pyinstaller-hooks-contrib":
    "https://github.com/pyinstaller/pyinstaller-hooks-contrib",
  tqdm: "https://github.com/tqdm/tqdm",
};

function buildSourceOffer(name, version, url) {
  return [
    "Written offer (copyleft source availability — LGPL/GPL §4/§6):",
    `  ${name} ${version} is copyleft-licensed. Its complete corresponding source`,
    `  code, and the full license terms (including any base license incorporated by`,
    `  reference), are available from ${url}. You have the right to obtain that`,
    `  source, to modify this component, and to relink or replace it within PuPu.`,
    "  If that URL becomes unavailable, contact the PuPu maintainers to obtain the source.",
  ].join("\n");
}

// Resolve the written offer for a package, or record a gate problem if a copyleft
// component has no registered upstream source. Returns "" for permissive packages.
function resolveSourceOffer(ecosystem, name, version, license) {
  if (!COPYLEFT_LICENSE_RE.test(String(license || ""))) return "";
  const url = COPYLEFT_SOURCE_OFFERS[name];
  if (!url) {
    problems.push(
      `[${ecosystem}] ${name}@${version}: copyleft license "${license}" has no registered upstream source offer ` +
        "(add it to COPYLEFT_SOURCE_OFFERS for LGPL/GPL §4/§6 compliance)"
    );
    return "";
  }
  return buildSourceOffer(name, version, url);
}

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
    "Copyleft components (e.g. LGPL/GPL) additionally carry a written offer naming",
    "their upstream source, so you can obtain, modify, and replace them (LGPL/GPL",
    "§4/§6). Look for \"Written offer\" beneath the relevant package below.",
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
    const version = id.slice(id.lastIndexOf("@") + 1);
    const sourceOffer = resolveSourceOffer("node", name, version, license);
    pkgs.push({ id, license, publisher: info.publisher || "", text, sourceOffer });
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
    const sourceOffer = resolveSourceOffer("python", p.Name, p.Version, license);
    pkgs.push({ id, license, publisher: "", text, sourceOffer });
  }
  console.log(`  OK: ${pkgs.length} python packages`);
  return pkgs;
}

function collectVendored() {
  const noticePath = path.join(
    root,
    "unchain_runtime",
    "server",
    "computer_control",
    "CLICK3_NOTICE.md"
  );
  if (!fs.existsSync(noticePath)) {
    problems.push("[vendored] clickclickclick notice file is missing");
    return [];
  }
  return [
    {
      id: "instavm/clickclickclick@e4ce8f958b4d7748a95af6d7201d1fa12ca5d2cb",
      license: "MIT",
      publisher: "Checksum Labs, Inc",
      text: fs.readFileSync(noticePath, "utf8").trim(),
      sourceOffer: "",
    },
  ];
}

function collectBundledMcpRuntimes({
  runtimeDir = MCP_RUNTIME_DIR,
  pinsPath = MCP_RUNTIME_PINS,
  check = CHECK,
  problemSink = problems,
  warn = (message) => console.warn(message),
} = {}) {
  const failOrWarn = (message) => {
    const detail = `[bundled-mcp-runtime] ${message}`;
    if (check) {
      problemSink.push(detail);
    } else {
      warn(`${detail} — SKIPPED`);
    }
  };
  const loadJson = (filePath, label) => {
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
      failOrWarn(
        `${label} is unavailable or invalid at ${filePath}: ${error.message}`,
      );
      return null;
    }
  };
  const loadLicense = (relativePath, label) => {
    const filePath = path.join(runtimeDir, relativePath);
    try {
      const text = fs.readFileSync(filePath, "utf8").trim();
      if (!text) throw new Error("file is empty");
      return text;
    } catch (error) {
      failOrWarn(
        `${label} license is unavailable at ${filePath}: ${error.message}`,
      );
      return "";
    }
  };

  if (!fs.existsSync(runtimeDir)) {
    failOrWarn(
      `staged runtime not found at ${runtimeDir}; run prepare:mcp-runtime before the license gate`,
    );
    return [];
  }

  const manifest = loadJson(
    path.join(runtimeDir, "manifest.json"),
    "runtime manifest",
  );
  const pins = loadJson(pinsPath, "runtime pins");
  if (!manifest || !pins) return [];

  const entries = [];
  const runtimeSpecs = [
    {
      key: "node",
      displayName: "Node.js",
      license: "MIT and bundled third-party licenses",
      licensePaths: ["node/LICENSE"],
    },
    {
      key: "uv",
      displayName: "uv",
      license: "Apache-2.0 OR MIT",
      licensePaths: ["uv/LICENSE-APACHE", "uv/LICENSE-MIT"],
    },
    {
      key: "python",
      displayName: "CPython standalone",
      license: "Python-2.0 and bundled third-party licenses",
      licensePaths: ["python/LICENSE"],
    },
  ];

  for (const spec of runtimeSpecs) {
    const staged = manifest.runtimes && manifest.runtimes[spec.key];
    const pinned = pins.runtimes && pins.runtimes[spec.key];
    if (!staged || !pinned || !staged.version || !staged.source_url) {
      failOrWarn(
        `${spec.displayName} metadata is missing from the staged manifest or pins`,
      );
      continue;
    }
    if (staged.version !== pinned.version) {
      failOrWarn(
        `${spec.displayName} staged version ${staged.version} does not match pin ${pinned.version}`,
      );
      continue;
    }

    const licenseTexts = spec.licensePaths.map((licensePath) => ({
      licensePath,
      text: loadLicense(licensePath, spec.displayName),
    }));
    if (licenseTexts.some(({ text }) => !text)) continue;
    const text = licenseTexts
      .map(({ licensePath, text: licenseText }) => {
        if (licenseTexts.length === 1) return licenseText;
        return `${path.basename(licensePath)}:\n\n${licenseText}`;
      })
      .join("\n\n");
    const sourceOffer = resolveSourceOffer(
      "bundled-mcp-runtime",
      spec.displayName,
      staged.version,
      spec.license,
    );
    entries.push({
      id: `${spec.displayName}@${staged.version}`,
      license: spec.license,
      publisher: "",
      source: staged.source_url,
      text,
      sourceOffer,
    });
  }

  const bootstrap =
    pins.runtimes && pins.runtimes.python && pins.runtimes.python.bootstrap;
  if (!bootstrap || !Array.isArray(bootstrap.packages)) {
    failOrWarn("Python bootstrap package pins are missing");
    return entries;
  }
  const bootstrapLicenses = {
    truststore: "MIT",
    certifi: "MPL-2.0",
  };
  for (const name of ["truststore", "certifi"]) {
    const pinned = bootstrap.packages.find((pkg) => pkg.name === name);
    if (!pinned || !pinned.version || !pinned.url) {
      failOrWarn(`${name} bootstrap metadata is missing from the runtime pins`);
      continue;
    }
    const relativePath = path.join(
      "python_bootstrap",
      `${name}-${pinned.version}.dist-info`,
      "licenses",
      "LICENSE",
    );
    const text = loadLicense(relativePath, name);
    if (!text) continue;
    const license = bootstrapLicenses[name];
    entries.push({
      id: `${name}@${pinned.version}`,
      license,
      publisher: "",
      source: pinned.url,
      text,
      sourceOffer: resolveSourceOffer(
        "bundled-mcp-runtime",
        name,
        pinned.version,
        license,
      ),
    });
  }

  return entries;
}

function renderSection(title, pkgs) {
  const lines = [SEP, title, SEP, ""];
  for (const p of pkgs.sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`--- ${p.id} ---`);
    lines.push(`License: ${p.license}`);
    if (p.publisher) lines.push(`Publisher: ${p.publisher}`);
    if (p.source) lines.push(`Source: ${p.source}`);
    if (p.sourceOffer) {
      lines.push("");
      lines.push(p.sourceOffer);
    }
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
  const bundledMcpRuntimes = collectBundledMcpRuntimes();
  const vendored = collectVendored();

  const body =
    header() +
    renderSection(`NPM PACKAGES (${node.length})`, node) +
    "\n" +
    renderSection(`PYTHON PACKAGES (${python.length})`, python) +
    "\n" +
    renderSection(
      `BUNDLED MCP RUNTIMES (${bundledMcpRuntimes.length})`,
      bundledMcpRuntimes,
    ) +
    "\n" +
    renderSection(`VENDORED SOURCE (${vendored.length})`, vendored);

  fs.writeFileSync(OUT, body, "utf8");
  console.log(
    `\nWrote ${path.relative(root, OUT)} (${node.length + python.length + bundledMcpRuntimes.length + vendored.length} packages)`,
  );

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

// Exported for the notices unit test; only run the generator when invoked as a
// script (so `require`-ing this file to test the helpers does not shell out to
// license-checker / pip-licenses).
module.exports = {
  COPYLEFT_LICENSE_RE,
  COPYLEFT_SOURCE_OFFERS,
  buildSourceOffer,
  resolveSourceOffer,
  renderSection,
  collectVendored,
  collectBundledMcpRuntimes,
  problems,
};

if (require.main === module) {
  main();
}
