// F6 (SEC-001 LOW, license hygiene): the third-party notices generator must
// attach an LGPL/GPL §4/§6 written source offer to copyleft dependencies
// (pynput is LGPL-3.0), and must fail the release gate if a copyleft component
// has no registered upstream source.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

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

test("vendored clickclickclick adapter carries pinned MIT attribution", () => {
  const entries = notices.collectVendored();
  assert.equal(entries.length, 1);
  assert.match(entries[0].id, /e4ce8f958b4d7748a95af6d7201d1fa12ca5d2cb/);
  assert.equal(entries[0].license, "MIT");
  assert.match(entries[0].text, /Copyright \(c\) 2024 Checksum Labs, Inc/);
  assert.match(entries[0].text, /Permission is hereby granted/);
});
