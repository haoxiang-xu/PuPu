const path = require("path");
const os = require("os");
const fs = require("fs");
const crypto = require("crypto");

// node:sqlite is unavailable under some runtimes, and jest 27's resolver
// mangles `require("node:sqlite")`. process.getBuiltinModule bypasses it.
let sqlite = null;
try {
  sqlite = require("node:sqlite");
} catch (_error) {
  sqlite = null;
}
if (!sqlite && typeof process.getBuiltinModule === "function") {
  try {
    sqlite = process.getBuiltinModule("node:sqlite");
  } catch (_error) {
    sqlite = null;
  }
}

const describeIfSqlite = sqlite ? describe : describe.skip;

const {
  createSettingsStorageService,
  MCP_ICON_LIMITS,
  MCP_ICON_MIME_EXT,
} = require("../../main/services/settings_storage/service");

const makeTempDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "pupu-settings-mcp-icons-"));

const fakeApp = (userDataDir) => ({
  getPath: (key) => {
    if (key === "userData") return userDataDir;
    throw new Error(`unexpected app.getPath(${key})`);
  },
});

// Asserts fn throws an error carrying the given .code (jest 27-safe).
const expectThrowCode = (fn, code) => {
  let caught = null;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).not.toBeNull();
  expect(caught.code).toBe(code);
  // The code also rides the message behind the stable "[<code>] " prefix.
  expect(String(caught.message)).toContain(`[${code}] `);
  return caught;
};

const ICONS_DIR_SEGMENTS = ["assets", "mcp-icons"];
const iconsDirFor = (userDataDir) =>
  path.join(userDataDir, ...ICONS_DIR_SEGMENTS);

// "hello" as base64 — a tiny valid png-content payload.
const PNG_CONTENT = Buffer.from("hello", "utf8").toString("base64");
const SVG_CONTENT = "<svg><rect/></svg>";

const OWNER = "mcp.custom.local-test";
const OWNER_TYPE = "mcp_icon";

const startService = (userDataDir) => {
  const service = createSettingsStorageService({
    app: fakeApp(userDataDir),
    fs,
    path,
    sqlite,
  });
  service.init();
  return service;
};

// Direct read of asset_metadata rows for a settings.db (second connection; WAL
// allows it). Used to assert self-heal / no-dangling invariants at the SQL row
// level, and to craft hostile rows.
const openDb = (userDataDir) =>
  new sqlite.DatabaseSync(path.join(userDataDir, "settings.db"));

const rowsFor = (userDataDir) => {
  const db = openDb(userDataDir);
  try {
    return db
      .prepare(
        "SELECT owner_id, relative_path, mime_type, byte_size, sha256 " +
          "FROM asset_metadata WHERE owner_type = ?",
      )
      .all(OWNER_TYPE);
  } finally {
    db.close();
  }
};

describeIfSqlite("settings storage — custom MCP icon asset store", () => {
  let userDataDir;
  let service;

  beforeEach(() => {
    userDataDir = makeTempDir();
    service = startService(userDataDir);
  });

  afterEach(() => {
    try {
      service.close();
    } catch (_error) {
      // already closed
    }
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  test("mime → extension table is limited to png and svg", () => {
    expect(MCP_ICON_MIME_EXT).toEqual({
      "image/png": "png",
      "image/svg+xml": "svg",
    });
    expect(MCP_ICON_LIMITS.MAX_ENTRIES).toBe(100);
    expect(MCP_ICON_LIMITS.MAX_DECODED_BYTES).toBe(300_000);
  });

  test("asset_metadata table exists with the plan §3.6 shape", () => {
    const db = openDb(userDataDir);
    try {
      const info = db.prepare("PRAGMA table_info(asset_metadata)").all();
      const columns = info.map((c) => c.name).sort();
      expect(columns).toEqual(
        [
          "asset_id",
          "owner_type",
          "owner_id",
          "relative_path",
          "mime_type",
          "byte_size",
          "sha256",
          "updated_at",
        ].sort(),
      );
    } finally {
      db.close();
    }
  });

  test("stores and reads a png icon (content round-trips as base64)", () => {
    const result = service.setMcpIconAsset(OWNER, {
      mime: "image/png",
      content: PNG_CONTENT,
    });
    expect(result.ok).toBe(true);
    expect(result.byteSize).toBe(5);

    const read = service.getMcpIconAsset(OWNER);
    expect(read.icon).toEqual({ mime: "image/png", content: PNG_CONTENT });

    // A real file exists inside the assets directory.
    const rows = rowsFor(userDataDir);
    expect(rows).toHaveLength(1);
    const abs = path.join(iconsDirFor(userDataDir), rows[0].relative_path);
    expect(fs.existsSync(abs)).toBe(true);
    expect(fs.readFileSync(abs)).toEqual(Buffer.from("hello", "utf8"));
    expect(rows[0].mime_type).toBe("image/png");
  });

  test("stores and reads an svg icon (content round-trips as raw text)", () => {
    service.setMcpIconAsset("mcp.custom.svg", {
      mime: "image/svg+xml",
      content: SVG_CONTENT,
    });
    const read = service.getMcpIconAsset("mcp.custom.svg");
    expect(read.icon).toEqual({
      mime: "image/svg+xml",
      content: SVG_CONTENT,
    });
    // The on-disk file holds the raw svg text, NOT base64.
    const abs = path.join(
      iconsDirFor(userDataDir),
      rowsFor(userDataDir)[0].relative_path,
    );
    expect(fs.readFileSync(abs, "utf8")).toBe(SVG_CONTENT);
  });

  test("getMcpIconAsset returns null for an unknown / invalid id", () => {
    expect(service.getMcpIconAsset("mcp.custom.missing").icon).toBeNull();
    expect(service.getMcpIconAsset("").icon).toBeNull();
    expect(service.getMcpIconAsset(42).icon).toBeNull();
  });

  test("rejects an unsupported mime", () => {
    expectThrowCode(
      () =>
        service.setMcpIconAsset("mcp.custom.gif", {
          mime: "image/gif",
          content: PNG_CONTENT,
        }),
      "invalid_mcp_icon",
    );
    expect(rowsFor(userDataDir)).toHaveLength(0);
  });

  test("rejects undecodable png base64", () => {
    expectThrowCode(
      () =>
        service.setMcpIconAsset("mcp.custom.badb64", {
          mime: "image/png",
          content: "not*valid*base64",
        }),
      "invalid_mcp_icon",
    );
    expect(rowsFor(userDataDir)).toHaveLength(0);
  });

  test("rejects an invalid toolkit id", () => {
    expectThrowCode(
      () =>
        service.setMcpIconAsset("__proto__", {
          mime: "image/png",
          content: PNG_CONTENT,
        }),
      "invalid_mcp_icon",
    );
  });

  test("rejects an oversize icon (decoded bytes over the cap)", () => {
    const huge = "x".repeat(MCP_ICON_LIMITS.MAX_DECODED_BYTES + 1);
    expectThrowCode(
      () =>
        service.setMcpIconAsset("mcp.custom.huge", {
          mime: "image/svg+xml",
          content: huge,
        }),
      "mcp_icon_too_large",
    );
    expect(rowsFor(userDataDir)).toHaveLength(0);
    // No file left behind for a rejected write (the dir may not even exist,
    // since validation throws before the lazy mkdir).
    const dir = iconsDirFor(userDataDir);
    const leftover = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    expect(leftover).toHaveLength(0);
  });

  test("enforces the entry cap only for new owners", () => {
    const tiny = { mime: "image/png", content: PNG_CONTENT };
    for (let i = 0; i < MCP_ICON_LIMITS.MAX_ENTRIES; i += 1) {
      service.setMcpIconAsset(`mcp.custom.k${i}`, tiny);
    }
    expect(rowsFor(userDataDir)).toHaveLength(MCP_ICON_LIMITS.MAX_ENTRIES);
    // A new owner past the cap is rejected...
    expectThrowCode(
      () => service.setMcpIconAsset("mcp.custom.overflow", tiny),
      "mcp_icon_cap_reached",
    );
    // ...but replacing an existing owner still works.
    expect(
      service.setMcpIconAsset("mcp.custom.k0", {
        mime: "image/svg+xml",
        content: SVG_CONTENT,
      }).ok,
    ).toBe(true);
  });

  test("path traversal / hostile toolkit ids are neutralized into the assets dir", () => {
    const hostileIds = [
      "mcp.custom.../../../etc/passwd",
      "mcp.custom.../../evil",
      "mcp.custom./abs/path",
      "mcp.custom.%2e%2e%2fetc",
      "mcp.custom.a\\..\\..\\win",
    ];
    hostileIds.forEach((id, i) => {
      service.setMcpIconAsset(id, {
        mime: "image/png",
        content: PNG_CONTENT,
      });
      const row = rowsFor(userDataDir).find((r) => r.owner_id === id);
      expect(row).toBeDefined();
      const abs = path.resolve(
        iconsDirFor(userDataDir),
        row.relative_path,
      );
      // The resolved file must stay strictly inside the assets directory.
      const rel = path.relative(iconsDirFor(userDataDir), abs);
      expect(rel.startsWith("..")).toBe(false);
      expect(path.isAbsolute(rel)).toBe(false);
      expect(rel.includes(path.sep)).toBe(false); // flat filename, no subdirs
      expect(fs.existsSync(abs)).toBe(true);
      expect(i).toBeGreaterThanOrEqual(0);
    });
  });

  test("a hostile stored relative_path is rejected on read and self-heals", () => {
    // Craft a row whose relative_path escapes the dir (as if written by other
    // means), then read: the row is dropped, null returned, no file touched.
    const db = openDb(userDataDir);
    try {
      db.prepare(
        "INSERT INTO asset_metadata(asset_id, owner_type, owner_id, " +
          "relative_path, mime_type, byte_size, sha256, updated_at) " +
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        "hostile-asset",
        OWNER_TYPE,
        "mcp.custom.hostile",
        "../../escape.txt",
        "image/png",
        1,
        "deadbeef",
        Date.now(),
      );
    } finally {
      db.close();
    }
    expect(service.getMcpIconAsset("mcp.custom.hostile").icon).toBeNull();
    // Self-heal dropped the row.
    expect(
      rowsFor(userDataDir).find((r) => r.owner_id === "mcp.custom.hostile"),
    ).toBeUndefined();
  });

  test("duplicate content re-set is a stable in-place replacement (one row)", () => {
    const icon = { mime: "image/png", content: PNG_CONTENT };
    const first = service.setMcpIconAsset(OWNER, icon);
    const firstAbs = path.join(iconsDirFor(userDataDir), first.relativePath);
    const second = service.setMcpIconAsset(OWNER, icon);
    // Same content → same filename, same single row, file still present.
    expect(second.relativePath).toBe(first.relativePath);
    expect(rowsFor(userDataDir)).toHaveLength(1);
    expect(fs.existsSync(firstAbs)).toBe(true);
  });

  test("changing content deletes the old file (no orphan)", () => {
    const first = service.setMcpIconAsset(OWNER, {
      mime: "image/png",
      content: PNG_CONTENT,
    });
    const firstAbs = path.join(iconsDirFor(userDataDir), first.relativePath);
    expect(fs.existsSync(firstAbs)).toBe(true);

    const second = service.setMcpIconAsset(OWNER, {
      mime: "image/svg+xml",
      content: SVG_CONTENT,
    });
    const secondAbs = path.join(iconsDirFor(userDataDir), second.relativePath);
    expect(second.relativePath).not.toBe(first.relativePath);
    // Old file gone, new file present, still one row.
    expect(fs.existsSync(firstAbs)).toBe(false);
    expect(fs.existsSync(secondAbs)).toBe(true);
    expect(rowsFor(userDataDir)).toHaveLength(1);
  });

  test("delete removes the SQL row AND the file", () => {
    const set = service.setMcpIconAsset(OWNER, {
      mime: "image/png",
      content: PNG_CONTENT,
    });
    const abs = path.join(iconsDirFor(userDataDir), set.relativePath);
    expect(fs.existsSync(abs)).toBe(true);

    const del = service.deleteMcpIconAsset(OWNER);
    expect(del.deleted).toBe(true);
    expect(rowsFor(userDataDir)).toHaveLength(0);
    expect(fs.existsSync(abs)).toBe(false);
    // Deleting a missing owner is a no-op.
    expect(service.deleteMcpIconAsset(OWNER).deleted).toBe(false);
  });

  test("a missing file self-heals: the SQL row is dropped and null returned", () => {
    const set = service.setMcpIconAsset(OWNER, {
      mime: "image/png",
      content: PNG_CONTENT,
    });
    const abs = path.join(iconsDirFor(userDataDir), set.relativePath);
    fs.unlinkSync(abs); // simulate a lost file
    expect(service.getMcpIconAsset(OWNER).icon).toBeNull();
    expect(rowsFor(userDataDir)).toHaveLength(0);
  });

  test("listMcpIconOwners returns metadata for every owner (no content)", () => {
    service.setMcpIconAsset("mcp.custom.a", {
      mime: "image/png",
      content: PNG_CONTENT,
    });
    service.setMcpIconAsset("mcp.custom.b", {
      mime: "image/svg+xml",
      content: SVG_CONTENT,
    });
    const listed = service.listMcpIconOwners();
    expect(listed.ok).toBe(true);
    const ids = listed.owners.map((o) => o.toolkitId).sort();
    expect(ids).toEqual(["mcp.custom.a", "mcp.custom.b"]);
    listed.owners.forEach((o) => {
      expect(typeof o.mime).toBe("string");
      expect(typeof o.byteSize).toBe("number");
      expect(o.content).toBeUndefined(); // never carries content
    });
  });

  test("a file-write failure leaves no SQL row and no orphan file", () => {
    const dir = makeTempDir();
    const throwingFs = {
      ...fs,
      writeFileSync: () => {
        const err = new Error("disk full");
        err.code = "ENOSPC";
        throw err;
      },
    };
    const svc = createSettingsStorageService({
      app: fakeApp(dir),
      fs: throwingFs,
      path,
      sqlite,
    });
    svc.init();
    try {
      let caught = null;
      try {
        svc.setMcpIconAsset(OWNER, {
          mime: "image/png",
          content: PNG_CONTENT,
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).not.toBeNull();
      // No row committed (write happens before SQL).
      expect(rowsFor(dir)).toHaveLength(0);
    } finally {
      svc.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a SQL-write failure removes the just-written file (no dangling SQL, no orphan)", () => {
    const dir = makeTempDir();
    // sqlite proxy that throws on the asset_metadata INSERT run().
    const proxySqlite = {
      DatabaseSync: class {
        constructor(p) {
          this._db = new sqlite.DatabaseSync(p);
        }
        exec(sql) {
          return this._db.exec(sql);
        }
        prepare(sql) {
          const stmt = this._db.prepare(sql);
          if (sql.includes("INSERT INTO asset_metadata")) {
            return {
              run: () => {
                throw new Error("boom-sql");
              },
              get: (...a) => stmt.get(...a),
              all: (...a) => stmt.all(...a),
            };
          }
          return stmt;
        }
        close() {
          return this._db.close();
        }
      },
    };
    const svc = createSettingsStorageService({
      app: fakeApp(dir),
      fs,
      path,
      sqlite: proxySqlite,
    });
    svc.init();
    try {
      let caught = null;
      try {
        svc.setMcpIconAsset(OWNER, {
          mime: "image/png",
          content: PNG_CONTENT,
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).not.toBeNull();
      // The new file was cleaned up — assets dir holds no icon files.
      const iconsDir = iconsDirFor(dir);
      const leftover = fs.existsSync(iconsDir)
        ? fs.readdirSync(iconsDir)
        : [];
      expect(leftover).toHaveLength(0);
      // And no SQL row (rolled back).
      expect(rowsFor(dir)).toHaveLength(0);
    } finally {
      svc.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a SQL-write failure on an identical-content re-set keeps the existing file (no dangling row, icon preserved)", () => {
    const dir = makeTempDir();
    // Fail the asset_metadata upsert only on demand, so the first set can
    // succeed and the second (byte-identical) re-set can fail at SQL.
    let failInsert = false;
    const proxySqlite = {
      DatabaseSync: class {
        constructor(p) {
          this._db = new sqlite.DatabaseSync(p);
        }
        exec(sql) {
          return this._db.exec(sql);
        }
        prepare(sql) {
          const stmt = this._db.prepare(sql);
          if (sql.includes("INSERT INTO asset_metadata")) {
            return {
              run: (...a) => {
                if (failInsert) throw new Error("boom-sql");
                return stmt.run(...a);
              },
              get: (...a) => stmt.get(...a),
              all: (...a) => stmt.all(...a),
            };
          }
          return stmt;
        }
        close() {
          return this._db.close();
        }
      },
    };
    const svc = createSettingsStorageService({
      app: fakeApp(dir),
      fs,
      path,
      sqlite: proxySqlite,
    });
    svc.init();
    try {
      // First set succeeds: row + file F (deterministic filename).
      const set = svc.setMcpIconAsset(OWNER, {
        mime: "image/png",
        content: PNG_CONTENT,
      });
      const absF = path.join(iconsDirFor(dir), set.relativePath);
      expect(fs.existsSync(absF)).toBe(true);
      // Re-set byte-identical content (same filename F), now with the SQL
      // upsert failing. The rolled-back row still references F, so the failure
      // recovery must NOT unlink F.
      failInsert = true;
      let caught = null;
      try {
        svc.setMcpIconAsset(OWNER, { mime: "image/png", content: PNG_CONTENT });
      } catch (error) {
        caught = error;
      }
      expect(caught).not.toBeNull();
      failInsert = false;
      // The pre-existing file survived and the surviving row is not dangling.
      expect(fs.existsSync(absF)).toBe(true);
      expect(rowsFor(dir)).toHaveLength(1);
      // The icon is still readable (no self-heal to null / no data loss).
      expect(svc.getMcpIconAsset(OWNER).icon).toEqual({
        mime: "image/png",
        content: PNG_CONTENT,
      });
    } finally {
      svc.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // ---- migration -----------------------------------------------------------

  const iconsPayload = (icons, overrides = {}) => ({
    migrationVersion: 1,
    icons,
    ...overrides,
  });

  test("migrates png + svg icons and marks the state complete", () => {
    const result = service.migrateMcpIconsLegacy(
      iconsPayload({
        "mcp.custom.p": { mime: "image/png", content: PNG_CONTENT },
        "mcp.custom.s": { mime: "image/svg+xml", content: SVG_CONTENT },
      }),
    );
    expect(result.status).toBe("complete");
    expect(result.importedCount).toBe(2);
    expect(result.droppedEntries).toBe(0);

    expect(service.getMcpIconAsset("mcp.custom.p").icon).toEqual({
      mime: "image/png",
      content: PNG_CONTENT,
    });
    expect(service.getMcpIconAsset("mcp.custom.s").icon).toEqual({
      mime: "image/svg+xml",
      content: SVG_CONTENT,
    });

    // Meta rides the bootstrap snapshot.
    const snapshot = service.getBootstrapSnapshot();
    expect(snapshot.storeMigrations.mcpIcons.state).toBe("complete");
  });

  test("migration is idempotent on the same digest (already-complete, no dupes)", () => {
    const payload = iconsPayload({
      "mcp.custom.p": { mime: "image/png", content: PNG_CONTENT },
    });
    const first = service.migrateMcpIconsLegacy(payload);
    expect(first.status).toBe("complete");
    const second = service.migrateMcpIconsLegacy(payload);
    expect(second.status).toBe("already-complete");
    expect(rowsFor(userDataDir)).toHaveLength(1);
  });

  test("migration refuses a different (stale) digest after completion", () => {
    service.migrateMcpIconsLegacy(
      iconsPayload({
        "mcp.custom.p": { mime: "image/png", content: PNG_CONTENT },
      }),
    );
    const refused = service.migrateMcpIconsLegacy(
      iconsPayload({
        "mcp.custom.other": { mime: "image/png", content: PNG_CONTENT },
      }),
    );
    expect(refused.status).toBe("refused-stale-digest");
    // SQL authority is untouched.
    const ids = rowsFor(userDataDir).map((r) => r.owner_id);
    expect(ids).toEqual(["mcp.custom.p"]);
  });

  test("migration drops-and-counts invalid entries but imports valid ones", () => {
    const result = service.migrateMcpIconsLegacy(
      iconsPayload({
        "mcp.custom.ok": { mime: "image/png", content: PNG_CONTENT },
        "mcp.custom.badmime": { mime: "image/gif", content: PNG_CONTENT },
        "mcp.custom.baddata": { mime: "image/png", content: "***" },
        "mcp.custom.huge": {
          mime: "image/svg+xml",
          content: "x".repeat(MCP_ICON_LIMITS.MAX_DECODED_BYTES + 1),
        },
        __proto__: { mime: "image/png", content: PNG_CONTENT },
      }),
    );
    expect(result.status).toBe("complete");
    expect(result.importedCount).toBe(1);
    expect(result.droppedEntries).toBeGreaterThanOrEqual(3);
    expect(rowsFor(userDataDir).map((r) => r.owner_id)).toEqual([
      "mcp.custom.ok",
    ]);
  });

  test("migration rejects an unsupported version and a bad payload", () => {
    expectThrowCode(
      () => service.migrateMcpIconsLegacy(iconsPayload({}, { migrationVersion: 2 })),
      "unsupported_migration_version",
    );
    expectThrowCode(
      () => service.migrateMcpIconsLegacy({ migrationVersion: 1 }),
      "invalid_migration_payload",
    );
    expectThrowCode(
      () => service.migrateMcpIconsLegacy(null),
      "invalid_migration_payload",
    );
  });

  test("migration verifies a claimed digest (mismatch rejected)", () => {
    expectThrowCode(
      () =>
        service.migrateMcpIconsLegacy(
          iconsPayload(
            { "mcp.custom.p": { mime: "image/png", content: PNG_CONTENT } },
            { digest: "deadbeef" },
          ),
        ),
      "digest_mismatch",
    );
    expect(rowsFor(userDataDir)).toHaveLength(0);
  });
});
