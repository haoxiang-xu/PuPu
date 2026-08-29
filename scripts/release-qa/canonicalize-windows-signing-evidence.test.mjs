import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  canonicalizeWindowsSigningEvidence,
} from "./canonicalize-windows-signing-evidence.mjs";

const signature = {
  sha256: "a".repeat(64),
  signer_subject: "CN=PuPu release signing test",
  signer_thumbprint: "ABCDEF0123456789ABCDEF0123456789ABCDEF01",
};

const signedFile = (path) => ({ path, ...signature });
const windowsPath = (...segments) => segments.join(String.fromCharCode(92));
const CLI = path.resolve(
  import.meta.dirname,
  "canonicalize-windows-signing-evidence.mjs",
);

const evidence = (overrides = {}) => ({
  schema: "pupu.windows-release-candidate-signing.v1",
  unsigned_payload_exceptions: [
    {
      path: windowsPath("resources", "mcp_runtime", "python", "DLLs", "tk86t.dll"),
    },
    {
      path: windowsPath("resources", "mcp_runtime", "python", "DLLs", "tcl86t.dll"),
    },
  ],
  signed_files: [
    signedFile(windowsPath(".release-qa", "windows-unpacked", "d3dcompiler_47.dll")),
    signedFile(windowsPath(".release-qa", "windows-unpacked", "libGLESv2.dll")),
    signedFile(windowsPath(".release-qa", "windows-unpacked", "PuPu.exe")),
    signedFile(windowsPath(
      ".release-qa",
      "windows-unpacked",
      "resources",
      "mcp_runtime",
      "python",
      "vcruntime140_1.dll",
    )),
    signedFile(windowsPath(
      ".release-qa",
      "windows-unpacked",
      "resources",
      "mcp_runtime",
      "python",
      "vcruntime140.dll",
    )),
    signedFile(windowsPath("dist", "PuPu-0.1.10-windows-x64.exe")),
  ],
  ...overrides,
});

test("canonicalizer reproduces and repairs the RC2 PowerShell ordering inversions", () => {
  const input = evidence();
  const canonical = canonicalizeWindowsSigningEvidence(input);

  assert.deepEqual(canonical.signed_files.map((file) => file.path), [
    windowsPath(".release-qa", "windows-unpacked", "PuPu.exe"),
    windowsPath(".release-qa", "windows-unpacked", "d3dcompiler_47.dll"),
    windowsPath(".release-qa", "windows-unpacked", "libGLESv2.dll"),
    windowsPath(
      ".release-qa",
      "windows-unpacked",
      "resources",
      "mcp_runtime",
      "python",
      "vcruntime140.dll",
    ),
    windowsPath(
      ".release-qa",
      "windows-unpacked",
      "resources",
      "mcp_runtime",
      "python",
      "vcruntime140_1.dll",
    ),
    windowsPath("dist", "PuPu-0.1.10-windows-x64.exe"),
  ]);
  assert.deepEqual(canonical.unsigned_payload_exceptions.map((file) => file.path), [
    windowsPath("resources", "mcp_runtime", "python", "DLLs", "tcl86t.dll"),
    windowsPath("resources", "mcp_runtime", "python", "DLLs", "tk86t.dll"),
  ]);
  assert.equal(
    input.signed_files[0].path,
    windowsPath(".release-qa", "windows-unpacked", "d3dcompiler_47.dll"),
  );
});

test("canonicalizer rejects duplicate signed paths before artifact admission", () => {
  const duplicate = signedFile(windowsPath(".release-qa", "windows-unpacked", "PuPu.exe"));
  assert.throws(
    () => canonicalizeWindowsSigningEvidence(
      evidence({ signed_files: [duplicate, duplicate] }),
    ),
    /signed_files paths must be unique/,
  );
});

test("canonicalizer supports the shared Windows signing qualification schema", () => {
  const canonical = canonicalizeWindowsSigningEvidence(evidence({
    schema: "pupu.windows-signing-qualification.v1",
  }));
  assert.equal(canonical.schema, "pupu.windows-signing-qualification.v1");
  assert.equal(canonical.signed_files[0].path, windowsPath(
    ".release-qa",
    "windows-unpacked",
    "PuPu.exe",
  ));
});

test("canonicalizer rejects an unsupported evidence schema", () => {
  assert.throws(
    () => canonicalizeWindowsSigningEvidence(
      evidence({ schema: "pupu.windows-signing.future" }),
    ),
    /unsupported Windows signing evidence schema/,
  );
});

test("CLI rewrites the producer JSON before the composite action publishes it", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-windows-signing-evidence-"));
  const evidencePath = path.join(root, "windows-signing-evidence.v1.json");
  fs.writeFileSync(
    evidencePath,
    JSON.stringify(evidence(), null, 2) + String.fromCharCode(10),
    "utf8",
  );

  const result = spawnSync(
    process.execPath,
    [CLI, "--evidence", evidencePath],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  const canonical = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  assert.equal(
    canonical.signed_files[0].path,
    windowsPath(".release-qa", "windows-unpacked", "PuPu.exe"),
  );
});
