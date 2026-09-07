const fs = require("fs");
const os = require("os");
const path = require("path");
const { resolveWindowsVaultRuntimeProvenance } = require("../../main/services/unchain/windows_vault_provenance");
const { createWindowsVaultCapabilityReceipt, createWindowsVaultCapabilityLatch } = require("../../main/services/unchain/windows_vault_capability");

describe("Windows development Vault admission", () => {
  let root;
  let options;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "pupu dev 中文 "));
    const script = path.join(root, "unchain_runtime", "server", "main.py");
    const python = path.join(root, "python.exe");
    fs.mkdirSync(path.dirname(script), { recursive: true });
    fs.writeFileSync(script, "development source");
    fs.writeFileSync(python, "validated interpreter fixture");
    options = {
      app: { isPackaged: false, getAppPath: () => root },
      entrypoint: { command: python, args: [script, "--vault-sink-worker"], cwd: path.dirname(script), dataDir: root },
      fs, path, platform: "win32", arch: "x64",
    };
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  const assembly = (provenance) => ({
    isPackaged: false,
    broker: { protocol: 1, sink_kinds: ["shell_secret_env"] },
    capability: { containment: "win32_job_list_v1", enabled_sink_kinds: ["shell_secret_env"], protocol: 1 },
    probe: { containment: "win32_job_list_v1", protocol: 1, supervisor_protocol: 1, worker_protocol: 1 },
    provenance,
  });

  test("real producer admits development without packaged artifacts through the strict receipt consumer", () => {
    const provenance = resolveWindowsVaultRuntimeProvenance(options);
    expect(provenance).toEqual({ arch: "x64", schema: "pupu.windows-vault-development.v1" });
    expect(Object.isFrozen(provenance)).toBe(true);
    const receipt = createWindowsVaultCapabilityReceipt(assembly(provenance));
    expect(receipt.provenance).toEqual(provenance);
    expect(Object.isFrozen(receipt.provenance)).toBe(true);
    expect(createWindowsVaultCapabilityLatch({ platform: "win32" }).configure(receipt))
      .toEqual({ status: "ready", reason: "" });
  });

  test.each([
    { command: "python" },
    { args: ["relative.py", "--vault-sink-worker"] },
    { args: ["--vault-sink-worker"] },
    { cwd: "relative" },
    { dataDir: "relative" },
  ])("rejects invalid development entrypoint %j", (override) => {
    options.entrypoint = { ...options.entrypoint, ...override };
    expect(() => resolveWindowsVaultRuntimeProvenance(options)).toThrow();
  });

  test("rejects missing source, unsupported architecture and absent app mode", () => {
    expect(() => resolveWindowsVaultRuntimeProvenance({ ...options, arch: "arm64" })).toThrow();
    expect(() => resolveWindowsVaultRuntimeProvenance({ ...options, app: { getAppPath: () => root } })).toThrow();
    fs.unlinkSync(options.entrypoint.args[0]);
    expect(() => resolveWindowsVaultRuntimeProvenance(options)).toThrow();
  });

  test("packaged resolution cannot fall back to development", () => {
    options.app.isPackaged = true;
    expect(() => resolveWindowsVaultRuntimeProvenance(options)).toThrow();
  });

  test("development receipts require explicit app mode and successful containment", () => {
    const input = assembly(resolveWindowsVaultRuntimeProvenance(options));
    expect(() => createWindowsVaultCapabilityReceipt({ ...input, isPackaged: true })).toThrow();
    const { isPackaged, ...unspecified } = input;
    expect(() => createWindowsVaultCapabilityReceipt(unspecified)).toThrow();
    expect(() => createWindowsVaultCapabilityReceipt({ ...input, probe: null })).toThrow();
    expect(() => createWindowsVaultCapabilityReceipt({ ...input, broker: { protocol: 1, sink_kinds: [] } })).toThrow();
  });

  test.each([
    { unexpected: true },
    { runtime_manifest_digest: `sha256:${"a".repeat(64)}` },
    { schema: "pupu.windows-vault-development.v2" },
    { arch: "arm64" },
  ])("rejects development receipt schema drift %j", (override) => {
    const provenance = { ...resolveWindowsVaultRuntimeProvenance(options), ...override };
    expect(() => createWindowsVaultCapabilityReceipt(assembly(provenance))).toThrow();
  });
});
