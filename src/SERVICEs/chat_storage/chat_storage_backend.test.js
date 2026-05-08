import {
  createChatStorageBackend,
  LEGACY_LOCALSTORAGE_KEY,
  MIGRATION_MARKER_KEY,
} from "./chat_storage_backend";

describe("chat storage backend adapter", () => {
  beforeEach(() => {
    window.localStorage.clear();
    delete window.chatStorageAPI;
  });

  test("prefers window.chatStorageAPI when present", () => {
    const bootstrapValue = { activeChatId: "a" };
    window.chatStorageAPI = {
      bootstrap: jest.fn(() => bootstrapValue),
      write: jest.fn(),
    };

    const backend = createChatStorageBackend();
    expect(backend.readBootstrap()).toEqual(bootstrapValue);
    expect(window.chatStorageAPI.bootstrap).toHaveBeenCalled();

    backend.persist({ foo: "bar" });
    expect(window.chatStorageAPI.write).toHaveBeenCalledWith({ foo: "bar" });
  });

  test("falls back to localStorage when window.chatStorageAPI is absent", () => {
    const stored = { activeChatId: "legacy" };
    window.localStorage.setItem(
      LEGACY_LOCALSTORAGE_KEY,
      JSON.stringify(stored),
    );

    const backend = createChatStorageBackend();
    expect(backend.readBootstrap()).toEqual(stored);

    backend.persist({ v2: true });
    expect(
      JSON.parse(window.localStorage.getItem(LEGACY_LOCALSTORAGE_KEY)),
    ).toEqual({ v2: true });
  });

  test("returns null when neither IPC nor localStorage has data", () => {
    const backend = createChatStorageBackend();
    expect(backend.readBootstrap()).toBeNull();
  });

  test("when IPC bootstrap is null but legacy localStorage exists, migrate once and tag", () => {
    const legacy = { activeChatId: "migrate-me" };
    window.localStorage.setItem(
      LEGACY_LOCALSTORAGE_KEY,
      JSON.stringify(legacy),
    );
    const writeSpy = jest.fn();
    window.chatStorageAPI = {
      bootstrap: jest.fn(() => null),
      write: writeSpy,
    };

    const backend = createChatStorageBackend();
    expect(backend.readBootstrap()).toEqual(legacy);
    expect(writeSpy).toHaveBeenCalledWith(legacy);
    expect(window.localStorage.getItem(MIGRATION_MARKER_KEY)).not.toBeNull();
  });

  test("skips legacy migration when marker already present", () => {
    window.localStorage.setItem(
      LEGACY_LOCALSTORAGE_KEY,
      JSON.stringify({ stale: true }),
    );
    window.localStorage.setItem(MIGRATION_MARKER_KEY, "2026-04-19T00:00:00Z");
    const writeSpy = jest.fn();
    window.chatStorageAPI = {
      bootstrap: jest.fn(() => null),
      write: writeSpy,
    };

    const backend = createChatStorageBackend();
    expect(backend.readBootstrap()).toBeNull();
    expect(writeSpy).not.toHaveBeenCalled();
  });
});
