const { EventEmitter } = require("events");

const { createUpdateService, UPDATE_STAGES } = require("../../main/services/update/service");

const createHarness = ({ checkForUpdates } = {}) => {
  const autoUpdater = new EventEmitter();
  autoUpdater.checkForUpdates = jest.fn(checkForUpdates || (() => Promise.resolve()));
  autoUpdater.quitAndInstall = jest.fn();
  const stateEvents = [];
  const storedFiles = new Map();
  const fs = {
    readFileSync: jest.fn((filePath) => {
      if (!storedFiles.has(filePath)) throw new Error("ENOENT");
      return storedFiles.get(filePath);
    }),
    writeFileSync: jest.fn((filePath, value) => storedFiles.set(filePath, value)),
  };
  const app = {
    isPackaged: true,
    getPath: () => "/tmp/pupu-updater-test",
    getVersion: () => "0.1.9",
  };
  const webContents = {
    getAllWebContents: () => [{
      isDestroyed: () => false,
      send: (channel, payload) => stateEvents.push({ channel, payload }),
    }],
  };
  return {
    autoUpdater,
    fs,
    stateEvents,
    service: createUpdateService({
      app,
      webContents,
      autoUpdater,
      fs,
      path: require("path"),
    }),
  };
};

describe("packaged updater state machine", () => {
  let originalPlatform;

  beforeEach(() => {
    originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "win32" });
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", originalPlatform);
  });

  test("moves through checking, downloading, downloaded, and admits exactly one install", async () => {
    const { autoUpdater, service } = createHarness();
    expect(service.getAutoUpdateEnabled()).toBe(true);
    expect(await service.installDownloadedAppUpdate()).toEqual({ started: false });

    expect(await service.checkAndDownloadAppUpdate()).toEqual({ started: true });
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(service.getAppUpdateStatePayload()).toMatchObject({ stage: UPDATE_STAGES.CHECKING });
    autoUpdater.emit("update-available", { version: "0.1.10" });
    autoUpdater.emit("download-progress", { percent: 63.5 });
    expect(service.getAppUpdateStatePayload()).toMatchObject({
      stage: UPDATE_STAGES.DOWNLOADING,
      latestVersion: "0.1.10",
      progress: 64,
    });
    autoUpdater.emit("update-downloaded", { version: "0.1.10" });
    expect(service.getAppUpdateStatePayload()).toMatchObject({
      stage: UPDATE_STAGES.DOWNLOADED,
      latestVersion: "0.1.10",
      progress: 100,
    });

    expect(await service.checkAndDownloadAppUpdate()).toEqual({ started: false });
    expect(await service.installDownloadedAppUpdate()).toEqual({ started: true });
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
    expect(await service.installDownloadedAppUpdate()).toEqual({ started: false });
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
  });

  test("recovers from a failed check and persists an explicit disabled preference", async () => {
    const failure = new Error("feed unavailable");
    const { autoUpdater, fs, service } = createHarness({
      checkForUpdates: jest.fn()
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce(undefined),
    });
    expect(await service.checkAndDownloadAppUpdate()).toEqual({ started: false });
    expect(service.getAppUpdateStatePayload()).toMatchObject({
      stage: UPDATE_STAGES.ERROR,
      message: "feed unavailable",
    });
    expect(await service.checkAndDownloadAppUpdate()).toEqual({ started: true });
    expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);

    expect(service.setAutoUpdateEnabled(false)).toEqual({ ok: true });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      "/tmp/pupu-updater-test/auto_update_pref.json",
      JSON.stringify({ enabled: false }),
      "utf8",
    );
    expect(service.getAutoUpdateEnabled()).toBe(false);
  });
});
