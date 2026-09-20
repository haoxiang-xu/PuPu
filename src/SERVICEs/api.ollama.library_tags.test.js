import fs from "fs";
import path from "path";
import { createOllamaApi, parseLibraryTagsHtml } from "./api.ollama";

const FIXTURE = fs.readFileSync(
  path.join(__dirname, "__fixtures__", "ollama_tags_qwen3.html"),
  "utf8",
);

describe("parseLibraryTagsHtml (real ollama.com page, saved 2026-09-19)", () => {
  test("yields one entry per tag with size, context, input and age", () => {
    const tags = parseLibraryTagsHtml(FIXTURE, "qwen3");
    expect(tags.length).toBeGreaterThan(20);
    const byTag = Object.fromEntries(tags.map((t) => [t.tag, t]));
    expect(byTag.latest).toMatchObject({
      size_label: "5.2GB",
      size_bytes: 5_200_000_000,
      context: "40K",
      input: "Text",
    });
    expect(byTag.latest.updated).toMatch(/ago$/);
    expect(byTag["0.6b"].size_bytes).toBeLessThan(byTag["32b"].size_bytes);
    // no duplicates, page order preserved for the first few
    expect(new Set(tags.map((t) => t.tag)).size).toBe(tags.length);
    expect(tags[0].tag).toBe("latest");
  });

  test("a page that no longer matches parses to [] rather than throwing", () => {
    expect(parseLibraryTagsHtml("<html><body>nope</body></html>", "qwen3")).toEqual([]);
    expect(parseLibraryTagsHtml("", "qwen3")).toEqual([]);
    expect(parseLibraryTagsHtml(FIXTURE, "not-on-this-page")).toEqual([]);
  });
});

describe("api.ollama.fetchLibraryTags / searchLibrary sort (BC-002 / BC-003 producer)", () => {
  afterEach(() => {
    delete window.ollamaLibraryAPI;
  });

  test("fetchLibraryTags invokes the bridge with the trimmed name and parses", async () => {
    const tagsMock = jest.fn(() => Promise.resolve(FIXTURE));
    window.ollamaLibraryAPI = { search: jest.fn(), tags: tagsMock };
    const api = createOllamaApi();
    const tags = await api.fetchLibraryTags("  qwen3 ");
    expect(tagsMock).toHaveBeenCalledWith("qwen3");
    expect(tags.find((t) => t.tag === "14b")).toBeTruthy();
  });

  test("fetchLibraryTags refuses an empty name and a missing bridge", async () => {
    const api = createOllamaApi();
    await expect(api.fetchLibraryTags("")).rejects.toMatchObject({ code: "invalid_argument" });
    window.ollamaLibraryAPI = { search: jest.fn() };
    await expect(api.fetchLibraryTags("qwen3")).rejects.toMatchObject({ code: "bridge_unavailable" });
  });

  test("searchLibrary forwards only the exact 'newest' sort; anything else becomes default", async () => {
    const search = jest.fn(() => Promise.resolve("<html></html>"));
    window.ollamaLibraryAPI = { search, tags: jest.fn() };
    const api = createOllamaApi();
    await api.searchLibrary({ query: "q", category: "c", sort: "newest" });
    expect(search).toHaveBeenLastCalledWith("q", "c", "newest");
    await api.searchLibrary({ query: "q", category: "c", sort: "evil" });
    expect(search).toHaveBeenLastCalledWith("q", "c", "");
    await api.searchLibrary({ query: "q" });
    expect(search).toHaveBeenLastCalledWith("q", "", "");
  });
});
