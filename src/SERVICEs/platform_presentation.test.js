import {
  HOST_PLATFORMS,
  getHostPlatform,
  getPresentationPlatform,
  isPlatformOverrideAllowed,
  readPlatformOverride,
  subscribePresentationPlatform,
  writePlatformOverride,
} from "./platform_presentation";
import {
  readNamespace,
  resetSettingsRepositoryForTests,
} from "./settings_repository";

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

describe("platform_presentation (#256)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetSettingsRepositoryForTests();
    window.osInfo = { platform: "darwin" };
    window.runtime = { isElectron: true, platform: "darwin" };
  });
  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    delete window.osInfo;
    delete window.runtime;
  });

  test("the host is what preload reports; 'web' outside Electron", () => {
    expect(HOST_PLATFORMS).toEqual(["darwin", "win32", "linux"]);
    expect(getHostPlatform()).toBe("darwin");
    delete window.osInfo;
    expect(getHostPlatform()).toBe("darwin"); /* runtime.platform */
    delete window.runtime;
    expect(getHostPlatform()).toBe("web");
  });

  test("AC-256-1: the override is the presentation in dev Electron; unknown values read as none", () => {
    expect(readPlatformOverride()).toBeNull();
    expect(getPresentationPlatform()).toBe("darwin");
    writePlatformOverride("win32");
    expect(readPlatformOverride()).toBe("win32");
    expect(getPresentationPlatform()).toBe("win32");
    /* the record lives in the dev namespace next to the other dev switches */
    expect(readNamespace("dev", {}).platform_override).toBe("win32");
    writePlatformOverride("linux");
    expect(getPresentationPlatform()).toBe("linux");
    writePlatformOverride("amiga");
    expect(readPlatformOverride()).toBeNull();
    expect(getPresentationPlatform()).toBe("darwin");
    writePlatformOverride("win32");
    writePlatformOverride(null);
    expect(readPlatformOverride()).toBeNull();
    expect(readNamespace("dev", {}).platform_override).toBeUndefined();
  });

  test("the override never applies outside Electron", () => {
    writePlatformOverride("win32");
    window.runtime = { isElectron: false };
    expect(isPlatformOverrideAllowed()).toBe(false);
    expect(getPresentationPlatform()).toBe("darwin");
  });

  test("AC-256-2: a production build follows the real platform whatever the record says", () => {
    writePlatformOverride("linux");
    expect(getPresentationPlatform()).toBe("linux");
    process.env.NODE_ENV = "production";
    expect(isPlatformOverrideAllowed()).toBe(false);
    expect(getPresentationPlatform()).toBe("darwin");
    /* the record is untouched: reading is not writing */
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    expect(readPlatformOverride()).toBe("linux");
  });

  test("subscribers hear the presentation after a write of the dev namespace only", () => {
    const heard = [];
    const unsubscribe = subscribePresentationPlatform((platform) => heard.push(platform));
    writePlatformOverride("win32");
    expect(heard).toEqual(["win32"]);
    unsubscribe();
    writePlatformOverride("linux");
    expect(heard).toEqual(["win32"]);
  });
});
