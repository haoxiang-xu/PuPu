const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");
const { Readable } = require("stream");
const {
  createSkillRepoDownloader,
  SKILL_REPO_LIMITS,
} = require("../../main/services/runtime/skill_repo_download");

/* ── in-memory USTAR fixture builder (byte-level control over every gate) ── */
const TYPE = {
  FILE: "0",
  DIRECTORY: "5",
  SYMLINK: "2",
  HARDLINK: "1",
  CHARDEV: "3",
};

const ustar = (name, body = "", { type = TYPE.FILE, linkname = "" } = {}) => {
  const data = Buffer.from(body);
  const header = Buffer.alloc(512);
  header.write(name.slice(0, 100), 0, "utf8");
  header.write("0000644\0", 100); // mode
  header.write("0000000\0", 108); // uid
  header.write("0000000\0", 116); // gid
  header.write(data.length.toString(8).padStart(11, "0") + "\0", 124); // size
  header.write("00000000000\0", 136); // mtime
  header.write("        ", 148); // checksum placeholder (8 spaces)
  header.write(type, 156); // typeflag
  if (linkname) header.write(linkname.slice(0, 100), 157, "utf8");
  header.write("ustar\0", 257);
  header.write("00", 263);
  let sum = 0;
  for (let i = 0; i < 512; i += 1) sum += header[i];
  header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148);
  const pad = Buffer.alloc((512 - (data.length % 512)) % 512);
  return Buffer.concat([header, data, pad]);
};

const buildTarball = (entries) =>
  Buffer.concat([
    ...entries.map((e) =>
      ustar(e.name, e.body || "", { type: e.type, linkname: e.linkname }),
    ),
    Buffer.alloc(1024), // two zero blocks terminate the archive
  ]);

const gzip = (buffer) => zlib.gzipSync(buffer);
const sha256 = (body) =>
  crypto.createHash("sha256").update(Buffer.from(body)).digest("hex");

/* A fetch mock that streams a Node Readable body (no network). */
const makeFetch = ({
  status = 200,
  contentLength = null,
  gzipBuffer = null,
  throwError = null,
  onCall = null,
} = {}) => {
  return async (url, options) => {
    if (onCall) onCall(url, options);
    if (throwError) throw throwError;
    return {
      status,
      headers: {
        get: (key) =>
          key.toLowerCase() === "content-length" && contentLength != null
            ? String(contentLength)
            : null,
      },
      body: gzipBuffer ? Readable.from([gzipBuffer]) : Readable.from([]),
    };
  };
};

const VALID_REPO = "obra/superpowers";
const VALID_SHA = "a".repeat(40);

let tempRoot;
const makeDownloader = (overrides = {}) =>
  createSkillRepoDownloader({
    fs,
    path,
    zlib,
    tar: require("tar"),
    crypto,
    getTempDir: () => tempRoot,
    fetchImpl: overrides.fetchImpl,
    limits: overrides.limits || SKILL_REPO_LIMITS,
    generateUuid: overrides.generateUuid,
    scheduleTimeout: overrides.scheduleTimeout,
    cancelTimeout: overrides.cancelTimeout,
  });

const withLimits = (over) => Object.freeze({ ...SKILL_REPO_LIMITS, ...over });

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-s6a-test-"));
});
afterEach(() => {
  try {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

const leftoverDirs = () =>
  fs
    .readdirSync(tempRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith("pupu-skillpack-"))
    .map((d) => d.name);

describe("skill repo download — payload validation (invalid_payload)", () => {
  const cases = {
    null: null,
    "missing repo": { sha: VALID_SHA, manifest: [{ path: "a.md", sha256: sha256("x") }] },
    "bad repo regex": { repo: "not a repo", sha: VALID_SHA, manifest: [{ path: "a.md", sha256: sha256("x") }] },
    "repo with slash injection": { repo: "a/b/c", sha: VALID_SHA, manifest: [{ path: "a.md", sha256: sha256("x") }] },
    "bad sha": { repo: VALID_REPO, sha: "xyz", manifest: [{ path: "a.md", sha256: sha256("x") }] },
    "empty manifest": { repo: VALID_REPO, sha: VALID_SHA, manifest: [] },
    "manifest bad sha256": { repo: VALID_REPO, sha: VALID_SHA, manifest: [{ path: "a.md", sha256: "nope" }] },
    "manifest absolute path": { repo: VALID_REPO, sha: VALID_SHA, manifest: [{ path: "/etc/a.md", sha256: sha256("x") }] },
    "manifest dotdot path": { repo: VALID_REPO, sha: VALID_SHA, manifest: [{ path: "../a.md", sha256: sha256("x") }] },
    "manifest control char path": { repo: VALID_REPO, sha: VALID_SHA, manifest: [{ path: "a" + String.fromCharCode(1) + "b.md", sha256: sha256("x") }] },
    "manifest non-md path": { repo: VALID_REPO, sha: VALID_SHA, manifest: [{ path: "skills/a/run.sh", sha256: sha256("x") }] },
    "manifest too deep": {
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [{ path: Array(14).fill("d").join("/") + "/a.md", sha256: sha256("x") }],
    },
  };

  Object.entries(cases).forEach(([label, payload]) => {
    test(`rejects: ${label}`, async () => {
      const downloader = makeDownloader({ fetchImpl: makeFetch() });
      const result = await downloader.downloadSkillRepo(payload);
      expect(result).toEqual({ ok: false, error: "invalid_payload" });
    });
  });
});

describe("skill repo download — network gates", () => {
  test("only ever fetches the codeload URL with redirect:error", async () => {
    let seenUrl = null;
    let seenOptions = null;
    const tarball = buildTarball([
      { name: "pkg/skills/a/SKILL.md", body: "hi" },
    ]);
    const downloader = makeDownloader({
      fetchImpl: makeFetch({
        gzipBuffer: gzip(tarball),
        onCall: (url, options) => {
          seenUrl = url;
          seenOptions = options;
        },
      }),
    });
    await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [{ path: "skills/a/SKILL.md", sha256: sha256("hi") }],
    });
    expect(seenUrl).toBe(
      `https://codeload.github.com/${VALID_REPO}/tar.gz/${VALID_SHA}`,
    );
    expect(seenOptions.redirect).toBe("error");
    expect(seenOptions.signal).toBeDefined();
  });

  test("404 → not_found", async () => {
    const downloader = makeDownloader({ fetchImpl: makeFetch({ status: 404 }) });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [{ path: "a.md", sha256: sha256("x") }],
    });
    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  test("non-200 → network", async () => {
    const downloader = makeDownloader({ fetchImpl: makeFetch({ status: 500 }) });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [{ path: "a.md", sha256: sha256("x") }],
    });
    expect(result).toEqual({ ok: false, error: "network" });
  });

  test("fetch throws (non-abort) → network", async () => {
    const downloader = makeDownloader({
      fetchImpl: makeFetch({ throwError: new Error("ECONNREFUSED") }),
    });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [{ path: "a.md", sha256: sha256("x") }],
    });
    expect(result).toEqual({ ok: false, error: "network" });
  });

  test("redirect rejection surfaces as network", async () => {
    // fetch with redirect:'error' rejects with a TypeError on redirect.
    const downloader = makeDownloader({
      fetchImpl: makeFetch({
        throwError: new TypeError("fetch failed: unexpected redirect"),
      }),
    });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [{ path: "a.md", sha256: sha256("x") }],
    });
    expect(result).toEqual({ ok: false, error: "network" });
  });
});

describe("skill repo download — timeout gate", () => {
  test("AbortError from fetch → timeout", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    const downloader = makeDownloader({
      fetchImpl: makeFetch({ throwError: abortErr }),
    });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [{ path: "a.md", sha256: sha256("x") }],
    });
    expect(result).toEqual({ ok: false, error: "timeout" });
  });

  test("download watchdog fires → aborts fetch → timeout", async () => {
    // scheduleTimeout fires the download (60s) callback synchronously; the
    // fetch mock observes the aborted signal and rejects.
    const downloader = makeDownloader({
      scheduleTimeout: (fn, ms) => {
        if (ms === SKILL_REPO_LIMITS.DOWNLOAD_TIMEOUT_MS) fn();
        return 0;
      },
      cancelTimeout: () => {},
      fetchImpl: async (_url, options) => {
        if (options.signal && options.signal.aborted) {
          const err = new Error("aborted");
          err.name = "AbortError";
          throw err;
        }
        return { status: 200, headers: { get: () => null }, body: Readable.from([]) };
      },
    });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [{ path: "a.md", sha256: sha256("x") }],
    });
    expect(result).toEqual({ ok: false, error: "timeout" });
  });
});

describe("skill repo download — size / bomb gates", () => {
  test("Content-Length over cap → too_large (before download)", async () => {
    const downloader = makeDownloader({
      fetchImpl: makeFetch({
        contentLength: SKILL_REPO_LIMITS.MAX_COMPRESSED_BYTES + 1,
        gzipBuffer: gzip(buildTarball([{ name: "pkg/a.md", body: "x" }])),
      }),
    });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [{ path: "a.md", sha256: sha256("x") }],
    });
    expect(result).toEqual({ ok: false, error: "too_large" });
  });

  test("streamed compressed body over cap → too_large", async () => {
    const tarball = buildTarball([{ name: "pkg/skills/a/SKILL.md", body: "hello" }]);
    const downloader = makeDownloader({
      limits: withLimits({ MAX_COMPRESSED_BYTES: 10 }),
      fetchImpl: makeFetch({ gzipBuffer: gzip(tarball) }),
    });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [{ path: "skills/a/SKILL.md", sha256: sha256("hello") }],
    });
    expect(result).toEqual({ ok: false, error: "too_large" });
  });

  test("gunzip output over cap → too_large (decompress bomb)", async () => {
    const big = "z".repeat(4096);
    const tarball = buildTarball([{ name: "pkg/skills/a/SKILL.md", body: big }]);
    const downloader = makeDownloader({
      limits: withLimits({ MAX_DECOMPRESSED_BYTES: 100 }),
      fetchImpl: makeFetch({ gzipBuffer: gzip(tarball) }),
    });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [{ path: "skills/a/SKILL.md", sha256: sha256(big) }],
    });
    expect(result).toEqual({ ok: false, error: "too_large" });
  });

  test("entry count over cap → too_large", async () => {
    const tarball = buildTarball([
      { name: "pkg/skills/a/SKILL.md", body: "a" },
      { name: "pkg/skills/b/SKILL.md", body: "b" },
      { name: "pkg/skills/c/SKILL.md", body: "c" },
    ]);
    const downloader = makeDownloader({
      limits: withLimits({ MAX_ENTRIES: 1 }),
      fetchImpl: makeFetch({ gzipBuffer: gzip(tarball) }),
    });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [{ path: "skills/a/SKILL.md", sha256: sha256("a") }],
    });
    expect(result).toEqual({ ok: false, error: "too_large" });
  });

  test("single file over per-file cap → too_large", async () => {
    const body = "y".repeat(2048);
    const tarball = buildTarball([{ name: "pkg/skills/a/SKILL.md", body }]);
    const downloader = makeDownloader({
      limits: withLimits({ MAX_FILE_BYTES: 100 }),
      fetchImpl: makeFetch({ gzipBuffer: gzip(tarball) }),
    });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [{ path: "skills/a/SKILL.md", sha256: sha256(body) }],
    });
    expect(result).toEqual({ ok: false, error: "too_large" });
  });

  test("total retained over cap → too_large", async () => {
    const a = "a".repeat(400);
    const b = "b".repeat(400);
    const tarball = buildTarball([
      { name: "pkg/skills/a/SKILL.md", body: a },
      { name: "pkg/skills/b/SKILL.md", body: b },
    ]);
    const downloader = makeDownloader({
      limits: withLimits({ MAX_TOTAL_RETAINED_BYTES: 500 }),
      fetchImpl: makeFetch({ gzipBuffer: gzip(tarball) }),
    });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [
        { path: "skills/a/SKILL.md", sha256: sha256(a) },
        { path: "skills/b/SKILL.md", sha256: sha256(b) },
      ],
    });
    expect(result).toEqual({ ok: false, error: "too_large" });
  });
});

describe("skill repo download — path / link gates", () => {
  test("symlink AT a manifest path → malformed (abort)", async () => {
    const tarball = buildTarball([
      {
        name: "pkg/skills/a/SKILL.md",
        type: TYPE.SYMLINK,
        linkname: "../../../../etc/passwd",
      },
    ]);
    const downloader = makeDownloader({
      fetchImpl: makeFetch({ gzipBuffer: gzip(tarball) }),
    });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [{ path: "skills/a/SKILL.md", sha256: sha256("whatever") }],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("malformed");
    expect(leftoverDirs()).toEqual([]);
  });

  test("hardlink AT a manifest path → malformed (abort)", async () => {
    const tarball = buildTarball([
      {
        name: "pkg/skills/a/SKILL.md",
        type: TYPE.HARDLINK,
        linkname: "pkg/other",
      },
    ]);
    const downloader = makeDownloader({
      fetchImpl: makeFetch({ gzipBuffer: gzip(tarball) }),
    });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [{ path: "skills/a/SKILL.md", sha256: sha256("x") }],
    });
    expect(result.error).toBe("malformed");
  });

  test("symlink OUTSIDE manifest is skipped; manifest file still installs", async () => {
    const good = "clean skill body";
    const tarball = buildTarball([
      { name: "pkg/evil-link", type: TYPE.SYMLINK, linkname: "/etc/passwd" },
      { name: "pkg/skills/a/SKILL.md", body: good },
    ]);
    const downloader = makeDownloader({
      fetchImpl: makeFetch({ gzipBuffer: gzip(tarball) }),
    });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [{ path: "skills/a/SKILL.md", sha256: sha256(good) }],
    });
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(result.dir, "evil-link"))).toBe(false);
    expect(
      fs.readFileSync(path.join(result.dir, "skills/a/SKILL.md"), "utf8"),
    ).toBe(good);
  });

  test("dotdot entry OUTSIDE manifest is skipped, never written", async () => {
    const good = "safe";
    const tarball = buildTarball([
      { name: "pkg/../escape.md", body: "pwned" },
      { name: "pkg/skills/a/SKILL.md", body: good },
    ]);
    const downloader = makeDownloader({
      fetchImpl: makeFetch({ gzipBuffer: gzip(tarball) }),
    });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [{ path: "skills/a/SKILL.md", sha256: sha256(good) }],
    });
    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(path.dirname(tempRoot), "escape.md"))).toBe(false);
    expect(fs.existsSync(path.join(result.dir, "..", "escape.md"))).toBe(false);
  });
});

describe("skill repo download — integrity gate", () => {
  test("hash mismatch → integrity, carries FIRST failing path, no content", async () => {
    const tarball = buildTarball([
      { name: "pkg/skills/a/SKILL.md", body: "tampered A" },
      { name: "pkg/skills/b/SKILL.md", body: "B" },
    ]);
    const downloader = makeDownloader({
      fetchImpl: makeFetch({ gzipBuffer: gzip(tarball) }),
    });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [
        { path: "skills/a/SKILL.md", sha256: sha256("expected A") },
        { path: "skills/b/SKILL.md", sha256: sha256("B") },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("integrity");
    expect(result.path).toBe("skills/a/SKILL.md");
    expect(Object.keys(result).sort()).toEqual(["error", "ok", "path"]);
    expect(JSON.stringify(result)).not.toContain("tampered");
    expect(leftoverDirs()).toEqual([]);
  });

  test("manifest path missing from archive → integrity", async () => {
    const tarball = buildTarball([{ name: "pkg/skills/a/SKILL.md", body: "A" }]);
    const downloader = makeDownloader({
      fetchImpl: makeFetch({ gzipBuffer: gzip(tarball) }),
    });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [
        { path: "skills/a/SKILL.md", sha256: sha256("A") },
        { path: "skills/missing/SKILL.md", sha256: sha256("M") },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("integrity");
    expect(result.path).toBe("skills/missing/SKILL.md");
  });
});

describe("skill repo download — malformed archive gate", () => {
  test("non-gzip body → malformed", async () => {
    const downloader = makeDownloader({
      fetchImpl: makeFetch({ gzipBuffer: Buffer.from("this is not gzip") }),
    });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [{ path: "a.md", sha256: sha256("x") }],
    });
    expect(result).toEqual({ ok: false, error: "malformed" });
  });
});

describe("skill repo download — golden path", () => {
  test("writes only manifest .md files with correct content", async () => {
    const skillBody = "# Brainstorming\n\ncontent here";
    const otherBody = "not in manifest";
    const tarball = buildTarball([
      { name: "pkg/", type: TYPE.DIRECTORY },
      { name: "pkg/skills/", type: TYPE.DIRECTORY },
      { name: "pkg/skills/brainstorm/SKILL.md", body: skillBody },
      { name: "pkg/skills/brainstorm/other.md", body: otherBody }, // not manifest
      { name: "pkg/README.md", body: "readme" }, // not manifest
      { name: "pkg/skills/plan/SKILL.md", body: "plan body" },
    ]);
    const downloader = makeDownloader({
      fetchImpl: makeFetch({ gzipBuffer: gzip(tarball) }),
    });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [
        { path: "skills/brainstorm/SKILL.md", sha256: sha256(skillBody) },
        { path: "skills/plan/SKILL.md", sha256: sha256("plan body") },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.dir.startsWith(path.join(tempRoot, "pupu-skillpack-"))).toBe(true);
    expect(
      fs.readFileSync(path.join(result.dir, "skills/brainstorm/SKILL.md"), "utf8"),
    ).toBe(skillBody);
    expect(
      fs.readFileSync(path.join(result.dir, "skills/plan/SKILL.md"), "utf8"),
    ).toBe("plan body");
    // subset filter: non-manifest files NOT written.
    expect(
      fs.existsSync(path.join(result.dir, "skills/brainstorm/other.md")),
    ).toBe(false);
    expect(fs.existsSync(path.join(result.dir, "README.md"))).toBe(false);
    // success path intentionally leaves the dir for the renderer to consume.
    expect(leftoverDirs().length).toBe(1);
  });
});

describe("skill repo download — fs write failure fail-closed", () => {
  test("write error → fs, temp dir removed", async () => {
    const good = "body";
    const tarball = buildTarball([{ name: "pkg/skills/a/SKILL.md", body: good }]);
    const downloader = createSkillRepoDownloader({
      fs: {
        promises: {
          mkdir: fs.promises.mkdir.bind(fs.promises),
          writeFile: async () => {
            throw new Error("EACCES");
          },
          rm: fs.promises.rm.bind(fs.promises),
        },
        readdirSync: fs.readdirSync.bind(fs),
        rmSync: fs.rmSync.bind(fs),
      },
      path,
      zlib,
      tar: require("tar"),
      crypto,
      getTempDir: () => tempRoot,
      fetchImpl: makeFetch({ gzipBuffer: gzip(tarball) }),
    });
    const result = await downloader.downloadSkillRepo({
      repo: VALID_REPO,
      sha: VALID_SHA,
      manifest: [{ path: "skills/a/SKILL.md", sha256: sha256(good) }],
    });
    expect(result).toEqual({ ok: false, error: "fs" });
    expect(leftoverDirs()).toEqual([]);
  });
});

describe("skill repo download — startup sweep", () => {
  test("removes leftover pupu-skillpack-* dirs, keeps others", () => {
    const stale = path.join(tempRoot, "pupu-skillpack-old-uuid");
    const other = path.join(tempRoot, "some-other-dir");
    fs.mkdirSync(stale, { recursive: true });
    fs.writeFileSync(path.join(stale, "x.md"), "leftover");
    fs.mkdirSync(other, { recursive: true });

    const downloader = makeDownloader({ fetchImpl: makeFetch() });
    downloader.sweepLeftoverSkillpackDirs();

    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(other)).toBe(true);
  });

  test("sweep is safe when temp dir is unreadable", () => {
    const downloader = createSkillRepoDownloader({
      fs,
      path,
      getTempDir: () => path.join(tempRoot, "does-not-exist"),
      fetchImpl: makeFetch(),
    });
    expect(() => downloader.sweepLeftoverSkillpackDirs()).not.toThrow();
  });
});
