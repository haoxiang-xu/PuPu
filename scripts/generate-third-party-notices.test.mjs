// F6 (SEC-001 LOW, license hygiene): the third-party notices generator must
// attach an LGPL/GPL §4/§6 written source offer to copyleft dependencies
// (pynput is LGPL-3.0), and must fail the release gate if a copyleft component
// has no registered upstream source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
// Guarded behind require.main, so importing does not shell out to the tooling.
const notices = require("./generate-third-party-notices.cjs");

test("copyleft regex matches (L)GPL/MPL/EPL, not permissive licenses", () => {
  const re = notices.COPYLEFT_LICENSE_RE;
  for (const s of [
    "GNU Lesser General Public License v3 (LGPLv3)",
    "LGPLv3",
    "GPL-3.0",
    "GPLv2",
    "MPL-2.0",
    "EPL-2.0",
  ]) {
    assert.ok(re.test(s), `expected copyleft match: ${s}`);
  }
  for (const s of ["MIT", "Apache-2.0", "BSD-3-Clause", "ISC", "HPND", "Python-2.0"]) {
    assert.ok(!re.test(s), `expected NO copyleft match: ${s}`);
  }
});

test("pynput gets a written source offer with upstream URL + version", () => {
  const offer = notices.resolveSourceOffer(
    "python",
    "pynput",
    "1.8.1",
    "GNU Lesser General Public License v3 (LGPLv3)"
  );
  assert.ok(offer, "expected a non-empty written offer for pynput");
  assert.match(offer, /github\.com\/moses-palmer\/pynput/);
  assert.match(offer, /pynput 1\.8\.1/);
  assert.match(offer, /§4\/§6/);
  assert.match(offer, /obtain|replace|relink/i);
});

test("every copyleft package in the release environment has a source offer", () => {
  for (const name of [
    "axe-core",
    "harmony-reflect",
    "node-forge",
    "certifi",
    "pyinstaller",
    "pyinstaller-hooks-contrib",
    "python-xlib",
    "tqdm",
  ]) {
    assert.match(notices.COPYLEFT_SOURCE_OFFERS[name], /^https:\/\/github\.com\//);
  }
});

test("permissive package gets no offer and no gate problem", () => {
  const before = notices.problems.length;
  const offer = notices.resolveSourceOffer("python", "Flask", "3.1.0", "BSD-3-Clause");
  assert.equal(offer, "");
  assert.equal(notices.problems.length, before, "permissive license must not add a problem");
});

test("unregistered copyleft component fails the gate", () => {
  const before = notices.problems.length;
  const offer = notices.resolveSourceOffer("python", "mystery-lib", "0.1", "GPL-3.0");
  assert.equal(offer, "", "no offer without a registered source");
  assert.equal(notices.problems.length, before + 1, "must record a gate problem");
  assert.match(
    notices.problems[notices.problems.length - 1],
    /no registered upstream source offer/
  );
});

test("renderSection embeds the written offer above the license text", () => {
  const section = notices.renderSection("PYTHON PACKAGES (1)", [
    {
      id: "pynput@1.8.1",
      license: "GNU Lesser General Public License v3 (LGPLv3)",
      publisher: "",
      text: "GNU LESSER GENERAL PUBLIC LICENSE Version 3 ...",
      sourceOffer: notices.buildSourceOffer(
        "pynput",
        "1.8.1",
        "https://github.com/moses-palmer/pynput"
      ),
    },
  ]);
  assert.match(section, /Written offer/);
  assert.match(section, /github\.com\/moses-palmer\/pynput/);
  // offer appears before the license body
  assert.ok(
    section.indexOf("Written offer") < section.indexOf("GNU LESSER GENERAL PUBLIC LICENSE"),
    "written offer should precede the license text"
  );
});

test("bundled MCP runtime notices use staged license texts and immutable sources", (t) => {
  const fixtureRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "pupu-runtime-notices-"),
  );
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const runtimeDir = path.join(fixtureRoot, "mcp_runtime");
  const pinsPath = path.join(fixtureRoot, "mcp_runtime_pins.json");
  const write = (relativePath, contents) => {
    const filePath = path.join(runtimeDir, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents, "utf8");
  };

  const sources = {
    node: "https://example.test/node.tar.gz",
    uv: "https://example.test/uv.tar.gz",
    python: "https://example.test/python.tar.gz",
  };
  write(
    "manifest.json",
    JSON.stringify({
      runtimes: {
        node: { version: "v24.11.1", source_url: sources.node },
        uv: { version: "0.11.32", source_url: sources.uv },
        python: { version: "3.12.13+20260718", source_url: sources.python },
      },
    }),
  );
  write("node/LICENSE", "NODE LICENSE BODY");
  write("uv/LICENSE-APACHE", "UV APACHE LICENSE BODY");
  write("uv/LICENSE-MIT", "UV MIT LICENSE BODY");
  write("python/LICENSE", "CPYTHON LICENSE BODY");
  write(
    "python/licenses/pip/LICENSE.txt",
    "PIP LICENSE MUST NOT BE DUPLICATED",
  );
  write(
    "python_bootstrap/truststore-0.10.4.dist-info/licenses/LICENSE",
    "TRUSTSTORE LICENSE BODY",
  );
  write(
    "python_bootstrap/certifi-2026.2.25.dist-info/licenses/LICENSE",
    "CERTIFI LICENSE BODY",
  );
  fs.writeFileSync(
    pinsPath,
    JSON.stringify({
      runtimes: {
        node: { version: "v24.11.1" },
        uv: { version: "0.11.32" },
        python: {
          version: "3.12.13+20260718",
          bootstrap: {
            packages: [
              {
                name: "truststore",
                version: "0.10.4",
                url: "https://example.test/truststore.whl",
              },
              {
                name: "certifi",
                version: "2026.2.25",
                url: "https://example.test/certifi.whl",
              },
            ],
          },
        },
      },
    }),
    "utf8",
  );

  const fixtureProblems = [];
  const entries = notices.collectBundledMcpRuntimes({
    runtimeDir,
    pinsPath,
    check: true,
    problemSink: fixtureProblems,
  });
  assert.deepEqual(fixtureProblems, []);
  assert.deepEqual(
    entries.map((entry) => entry.id),
    [
      "Node.js@v24.11.1",
      "uv@0.11.32",
      "CPython standalone@3.12.13+20260718",
      "truststore@0.10.4",
      "certifi@2026.2.25",
    ],
  );

  const section = notices.renderSection(
    `BUNDLED MCP RUNTIMES (${entries.length})`,
    entries,
  );
  for (const body of [
    "NODE LICENSE BODY",
    "UV APACHE LICENSE BODY",
    "UV MIT LICENSE BODY",
    "CPYTHON LICENSE BODY",
    "TRUSTSTORE LICENSE BODY",
    "CERTIFI LICENSE BODY",
  ]) {
    assert.match(section, new RegExp(body));
  }
  for (const source of Object.values(sources))
    assert.match(section, new RegExp(source));
  assert.match(section, /https:\/\/example\.test\/truststore\.whl/);
  assert.match(section, /https:\/\/example\.test\/certifi\.whl/);
  assert.doesNotMatch(section, /PIP LICENSE MUST NOT BE DUPLICATED/);
});

test("missing staged MCP runtime fails check mode and warns/skips otherwise", () => {
  const missingDir = path.join(
    os.tmpdir(),
    `pupu-missing-runtime-${process.pid}`,
  );
  const fixtureProblems = [];
  const strictEntries = notices.collectBundledMcpRuntimes({
    runtimeDir: missingDir,
    check: true,
    problemSink: fixtureProblems,
  });
  assert.deepEqual(strictEntries, []);
  assert.equal(fixtureProblems.length, 1);
  assert.match(fixtureProblems[0], /staged runtime not found/);

  const warnings = [];
  const lenientProblems = [];
  const lenientEntries = notices.collectBundledMcpRuntimes({
    runtimeDir: missingDir,
    check: false,
    problemSink: lenientProblems,
    warn: (message) => warnings.push(message),
  });
  assert.deepEqual(lenientEntries, []);
  assert.deepEqual(lenientProblems, []);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /SKIPPED/);
});

test("vendored clickclickclick adapter carries pinned MIT attribution", () => {
  const entries = notices.collectVendored();
  assert.equal(entries.length, 1);
  assert.match(entries[0].id, /e4ce8f958b4d7748a95af6d7201d1fa12ca5d2cb/);
  assert.equal(entries[0].license, "MIT");
  assert.match(entries[0].text, /Copyright \(c\) 2024 Checksum Labs, Inc/);
  assert.match(entries[0].text, /Permission is hereby granted/);
});
