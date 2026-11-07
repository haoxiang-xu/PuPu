const fs = require("fs");
const path = require("path");
const os = require("os");
let sqlite = null;
try { sqlite = require("node:sqlite"); } catch (_) {}
if (!sqlite && typeof process.getBuiltinModule === "function") {
  try { sqlite = process.getBuiltinModule("node:sqlite"); } catch (_) {}
}
const describeSqlite = sqlite ? describe : describe.skip;
const { createSettingsStorageService } = require("../../main/services/settings_storage/service");

describeSqlite("Main-only model provider registry preserves persistence status", () => {
  let dir, service, raw, safeStorage;
  const openService = (initialize = true) => {
    safeStorage = { isEncryptionAvailable: jest.fn(() => true), encryptString: jest.fn(), decryptString: jest.fn() };
    service = createSettingsStorageService({ app: { getPath: (name) => { if (name !== "userData") throw new Error("unexpected path"); return dir; } }, fs, path, sqlite, safeStorage, platform: "darwin" });
    if (initialize) { service.init(); raw = new sqlite.DatabaseSync(path.join(dir, "settings.db")); }
    return service;
  };
  const putRaw = (text) => raw.prepare("INSERT INTO settings(namespace,value_json,schema_version,updated_at,revision) VALUES (?,?,?,?,?) ON CONFLICT(namespace) DO UPDATE SET value_json=excluded.value_json,revision=excluded.revision,updated_at=excluded.updated_at").run("model_providers", text, 1, 1234, 17);
  const row = () => raw.prepare("SELECT namespace,value_json,schema_version,updated_at,revision FROM settings WHERE namespace=?").get("model_providers");
  const readWithoutMutation = () => {
    const before = row();
    const result = service.readModelProviderRegistry();
    expect(row()).toEqual(before);
    expect(safeStorage.encryptString).not.toHaveBeenCalled();
    expect(safeStorage.decryptString).not.toHaveBeenCalled();
    return result;
  };
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "pupu-model-registry-test-")); });
  afterEach(() => { if (raw) raw.close(); if (service) service.close(); fs.rmSync(dir, { recursive: true, force: true }); raw = null; service = null; });

  test("uninitialized and closed storage return unavailable, never missing", () => {
    openService(false);
    expect(service.readModelProviderRegistry()).toEqual({ status: "unavailable" });
    service.init(); service.close();
    expect(service.readModelProviderRegistry()).toEqual({ status: "unavailable" });
  });

  test("an absent SQL namespace is explicitly missing", () => {
    openService();
    expect(readWithoutMutation()).toEqual({ status: "missing" });
    expect(row()).toBeUndefined();
  });

  test("an OPEN namespace with no providers field is ready and empty", () => {
    openService(); putRaw(JSON.stringify({ unrelated_setting: { preserve: true }, openai_api_key: "NOT-READ-BY-THIS-API" }));
    expect(readWithoutMutation()).toEqual({ status: "ready", providers: [] });
  });

  test("every original provider entry, including duplicates and malformed values, reaches admission", () => {
    openService();
    const providers = [{ id: "deepseek", enabled: false }, { id: "deepseek", enabled: true }, null, 7, ["bad"], JSON.parse('{"id":"__proto__","enabled":false}')];
    putRaw(JSON.stringify({ custom_providers: providers, unrelated_setting: "keep" }));
    const result = readWithoutMutation();
    expect(result).toEqual({ status: "ready", providers });
    result.providers[0].enabled = true;
    expect(readWithoutMutation()).toEqual({ status: "ready", providers });
  });

  test.each(["not JSON", "null", "[]", "7", '\"text\"', '{"custom_providers":null}', '{"custom_providers":{}}', '{"custom_providers":"not-an-array"}'])("invalid namespace %s never becomes absent", (text) => {
    openService(); putRaw(text);
    expect(readWithoutMutation()).toEqual({ status: "invalid" });
  });

  test("corrupt JSON stays distinguishable when public bootstrap omits it", () => {
    openService(); putRaw("CORRUPT-REGISTRY-JSON-SENTINEL");
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(service.getBootstrapSnapshot().namespaces).not.toHaveProperty("model_providers");
      expect(readWithoutMutation()).toEqual({ status: "invalid" });
      expect(JSON.stringify(warn.mock.calls)).not.toContain("CORRUPT-REGISTRY-JSON-SENTINEL");
    } finally { warn.mockRestore(); }
  });

  test("SQL read failure is unavailable and does not repair or recreate settings", () => {
    openService(); raw.exec("DROP TABLE settings");
    expect(service.readModelProviderRegistry()).toEqual({ status: "unavailable" });
    expect(raw.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").all()).toEqual([]);
    expect(safeStorage.decryptString).not.toHaveBeenCalled();
  });
});
