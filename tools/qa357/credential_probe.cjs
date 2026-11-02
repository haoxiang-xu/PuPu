// QA-only, Linux-only: real safeStorage and real production storage service.
// No BrowserWindow, IPC mutation, mocked secret reader or plaintext fallback.
if (process.platform !== "linux") throw new Error("disposable hosted Linux only");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { app, safeStorage } = require("electron");
const sqlite = process.getBuiltinModule("node:sqlite");
const SENTINEL = "qa357-offline-only-not-a-real-key";
const mode = process.env.QA_PROBE_MODE;
assert(["write", "read", "basic"].includes(mode));
assert(process.env.QA357_NETNS === "1");
assert(!process.argv.some((arg) => /--(?:no-sandbox|disable-.*sandbox)/.test(arg)));
const profile = path.resolve(process.env.QA_PROBE_PROFILE);
const output = path.resolve(process.env.QA_OUT, `credential-${mode}.json`);
fs.mkdirSync(profile, { recursive: true, mode: 0o700 });
app.setPath("userData", profile);
app.setName("qa357-credential-qualifier");
const { createSettingsStorageService, SAFE_SECRET_STORAGE_LINUX_BACKENDS } = require(
  path.join(process.env.QA_CANDIDATE_ROOT, "electron/main/services/settings_storage/service.js"),
);

app.whenReady().then(() => {
  const service = createSettingsStorageService({ app, fs, path, sqlite, safeStorage });
  try {
    service.init();
    // init performs the production availability probe first; inspecting the
    // backend before that probe can observe an uninitialized crypto backend.
    const backend = safeStorage.getSelectedStorageBackend();
    const bootstrap = service.getBootstrapSnapshot();
    assert.equal(bootstrap.available, true, "real SQLite storage must be available");
    let rejectedCode = null;
    if (mode === "basic") {
      assert(!SAFE_SECRET_STORAGE_LINUX_BACKENDS.has(backend), "negative must select an untrusted backend");
      assert.equal(service.getSecretStorageStatus(), "unavailable");
      assert.throws(() => service.setProviderCredential("provider", "openai", SENTINEL), (error) => {
        rejectedCode = error.code;
        return error.code === "secret_storage_unavailable";
      });
      assert.equal(service.readDecryptedProviderSecret("provider", "openai"), null);
    } else {
      assert(SAFE_SECRET_STORAGE_LINUX_BACKENDS.has(backend), "a real OS keyring must be selected");
      assert.equal(service.getSecretStorageStatus(), "available");
      if (mode === "write") {
        const result = service.setProviderCredential("provider", "openai", SENTINEL);
        assert.equal(result.ok, true);
        assert.equal(result.ownerId, "openai");
      }
      assert.equal(service.readDecryptedProviderSecret("provider", "openai"), SENTINEL);
    }
    assert(!JSON.stringify(service.getBootstrapSnapshot()).includes(SENTINEL));
    service.close();
    const dbFile = path.join(profile, "settings.db");
    assert(!fs.readFileSync(dbFile).includes(Buffer.from(SENTINEL)));
    const db = new sqlite.DatabaseSync(dbFile, { readOnly: true });
    const count = Number(db.prepare("SELECT COUNT(*) AS n FROM provider_credentials").get().n);
    assert.equal(count, mode === "basic" ? 0 : 1);
    db.close();
    const receipt = { schema: "qa357.real-secret-service.v1", mode, pid: process.pid,
      uid: process.getuid(), profile, backend, producer_status: mode === "basic" ? "unavailable" : "available",
      exact_round_trip: mode !== "basic", bootstrap_contains_sentinel: false,
      database_contains_sentinel: false, provider_rows: count, rejected_code: rejectedCode };
    fs.writeFileSync(output, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
    app.exit(0);
  } finally {
    service.close();
  }
}).catch((error) => {
  console.error("credential qualification failed:", error.code || error.message);
  app.exit(1);
});
