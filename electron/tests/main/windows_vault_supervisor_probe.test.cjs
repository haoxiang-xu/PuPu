const { EventEmitter } = require("events");
const { PassThrough } = require("stream");
const {
  probeWindowsVaultSupervisor,
} = require("../../main/services/unchain/windows_vault_supervisor_probe");

const READY = Buffer.from(
  '{"containment":"win32_job_list_v1","kind":"ready","protocol":1}',
  "utf8",
);
const WORKER_ERROR = Buffer.from(
  '{"error":{"code":"vault_worker_protocol_error"},"ok":false,"version":1}',
  "utf8",
);

const frame = (body) => {
  const value = Buffer.allocUnsafe(body.length + 4);
  value.writeUInt32BE(body.length, 0);
  body.copy(value, 4);
  return value;
};

const entrypoint = () => ({
  args: ["--vault-sink-worker"],
  command: "C:\\Program Files\\PuPu\\resources\\unchain-server.exe",
  cwd: "C:\\Program Files\\PuPu\\resources",
  dataDir: "C:\\Users\\tester\\AppData\\Roaming\\PuPu",
});

const child = () => {
  const value = new EventEmitter();
  value.stdin = { end: jest.fn() };
  value.stdout = new PassThrough();
  value.kill = jest.fn();
  return value;
};

const tick = () => new Promise((resolve) => setImmediate(resolve));

describe("Windows Vault supervisor probe", () => {
  test("accepts only READY, the closed worker error, and exit zero", async () => {
    const processHandle = child();
    const probe = probeWindowsVaultSupervisor({
      entrypoint: entrypoint(),
      environmentSource: { PATH: "C:\\Windows\\System32" },
      platform: "win32",
      spawn: jest.fn(() => processHandle),
    });

    processHandle.emit("spawn");
    processHandle.stdout.write(frame(READY));
    await tick();
    expect(processHandle.stdin.end).toHaveBeenCalledWith(Buffer.alloc(4));
    processHandle.stdout.write(frame(WORKER_ERROR));
    await tick();
    processHandle.emit("close", 0);

    await expect(probe).resolves.toEqual({
      containment: "win32_job_list_v1",
      protocol: 1,
      supervisor_protocol: 1,
      worker_protocol: 1,
    });
    expect(processHandle.kill).not.toHaveBeenCalled();
  });

  test("rejects malformed READY before writing any worker frame", async () => {
    const processHandle = child();
    const probe = probeWindowsVaultSupervisor({
      entrypoint: entrypoint(),
      platform: "win32",
      spawn: jest.fn(() => processHandle),
    });

    processHandle.emit("spawn");
    processHandle.stdout.write(frame(Buffer.from("{}", "utf8")));

    await expect(probe).rejects.toMatchObject({
      code: "vault_worker_ready_protocol_error",
    });
    expect(processHandle.stdin.end).not.toHaveBeenCalled();
    expect(processHandle.kill).toHaveBeenCalledWith("SIGKILL");
  });

  test("rejects a non-canonical worker response and reaps the supervisor", async () => {
    const processHandle = child();
    const probe = probeWindowsVaultSupervisor({
      entrypoint: entrypoint(),
      platform: "win32",
      spawn: jest.fn(() => processHandle),
    });

    processHandle.emit("spawn");
    processHandle.stdout.write(frame(READY));
    await tick();
    processHandle.stdout.write(frame(Buffer.from("{}", "utf8")));

    await expect(probe).rejects.toMatchObject({
      code: "vault_worker_probe_protocol_error",
    });
    expect(processHandle.kill).toHaveBeenCalledWith("SIGKILL");
  });

  test("fails closed outside Windows", async () => {
    await expect(
      probeWindowsVaultSupervisor({ entrypoint: entrypoint(), platform: "darwin" }),
    ).rejects.toMatchObject({ code: "vault_worker_containment_unsupported" });
  });
});
