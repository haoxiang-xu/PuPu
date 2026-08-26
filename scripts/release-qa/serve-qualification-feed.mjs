import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { verifyQualificationFeedDirectory } from "./build-qualification-feed.mjs";
import { readJson, readReleaseArtifactContract } from "./release-artifact-manifest.mjs";

const LOOPBACK_HOST = "127.0.0.1";
const ROOT = path.resolve(import.meta.dirname, "../..");

const contentTypeFor = (name) => {
  if (name.endsWith(".yml")) return "application/x-yaml; charset=utf-8";
  if (name.endsWith(".zip")) return "application/zip";
  return "application/octet-stream";
};

const parseRange = (value, size) => {
  if (typeof value !== "string") return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) return false;
  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return false;
  let start;
  let end;
  if (rawStart) {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
  } else {
    const suffixLength = Number(rawEnd);
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) {
    return false;
  }
  return { start, end: Math.min(end, size - 1) };
};

const closeServer = (server) => new Promise((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
});

const startServer = (server, port) => new Promise((resolve, reject) => {
  const fail = (error) => {
    server.off("listening", succeed);
    reject(error);
  };
  const succeed = () => {
    server.off("error", fail);
    resolve();
  };
  server.once("error", fail);
  server.once("listening", succeed);
  server.listen({ host: LOOPBACK_HOST, port, exclusive: true });
});

export async function startQualificationFeedServer({ feedDir, manifest, contract, targetId, port = 0 }) {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new Error("qualification feed port must be an integer from 0 through 65535");
  }
  const feed = verifyQualificationFeedDirectory({ feedDir, manifest, contract, targetId });
  const directory = path.resolve(feedDir);
  const allowedFiles = new Set([
    feed.metadata.name,
    feed.payload.name,
    feed.blockmap.name,
    "qualification-feed.v1.json",
  ]);
  const requests = [];

  const server = http.createServer((request, response) => {
    const method = request.method || "";
    const rawUrl = request.url || "/";
    const pathname = new URL(rawUrl, `http://${LOOPBACK_HOST}`).pathname;
    const requestedName = decodeURIComponent(pathname.slice(1));
    const requestRecord = { method, pathname, status: 500 };
    requests.push(requestRecord);
    const finish = (status, headers = {}) => {
      requestRecord.status = status;
      response.writeHead(status, {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...headers,
      });
    };

    if (method !== "GET" && method !== "HEAD") {
      finish(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }
    if (!requestedName || requestedName.includes("/") || requestedName.includes("\\") || !allowedFiles.has(requestedName)) {
      finish(404);
      response.end();
      return;
    }

    const filePath = path.join(directory, requestedName);
    const size = fs.statSync(filePath).size;
    const range = parseRange(request.headers.range, size);
    if (range === false) {
      finish(416, { "Content-Range": `bytes */${size}` });
      response.end();
      return;
    }
    const start = range?.start ?? 0;
    const end = range?.end ?? size - 1;
    const contentLength = end - start + 1;
    const headers = {
      "Accept-Ranges": "bytes",
      "Content-Length": contentLength,
      "Content-Type": contentTypeFor(requestedName),
      ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}),
    };
    finish(range ? 206 : 200, headers);
    if (method === "HEAD") {
      response.end();
      return;
    }
    const stream = fs.createReadStream(filePath, { start, end });
    stream.on("error", () => {
      if (!response.headersSent) finish(500);
      response.end();
    });
    stream.pipe(response);
  });

  await startServer(server, port);
  const address = server.address();
  if (!address || typeof address === "string" || address.address !== LOOPBACK_HOST) {
    await closeServer(server);
    throw new Error("qualification feed must bind exactly to 127.0.0.1");
  }
  return {
    feed,
    requests,
    url: `http://${LOOPBACK_HOST}:${address.port}`,
    close: () => closeServer(server),
  };
}

export function buildQualificationFeedServerLog({ feed, url, requests }) {
  if (!feed || !Array.isArray(requests) || typeof url !== "string" || !url.startsWith(`http://${LOOPBACK_HOST}:`)) {
    throw new Error("qualification feed server log requires an active loopback server");
  }
  return {
    schema: "pupu.qualification-feed-server.v1",
    transport: "runner-loopback",
    target_id: feed.target_id,
    candidate_manifest_digest: feed.candidate_manifest_digest,
    url,
    requests: requests.map(({ method, pathname, status }) => ({ method, pathname, status })),
  };
}

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`invalid argument near ${key || "(end)"}`);
    }
    args[key.slice(2)] = value;
    index += 1;
  }
  for (const key of ["candidate-dir", "feed-dir", "target", "ready-file", "request-log"]) {
    if (!args[key]) throw new Error(`--${key} is required`);
  }
  return args;
};

const writeNewJson = (outputPath, value, label) => {
  const output = path.resolve(outputPath);
  if (fs.existsSync(output)) throw new Error(`${label} output must not already exist`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const waitForShutdown = () => new Promise((resolve) => {
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    resolve();
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
});

const modulePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  let server;
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
    const candidateDir = path.resolve(args["candidate-dir"]);
    const manifest = readJson(path.join(candidateDir, "release-assets.v1.json"));
    const contract = readReleaseArtifactContract(path.join(ROOT, "contracts/release/release-artifact-contract.v1.json"));
    server = await startQualificationFeedServer({
      feedDir: args["feed-dir"],
      manifest,
      contract,
      targetId: args.target,
    });
    writeNewJson(args["ready-file"], {
      schema: "pupu.qualification-feed-server-ready.v1",
      target_id: server.feed.target_id,
      candidate_manifest_digest: server.feed.candidate_manifest_digest,
      transport: "runner-loopback",
      url: server.url,
    }, "qualification feed ready");
    console.log(`[qualification-feed] listening at ${server.url}`);
    await waitForShutdown();
  } catch (error) {
    console.error(`[qualification-feed] ${error.message || String(error)}`);
    process.exitCode = 1;
  } finally {
    if (server) {
      try {
        await server.close();
        writeNewJson(args["request-log"], buildQualificationFeedServerLog(server), "qualification feed request log");
      } catch (error) {
        console.error(`[qualification-feed] ${error.message || String(error)}`);
        process.exitCode = 1;
      }
    }
  }
}
