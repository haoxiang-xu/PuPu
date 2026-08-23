const path = require("path");
const os = require("os");
const fs = require("fs");

// node:sqlite resolution mirrors settings_storage_service.test.cjs: jest 27's
// resolver mangles the prefix, process.getBuiltinModule bypasses it. Skip the
// suite cleanly when the engine is genuinely missing.
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
  createMemoryVaultService,
  MEMORY_VAULT_LIMITS,
  MEMORY_VAULT_SINK_KINDS,
  HANDLE_PATTERN,
  GRANT_ID_PATTERN,
} = require("../../main/services/memory_vault/service");
const {
  createSettingsStorageService,
} = require("../../main/services/settings_storage/service");

const makeTempDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "pupu-memory-vault-"));

const fakeApp = (userDataDir) => ({
  getPath: (key) => {
    if (key === "userData") return userDataDir;
    throw new Error(`unexpected app.getPath(${key})`);
  },
});

// Fake safeStorage whose ciphertext NEVER contains the plaintext bytes (XOR
// with a fixed pad) — so the "no plaintext anywhere in the DB" assertions are
// meaningful rather than trivially true/false.
const XOR_PAD = 0x5a;
const fakeEncrypt = (plaintext) => {
  const bytes = Buffer.from(plaintext, "utf8");
  const out = Buffer.alloc(bytes.length + 4);
  Buffer.from("ENC:").copy(out);
  for (let i = 0; i < bytes.length; i += 1) {
    out[i + 4] = bytes[i] ^ XOR_PAD;
  }
  return out;
};
const makeFakeSafeStorage = (overrides = {}) => ({
  isEncryptionAvailable: jest.fn(() => true),
  encryptString: jest.fn(fakeEncrypt),
  ...overrides,
});

const expectThrowCode = (fn, code) => {
  let caught = null;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).not.toBeNull();
  expect(caught.code).toBe(code);
  // The stable code also rides the message as "[<code>] " for IPC transport.
  expect(caught.message.startsWith(`[${code}] `)).toBe(true);
  return caught;
};

const SECRET = "sk-vault-TOPSECRET-0123456789";
const OP = (suffix) => `op-000000-${suffix}`;
const SINK = "computer_input";
const CHAT_SCOPE = Object.freeze({ scopeKind: "chat", scopeId: "chat-42" });

const depositPayload = (overrides = {}) => ({
  operationId: OP("deposit-1"),
  scopeKind: "chat",
  scopeId: "chat-42",
  label: "OpenAI key",
  plaintext: SECRET,
  ...overrides,
});

describeIfSqlite("memory vault service", () => {
  let dir;
  let services;

  const makeVault = (opts = {}) => {
    const service = createMemoryVaultService({
      app: fakeApp(dir),
      path,
      sqlite,
      safeStorage:
        opts.safeStorage === undefined
          ? makeFakeSafeStorage()
          : opts.safeStorage,
      ...(opts.platform ? { platform: opts.platform } : {}),
    });
    services.push(service);
    if (opts.init !== false) service.init();
    return service;
  };

  const openRawDb = () => {
    const { DatabaseSync } = sqlite;
    const raw = new DatabaseSync(path.join(dir, "settings.db"));
    return raw;
  };

  // getStatus deliberately reports NO row counts (security requirement), so
  // the suite counts rows through an independent raw connection instead —
  // which also proves the assertions are about the DATABASE, not about a
  // number the service chose to report.
  const rowCounts = () => {
    const raw = openRawDb();
    try {
      const count = (table) =>
        Number(raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
      return {
        secrets: count("vault_secrets"),
        grants: count("vault_grants"),
        receipts: count("vault_operation_receipts"),
      };
    } finally {
      raw.close();
    }
  };

  const allDbBytes = () => {
    const chunks = [];
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = path.join(dir, `settings.db${suffix}`);
      if (fs.existsSync(file)) chunks.push(fs.readFileSync(file));
    }
    return Buffer.concat(chunks);
  };

  beforeEach(() => {
    dir = makeTempDir();
    services = [];
  });

  afterEach(() => {
    for (const service of services) {
      try {
        service.close();
      } catch (_error) {
        // already closed
      }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("throws on missing dependencies", () => {
    expect(() => createMemoryVaultService()).toThrow(/missing dependencies/);
    expect(() => createMemoryVaultService({ app: fakeApp("x") })).toThrow(
      /missing dependencies/,
    );
  });

  test("init creates exactly the five vault tables and nothing else", () => {
    makeVault();
    const raw = openRawDb();
    try {
      const tables = raw
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all()
        .map((row) => row.name);
      expect(tables).toEqual([
        "vault_grants",
        "vault_operation_receipts",
        "vault_secrets",
        "vault_use_intents",
        "vault_use_receipts",
      ]);
    } finally {
      raw.close();
    }
  });

  test("uninitialized/degraded service fails every call with a stable code and getStatus never throws", () => {
    const vault = makeVault({ init: false });
    expectThrowCode(() => vault.deposit(depositPayload()), "memory_vault_unavailable");
    expectThrowCode(
      () => vault.listDescriptors(CHAT_SCOPE),
      "memory_vault_unavailable",
    );
    expect(vault.getStatus()).toEqual({
      ok: true,
      available: false,
      reason: "not-initialized",
      secretStorageStatus: "unavailable",
    });
  });

  describe("getStatus exposes no row counts", () => {
    test("status is availability-only — never a count oracle over the vault", () => {
      const vault = makeVault();
      vault.deposit(depositPayload());

      const status = vault.getStatus();
      expect(Object.keys(status).sort()).toEqual([
        "available",
        "ok",
        "secretStorageStatus",
      ]);
      expect(status).toEqual({
        ok: true,
        available: true,
        secretStorageStatus: "available",
      });
      // No count of anything, under any key name, at any depth. (The exact
      // key-set assertion above is the real lock; this catches a count
      // sneaking back in under a creative name.)
      expect(status.counts).toBeUndefined();
      expect(JSON.stringify(status)).not.toMatch(/count|grants|receipts/i);
      // …while the row genuinely exists (the absence is a policy, not a bug).
      expect(rowCounts().secrets).toBe(1);
    });
  });

  describe("deposit", () => {
    test("stores ciphertext only and returns an opaque >=128-bit handle, never plaintext or ciphertext", () => {
      const vault = makeVault();
      const result = vault.deposit(depositPayload());

      expect(result.ok).toBe(true);
      expect(result.status).toBe("stored");
      expect(HANDLE_PATTERN.test(result.handle)).toBe(true);
      // Nothing secret in the returned object.
      expect(JSON.stringify(result)).not.toContain(SECRET);
      expect(JSON.stringify(result)).not.toContain("ciphertext");

      // Nothing plaintext anywhere in the database files (main + WAL + shm).
      expect(allDbBytes().includes(Buffer.from(SECRET, "utf8"))).toBe(false);

      // The row holds a BLOB whose bytes are not the plaintext.
      const raw = openRawDb();
      try {
        const row = raw
          .prepare("SELECT ciphertext FROM vault_secrets WHERE handle = ?")
          .get(result.handle);
        expect(row).toBeDefined();
        const stored = Buffer.from(row.ciphertext);
        expect(stored.length).toBeGreaterThan(0);
        expect(stored.equals(Buffer.from(SECRET, "utf8"))).toBe(false);
      } finally {
        raw.close();
      }
    });

    test("handles are random: distinct deposits yield distinct handles", () => {
      const vault = makeVault();
      const a = vault.deposit(
        depositPayload({ operationId: OP("rand-a"), scopeId: "chat-a" }),
      );
      const b = vault.deposit(
        depositPayload({ operationId: OP("rand-b"), scopeId: "chat-b" }),
      );
      expect(a.handle).not.toBe(b.handle);
    });

    test("scope_kind is locked to chat/user", () => {
      const vault = makeVault();
      for (const scopeKind of ["workspace", "global", "", null, 7, "Chat"]) {
        expectThrowCode(
          () => vault.deposit(depositPayload({ scopeKind })),
          "invalid_scope_kind",
        );
      }
      expect(
        vault.deposit(
          depositPayload({ operationId: OP("user-ok"), scopeKind: "user" }),
        ).ok,
      ).toBe(true);
    });

    test("scope_id is strictly gated (charset, length, __proto__)", () => {
      const vault = makeVault();
      for (const scopeId of [
        "",
        "has space",
        "a".repeat(129),
        "__proto__",
        "emoji-🔑",
        null,
      ]) {
        expectThrowCode(
          () => vault.deposit(depositPayload({ scopeId })),
          "invalid_scope_id",
        );
      }
    });

    test("label handles Unicode strictly: NFC-normalized, control chars rejected, bounded", () => {
      const vault = makeVault();
      // Unicode is allowed and NFC-normalized ("e" + combining acute → "é").
      const composed = vault.deposit(
        depositPayload({ operationId: OP("label-nfc"), label: "clé 🔑" }),
      );
      expect(composed.label).toBe("clé 🔑");

      for (const label of [
        "",
        "   ",
        "bad label",
        "bad\nlabel",
        "x".repeat(MEMORY_VAULT_LIMITS.LABEL_MAX_CODE_POINTS + 1),
        // 121 code points of a 4-byte emoji also busts the byte bound.
        "🔑".repeat(200),
        42,
      ]) {
        expectThrowCode(
          () => vault.deposit(depositPayload({ label })),
          "invalid_label",
        );
      }
    });

    test("plaintext must be a bounded non-empty string", () => {
      const vault = makeVault();
      for (const plaintext of ["", null, 42, "x".repeat(64 * 1024 + 1)]) {
        expectThrowCode(
          () => vault.deposit(depositPayload({ plaintext })),
          "invalid_plaintext",
        );
      }
    });
  });

  // The label is the one CLEARTEXT field a deposit carries: it is stored
  // unencrypted, returned by listDescriptors, and hashed into the operation
  // receipt. A label containing the secret would smuggle the plaintext into
  // all three at once, so the guard runs BEFORE encryption and BEFORE the
  // idempotent-mutation wrapper.
  describe("deposit label guard: a label may never embed the secret", () => {
    // Every encoding the shared variant generator covers, crossed with every
    // position the secret could sit at inside the label.
    const encodings = {
      raw: (secret) => secret,
      trimmed: (secret) => `  ${secret}  `.trim(),
      upperCased: (secret) => secret.toUpperCase(),
      lowerCased: (secret) => secret.toLowerCase(),
      jsonInner: (secret) => JSON.stringify(secret).slice(1, -1),
      uriComponent: (secret) => encodeURIComponent(secret),
      formEncoded: (secret) => encodeURIComponent(secret).replace(/%20/g, "+"),
      fullPercent: (secret) =>
        [...Buffer.from(secret, "utf8")]
          .map((byte) => `%${byte.toString(16).padStart(2, "0")}`)
          .join(""),
      base64: (secret) => Buffer.from(secret, "utf8").toString("base64"),
      base64Unpadded: (secret) =>
        Buffer.from(secret, "utf8").toString("base64").replace(/=+$/u, ""),
      base64url: (secret) => Buffer.from(secret, "utf8").toString("base64url"),
      base64urlUnpadded: (secret) =>
        Buffer.from(secret, "utf8").toString("base64url").replace(/=+$/u, ""),
      hexLower: (secret) => Buffer.from(secret, "utf8").toString("hex"),
      hexUpper: (secret) =>
        Buffer.from(secret, "utf8").toString("hex").toUpperCase(),
    };

    const positions = {
      alone: (encoded) => encoded,
      prefix: (encoded) => `${encoded} backup key`,
      suffix: (encoded) => `backup key ${encoded}`,
      middle: (encoded) => `key ${encoded} backup`,
      noSeparators: (encoded) => `key${encoded}backup`,
    };

    // Secret LENGTHS 1 and 2 are in the matrix on purpose: a length-based
    // shortcut ("too short to be worth checking") is exactly the kind of
    // optimization that would silently open the hole.
    const secrets = ["a", "9", "ab", "sk-live-0123456789abcdef", "clé-🔑-secret"];

    test("rejects every encoding at every position, at every secret length", () => {
      const safeStorage = makeFakeSafeStorage();
      const vault = makeVault({ safeStorage });
      let cases = 0;
      for (const secret of secrets) {
        for (const [encodingName, encode] of Object.entries(encodings)) {
          const encoded = encode(secret);
          if (!encoded) continue;
          for (const [positionName, place] of Object.entries(positions)) {
            const label = place(encoded);
            // NFC is what the service normalizes to before the guard runs.
            if (label.normalize("NFC").trim().length === 0) continue;
            cases += 1;
            expectThrowCode(
              () =>
                vault.deposit(
                  depositPayload({
                    operationId: OP(
                      `guard-${cases.toString().padStart(4, "0")}`,
                    ),
                    label,
                    plaintext: secret,
                  }),
                ),
              "invalid_label",
            );
          }
        }
      }
      // Guard against the matrix silently collapsing to nothing.
      expect(cases).toBeGreaterThanOrEqual(
        secrets.length * Object.keys(positions).length,
      );

      // Nothing was encrypted, and nothing durable was written: no secret
      // row, and no receipt that would make the rejection replay as success.
      expect(safeStorage.encryptString).toHaveBeenCalledTimes(0);
      expect(rowCounts()).toEqual({ secrets: 0, grants: 0, receipts: 0 });
    });

    test("the rejection is a static message that echoes neither secret nor label", () => {
      const vault = makeVault();
      const secret = "sk-live-0123456789abcdef";
      const label = `prod ${secret} key`;
      const error = expectThrowCode(
        () =>
          vault.deposit(
            depositPayload({
              operationId: OP("guard-static"),
              label,
              plaintext: secret,
            }),
          ),
        "invalid_label",
      );
      expect(error.message).toBe("[invalid_label] label must not contain the secret value");
      expect(error.message).not.toContain(secret);
      expect(error.message).not.toContain(label);
      expect(error.message).not.toContain("prod");
      // No offset/index leak either — the guard is not a position oracle.
      expect(error.message).not.toMatch(/\d/);
    });

    test("a rejected deposit leaves no trace in the database file, WAL or SHM", () => {
      const vault = makeVault();
      const secret = "sk-live-0123456789abcdef";
      expectThrowCode(
        () =>
          vault.deposit(
            depositPayload({
              operationId: OP("guard-bytes"),
              label: `prod ${secret}`,
              plaintext: secret,
            }),
          ),
        "invalid_label",
      );

      const bytes = allDbBytes();
      // The representative byte scan: the secret must not appear in ANY of the
      // encodings the guard rejected it for.
      for (const encode of Object.values(encodings)) {
        const encoded = encode(secret);
        if (!encoded) continue;
        expect(bytes.includes(Buffer.from(encoded, "utf8"))).toBe(false);
      }
      expect(rowCounts()).toEqual({ secrets: 0, grants: 0, receipts: 0 });
    });

    test("benign control: a label that does not contain the secret still deposits", () => {
      const vault = makeVault();
      const secret = "sk-live-0123456789abcdef";
      const stored = vault.deposit(
        depositPayload({
          operationId: OP("guard-benign"),
          label: "Production OpenAI key",
          plaintext: secret,
        }),
      );
      expect(stored.ok).toBe(true);
      expect(stored.label).toBe("Production OpenAI key");
      expect(HANDLE_PATTERN.test(stored.handle)).toBe(true);
      expect(rowCounts().secrets).toBe(1);

      // …and a label that merely SHARES CHARACTERS with the secret is fine —
      // the guard matches whole encoded variants, not characters.
      const second = vault.deposit(
        depositPayload({
          operationId: OP("guard-benign-2"),
          label: "sk key for live use",
          plaintext: secret,
        }),
      );
      expect(second.ok).toBe(true);
      expect(rowCounts().secrets).toBe(2);
    });
  });

  describe("operationId idempotency + receipts", () => {
    test("every mutation requires a well-formed operationId", () => {
      const vault = makeVault();
      for (const operationId of [undefined, "", "short", "has space", "__proto__x!", 42]) {
        expectThrowCode(
          () => vault.deposit(depositPayload({ operationId })),
          "invalid_operation_id",
        );
      }
    });

    test("replaying a deposit returns the original handle without a second row", () => {
      const vault = makeVault();
      const first = vault.deposit(depositPayload());
      const replay = vault.deposit(depositPayload());
      expect(replay.handle).toBe(first.handle);
      expect(replay.replayed).toBe(true);
      expect(first.replayed).toBeUndefined();
      expect(rowCounts().secrets).toBe(1);
      expect(rowCounts().receipts).toBe(1);
    });

    test("same operationId with different non-secret params is a conflict", () => {
      const vault = makeVault();
      vault.deposit(depositPayload());
      expectThrowCode(
        () => vault.deposit(depositPayload({ scopeId: "chat-43" })),
        "operation_conflict",
      );
      expectThrowCode(
        () =>
          vault.grant({
            operationId: OP("deposit-1"),
            ...CHAT_SCOPE,
            handle: `pvh1_${"a".repeat(64)}`,
            sinkKind: SINK,
          }),
        "operation_conflict",
      );
    });

    test("receipt hash is independent of the plaintext (never secret-derived)", () => {
      const vault = makeVault();
      vault.deposit(depositPayload({ operationId: OP("fp-a"), plaintext: "secret-A" }));
      vault.deposit(depositPayload({ operationId: OP("fp-b"), plaintext: "secret-B" }));
      const raw = openRawDb();
      try {
        const rows = raw
          .prepare(
            "SELECT operation_id, receipt_hash, result_json " +
              "FROM vault_operation_receipts ORDER BY operation_id",
          )
          .all();
        expect(rows).toHaveLength(2);
        // Same non-secret identity → same fingerprint even though the two
        // plaintexts differ: the hash provably has no plaintext input.
        expect(rows[0].receipt_hash).toBe(rows[1].receipt_hash);
        expect(rows[0].receipt_hash).toMatch(/^[0-9a-f]{64}$/);
        for (const row of rows) {
          expect(row.result_json).not.toContain("secret-A");
          expect(row.result_json).not.toContain("secret-B");
        }
      } finally {
        raw.close();
      }
    });

    test("a failed mutation writes no receipt (errors are not idempotent successes)", () => {
      const vault = makeVault();
      expectThrowCode(
        () =>
          vault.grant({
            operationId: OP("grant-missing"),
            ...CHAT_SCOPE,
            handle: `pvh1_${"b".repeat(64)}`,
            sinkKind: SINK,
          }),
        "secret_not_found",
      );
      expect(rowCounts().receipts).toBe(0);
    });
  });

  describe("safeStorage fail-closed", () => {
    test("unavailable safeStorage: deposit rejects with a stable code and stores nothing", () => {
      const vault = makeVault({
        safeStorage: makeFakeSafeStorage({
          isEncryptionAvailable: jest.fn(() => false),
        }),
      });
      expect(vault.getStatus().secretStorageStatus).toBe("unavailable");
      expectThrowCode(
        () => vault.deposit(depositPayload()),
        "secret_storage_unavailable",
      );
      expect(rowCounts()).toEqual({ secrets: 0, grants: 0, receipts: 0 });
    });

    test("missing safeStorage entirely: fail closed, never plaintext", () => {
      const vault = makeVault({ safeStorage: null });
      expect(vault.getStatus().secretStorageStatus).toBe("unavailable");
      expectThrowCode(
        () => vault.deposit(depositPayload()),
        "secret_storage_unavailable",
      );
    });

    test("Linux basic_text/unknown backends are refused; real keyrings accepted", () => {
      for (const backend of ["basic_text", "unknown", null]) {
        const vault = makeVault({
          platform: "linux",
          safeStorage: makeFakeSafeStorage({
            getSelectedStorageBackend: jest.fn(() => backend),
          }),
        });
        expect(vault.getStatus().secretStorageStatus).toBe("unavailable");
        expectThrowCode(
          () => vault.deposit(depositPayload()),
          "secret_storage_unavailable",
        );
        vault.close();
      }

      const keyring = makeVault({
        platform: "linux",
        safeStorage: makeFakeSafeStorage({
          getSelectedStorageBackend: jest.fn(() => "gnome_libsecret"),
        }),
      });
      expect(keyring.getStatus().secretStorageStatus).toBe("available");
      expect(keyring.deposit(depositPayload()).ok).toBe(true);
    });

    test("an encryptString failure latches unavailable for the session", () => {
      const encryptString = jest.fn(() => {
        throw new Error("keychain locked");
      });
      const vault = makeVault({
        safeStorage: makeFakeSafeStorage({ encryptString }),
      });
      expectThrowCode(
        () => vault.deposit(depositPayload()),
        "secret_storage_unavailable",
      );
      expect(vault.getStatus().secretStorageStatus).toBe("unavailable");
      // Latched: the second attempt fails without re-invoking the OS crypto.
      expectThrowCode(
        () => vault.deposit(depositPayload({ operationId: OP("latch-2") })),
        "secret_storage_unavailable",
      );
      expect(encryptString).toHaveBeenCalledTimes(1);
    });

    test("a spoofed safeStorage echoing plaintext bytes is refused (nothing lands in the DB)", () => {
      const vault = makeVault({
        safeStorage: makeFakeSafeStorage({
          encryptString: jest.fn((plaintext) => Buffer.from(plaintext, "utf8")),
        }),
      });
      expectThrowCode(
        () => vault.deposit(depositPayload()),
        "secret_storage_unavailable",
      );
      expect(rowCounts().secrets).toBe(0);
      expect(allDbBytes().includes(Buffer.from(SECRET, "utf8"))).toBe(false);
    });
  });

  describe("descriptors, grants, delete cascade", () => {
    const seedThreeScopes = (vault) => {
      vault.deposit(
        depositPayload({ operationId: OP("iso-a"), scopeId: "chat-a" }),
      );
      vault.deposit(
        depositPayload({ operationId: OP("iso-b"), scopeId: "chat-b" }),
      );
      vault.deposit(
        depositPayload({
          operationId: OP("iso-u"),
          scopeKind: "user",
          scopeId: "profile-1",
        }),
      );
    };

    test("listDescriptors returns only the one exact scope and never ciphertext", () => {
      const vault = makeVault();
      seedThreeScopes(vault);

      const chatA = vault.listDescriptors({
        scopeKind: "chat",
        scopeId: "chat-a",
      });
      expect(chatA.descriptors).toHaveLength(1);
      expect(chatA.descriptors[0].scopeId).toBe("chat-a");
      expect(Object.keys(chatA.descriptors[0]).sort()).toEqual([
        "createdAt",
        "grantCount",
        "handle",
        "label",
        "scopeId",
        "scopeKind",
        "updatedAt",
      ]);
      expect(JSON.stringify(chatA)).not.toContain(SECRET);

      // Same scopeId under a different kind is a different scope entirely.
      expect(
        vault.listDescriptors({ scopeKind: "user", scopeId: "chat-a" })
          .descriptors,
      ).toHaveLength(0);
      expect(
        vault.listDescriptors({ scopeKind: "user", scopeId: "profile-1" })
          .descriptors,
      ).toHaveLength(1);
    });

    test("listDescriptors REQUIRES both scope fields — no global or partial enumeration", () => {
      const vault = makeVault();
      seedThreeScopes(vault);

      // No-argument / empty filter: the "list everything" call does not exist.
      expectThrowCode(() => vault.listDescriptors(), "invalid_scope_kind");
      expectThrowCode(() => vault.listDescriptors({}), "invalid_scope_kind");
      // Partial filters are rejected in BOTH directions.
      expectThrowCode(
        () => vault.listDescriptors({ scopeKind: "chat" }),
        "invalid_scope_id",
      );
      expectThrowCode(
        () => vault.listDescriptors({ scopeId: "chat-a" }),
        "invalid_scope_kind",
      );
      // Explicit undefined/null/empty are not a wildcard either.
      for (const scopeId of [undefined, null, "", "%", "*"]) {
        expectThrowCode(
          () => vault.listDescriptors({ scopeKind: "chat", scopeId }),
          "invalid_scope_id",
        );
      }
      for (const scopeKind of [undefined, null, "", "all", "*"]) {
        expectThrowCode(
          () => vault.listDescriptors({ scopeKind, scopeId: "chat-a" }),
          "invalid_scope_kind",
        );
      }
      // Filters are gated as strictly as writes.
      expectThrowCode(
        () => vault.listDescriptors({ scopeKind: "everything", scopeId: "x" }),
        "invalid_scope_kind",
      );
      expectThrowCode(
        () =>
          vault.listDescriptors({ scopeKind: "chat", scopeId: "__proto__" }),
        "invalid_scope_id",
      );
      expectThrowCode(
        () => vault.listDescriptors("chat-a"),
        "invalid_payload",
      );
    });

    test("grant requires an existing in-scope handle and returns a well-formed grantId; revoke is idempotent", () => {
      const vault = makeVault();
      const { handle } = vault.deposit(depositPayload());

      expectThrowCode(
        () =>
          vault.grant({
            operationId: OP("g-bad-handle"),
            ...CHAT_SCOPE,
            handle: "not-a-handle",
            sinkKind: SINK,
          }),
        "invalid_handle",
      );

      const granted = vault.grant({
        operationId: OP("g-1"),
        ...CHAT_SCOPE,
        handle,
        sinkKind: SINK,
      });
      expect(GRANT_ID_PATTERN.test(granted.grantId)).toBe(true);
      expect(granted.ok).toBe(true);
      // Only non-secret, caller-supplied fields (plus the new grantId) come
      // back — nothing is echoed out of the stored secret row.
      expect(Object.keys(granted).sort()).toEqual([
        "createdAt",
        "grantId",
        "handle",
        "ok",
        "scopeId",
        "scopeKind",
        "sinkKind",
      ]);
      expect(JSON.stringify(granted)).not.toContain(SECRET);
      expect(JSON.stringify(granted)).not.toContain("OpenAI key");
      expect(JSON.stringify(granted)).not.toContain("ciphertext");

      // Replay returns the SAME grantId, no duplicate row.
      const replay = vault.grant({
        operationId: OP("g-1"),
        ...CHAT_SCOPE,
        handle,
        sinkKind: SINK,
      });
      expect(replay.grantId).toBe(granted.grantId);
      expect(replay.replayed).toBe(true);
      expect(rowCounts().grants).toBe(1);

      const revoked = vault.revoke({
        operationId: OP("r-1"),
        grantId: granted.grantId,
      });
      expect(revoked).toEqual({
        ok: true,
        grantId: granted.grantId,
        revoked: true,
      });
      // Revoking an unknown grant succeeds with revoked:false.
      const again = vault.revoke({
        operationId: OP("r-2"),
        grantId: granted.grantId,
      });
      expect(again.revoked).toBe(false);
      expect(rowCounts().grants).toBe(0);
    });

    test("grant is scope-bound: a handle from another scope is indistinguishable from a missing one", () => {
      const vault = makeVault();
      const { handle } = vault.deposit(depositPayload()); // chat / chat-42
      vault.deposit(
        depositPayload({
          operationId: OP("other-scope"),
          scopeKind: "user",
          scopeId: "profile-1",
        }),
      );

      // Right handle, wrong scopeId → refused.
      expectThrowCode(
        () =>
          vault.grant({
            operationId: OP("g-wrong-id"),
            scopeKind: "chat",
            scopeId: "chat-43",
            handle,
            sinkKind: SINK,
          }),
        "secret_not_found",
      );
      // Right handle, wrong scopeKind → refused.
      expectThrowCode(
        () =>
          vault.grant({
            operationId: OP("g-wrong-kind"),
            scopeKind: "user",
            scopeId: "chat-42",
            handle,
            sinkKind: SINK,
          }),
        "secret_not_found",
      );
      // A handle that exists nowhere returns the SAME code: grant cannot be
      // used as an existence oracle across scopes.
      expectThrowCode(
        () =>
          vault.grant({
            operationId: OP("g-nowhere"),
            scopeKind: "chat",
            scopeId: "chat-43",
            handle: `pvh1_${"c".repeat(64)}`,
            sinkKind: SINK,
          }),
        "secret_not_found",
      );
      // Scope fields are required and gated exactly like the writes.
      [
        { scopeKind: undefined, scopeId: "chat-42", code: "invalid_scope_kind" },
        { scopeKind: "chat", scopeId: undefined, code: "invalid_scope_id" },
        { scopeKind: "all", scopeId: "chat-42", code: "invalid_scope_kind" },
        { scopeKind: "chat", scopeId: "__proto__", code: "invalid_scope_id" },
      ].forEach((bad, index) => {
        expectThrowCode(
          () =>
            vault.grant({
              operationId: OP(`g-gate-${index}`),
              scopeKind: bad.scopeKind,
              scopeId: bad.scopeId,
              handle,
              sinkKind: SINK,
            }),
          bad.code,
        );
      });
      expect(rowCounts().grants).toBe(0);
    });

    test("grants target the closed sink-kind enum — arbitrary grantee strings are refused", () => {
      const vault = makeVault();
      const { handle } = vault.deposit(depositPayload());

      expect([...MEMORY_VAULT_SINK_KINDS]).toEqual([
        "computer_input",
        "shell_secret_env",
        "shell_secret_stdin",
        "mcp_schema_secret",
      ]);

      // Every controlled sink kind is accepted and persisted verbatim.
      MEMORY_VAULT_SINK_KINDS.forEach((sinkKind, index) => {
        const result = vault.grant({
          operationId: OP(`sink-ok-${index}`),
          ...CHAT_SCOPE,
          handle,
          sinkKind,
        });
        expect(result.sinkKind).toBe(sinkKind);
      });
      const raw = openRawDb();
      try {
        const stored = raw
          .prepare("SELECT sink_kind FROM vault_grants ORDER BY created_at")
          .all()
          .map((row) => row.sink_kind);
        expect(new Set(stored)).toEqual(new Set(MEMORY_VAULT_SINK_KINDS));
      } finally {
        raw.close();
      }

      // Anything else — including the old free-text grantee style, near-misses
      // and casing variants — is rejected outright.
      [
        "memory_v2",
        "recipe_runner",
        "Computer_Input",
        "computer_input ",
        " computer_input",
        "computer_input;drop",
        "",
        undefined,
        null,
        42,
        ["computer_input"],
      ].forEach((sinkKind, index) => {
        expectThrowCode(
          () =>
            vault.grant({
              operationId: OP(`sink-bad-${index}`),
              ...CHAT_SCOPE,
              handle,
              sinkKind,
            }),
          "invalid_sink_kind",
        );
      });

      // The legacy field name buys nothing: `grantee` is not read at all.
      expectThrowCode(
        () =>
          vault.grant({
            operationId: OP("sink-legacy"),
            ...CHAT_SCOPE,
            handle,
            grantee: "memory_v2",
          }),
        "invalid_sink_kind",
      );
      expect(rowCounts().grants).toBe(MEMORY_VAULT_SINK_KINDS.length);
    });

    test("delete cascades grants transactionally and leaves a non-secret receipt", () => {
      const vault = makeVault();
      const { handle } = vault.deposit(depositPayload());
      vault.grant({
        operationId: OP("dc-g1"),
        ...CHAT_SCOPE,
        handle,
        sinkKind: "computer_input",
      });
      vault.grant({
        operationId: OP("dc-g2"),
        ...CHAT_SCOPE,
        handle,
        sinkKind: "shell_secret_env",
      });

      const result = vault.deleteSecret({ operationId: OP("dc-del"), handle });
      expect(result).toEqual({
        ok: true,
        handle,
        deleted: true,
        revokedGrants: 2,
      });
      expect(rowCounts()).toEqual({ secrets: 0, grants: 0, receipts: 4 });

      const raw = openRawDb();
      try {
        const receipt = raw
          .prepare(
            "SELECT op_kind, result_json FROM vault_operation_receipts " +
              "WHERE operation_id = ?",
          )
          .get(OP("dc-del"));
        expect(receipt.op_kind).toBe("delete");
        expect(receipt.result_json).not.toContain(SECRET);
      } finally {
        raw.close();
      }

      // Deleting an already-deleted handle under a NEW operationId reports
      // deleted:false; replaying the original returns the original result.
      const gone = vault.deleteSecret({ operationId: OP("dc-del2"), handle });
      expect(gone.deleted).toBe(false);
      const replay = vault.deleteSecret({ operationId: OP("dc-del"), handle });
      expect(replay.deleted).toBe(true);
      expect(replay.replayed).toBe(true);
    });
  });

  describe("database-enforced grant integrity", () => {
    test("foreign_keys is ON and vault_grants.handle CASCADEs on delete at the DB level", () => {
      const vault = makeVault();
      const { handle } = vault.deposit(depositPayload());
      vault.grant({
        operationId: OP("fk-g1"),
        ...CHAT_SCOPE,
        handle,
        sinkKind: SINK,
      });

      const raw = openRawDb();
      try {
        // The connection-level PRAGMA the service asserts at init.
        expect(Number(raw.prepare("PRAGMA foreign_keys").get().foreign_keys))
          .toBe(1);
        raw.exec("PRAGMA foreign_keys = ON;");

        const fks = raw.prepare("PRAGMA foreign_key_list(vault_grants)").all();
        expect(fks).toHaveLength(1);
        expect(fks[0].table).toBe("vault_secrets");
        expect(fks[0].from).toBe("handle");
        expect(fks[0].to).toBe("handle");
        expect(String(fks[0].on_delete).toUpperCase()).toBe("CASCADE");

        // A grant for a nonexistent handle is refused by SQLITE itself, not
        // just by the service's application-level check.
        expect(() =>
          raw
            .prepare(
              "INSERT INTO vault_grants(grant_id, handle, sink_kind, created_at)" +
                " VALUES (?, ?, ?, ?)",
            )
            .run(`pvg1_${"f".repeat(32)}`, `pvh1_${"f".repeat(64)}`, SINK, 1),
        ).toThrow();

        // Deleting the secret behind the service's back still removes grants.
        raw.prepare("DELETE FROM vault_secrets WHERE handle = ?").run(handle);
        expect(
          Number(raw.prepare("SELECT COUNT(*) AS n FROM vault_grants").get().n),
        ).toBe(0);
      } finally {
        raw.close();
      }
    });

    test("a preflight vault_grants table (free-text grantee, no FK) is rebuilt without touching secrets", () => {
      // Build the pre-hardening P0 shape by hand, with a live secret, a
      // carryable grant, an unmappable free-text grant and a dangling one.
      const seeded = makeVault();
      const { handle } = seeded.deposit(depositPayload());
      seeded.close();

      const raw = openRawDb();
      try {
        raw.exec("DROP TABLE vault_grants;");
        raw.exec(
          "CREATE TABLE vault_grants (grant_id TEXT PRIMARY KEY, " +
            "handle TEXT NOT NULL, grantee TEXT NOT NULL, " +
            "created_at INTEGER NOT NULL);",
        );
        const insert = raw.prepare(
          "INSERT INTO vault_grants(grant_id, handle, grantee, created_at)" +
            " VALUES (?, ?, ?, ?)",
        );
        insert.run(`pvg1_${"1".repeat(32)}`, handle, "computer_input", 1);
        insert.run(`pvg1_${"2".repeat(32)}`, handle, "memory_v2", 2);
        insert.run(
          `pvg1_${"3".repeat(32)}`,
          `pvh1_${"9".repeat(64)}`,
          "computer_input",
          3,
        );
        // A leftover scratch table from a half-finished rebuild must not
        // latch the vault into degraded mode.
        raw.exec("CREATE TABLE vault_grants_rebuilt (grant_id TEXT);");
      } finally {
        raw.close();
      }

      const vault = makeVault();

      // The secret is untouched — the migration NEVER deletes secrets.
      const descriptors = vault.listDescriptors(CHAT_SCOPE).descriptors;
      expect(descriptors).toHaveLength(1);
      expect(descriptors[0].handle).toBe(handle);
      expect(descriptors[0].label).toBe("OpenAI key");

      const after = openRawDb();
      try {
        const columns = after
          .prepare("PRAGMA table_info(vault_grants)")
          .all()
          .map((row) => row.name);
        expect(columns.sort()).toEqual([
          "created_at",
          "grant_id",
          "handle",
          "sink_kind",
        ]);
        const fks = after
          .prepare("PRAGMA foreign_key_list(vault_grants)")
          .all();
        expect(String(fks[0].on_delete).toUpperCase()).toBe("CASCADE");

        // Only the row that is valid under the new contract survives; the
        // free-text and dangling grants are dropped (a P0 grant confers
        // nothing and is trivially re-issued).
        const rows = after
          .prepare("SELECT grant_id, sink_kind FROM vault_grants")
          .all();
        expect(rows).toEqual([
          { grant_id: `pvg1_${"1".repeat(32)}`, sink_kind: "computer_input" },
        ]);
        // The index survived the rebuild.
        expect(
          after
            .prepare(
              "SELECT name FROM sqlite_master WHERE type = 'index' " +
                "AND name = 'idx_vault_grants_handle'",
            )
            .get(),
        ).toBeDefined();
        // Still exactly the three vault tables — no leftover scratch table.
        expect(
          after
            .prepare(
              "SELECT name FROM sqlite_master WHERE type = 'table' " +
                "AND name LIKE 'vault_%' ORDER BY name",
            )
            .all()
            .map((row) => row.name),
        ).toEqual([
          "vault_grants",
          "vault_operation_receipts",
          "vault_secrets",
          "vault_use_intents",
          "vault_use_receipts",
        ]);
      } finally {
        after.close();
      }

      // Re-running init is a no-op (idempotent convergence).
      vault.close();
      const again = makeVault();
      expect(rowCounts().grants).toBe(1);
      expect(again.listDescriptors(CHAT_SCOPE).descriptors).toHaveLength(1);
    });
  });

  describe("coexistence with settings storage (same settings.db file)", () => {
    test("settings reset never touches the vault, and the vault never touches settings", () => {
      const settingsService = createSettingsStorageService({
        app: fakeApp(dir),
        fs,
        path,
        sqlite,
      });
      services.push(settingsService);
      settingsService.init();
      settingsService.setNamespace("ui", { side_menu_open: true });

      const vault = makeVault();
      const { handle } = vault.deposit(depositPayload());
      vault.grant({
        operationId: OP("coex-g"),
        ...CHAT_SCOPE,
        handle,
        sinkKind: SINK,
      });

      // Vault init did not disturb the settings row.
      const snapshot = settingsService.getBootstrapSnapshot();
      expect(snapshot.available).toBe(true);
      expect(snapshot.namespaces.ui).toEqual({ side_menu_open: true });

      // Reset settings clears the settings tables but the vault is intact.
      const reset = settingsService.resetSettings();
      expect(reset.ok).toBe(true);
      expect(vault.listDescriptors(CHAT_SCOPE).descriptors).toHaveLength(1);
      expect(rowCounts()).toEqual({ secrets: 1, grants: 1, receipts: 2 });
      expect(
        settingsService.getBootstrapSnapshot().namespaces.ui,
      ).toBeUndefined();
    });
  });
});
