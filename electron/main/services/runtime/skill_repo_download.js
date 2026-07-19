/*
 * S6a — store one-click skill-pack install: download + parse-only extract of a
 * pinned GitHub repo tarball into a self-managed temp dir.
 *
 * Contract source of truth: docs/superpowers/specs/2026-07-18-s6-store-skillpack-install.md
 * (裁决 2/3/4 + 通道契约 r1.1). This module NEVER runs `tar.x` and never uses a
 * tar-internal path as an fs write path. Only manifest-hit .md files, verified by
 * sha256, are written under a fresh pupu-skillpack-<uuid>/ dir with self-built,
 * sanitized relative paths. Every failure is fail-closed: no partial extraction,
 * no leftover dir.
 *
 * Return shape (symmetric with runtimeService.scanSkillDir family):
 *   { ok: true, dir }              — success; renderer consumes dir via scanSkillDir
 *   { ok: false, error: <code> }   — code ∈ SKILL_REPO_ERROR_CODES
 *   integrity failures additionally carry { path } = FIRST mismatching relPath
 *   (no file content ever crosses the boundary on failure).
 */

const nodeStream = require("stream");

/* ── Hard limits: SINGLE FROZEN BLOCK. 改动须过 security。 ──────────────────
 * Every tar-bomb / path-escape / timeout ceiling lives here and nowhere else.
 * Changing any value requires a security review (spec 裁决 3 + r1.1 §5).
 */
const SKILL_REPO_LIMITS = Object.freeze({
  MAX_COMPRESSED_BYTES: 32 * 1024 * 1024, // 32 MiB downloaded compressed body
  MAX_DECOMPRESSED_BYTES: 256 * 1024 * 1024, // 256 MiB cumulative gunzip output
  MAX_ENTRIES: 10000, // tar entry count
  MAX_PATH_DEPTH: 12, // path segments after top-level strip
  MAX_SEGMENT_BYTES: 255, // per path segment
  MAX_FILE_BYTES: 256 * 1024, // per retained file
  MAX_TOTAL_RETAINED_BYTES: 8 * 1024 * 1024, // 8 MiB total retained
  DOWNLOAD_TIMEOUT_MS: 60000, // download watchdog
  TOTAL_TIMEOUT_MS: 180000, // whole download + extract watchdog
});

const SKILL_REPO_ERROR_CODES = Object.freeze([
  "invalid_payload",
  "network",
  "timeout",
  "not_found",
  "too_large",
  "malformed",
  "integrity",
  "fs",
]);

const CODELOAD_HOST = "codeload.github.com";
const REPO_RE = /^[\w.-]+\/[\w.-]+$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
// Reject NUL + C0 controls + DEL in any path (spec 裁决 3 path row).
const CONTROL_CHAR_RE = /[\x00-\x1f\x7f]/;

/* Internal signal carrying a frozen error code (+ optional first-fail path). */
class SkillRepoError extends Error {
  constructor(code, extra) {
    super(code);
    this.name = "SkillRepoError";
    this.code = code;
    this.extra = extra || null;
  }
}

const isAbortError = (error) =>
  !!error &&
  (error.name === "AbortError" ||
    error.code === "ABORT_ERR" ||
    error.code === "ERR_CANCELED");

/* Strip GitHub's single top-level `{repo}-{sha}/` prefix — zero assumption on the
 * exact name, just drop the first segment. Returns "" for the top dir itself. */
const stripTopLevel = (rawPath) => {
  const normalized = String(rawPath || "").replace(/\\/g, "/");
  const segments = normalized.split("/");
  segments.shift(); // drop top-level prefix dir
  return segments.join("/").replace(/\/+$/, "");
};

/* Sanitization for a stripped relative path (spec 裁决 3 path row). Rejects
 * absolute paths, `..`, control chars, over-deep, over-long segments. */
const isSafeRelPath = (relPath, limits) => {
  if (typeof relPath !== "string" || relPath.length === 0) return false;
  if (relPath.includes("\\")) return false;
  if (relPath.startsWith("/")) return false;
  if (/^[A-Za-z]:/.test(relPath)) return false;
  if (CONTROL_CHAR_RE.test(relPath)) return false;
  const segments = relPath.split("/");
  if (segments.length > limits.MAX_PATH_DEPTH) return false;
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") return false;
    if (Buffer.byteLength(segment, "utf8") > limits.MAX_SEGMENT_BYTES) {
      return false;
    }
  }
  return true;
};

const isPathWithin = (root, candidate, path) => {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
};

const createSkillRepoDownloader = (deps = {}) => {
  const {
    fs = require("fs"),
    path = require("path"),
    zlib = require("zlib"),
    tar = require("tar"),
    crypto = require("crypto"),
    getTempDir,
    fetchImpl = (...args) => globalThis.fetch(...args),
    generateUuid = () => require("crypto").randomUUID(),
    scheduleTimeout = (fn, ms) => setTimeout(fn, ms),
    cancelTimeout = (handle) => clearTimeout(handle),
    limits = SKILL_REPO_LIMITS,
  } = deps;

  const resolveTempDir = () =>
    typeof getTempDir === "function" ? getTempDir() : require("os").tmpdir();

  /* ── payload validation → invalid_payload ────────────────────────────── */
  const validatePayload = (payload) => {
    if (!payload || typeof payload !== "object") return null;
    const repo = payload.repo;
    const sha = payload.sha;
    const manifest = payload.manifest;
    if (typeof repo !== "string" || !REPO_RE.test(repo)) return null;
    if (typeof sha !== "string" || !SHA_RE.test(sha)) return null;
    if (!Array.isArray(manifest) || manifest.length === 0) return null;

    const manifestByPath = new Map();
    for (const entry of manifest) {
      if (!entry || typeof entry !== "object") return null;
      const relPath = entry.path;
      const sha256 = entry.sha256;
      if (typeof relPath !== "string" || typeof sha256 !== "string") return null;
      if (!SHA256_RE.test(sha256)) return null;
      // manifest paths must be safe AND .md-only (only .md is ever written).
      if (!isSafeRelPath(relPath, limits)) return null;
      if (!relPath.toLowerCase().endsWith(".md")) return null;
      if (manifestByPath.has(relPath)) return null; // no duplicates
      manifestByPath.set(relPath, sha256);
    }
    return {
      repo,
      sha,
      manifest,
      manifestByPath,
      manifestPaths: new Set(manifestByPath.keys()),
    };
  };

  const toNodeStream = (body) => {
    if (!body) throw new SkillRepoError("network");
    if (typeof body.pipe === "function") return body; // already a Node stream
    if (typeof nodeStream.Readable.fromWeb === "function") {
      return nodeStream.Readable.fromWeb(body);
    }
    throw new SkillRepoError("network");
  };

  /* ── streaming parse-only extract ────────────────────────────────────── */
  const extract = (nodeBody, validated) =>
    new Promise((resolve, reject) => {
      const { manifestByPath, manifestPaths } = validated;
      let compressed = 0;
      let decompressed = 0;
      let entryCount = 0;
      let totalRetained = 0;
      let settled = false;
      const retained = new Map(); // relPath -> Buffer (verified)

      const gunzip = zlib.createGunzip();
      const parser = new tar.Parser();

      const compressedGate = new nodeStream.Transform({
        transform(chunk, _enc, cb) {
          compressed += chunk.length;
          if (compressed > limits.MAX_COMPRESSED_BYTES) {
            cb(new SkillRepoError("too_large"));
            return;
          }
          cb(null, chunk);
        },
      });
      const decompressedGate = new nodeStream.Transform({
        transform(chunk, _enc, cb) {
          decompressed += chunk.length;
          if (decompressed > limits.MAX_DECOMPRESSED_BYTES) {
            cb(new SkillRepoError("too_large"));
            return;
          }
          cb(null, chunk);
        },
      });

      const settle = (error) => {
        if (settled) return;
        settled = true;
        try {
          nodeBody.destroy();
        } catch {
          /* ignore */
        }
        try {
          gunzip.destroy();
        } catch {
          /* ignore */
        }
        try {
          parser.destroy();
        } catch {
          /* ignore */
        }
        if (error) reject(error);
        else resolve(retained);
      };

      const abort = (codeOrError, extra) => {
        if (settled) return;
        const error =
          codeOrError instanceof SkillRepoError
            ? codeOrError
            : new SkillRepoError(codeOrError, extra);
        settle(error);
      };

      const onStreamError = (defaultCode) => (error) => {
        if (settled) return;
        if (error instanceof SkillRepoError) abort(error);
        else abort(defaultCode || "malformed");
      };

      const handleEntry = (entry) => {
        if (settled) {
          entry.resume();
          return;
        }
        entryCount += 1;
        if (entryCount > limits.MAX_ENTRIES) {
          abort("too_large");
          entry.resume();
          return;
        }

        const relPath = stripTopLevel(entry.path);
        if (!relPath) {
          entry.resume();
          return;
        }

        const type = entry.type;
        const isFile = type === "File";
        const isDir = type === "Directory";
        const inManifest = manifestPaths.has(relPath);

        // Non-regular, non-directory entries (symlink/hardlink/device/fifo):
        // manifest path → abort; otherwise skip. (spec 裁决 3 entry-type row)
        if (!isFile && !isDir) {
          if (inManifest) abort("malformed", { path: relPath });
          else entry.resume();
          return;
        }

        // Path-shape violations: manifest path → abort; otherwise skip.
        if (!isSafeRelPath(relPath, limits)) {
          if (inManifest) abort("malformed", { path: relPath });
          else entry.resume();
          return;
        }

        if (isDir) {
          entry.resume(); // we build our own dirs on write
          return;
        }

        // Regular file. Subset filter = manifest: only manifest hits retained.
        if (!inManifest) {
          entry.resume();
          return;
        }

        const chunks = [];
        let fileBytes = 0;
        entry.on("data", (chunk) => {
          if (settled) return;
          fileBytes += chunk.length;
          if (fileBytes > limits.MAX_FILE_BYTES) {
            abort("too_large", { path: relPath });
            return;
          }
          totalRetained += chunk.length;
          if (totalRetained > limits.MAX_TOTAL_RETAINED_BYTES) {
            abort("too_large");
            return;
          }
          chunks.push(chunk);
        });
        entry.on("end", () => {
          if (settled) return;
          const buffer = Buffer.concat(chunks);
          // Hash the RAW extracted bytes, zero normalization (r1.1 §4).
          const digest = crypto
            .createHash("sha256")
            .update(buffer)
            .digest("hex");
          if (digest !== manifestByPath.get(relPath)) {
            abort("integrity", { path: relPath });
            return;
          }
          retained.set(relPath, buffer);
        });
        entry.on("error", () => abort("malformed", { path: relPath }));
      };

      nodeBody.on("error", onStreamError("network"));
      compressedGate.on("error", onStreamError(null));
      gunzip.on("error", onStreamError("malformed"));
      decompressedGate.on("error", onStreamError(null));
      parser.on("error", onStreamError("malformed"));
      parser.on("entry", handleEntry);
      parser.on("end", () => {
        if (settled) return;
        // Coverage: every manifest path must have been retained & verified.
        for (const wanted of manifestPaths) {
          if (!retained.has(wanted)) {
            abort("integrity", { path: wanted });
            return;
          }
        }
        settle(null);
      });

      nodeBody
        .pipe(compressedGate)
        .pipe(gunzip)
        .pipe(decompressedGate)
        .pipe(parser);
    });

  /* ── write verified files under a fresh temp dir ─────────────────────── */
  const writeRetained = async (retained) => {
    const root = path.join(
      resolveTempDir(),
      `pupu-skillpack-${generateUuid()}`,
    );
    try {
      await fs.promises.mkdir(root, { recursive: true });
      for (const [relPath, buffer] of retained) {
        const segments = relPath.split("/").filter(Boolean);
        const dest = path.join(root, ...segments);
        if (!isPathWithin(root, path.resolve(dest), path)) {
          throw new SkillRepoError("fs");
        }
        await fs.promises.mkdir(path.dirname(dest), { recursive: true });
        await fs.promises.writeFile(dest, buffer);
      }
      return root;
    } catch (error) {
      try {
        await fs.promises.rm(root, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
      throw error;
    }
  };

  /* ── public: download one pinned repo tarball ────────────────────────── */
  const downloadSkillRepo = async (payload = {}) => {
    const validated = validatePayload(payload);
    if (!validated) return { ok: false, error: "invalid_payload" };

    const controller = new AbortController();
    let timedOut = false;
    let downloadTimer = null;
    let totalTimer = null;
    const clearTimers = () => {
      if (downloadTimer !== null) cancelTimeout(downloadTimer);
      if (totalTimer !== null) cancelTimeout(totalTimer);
      downloadTimer = null;
      totalTimer = null;
    };
    const fireTimeout = () => {
      timedOut = true;
      try {
        controller.abort();
      } catch {
        /* ignore */
      }
    };

    totalTimer = scheduleTimeout(fireTimeout, limits.TOTAL_TIMEOUT_MS);
    downloadTimer = scheduleTimeout(fireTimeout, limits.DOWNLOAD_TIMEOUT_MS);

    try {
      const url = `https://${CODELOAD_HOST}/${validated.repo}/tar.gz/${validated.sha}`;
      // Domain whitelist is hard-wired; url host is derived only from a
      // regex-validated repo/sha so it can never leave codeload.
      if (new URL(url).host !== CODELOAD_HOST) {
        return { ok: false, error: "invalid_payload" };
      }

      let response;
      try {
        response = await fetchImpl(url, {
          redirect: "error", // never follow redirects
          signal: controller.signal,
        });
      } catch (error) {
        if (timedOut || isAbortError(error)) return { ok: false, error: "timeout" };
        return { ok: false, error: "network" };
      }

      const status = Number(response && response.status);
      if (status === 404) return { ok: false, error: "not_found" };
      if (status !== 200) return { ok: false, error: "network" };

      const contentLength = response.headers && response.headers.get
        ? response.headers.get("content-length")
        : null;
      if (contentLength && Number(contentLength) > limits.MAX_COMPRESSED_BYTES) {
        try {
          controller.abort();
        } catch {
          /* ignore */
        }
        return { ok: false, error: "too_large" };
      }

      let retained;
      try {
        const nodeBody = toNodeStream(response.body);
        retained = await extract(nodeBody, validated);
      } catch (error) {
        try {
          controller.abort();
        } catch {
          /* ignore */
        }
        if (timedOut) return { ok: false, error: "timeout" };
        if (error instanceof SkillRepoError) {
          const out = { ok: false, error: error.code };
          if (error.code === "integrity" && error.extra && error.extra.path) {
            out.path = error.extra.path;
          }
          return out;
        }
        if (isAbortError(error)) return { ok: false, error: "timeout" };
        return { ok: false, error: "malformed" };
      }

      try {
        const dir = await writeRetained(retained);
        return { ok: true, dir };
      } catch {
        // fs write failed AFTER all gates; writeRetained already cleaned up.
        return { ok: false, error: "fs" };
      }
    } finally {
      clearTimers();
    }
  };

  /* ── startup sweep of leftover temp dirs ─────────────────────────────── */
  const sweepLeftoverSkillpackDirs = () => {
    try {
      const tmp = resolveTempDir();
      const entries = fs.readdirSync(tmp, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith("pupu-skillpack-")) {
          try {
            fs.rmSync(path.join(tmp, entry.name), {
              recursive: true,
              force: true,
            });
          } catch {
            /* best-effort */
          }
        }
      }
    } catch {
      /* temp dir unreadable — nothing to sweep */
    }
  };

  return {
    downloadSkillRepo,
    sweepLeftoverSkillpackDirs,
    SKILL_REPO_LIMITS: limits,
  };
};

module.exports = {
  createSkillRepoDownloader,
  SKILL_REPO_LIMITS,
  SKILL_REPO_ERROR_CODES,
};
