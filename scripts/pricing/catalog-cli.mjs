#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  signCatalog,
  validateCatalogPayload,
} from "./catalog-lib.mjs";
import {
  buildVerifiedCatalogProjection,
  fetchOfficialSourceCapture,
  loadOfficialSourceCapture,
  loadStrictJsonFile,
  loadPinnedProjectionFile,
  loadVerifiedCatalogFile,
  pricingProjectionSummary,
  writeOfficialSourceCapture,
} from "./catalog-runtime.mjs";

const USAGE = `Usage:
  catalog-cli.mjs fetch-proposal --url <official-url> --out-dir <directory>
  catalog-cli.mjs sign --payload <catalog.json> --capture-manifest <capture.json> [--capture-manifest <capture.json> ...] --private-key <ed25519.pem> --key-id <id> --out <envelope.json> [--force]
  catalog-cli.mjs verify --catalog <envelope.json> --trust-store <trust.json>
  catalog-cli.mjs project --catalog <envelope.json> --trust-store <trust.json> --out <projection.json> [--force]
  catalog-cli.mjs inspect --catalog <envelope.json> --trust-store <trust.json>
  catalog-cli.mjs inspect-projection --projection <projection.json> --sha256 <pinned-sha256>

The fetch command is the only command that accesses the network. Signing keys
are read only from an explicitly supplied local file; this repository ships no
production private key.`;

const parseArgs = (argv) => {
  const [command, ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument: ${token}`);
    const name = token.slice(2);
    if (name === "force") {
      values.force = true;
      continue;
    }
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`missing value for --${name}`);
    if (name === "capture-manifest") {
      values[name] = [...(values[name] || []), value];
    } else {
      if (Object.hasOwn(values, name)) throw new Error(`duplicate option: --${name}`);
      values[name] = value;
    }
    index += 1;
  }
  return { command, values };
};

const requireOption = (values, name) => {
  if (typeof values[name] !== "string" || values[name].length === 0) {
    throw new Error(`--${name} is required`);
  }
  return values[name];
};

const requireOptions = (values, name) => {
  if (!Array.isArray(values[name]) || values[name].length === 0) {
    throw new Error(`--${name} is required`);
  }
  return values[name];
};

const writeJson = async (filePath, value, { force = false } = {}) => {
  await fs.mkdir(path.dirname(path.resolve(filePath)), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    flag: force ? "w" : "wx",
    mode: 0o600,
  });
};

const assertPrivateKeyFileIsRestricted = async (privateKeyPath) => {
  if (process.platform === "win32") return;
  const stats = await fs.stat(privateKeyPath);
  if ((stats.mode & 0o077) !== 0) {
    throw new Error("private key permissions must not grant group or other access");
  }
};

const publicSummary = (verified) => ({
  verified: true,
  catalog_version: verified.payload.catalog_version,
  catalog_payload_sha256: verified.payload_sha256,
  key_id: verified.key_id,
  trusted_public_key_sha256: verified.trusted_public_key_sha256,
  effective_from: verified.payload.effective_from,
  effective_to: verified.payload.effective_to,
  source_count: verified.payload.sources.length,
  entry_count: verified.payload.entries.length,
});

export const runPricingCatalogCli = async (argv) => {
  const { command, values } = parseArgs(argv);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    return { stdout: USAGE, exitCode: 0 };
  }

  if (command === "fetch-proposal") {
    const capture = await fetchOfficialSourceCapture({
      sourceUrl: requireOption(values, "url"),
    });
    const written = await writeOfficialSourceCapture({
      outputDirectory: requireOption(values, "out-dir"),
      capture,
    });
    return {
      stdout: JSON.stringify(
        {
          network_access: "explicit_offline_review_command",
          manifest_path: written.manifestPath,
          body_path: written.bodyPath,
          source_digest: capture.manifest.body_sha256,
          capture_digest: capture.manifest.capture_sha256,
        },
        null,
        2,
      ),
      exitCode: 0,
    };
  }

  if (command === "sign") {
    const payloadPath = requireOption(values, "payload");
    const privateKeyPath = requireOption(values, "private-key");
    await assertPrivateKeyFileIsRestricted(privateKeyPath);
    const payload = validateCatalogPayload(
      await loadStrictJsonFile(payloadPath, "catalog_payload_file"),
    );
    const captures = await Promise.all(
      requireOptions(values, "capture-manifest").map((manifestPath) =>
        loadOfficialSourceCapture({ manifestPath }),
      ),
    );
    if (captures.length !== payload.sources.length) {
      throw new Error("capture manifest count must equal catalog source count");
    }
    const unmatchedCaptures = [...captures];
    for (const source of payload.sources) {
      const matchIndex = unmatchedCaptures.findIndex(
        ({ manifest }) =>
          manifest.provider === source.provider &&
          manifest.final_url === source.url &&
          manifest.retrieved_at === source.retrieved_at &&
          manifest.body_sha256 === source.source_digest,
      );
      if (matchIndex === -1) {
        throw new Error("catalog source is not bound to a verified capture manifest and body digest");
      }
      unmatchedCaptures.splice(matchIndex, 1);
    }
    const privateKeyPem = await fs.readFile(privateKeyPath, "utf8");
    const privateKey = crypto.createPrivateKey(privateKeyPem);
    if (privateKey.asymmetricKeyType !== "ed25519") {
      throw new Error("private key must be Ed25519");
    }
    const envelope = signCatalog(payload, {
      privateKeyPem,
      keyId: requireOption(values, "key-id"),
    });
    await writeJson(requireOption(values, "out"), envelope, { force: Boolean(values.force) });
    return {
      stdout: JSON.stringify(
        {
          signed: true,
          catalog_version: payload.catalog_version,
          payload_sha256: envelope.payload_sha256,
          key_id: envelope.signature.key_id,
        },
        null,
        2,
      ),
      exitCode: 0,
    };
  }

  if (command === "verify" || command === "inspect") {
    const verified = await loadVerifiedCatalogFile({
      catalogPath: requireOption(values, "catalog"),
      trustStorePath: requireOption(values, "trust-store"),
    });
    const result = publicSummary(verified);
    if (command === "inspect") {
      result.sources = verified.payload.sources;
      result.entries = verified.payload.entries;
    }
    return { stdout: JSON.stringify(result, null, 2), exitCode: 0 };
  }

  if (command === "project") {
    const verified = await loadVerifiedCatalogFile({
      catalogPath: requireOption(values, "catalog"),
      trustStorePath: requireOption(values, "trust-store"),
    });
    const projection = buildVerifiedCatalogProjection(verified);
    await writeJson(requireOption(values, "out"), projection, { force: Boolean(values.force) });
    return {
      stdout: JSON.stringify(pricingProjectionSummary(projection), null, 2),
      exitCode: 0,
    };
  }

  if (command === "inspect-projection") {
    const projection = await loadPinnedProjectionFile({
      projectionPath: requireOption(values, "projection"),
      expectedProjectionSha256: requireOption(values, "sha256"),
    });
    return {
      stdout: JSON.stringify(pricingProjectionSummary(projection), null, 2),
      exitCode: 0,
    };
  }

  throw new Error(`unknown command: ${command}`);
};

const isDirectInvocation =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectInvocation) {
  runPricingCatalogCli(process.argv.slice(2))
    .then(({ stdout, exitCode }) => {
      if (stdout) process.stdout.write(`${stdout}\n`);
      process.exitCode = exitCode;
    })
    .catch((error) => {
      process.stderr.write(`${error?.stack || error}\n\n${USAGE}\n`);
      process.exitCode = 1;
    });
}
