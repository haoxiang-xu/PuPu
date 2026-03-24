import { api } from "./api";

describe("api.miso character methods", () => {
  const originalMisoApi = window.misoAPI;

  beforeEach(() => {
    window.misoAPI = {
      listCharacters: jest.fn(async () => ({
        characters: [{ id: "mina" }],
        count: 1,
      })),
      saveCharacter: jest.fn(async (payload) => ({
        ...payload,
        id: payload.id || "mina",
      })),
      buildCharacterAgentConfig: jest.fn(async (payload) => ({
        session_id: "character_mina__dm__main_thread",
        ...payload,
      })),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    window.misoAPI = originalMisoApi;
  });

  test("listCharacters normalizes the bridge response", async () => {
    await expect(api.miso.listCharacters()).resolves.toEqual({
      characters: [{ id: "mina" }],
      count: 1,
    });
  });

  test("saveCharacter forwards the payload", async () => {
    const payload = { name: "Mina" };
    await api.miso.saveCharacter(payload);

    expect(window.misoAPI.saveCharacter).toHaveBeenCalledWith(payload);
  });

  test("buildCharacterAgentConfig forwards the payload", async () => {
    const payload = { characterId: "mina", threadId: "main thread" };
    await api.miso.buildCharacterAgentConfig(payload);

    expect(window.misoAPI.buildCharacterAgentConfig).toHaveBeenCalledWith(
      payload,
    );
  });
});
