const path = require("path");
const os = require("os");
const fs = require("fs");
const fsp = require("fs/promises");

const { createChatStorageService } = require(
  "../../main/services/chat_storage/service",
);

const makeTempDir = () =>
  fs.mkdtempSync(path.join(os.tmpdir(), "pupu-chat-storage-"));

const fakeApp = (userDataDir) => ({
  getPath: (key) => {
    if (key === "userData") return userDataDir;
    throw new Error(`unexpected app.getPath(${key})`);
  },
});

describe("chat storage service", () => {
  let dir;

  beforeEach(() => {
    dir = makeTempDir();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("init returns null snapshot when no chats.json exists", async () => {
    const service = createChatStorageService({
      app: fakeApp(dir),
      fs,
      fsp,
      path,
      debounceMs: 10,
    });
    await service.init();
    expect(service.getBootstrapSnapshot()).toBeNull();
  });

  test("init reads the existing chats.json synchronously-visible snapshot", async () => {
    const payload = { activeChatId: "a", chatsById: { a: { id: "a" } } };
    fs.writeFileSync(
      path.join(dir, "chats.json"),
      JSON.stringify(payload),
      "utf8",
    );
    const service = createChatStorageService({
      app: fakeApp(dir),
      fs,
      fsp,
      path,
      debounceMs: 10,
    });
    await service.init();
    expect(service.getBootstrapSnapshot()).toEqual(payload);
  });

  test("write debounces multiple calls into a single file write", async () => {
    const service = createChatStorageService({
      app: fakeApp(dir),
      fs,
      fsp,
      path,
      debounceMs: 20,
    });
    await service.init();

    service.write({ n: 1 });
    service.write({ n: 2 });
    service.write({ n: 3 });

    await new Promise((resolve) => setTimeout(resolve, 40));
    const raw = fs.readFileSync(path.join(dir, "chats.json"), "utf8");
    expect(JSON.parse(raw)).toEqual({ n: 3 });
  });

  test("write is atomic — tmp file rename, never half-written", async () => {
    const service = createChatStorageService({
      app: fakeApp(dir),
      fs,
      fsp,
      path,
      debounceMs: 10,
    });
    await service.init();
    service.write({ atomic: true });
    await new Promise((resolve) => setTimeout(resolve, 30));

    const entries = fs.readdirSync(dir);
    expect(entries).toContain("chats.json");
    expect(entries.every((name) => !name.endsWith(".tmp"))).toBe(true);
  });

  test("flushSync persists the latest pending write before returning", async () => {
    const service = createChatStorageService({
      app: fakeApp(dir),
      fs,
      fsp,
      path,
      debounceMs: 1000,
    });
    await service.init();
    service.write({ final: "yes" });
    service.flushSync();

    const raw = fs.readFileSync(path.join(dir, "chats.json"), "utf8");
    expect(JSON.parse(raw)).toEqual({ final: "yes" });
  });

  test("getBootstrapSnapshot reflects the most recent write (memory mirror)", async () => {
    const service = createChatStorageService({
      app: fakeApp(dir),
      fs,
      fsp,
      path,
      debounceMs: 50,
    });
    await service.init();
    expect(service.getBootstrapSnapshot()).toBeNull();

    service.write({ mirror: 1 });
    expect(service.getBootstrapSnapshot()).toEqual({ mirror: 1 });
  });
});
