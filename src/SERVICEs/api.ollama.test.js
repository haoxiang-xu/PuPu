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

describe("createOllamaApi searchLibrary size/tag parsing", () => {
  const ollamaApi = createOllamaApi();

  const libraryAnchor = (slug, description, chips, pulls) => `
    <a href="/library/${slug}">
      <h2><span>${slug}</span></h2>
      <p>${description}</p>
      ${chips.map((c) => `<span>${c}</span>`).join("\n")}
      <span>${pulls} Pulls</span>
    </a>`;

  const searchWithHtml = async (html) => {
    window.ollamaLibraryAPI = {
      search: jest.fn().mockResolvedValue(`<main>${html}</main>`),
    };
    return ollamaApi.searchLibrary({ query: "q", category: "" });
  };

  afterEach(() => {
    delete window.ollamaLibraryAPI;
    jest.clearAllMocks();
  });

  test("MoE AxB sizes are recognized for the five affected models", async () => {
    const models = await searchWithHtml(
      [
        libraryAnchor("mixtral", "MoE model", ["8x7b", "8x22b", "tools"], "623.4K"),
        libraryAnchor("dolphin-mixtral", "Uncensored MoE", ["8x7b", "8x22b"], "531.2K"),
        libraryAnchor("llama4", "Multimodal MoE", ["16x17b", "128x17b", "vision", "tools"], "1.2M"),
        libraryAnchor("nous-hermes2-mixtral", "Nous MoE", ["8x7b"], "128.1K"),
        libraryAnchor("notux", "Top-rated MoE", ["8x7b"], "22.3K"),
      ].join("\n"),
    );

    expect(models.map(({ name, sizes }) => ({ name, sizes }))).toEqual([
      { name: "mixtral", sizes: ["8x7b", "8x22b"] },
      { name: "dolphin-mixtral", sizes: ["8x7b", "8x22b"] },
      { name: "llama4", sizes: ["16x17b", "128x17b"] },
      { name: "nous-hermes2-mixtral", sizes: ["8x7b"] },
      { name: "notux", sizes: ["8x7b"] },
    ]);
    expect(models.find((m) => m.name === "llama4").tags).toEqual([
      "vision",
      "tools",
    ]);
  });

  test("regular size chips still parse (no regression)", async () => {
    const models = await searchWithHtml(
      [
        libraryAnchor("llama3.1", "Llama", ["8b", "70b", "405b"], "94.7M"),
        libraryAnchor("qwen2.5", "Qwen", ["0.5b", "1.5b", "7b", "72b"], "12.3M"),
        libraryAnchor("gemma3n", "Gemma", ["e2b", "e4b"], "1.1M"),
        libraryAnchor("all-minilm", "Embedding", ["22m", "33m", "embedding"], "1.5M"),
      ].join("\n"),
    );

    expect(models.map(({ name, sizes }) => ({ name, sizes }))).toEqual([
      { name: "llama3.1", sizes: ["8b", "70b", "405b"] },
      { name: "qwen2.5", sizes: ["0.5b", "1.5b", "7b", "72b"] },
      { name: "gemma3n", sizes: ["e2b", "e4b"] },
      { name: "all-minilm", sizes: ["22m", "33m"] },
    ]);
  });

  test("category keywords land in tags, never in sizes", async () => {
    const models = await searchWithHtml(
      libraryAnchor(
        "granite4",
        "IBM Granite",
        ["vision", "tools", "embedding", "cloud", "thinking", "3b"],
        "410.2K",
      ),
    );

    expect(models).toHaveLength(1);
    expect(models[0].tags).toEqual([
      "vision",
      "tools",
      "embedding",
      "cloud",
      "thinking",
    ]);
    expect(models[0].sizes).toEqual(["3b"]);
  });

  test("non-size words and the pulls token are not absorbed as sizes", async () => {
    const models = await searchWithHtml(
      libraryAnchor(
        "some-model",
        "Fast model with 8x7b routing", // description <p> must not leak into sizes
        ["7b", "instruct", "v2.5", "fp16", "128k-context-window", "70b-instruct"],
        "422.5K",
      ),
    );

    expect(models).toHaveLength(1);
    // "instruct"/"v2.5"/"fp16" are not sizes; "422.5k" is the pulls token;
    // "128k-context-window" has two hyphen segments and is rejected (the
    // suffix group accepts exactly one "-token"); "70b-instruct" is the
    // legacy single-suffix acceptance, preserved by the MoE extension.
    expect(models[0].sizes).toEqual(["7b", "70b-instruct"]);
  });

  test("legacy bare-x suffix matching set is preserved", async () => {
    const models = await searchWithHtml(
      libraryAnchor("legacy-model", "Legacy", ["2x", "7b"], "10.1K"),
    );

    // "2x" matched under the original SIZE_RE (`[kmbx]` suffix class).
    // This test pins the backward-compat guarantee: extending to MoE AxB
    // must not shrink the previously accepted set.
    expect(models[0].sizes).toEqual(["2x", "7b"]);
  });

  test("throws bridge_unavailable when the library bridge is missing", async () => {
    delete window.ollamaLibraryAPI;
    await expect(ollamaApi.searchLibrary({ query: "q" })).rejects.toMatchObject({
      code: "bridge_unavailable",
    });
  });
});

