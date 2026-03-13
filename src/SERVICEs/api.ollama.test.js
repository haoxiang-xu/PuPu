import { createOllamaApi } from "./api.ollama";

const makeResponse = (models) => ({
  ok: true,
  json: async () => ({ models }),
});

describe("createOllamaApi model listing", () => {
  const originalFetch = global.fetch;
  const ollamaApi = createOllamaApi();

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  test("listModels keeps all installed models", async () => {
    global.fetch.mockResolvedValue(
      makeResponse([
        {
          name: "llama3",
          size: 42,
          details: { families: ["llama"] },
        },
        {
          name: "nomic-embed-text",
          size: 8,
          details: { families: ["bert", "nomic-bert"] },
        },
        {
          model: "mystery-model",
          size: 5,
          details: {},
        },
      ]),
    );

    await expect(ollamaApi.listModels()).resolves.toEqual([
      { name: "llama3", size: 42 },
      { name: "nomic-embed-text", size: 8 },
      { name: "mystery-model", size: 5 },
    ]);
  });

  test("listChatModels filters embedding families", async () => {
    global.fetch.mockResolvedValue(
      makeResponse([
        {
          name: "llama3",
          size: 42,
          details: { families: ["llama"] },
        },
        {
          name: "bge-m3",
          size: 12,
          details: { families: ["bge-m3"] },
        },
        {
          name: "nomic-embed-text",
          size: 8,
          details: { families: ["nomic-bert"] },
        },
        {
          name: "unknown-chat-model",
          size: 4,
          details: {},
        },
      ]),
    );

    await expect(ollamaApi.listChatModels()).resolves.toEqual([
      { name: "llama3", size: 42 },
      { name: "unknown-chat-model", size: 4 },
    ]);
  });

  test("listEmbeddingModels keeps only embedding families", async () => {
    global.fetch.mockResolvedValue(
      makeResponse([
        {
          name: "llama3",
          size: 42,
          details: { families: ["llama"] },
        },
        {
          name: "bge-m3",
          size: 12,
          details: { families: ["bge-m3"] },
        },
        {
          name: "nomic-embed-text",
          size: 8,
          details: { families: ["bert", "nomic-bert"] },
        },
      ]),
    );

    await expect(ollamaApi.listEmbeddingModels()).resolves.toEqual([
      { name: "bge-m3", size: 12 },
      { name: "nomic-embed-text", size: 8 },
    ]);
  });
});
