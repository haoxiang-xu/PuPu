import { api } from "./api";

describe("api.unchain character methods", () => {
  const originalMisoApi = window.unchainAPI;

  beforeEach(() => {
    window.unchainAPI = {
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
    window.unchainAPI = originalMisoApi;
  });

  test("listCharacters normalizes the bridge response", async () => {
    await expect(api.unchain.listCharacters()).resolves.toEqual({
      characters: [{ id: "mina" }],
      count: 1,
    });
  });

  test("saveCharacter forwards the payload", async () => {
    const payload = { name: "Mina" };
    await api.unchain.saveCharacter(payload);

    expect(window.unchainAPI.saveCharacter).toHaveBeenCalledWith(payload);
  });

  test("buildCharacterAgentConfig forwards the payload", async () => {
    const payload = { characterId: "mina", threadId: "main thread" };
    await api.unchain.buildCharacterAgentConfig(payload);

    expect(window.unchainAPI.buildCharacterAgentConfig).toHaveBeenCalledWith(
      payload,
    );
  });
});
