import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import YAML from "yaml";

import { buildQualificationFeed } from "./build-qualification-feed.mjs";
import { buildQualificationFeedServerLog, startQualificationFeedServer } from "./serve-qualification-feed.mjs";
import { assertFeedRequests } from "./run-restart-update-qualification.mjs";
import {
  buildReleaseAssetManifest,
  expectedTargetAssets,
  hashFileSha512,
  readReleaseArtifactContract,
} from "./release-artifact-manifest.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const CONTRACT = readReleaseArtifactContract(path.join(ROOT, "docs/contracts/release/release-artifact-contract.v1.json"));
const VERSION = "0.1.10";
const digest = (character) => `sha256:${character.repeat(64)}`;

const fixture = ({ payloadBytes = 0 } = {}) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-loopback-feed-"));
  const candidateDir = path.join(root, "candidate");
  const assetDir = path.join(candidateDir, "assets");
  fs.mkdirSync(assetDir, { recursive: true });
  for (const asset of expectedTargetAssets(CONTRACT, VERSION)) {
    fs.writeFileSync(path.join(assetDir, asset.name), payloadBytes && asset.name.endsWith(".exe")
      ? Buffer.alloc(payloadBytes, 42) : `${asset.name}\n`);
  }
  const writeMetadata = (name, payloadNames, primaryName) => {
    const files = payloadNames.map((payloadName) => ({
      url: payloadName,
      sha512: hashFileSha512(path.join(assetDir, payloadName)),
      size: fs.statSync(path.join(assetDir, payloadName)).size,
    }));
    const primary = files.find((file) => file.url === primaryName);
    fs.writeFileSync(path.join(assetDir, name), YAML.stringify({
      version: VERSION,
      files,
      path: primaryName,
      sha512: primary.sha512,
    }), "utf8");
  };
  writeMetadata("latest-mac.yml", [
    "PuPu-0.1.10-macos-arm64.zip",
    "PuPu-0.1.10-macos-x64.zip",
  ], "PuPu-0.1.10-macos-x64.zip");
  writeMetadata("latest.yml", ["PuPu-0.1.10-windows-x64-setup.exe"], "PuPu-0.1.10-windows-x64-setup.exe");
  const manifest = buildReleaseAssetManifest({
    contract: CONTRACT,
    assetDir,
    tag: "v0.1.10",
    version: VERSION,
    commit: "a".repeat(40),
    candidateRunId: "12345",
    unchain: {
      artifact_sha256: digest("a"),
      runtime_manifest_digest: digest("b"),
      source_revision: "c".repeat(40),
    },
  });
  fs.writeFileSync(path.join(candidateDir, "release-assets.v1.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { candidateDir, manifest, root };
};

test("qualification feed listens only on loopback and serves exactly sealed updater files", async () => {
  const { root, candidateDir, manifest } = fixture();
  let server;
  try {
    const feedDir = path.join(root, "feed");
    const feed = buildQualificationFeed({ candidateDir, outDir: feedDir, targetId: "windows-x64", contract: CONTRACT });
    server = await startQualificationFeedServer({ feedDir, manifest, contract: CONTRACT, targetId: "windows-x64" });
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+$/);

    const metadata = await fetch(`${server.url}/latest.yml?noCache=one`);
    assert.equal(metadata.status, 200);
    assert.equal(await metadata.text(), fs.readFileSync(path.join(feedDir, feed.metadata.name), "utf8"));
    const range = await fetch(`${server.url}/${feed.payload.name}`, { headers: { Range: "bytes=0-3" } });
    assert.equal(range.status, 206);
    assert.equal(range.headers.get("content-range"), `bytes 0-3/${fs.statSync(path.join(feedDir, feed.payload.name)).size}`);
    assert.equal((await range.arrayBuffer()).byteLength, 4);

    assert.equal((await fetch(`${server.url}/`)).status, 404);
    assert.equal((await fetch(`${server.url}/../release-assets.v1.json`)).status, 404);
    assert.equal((await fetch(`${server.url}/latest.yml`, { method: "POST" })).status, 405);
    assert.deepEqual(server.requests.map(({ method, pathname, status }) => ({ method, pathname, status })), [
      { method: "GET", pathname: "/latest.yml", status: 200 },
      { method: "GET", pathname: `/${feed.payload.name}`, status: 206 },
      { method: "GET", pathname: "/", status: 404 },
      { method: "GET", pathname: "/release-assets.v1.json", status: 404 },
      { method: "POST", pathname: "/latest.yml", status: 405 },
    ]);
    assert.deepEqual(buildQualificationFeedServerLog(server), {
      schema: "pupu.qualification-feed-server.v1",
      transport: "runner-loopback",
      target_id: "windows-x64",
      candidate_manifest_digest: manifest.manifest_digest,
      url: server.url,
      requests: [
        { method: "GET", pathname: "/latest.yml", status: 200 },
        { method: "GET", pathname: `/${feed.payload.name}`, status: 206 },
        { method: "GET", pathname: "/", status: 404 },
        { method: "GET", pathname: "/release-assets.v1.json", status: 404 },
        { method: "POST", pathname: "/latest.yml", status: 405 },
      ],
    });
  } finally {
    await server?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("qualification feed accepts a predeclared loopback port for a signed N-1 fixture", async () => {
  const { root, candidateDir, manifest } = fixture();
  let server;
  try {
    const feedDir = path.join(root, "feed");
    buildQualificationFeed({ candidateDir, outDir: feedDir, targetId: "windows-x64", contract: CONTRACT });
    server = await startQualificationFeedServer({
      feedDir,
      manifest,
      contract: CONTRACT,
      targetId: "windows-x64",
      port: 38191,
    });
    assert.equal(server.url, "http://127.0.0.1:38191");
  } finally {
    await server?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("real sealed HTTP feed admits only the old blockmap miss followed by full payload", async () => {
  const { root, candidateDir, manifest } = fixture();
  let server;
  try {
    const feedDir = path.join(root, "feed");
    buildQualificationFeed({ candidateDir, outDir: feedDir, targetId: "windows-x64", contract: CONTRACT });
    server = await startQualificationFeedServer({ feedDir, manifest, contract: CONTRACT, targetId: "windows-x64" });
    const get = async (name) => {
      const response = await fetch(`${server.url}/${name}`);
      await response.arrayBuffer();
      return response.status;
    };
    assert.equal(await get(server.feed.metadata.name), 200);
    assert.equal(await get(server.feed.blockmap.name), 200);
    assert.equal(await get("PuPu-0.1.9-windows-x64-setup.exe.blockmap"), 404);
    assert.equal(await get(server.feed.payload.name), 200);
    const admission = { targetId: "windows-x64", fromVersion: "0.1.9", contract: CONTRACT };
    assert.doesNotThrow(() => assertFeedRequests(server, admission));
    assert.equal(await get("unknown-file"), 404);
    assert.throws(() => assertFeedRequests(server, admission), /rejected request/);
  } finally {
    await server?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

for (const disconnect of [true, false]) {
  test(`feed releases actual file handles after ${disconnect ? "client abort" : "server shutdown with a paused client"}`, async (t) => {
    const { root, candidateDir, manifest } = fixture({ payloadBytes: 8 * 1024 * 1024 });
    let server;
    let request;
    let response;
    const streams = [];
    const original = fs.createReadStream;
    t.mock.method(fs, "createReadStream", (...args) => {
      const stream = original(...args);
      streams.push(stream);
      return stream;
    });
    const deadline = async (operation) => {
      let timer;
      try {
        return await Promise.race([operation, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("file handle teardown timed out")), 1500);
        })]);
      } finally {
        clearTimeout(timer);
      }
    };
    try {
      const feedDir = path.join(root, "feed");
      buildQualificationFeed({ candidateDir, outDir: feedDir, targetId: "windows-x64", contract: CONTRACT });
      server = await startQualificationFeedServer({ feedDir, manifest, contract: CONTRACT, targetId: "windows-x64" });
      await deadline(new Promise((resolve, reject) => {
        request = http.get(`${server.url}/${server.feed.payload.name}`, (incoming) => {
          response = incoming;
          incoming.on("error", () => {});
          incoming.once("data", () => { incoming.pause(); resolve(); });
        });
        request.on("error", reject);
      }));
      assert.equal(streams.length, 1);
      assert.equal(streams[0].closed, false);
      const closed = new Promise((resolve) => streams[0].once("close", resolve));
      if (disconnect) response.destroy();
      else await deadline(server.close());
      await deadline(closed);
      assert.equal(streams[0].closed, true);
      await deadline(server.close());
      // A completed close is safe to invoke again during layered cleanup.
      await deadline(server.close());
    } finally {
      response?.destroy();
      request?.destroy();
      await Promise.all(streams.map((stream) => new Promise((resolve) => {
        if (stream.closed) return resolve();
        stream.once("close", resolve);
        stream.destroy();
      })));
      await server?.close().catch(() => {});
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}
