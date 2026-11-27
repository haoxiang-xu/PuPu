import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { validateWindowsReleaseCandidateSigningEvidence } from "./windows-release-candidate-signing.mjs";

const CANDIDATE = "pupu.windows-release-candidate-signing.v1";
const QUALIFICATION = "pupu.windows-signing-qualification.v1";
const COMMIT = "b".repeat(40);
const VERSION = "0.2.0";
const RUN_ID = "554433";
const INSTALLER_NAME = "PuPu-0.2.0-windows-x64-setup.exe";
const PAYLOAD_PREFIX = ".release-qa\\windows-unpacked\\";
const TCL = "resources\\mcp_runtime\\python\\DLLs\\tcl86t.dll";
const TK = "resources\\mcp_runtime\\python\\DLLs\\tk86t.dll";
const ELEVATE = "resources\\elevate.exe";
const REASON = "upstream Tcl/Tk DLL excluded from re-signing after native signature observation";
const CLI = path.join(import.meta.dirname, "build-windows-signing-evidence.mjs");
const STRICT_CLI = path.join(import.meta.dirname, "windows-release-candidate-signing.mjs");
const CASES = [
  { tcl: "Valid", tk: "Valid", unsigned: [], signed: ["PuPu.exe", ELEVATE, TCL, TK] },
  { tcl: "Valid", tk: "NotSigned", unsigned: [TK], signed: ["PuPu.exe", ELEVATE, TCL] },
  { tcl: "NotSigned", tk: "Valid", unsigned: [TCL], signed: ["PuPu.exe", ELEVATE, TK] },
  { tcl: "NotSigned", tk: "NotSigned", unsigned: [TCL, TK], signed: ["PuPu.exe", ELEVATE] },
];

function makeWindowsSigningObservationFixture(t, {
  schema = CANDIDATE,
  tcl = "Valid",
  tk = "Valid",
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-signing-observation-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const installerFile = path.join(root, "fixture bytes 输出", INSTALLER_NAME);
  fs.mkdirSync(path.dirname(installerFile), { recursive: true });
  // These bounded bytes and native-observation records are synthetic fixtures.
  // They do not claim that this host executed PowerShell or verified a signature.
  fs.writeFileSync(installerFile, Buffer.from("independent installer fixture bytes\n"));
  const records = [
    { payload: TK, status: tk },
    { payload: "PuPu.exe", status: "Valid" },
    { payload: null, status: "Valid" },
    { payload: TCL, status: tcl },
    { payload: ELEVATE, status: "Valid" },
  ];
  const observation = {
    schema: "pupu.windows-signing-observation.v1",
    evidence_schema: schema,
    run_id: RUN_ID,
    source_revision: COMMIT,
    package_version: VERSION,
    target_id: "windows-x64",
    files: records.map(({ payload, status }) => {
      const bytes = payload === null
        ? fs.readFileSync(installerFile)
        : Buffer.from("synthetic payload bytes: " + payload);
      const reportedPath = payload === null
        ? (schema === CANDIDATE ? "dist\\" + INSTALLER_NAME : "C:\\fixture\\dist\\" + INSTALLER_NAME)
        : (schema === CANDIDATE ? PAYLOAD_PREFIX + payload : "C:\\fixture\\payload\\" + payload);
      return {
        path: reportedPath,
        payload_path: payload,
        sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        authenticode_status: status,
        signer_subject: status === "Valid" ? "CN=synthetic native observation fixture" : null,
        signer_thumbprint: status === "Valid" ? "A".repeat(40) : null,
      };
    }),
  };
  return { root, installerFile, observation };
}

function candidateManifestFromInstallerBytes(fixture) {
  return {
    release: { candidate_run_id: RUN_ID, version: VERSION, commit: COMMIT },
    assets: [{
      target_id: "windows-x64",
      role: "installer",
      format: "exe",
      name: INSTALLER_NAME,
      // The expected hash comes from separate fixture bytes, never from evidence.
      sha256: "sha256:" + crypto.createHash("sha256")
        .update(fs.readFileSync(fixture.installerFile)).digest("hex"),
    }],
  };
}

for (const schema of [CANDIDATE, QUALIFICATION]) {
  for (const scenario of CASES) {
    test(schema + " classifies Tcl/Tk " + scenario.tcl + "/" + scenario.tk, async (t) => {
      const { buildWindowsSigningEvidence } = await import("./build-windows-signing-evidence.mjs");
      const fixture = makeWindowsSigningObservationFixture(t, { schema, ...scenario });
      const before = structuredClone(fixture.observation);
      const output = buildWindowsSigningEvidence(fixture.observation);
      const expectedKeys = schema === CANDIDATE
        ? ["schema", "status", "candidate_run_id", "source_revision", "package_version", "target_id",
          "payload_file_count", "signable_payload_file_count", "installer_file_count",
          "unsigned_payload_exceptions", "signed_files"]
        : ["schema", "status", "run_id", "source_revision", "payload_file_count",
          "signable_payload_file_count", "installer_file_count", "unsigned_payload_exceptions", "signed_files"];
      assert.deepEqual(Object.keys(output).sort(), expectedKeys.sort());
      assert.equal(output.schema, schema);
      assert.equal(output.status, "passed");
      assert.equal(output.source_revision, COMMIT);
      assert.equal(output[schema === CANDIDATE ? "candidate_run_id" : "run_id"], RUN_ID);
      assert.equal(output.payload_file_count, 4);
      assert.equal(output.signable_payload_file_count, 4 - scenario.unsigned.length);
      assert.equal(output.installer_file_count, 1);
      assert.equal(output.signed_files.length, 5 - scenario.unsigned.length);
      assert.ok(Array.isArray(output.unsigned_payload_exceptions));
      assert.deepEqual(output.unsigned_payload_exceptions.map((entry) => entry.path), scenario.unsigned);
      for (const entry of output.unsigned_payload_exceptions) {
        assert.deepEqual(Object.keys(entry).sort(), ["path", "sha256", "authenticode_status", "reason"].sort());
        const observed = before.files.find((file) => file.payload_path === entry.path);
        assert.equal(entry.sha256, observed.sha256);
        assert.equal(entry.authenticode_status, observed.authenticode_status);
        assert.equal(entry.reason, REASON);
      }
      const expectedPaths = scenario.signed.map((payload) =>
        schema === CANDIDATE ? PAYLOAD_PREFIX + payload : "C:\\fixture\\payload\\" + payload);
      expectedPaths.push(schema === CANDIDATE
        ? "dist\\" + INSTALLER_NAME : "C:\\fixture\\dist\\" + INSTALLER_NAME);
      expectedPaths.sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
      assert.deepEqual(output.signed_files.map((entry) => entry.path), expectedPaths);
      for (const entry of output.signed_files) {
        assert.deepEqual(Object.keys(entry).sort(), ["path", "sha256", "signer_subject", "signer_thumbprint"].sort());
        const observed = before.files.find((file) => file.path === entry.path);
        assert.equal(entry.sha256, observed.sha256);
        assert.equal(entry.signer_subject, observed.signer_subject);
        assert.equal(entry.signer_thumbprint, observed.signer_thumbprint);
      }
      assert.deepEqual(fixture.observation, before, "classification must not mutate native observations");
      assert.deepEqual(buildWindowsSigningEvidence(fixture.observation), output, "projection is deterministic");
      if (schema === CANDIDATE) {
        assert.equal(output.package_version, VERSION);
        assert.equal(output.target_id, "windows-x64");
        assert.doesNotThrow(() => validateWindowsReleaseCandidateSigningEvidence({
          evidence: output, manifest: candidateManifestFromInstallerBytes(fixture),
        }));
      }
    });
  }
}

test("legacy UnknownError is a controlled Tcl/Tk exception, not a generic signature bypass", async (t) => {
  const { buildWindowsSigningEvidence } = await import("./build-windows-signing-evidence.mjs");
  const fixture = makeWindowsSigningObservationFixture(t, { tcl: "UnknownError", tk: "Valid" });
  const output = buildWindowsSigningEvidence(fixture.observation);
  assert.equal(output.unsigned_payload_exceptions.length, 1);
  assert.equal(output.unsigned_payload_exceptions[0].path, TCL);
  assert.equal(output.unsigned_payload_exceptions[0].authenticode_status, "UnknownError");
  assert.equal(output.unsigned_payload_exceptions[0].reason, REASON);
  assert.doesNotThrow(() => validateWindowsReleaseCandidateSigningEvidence({
    evidence: output, manifest: candidateManifestFromInstallerBytes(fixture),
  }));
});

test("Valid observations require both signer certificate fields", async (t) => {
  const { buildWindowsSigningEvidence } = await import("./build-windows-signing-evidence.mjs");
  const fixture = makeWindowsSigningObservationFixture(t);
  for (const payload of [TCL, "PuPu.exe", null]) {
    for (const field of ["signer_subject", "signer_thumbprint"]) {
      const bad = structuredClone(fixture.observation);
      bad.files.find((file) => file.payload_path === payload)[field] = null;
      assert.throws(() => buildWindowsSigningEvidence(bad), /signer|certificate|subject|thumbprint/i);
    }
  }
});

test("ordinary payloads and the installer cannot use Tcl/Tk non-Valid exceptions", async (t) => {
  const { buildWindowsSigningEvidence } = await import("./build-windows-signing-evidence.mjs");
  const fixture = makeWindowsSigningObservationFixture(t);
  for (const payload of ["PuPu.exe", ELEVATE, null]) {
    for (const status of ["NotSigned", "UnknownError"]) {
      const bad = structuredClone(fixture.observation);
      Object.assign(bad.files.find((file) => file.payload_path === payload), {
        authenticode_status: status, signer_subject: null, signer_thumbprint: null,
      });
      assert.throws(() => buildWindowsSigningEvidence(bad), /signature|authenticode|status|signed/i);
    }
  }
});

test("Tcl/Tk HashMismatch, NotTrusted and unknown status fail closed", async (t) => {
  const { buildWindowsSigningEvidence } = await import("./build-windows-signing-evidence.mjs");
  const fixture = makeWindowsSigningObservationFixture(t);
  for (const status of ["HashMismatch", "NotTrusted", "future-status", "valid", ""]) {
    const bad = structuredClone(fixture.observation);
    bad.files.find((file) => file.payload_path === TCL).authenticode_status = status;
    assert.throws(() => buildWindowsSigningEvidence(bad), /signature|authenticode|status/i);
  }
});

test("malformed hashes and unknown observation/file fields fail closed", async (t) => {
  const { buildWindowsSigningEvidence } = await import("./build-windows-signing-evidence.mjs");
  const fixture = makeWindowsSigningObservationFixture(t);
  for (const hash of ["not-a-hash", "A".repeat(64), "a".repeat(63), ["a".repeat(64)], "a".repeat(64) + "\n"]) {
    const bad = structuredClone(fixture.observation);
    bad.files[0].sha256 = hash;
    assert.throws(() => buildWindowsSigningEvidence(bad), /hash|sha256/i);
  }
  const extraOuter = structuredClone(fixture.observation);
  extraOuter.unexpected = true;
  assert.throws(() => buildWindowsSigningEvidence(extraOuter), /keys|unknown|unexpected|fields/i);
  const extraFile = structuredClone(fixture.observation);
  extraFile.files[0].unexpected = true;
  assert.throws(() => buildWindowsSigningEvidence(extraFile), /keys|unknown|unexpected|fields/i);
});

test("missing, duplicate or mismatched payload identities cannot be hidden by classification", async (t) => {
  const { buildWindowsSigningEvidence } = await import("./build-windows-signing-evidence.mjs");
  const fixture = makeWindowsSigningObservationFixture(t);
  const mutations = [
    (input) => { input.files = input.files.filter((file) => file.payload_path !== TCL); },
    (input) => { input.files.push(structuredClone(input.files[0])); },
    (input) => { input.files.find((file) => file.payload_path === TCL).path = PAYLOAD_PREFIX + "other.dll"; },
    (input) => { input.files.find((file) => file.payload_path === TCL).payload_path = "..\\outside.dll"; },
    (input) => { input.files.push(structuredClone(input.files.find((file) => file.payload_path === null))); },
  ];
  for (const mutate of mutations) {
    const bad = structuredClone(fixture.observation);
    mutate(bad);
    assert.throws(() => buildWindowsSigningEvidence(bad), /path|payload|Tcl|Tk|duplicate|installer|unique/i);
  }
});

test("closed observation schema and release identity are validated before publication", async (t) => {
  const { buildWindowsSigningEvidence } = await import("./build-windows-signing-evidence.mjs");
  const fixture = makeWindowsSigningObservationFixture(t);
  for (const [field, value] of [
    ["schema", "pupu.windows-signing-observation.future"],
    ["evidence_schema", "pupu.windows-signing.future"],
    ["run_id", "0"],
    ["source_revision", "not-a-commit"],
    ["package_version", "not-semver"],
    ["target_id", "linux-x64"],
  ]) {
    const bad = structuredClone(fixture.observation);
    bad[field] = value;
    assert.throws(() => buildWindowsSigningEvidence(bad), /schema|run|source|revision|commit|version|target|identity/i);
  }
});

test("strict Candidate consumer still rejects Valid exceptions, omissions and mismatched installer bytes", async (t) => {
  const { buildWindowsSigningEvidence } = await import("./build-windows-signing-evidence.mjs");
  const fixture = makeWindowsSigningObservationFixture(t);
  const output = buildWindowsSigningEvidence(fixture.observation);
  const manifest = candidateManifestFromInstallerBytes(fixture);
  const wronglyUnsigned = structuredClone(output);
  const tcl = wronglyUnsigned.signed_files.find((file) => file.path === PAYLOAD_PREFIX + TCL);
  wronglyUnsigned.signed_files = wronglyUnsigned.signed_files.filter((file) => file !== tcl);
  wronglyUnsigned.signable_payload_file_count -= 1;
  wronglyUnsigned.unsigned_payload_exceptions = [{
    path: TCL, sha256: tcl.sha256, authenticode_status: "Valid", reason: REASON,
  }];
  assert.throws(() => validateWindowsReleaseCandidateSigningEvidence({
    evidence: wronglyUnsigned, manifest,
  }), /Authenticode-valid|Valid/i);
  const omitted = structuredClone(output);
  omitted.signed_files = omitted.signed_files.filter((file) => file.path !== PAYLOAD_PREFIX + TCL);
  omitted.payload_file_count -= 1;
  omitted.signable_payload_file_count -= 1;
  assert.throws(() => validateWindowsReleaseCandidateSigningEvidence({
    evidence: omitted, manifest,
  }), /Tcl|Tk|cover|missing|exception|payload/i);
  const wrongHash = structuredClone(output);
  wrongHash.signed_files.find((file) => file.path === "dist\\" + INSTALLER_NAME).sha256 = "f".repeat(64);
  assert.throws(() => validateWindowsReleaseCandidateSigningEvidence({
    evidence: wrongHash, manifest,
  }), /installer SHA-256/i);
});

test("real producer CLI output is accepted by the strict consumer using independently read installer bytes", async (t) => {
  await import("./build-windows-signing-evidence.mjs");
  const fixture = makeWindowsSigningObservationFixture(t);
  const observationPath = path.join(fixture.root, "native observation fixture.json");
  const outputPath = path.join(fixture.root, "windows evidence fixture.json");
  const rawObservation = JSON.stringify(fixture.observation, null, 2) + "\n";
  const originalInstaller = fs.readFileSync(fixture.installerFile);
  fs.writeFileSync(observationPath, rawObservation);
  const result = spawnSync(process.execPath, [CLI, "--observation", observationPath, "--evidence", outputPath], {
    encoding: "utf8", timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  assert.deepEqual(output.unsigned_payload_exceptions, []);
  assert.doesNotThrow(() => validateWindowsReleaseCandidateSigningEvidence({
    evidence: output, manifest: candidateManifestFromInstallerBytes(fixture),
  }));
  assert.deepEqual(fs.readFileSync(fixture.installerFile), originalInstaller);
  assert.equal(fs.readFileSync(observationPath, "utf8"), rawObservation);
});

test("producer CLI rejects invalid observations without publishing evidence", async (t) => {
  await import("./build-windows-signing-evidence.mjs");
  const fixture = makeWindowsSigningObservationFixture(t);
  const bad = structuredClone(fixture.observation);
  Object.assign(bad.files.find((file) => file.payload_path === "PuPu.exe"), {
    authenticode_status: "NotSigned", signer_subject: null, signer_thumbprint: null,
  });
  const observationPath = path.join(fixture.root, "invalid observation.json");
  const outputPath = path.join(fixture.root, "must not publish.json");
  fs.writeFileSync(observationPath, JSON.stringify(bad));
  const result = spawnSync(process.execPath, [CLI, "--observation", observationPath, "--evidence", outputPath], {
    encoding: "utf8", timeout: 10000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /signature|authenticode|status|signed/i);
  assert.equal(fs.existsSync(outputPath), false);
});

test("qualification accepts the shared action's empty optional version and target metadata", async (t) => {
  const { buildWindowsSigningEvidence } = await import("./build-windows-signing-evidence.mjs");
  const fixture = makeWindowsSigningObservationFixture(t, { schema: QUALIFICATION });
  fixture.observation.package_version = "";
  fixture.observation.target_id = "";
  const output = buildWindowsSigningEvidence(fixture.observation);
  assert.equal(output.schema, QUALIFICATION);
  assert.equal(output.run_id, RUN_ID);
  assert.equal(output.signed_files.length, 5);
  assert.deepEqual(output.unsigned_payload_exceptions, []);
  assert.equal(Object.hasOwn(output, "package_version"), false);
  assert.equal(Object.hasOwn(output, "target_id"), false);
});

for (const scenario of [CASES[0], CASES[1], CASES[3]]) {
  test("real producer CLI feeds strict package CLI with " + scenario.unsigned.length + " unsigned exceptions", async (t) => {
    await import("./build-windows-signing-evidence.mjs");
    const fixture = makeWindowsSigningObservationFixture(t, scenario);
    const observationPath = path.join(fixture.root, "observation.json");
    const evidencePath = path.join(fixture.root, "evidence.json");
    fs.writeFileSync(observationPath, JSON.stringify(fixture.observation));
    const produced = spawnSync(process.execPath, [
      CLI, "--observation", observationPath, "--evidence", evidencePath,
    ], { encoding: "utf8", timeout: 10000 });
    assert.equal(produced.status, 0, produced.stderr);
    const admitted = spawnSync(process.execPath, [
      STRICT_CLI, "--evidence", evidencePath, "--installer", fixture.installerFile,
      "--version", VERSION, "--run-id", RUN_ID, "--commit", COMMIT,
    ], { encoding: "utf8", timeout: 10000 });
    assert.equal(admitted.status, 0, admitted.stderr);
    assert.match(admitted.stdout, /strict package gate passed/);
    assert.equal(JSON.parse(fs.readFileSync(evidencePath)).unsigned_payload_exceptions.length,
      scenario.unsigned.length);
  });
}

test("strict package CLI rejects changed installer bytes, forged evidence hash and wrong expected identity", async (t) => {
  const { buildWindowsSigningEvidence } = await import("./build-windows-signing-evidence.mjs");
  for (const problem of ["installer-bytes", "evidence-hash", "expected-run", "expected-commit", "expected-version"]) {
    const fixture = makeWindowsSigningObservationFixture(t);
    const evidence = buildWindowsSigningEvidence(fixture.observation);
    const evidencePath = path.join(fixture.root, "evidence.json");
    if (problem === "installer-bytes") fs.appendFileSync(fixture.installerFile, "changed after observation");
    if (problem === "evidence-hash") {
      evidence.signed_files.find((entry) => entry.path === "dist\\" + INSTALLER_NAME).sha256 = "f".repeat(64);
    }
    fs.writeFileSync(evidencePath, JSON.stringify(evidence));
    const rejected = spawnSync(process.execPath, [
      STRICT_CLI, "--evidence", evidencePath, "--installer", fixture.installerFile,
      "--version", problem === "expected-version" ? "0.2.1" : VERSION,
      "--run-id", problem === "expected-run" ? "554434" : RUN_ID,
      "--commit", problem === "expected-commit" ? "c".repeat(40) : COMMIT,
    ], { encoding: "utf8", timeout: 10000 });
    assert.notEqual(rejected.status, 0, problem);
    assert.match(rejected.stderr, /installer SHA-256|run_id|source_revision|version|filename/i, problem);
    assert.doesNotMatch(rejected.stdout, /strict package gate passed/, problem);
  }
});

test("strict package CLI rejects unknown, repeated and incomplete argument sets", async (t) => {
  const { buildWindowsSigningEvidence } = await import("./build-windows-signing-evidence.mjs");
  const fixture = makeWindowsSigningObservationFixture(t);
  const evidencePath = path.join(fixture.root, "evidence.json");
  fs.writeFileSync(evidencePath, JSON.stringify(buildWindowsSigningEvidence(fixture.observation)));
  const validArgs = [
    "--evidence", evidencePath, "--installer", fixture.installerFile,
    "--version", VERSION, "--run-id", RUN_ID, "--commit", COMMIT,
  ];
  const unknown = [...validArgs];
  unknown[0] = "--unknown";
  const duplicate = [...validArgs];
  duplicate[2] = "--evidence";
  for (const args of [unknown, duplicate, validArgs.slice(0, -1), [...validArgs, "--extra", "value"]]) {
    const rejected = spawnSync(process.execPath, [STRICT_CLI, ...args], {
      encoding: "utf8", timeout: 10000,
    });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /arguments|expected|invalid/i);
    assert.doesNotMatch(rejected.stdout, /strict package gate passed/);
  }
});

test("strict consumer independently rejects closed-schema, identity and path-classification tampering", async (t) => {
  const { buildWindowsSigningEvidence } = await import("./build-windows-signing-evidence.mjs");
  const fixture = makeWindowsSigningObservationFixture(t);
  const valid = buildWindowsSigningEvidence(fixture.observation);
  const manifest = candidateManifestFromInstallerBytes(fixture);
  const mutations = [
    { name: "unknown envelope key", change: (value) => { value.extra = true; } },
    { name: "wrong schema", change: (value) => { value.schema = "pupu.windows-signing.future"; } },
    { name: "wrong run", change: (value) => { value.candidate_run_id = "554434"; } },
    { name: "wrong commit", change: (value) => { value.source_revision = "c".repeat(40); } },
    { name: "wrong version", change: (value) => { value.package_version = "0.2.1"; } },
    { name: "wrong status", change: (value) => { value.status = "failed"; } },
    { name: "unknown signed entry key", change: (value) => { value.signed_files[0].extra = true; } },
    { name: "wrong prefix", change: (value) => {
      value.signed_files.find((entry) => entry.path === PAYLOAD_PREFIX + "PuPu.exe").path = "outside\\PuPu.exe";
    } },
    { name: "unknown unsigned payload", change: (value) => {
      value.unsigned_payload_exceptions = [{
        path: "resources\\unapproved.dll", sha256: "a".repeat(64),
        authenticode_status: "NotSigned", reason: REASON,
      }];
      value.payload_file_count += 1;
    } },
    { name: "overlapping signed and unsigned", change: (value) => {
      value.unsigned_payload_exceptions = [{
        path: TCL, sha256: "a".repeat(64), authenticode_status: "NotSigned", reason: REASON,
      }];
      value.payload_file_count += 1;
    } },
    { name: "both Tcl/Tk omitted with forged counts", change: (value) => {
      value.signed_files = value.signed_files.filter((entry) =>
        entry.path !== PAYLOAD_PREFIX + TCL && entry.path !== PAYLOAD_PREFIX + TK);
      value.payload_file_count -= 2;
      value.signable_payload_file_count -= 2;
    } },
    { name: "case-alias path", change: (value) => {
      const launcher = value.signed_files.find((entry) => entry.path === PAYLOAD_PREFIX + "PuPu.exe");
      value.signed_files.push({ ...launcher, path: PAYLOAD_PREFIX + "pupu.exe" });
      value.payload_file_count += 1;
      value.signable_payload_file_count += 1;
    } },
    { name: "missing elevation helper with forged counts", change: (value) => {
      value.signed_files = value.signed_files.filter((entry) => entry.path !== PAYLOAD_PREFIX + ELEVATE);
      value.payload_file_count -= 1;
      value.signable_payload_file_count -= 1;
    } },
    { name: "missing signed certificate", change: (value) => {
      value.signed_files[0].signer_subject = "";
    } },
    { name: "signed Tcl hash with trailing newline", change: (value) => {
      value.signed_files.find((entry) => entry.path === PAYLOAD_PREFIX + TCL).sha256 += "\n";
    } },
  ];
  for (const { name, change } of mutations) {
    const corrupted = structuredClone(valid);
    change(corrupted);
    // Keep ordinary ordering valid so rejection tests the mutated admission data.
    corrupted.signed_files.sort((left, right) =>
      Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
    assert.throws(() => validateWindowsReleaseCandidateSigningEvidence({
      evidence: corrupted, manifest,
    }), undefined, name);
  }
  const unsignedFixture = makeWindowsSigningObservationFixture(t, { tk: "NotSigned" });
  const badStatus = buildWindowsSigningEvidence(unsignedFixture.observation);
  badStatus.unsigned_payload_exceptions[0].authenticode_status = "NotTrusted";
  assert.throws(() => validateWindowsReleaseCandidateSigningEvidence({
    evidence: badStatus, manifest: candidateManifestFromInstallerBytes(unsignedFixture),
  }), /unsupported Authenticode status/i);
});

test("absolute signing tools resolve their own imports from a legacy checkout without helpers", async (t) => {
  await import("./build-windows-signing-evidence.mjs");
  const fixture = makeWindowsSigningObservationFixture(t);
  const legacyCwd = path.join(fixture.root, "legacy fixture checkout 输出");
  fs.mkdirSync(path.join(legacyCwd, "dist"), { recursive: true });
  const legacyPackage = JSON.stringify({ name: "legacy-fixture", version: "0.1.13", private: true }) + "\n";
  fs.writeFileSync(path.join(legacyCwd, "package.json"), legacyPackage);
  const legacyInstaller = path.join(legacyCwd, "dist", INSTALLER_NAME);
  fs.copyFileSync(fixture.installerFile, legacyInstaller);
  const originalInstaller = fs.readFileSync(legacyInstaller);
  const observationPath = path.join(legacyCwd, "native observation fixture.json");
  const evidencePath = path.join(legacyCwd, "windows evidence fixture.json");
  fs.writeFileSync(observationPath, JSON.stringify(fixture.observation));
  assert.ok(path.isAbsolute(CLI));
  assert.ok(path.isAbsolute(STRICT_CLI));
  assert.equal(fs.existsSync(path.join(legacyCwd, "scripts", "release-qa")), false);
  assert.equal(fs.existsSync(path.join(legacyCwd, "node_modules")), false);

  // This executes the real tools checkout entrypoints and their relative ESM
  // imports. It neither copies helpers into the old checkout nor simulates PS.
  const produced = spawnSync(process.execPath, [
    CLI, "--observation", observationPath, "--evidence", evidencePath,
  ], { cwd: legacyCwd, encoding: "utf8", timeout: 10000 });
  assert.equal(produced.status, 0, produced.stderr);
  const admitted = spawnSync(process.execPath, [
    STRICT_CLI, "--evidence", evidencePath, "--installer", legacyInstaller,
    "--version", VERSION, "--run-id", RUN_ID, "--commit", COMMIT,
  ], { cwd: legacyCwd, encoding: "utf8", timeout: 10000 });
  assert.equal(admitted.status, 0, admitted.stderr);
  assert.match(admitted.stdout, /strict package gate passed/);
  assert.deepEqual(JSON.parse(fs.readFileSync(evidencePath)).unsigned_payload_exceptions, []);
  assert.deepEqual(fs.readFileSync(legacyInstaller), originalInstaller);
  assert.equal(fs.readFileSync(path.join(legacyCwd, "package.json"), "utf8"), legacyPackage);
  assert.equal(fs.existsSync(path.join(legacyCwd, "scripts", "release-qa")), false);
  assert.equal(fs.existsSync(path.join(legacyCwd, "node_modules")), false);
});
