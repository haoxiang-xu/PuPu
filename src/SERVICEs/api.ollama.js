import {
  FrontendApiError,
  OLLAMA_BASE,
  assertBridgeMethod,
  hasBridgeMethod,
  safeJson,
  toFrontendApiError,
  withTimeout,
} from "./api.shared";

export const createOllamaApi = () => ({
  isBridgeAvailable: () =>
    hasBridgeMethod("ollamaAPI", "getStatus") &&
    hasBridgeMethod("ollamaAPI", "restart"),

  install: async () => {
    try {
      const method = assertBridgeMethod("ollamaAPI", "install");
      return await withTimeout(
        () => method(),
        120000,
        "ollama_install_timeout",
        "Ollama download timed out",
      );
    } catch (error) {
      throw toFrontendApiError(
        error,
        "ollama_install_failed",
        "Ollama download failed",
      );
    }
  },

  onInstallProgress: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }

    if (!hasBridgeMethod("ollamaAPI", "onInstallProgress")) {
      return () => {};
    }

    try {
      const method = assertBridgeMethod("ollamaAPI", "onInstallProgress");
      const unsubscribe = method(callback);
      return typeof unsubscribe === "function" ? unsubscribe : () => {};
    } catch (_error) {
      return () => {};
    }
  },

  getStatus: async () => {
    try {
      const method = assertBridgeMethod("ollamaAPI", "getStatus");
      const status = await withTimeout(
        () => method(),
        5000,
        "ollama_status_timeout",
        "Ollama status request timed out",
      );
      return typeof status === "string" ? status : "unknown";
    } catch (error) {
      throw toFrontendApiError(
        error,
        "ollama_status_failed",
        "Failed to query Ollama status",
      );
    }
  },

  restart: async () => {
    try {
      const method = assertBridgeMethod("ollamaAPI", "restart");
      const result = await withTimeout(
        () => method(),
        10000,
        "ollama_restart_timeout",
        "Ollama restart request timed out",
      );
      return typeof result === "string" ? result : "error";
    } catch (error) {
      throw toFrontendApiError(
        error,
        "ollama_restart_failed",
        "Failed to restart Ollama",
      );
    }
  },

  listModels: async () => {
    try {
      const response = await withTimeout(
        () =>
          fetch(`${OLLAMA_BASE}/api/tags`, {
            method: "GET",
          }),
        3000,
        "ollama_list_timeout",
        "Ollama model list request timed out",
      );

      if (!response.ok) {
        throw new FrontendApiError(
          "ollama_http_error",
          `Failed to list Ollama models (${response.status})`,
          null,
          { status: response.status },
        );
      }

      const json = await safeJson(response);
      const models = (json?.models || [])
        .map((item) => ({
          name: item?.name,
          size: item?.size || 0,
        }))
        .filter((item) => typeof item.name === "string" && item.name.trim());

      return models.sort((a, b) => b.size - a.size);
    } catch (error) {
      throw toFrontendApiError(
        error,
        "ollama_list_failed",
        "Failed to load Ollama models",
      );
    }
  },

  /**
   * List only embedding-capable models installed locally.
   * Filters by checking `details.families` for known embedding families
   * (e.g. "bert", "nomic-bert").
   */
  listEmbeddingModels: async () => {
    const EMBEDDING_FAMILIES = new Set(["bert", "nomic-bert", "bge"]);
    try {
      const response = await withTimeout(
        () =>
          fetch(`${OLLAMA_BASE}/api/tags`, {
            method: "GET",
          }),
        3000,
        "ollama_embed_list_timeout",
        "Ollama embedding model list request timed out",
      );

      if (!response.ok) {
        throw new FrontendApiError(
          "ollama_http_error",
          `Failed to list Ollama models (${response.status})`,
          null,
          { status: response.status },
        );
      }

      const json = await safeJson(response);
      const models = (json?.models || [])
        .filter((item) => {
          const families = item?.details?.families || [];
          return families.some((f) => EMBEDDING_FAMILIES.has(f));
        })
        .map((item) => ({
          name: item?.name,
          size: item?.size || 0,
        }))
        .filter((item) => typeof item.name === "string" && item.name.trim());

      return models.sort((a, b) => b.size - a.size);
    } catch (error) {
      throw toFrontendApiError(
        error,
        "ollama_embed_list_failed",
        "Failed to load Ollama embedding models",
      );
    }
  },

  searchLibrary: async ({ query = "", category = "" } = {}) => {
    if (
      typeof window === "undefined" ||
      typeof window.ollamaLibraryAPI?.search !== "function"
    ) {
      throw new FrontendApiError(
        "bridge_unavailable",
        "Ollama library bridge not available",
      );
    }
    const rawHtml = await window.ollamaLibraryAPI.search(query, category);
    if (typeof rawHtml !== "string") {
      throw new FrontendApiError(
        "parse_error",
        "Unexpected response from library search",
      );
    }

    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(rawHtml, "text/html");
      const CATEGORY_KEYWORDS = new Set([
        "embedding",
        "vision",
        "tools",
        "thinking",
        "code",
        "cloud",
      ]);
      const SIZE_RE = /^\d+(\.\d+)?[kKmMbBxX]$/;

      const models = [];
      const anchors = doc.querySelectorAll("a[href^='/library/']");

      anchors.forEach((a) => {
        const href = a.getAttribute("href") || "";
        const slug = href.replace(/^\/library\//, "");
        if (!slug || slug.includes("/")) return;

        const descEl = a.querySelector("p");
        const description = descEl ? descEl.textContent.trim() : "";

        const textNodes = Array.from(a.querySelectorAll("span, p"))
          .map((el) => el.textContent.trim().toLowerCase())
          .filter(Boolean);

        const tags = [];
        const sizes = [];

        textNodes.forEach((t) => {
          if (CATEGORY_KEYWORDS.has(t)) {
            if (!tags.includes(t)) tags.push(t);
          } else if (SIZE_RE.test(t)) {
            if (!sizes.includes(t)) sizes.push(t);
          }
        });

        const fullText = a.textContent || "";
        const pullsMatch = fullText.match(/([\d.]+[kKmMbB])\s+Pulls/i);
        const pulls = pullsMatch ? pullsMatch[1] : "";

        models.push({ name: slug, description, tags, sizes, pulls });
      });

      return models;
    } catch (parseErr) {
      throw new FrontendApiError(
        "parse_error",
        "Failed to parse Ollama library response",
        parseErr,
      );
    }
  },

  pullModel: async ({ name, onProgress, signal } = {}) => {
    const modelName = typeof name === "string" ? name.trim() : "";
    if (!modelName) {
      throw new FrontendApiError("invalid_argument", "Model name is required");
    }

    const response = await withTimeout(
      () =>
        fetch(`${OLLAMA_BASE}/api/pull`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: modelName, stream: true }),
          signal: signal || undefined,
        }),
      60000,
      "ollama_pull_timeout",
      "Ollama pull request timed out",
    );

    if (!response.ok) {
      throw new FrontendApiError(
        "ollama_http_error",
        `Failed to pull model (${response.status})`,
        null,
        { status: response.status, model: modelName },
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new FrontendApiError("stream_error", "No response body stream");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const obj = JSON.parse(trimmed);
          const status = typeof obj.status === "string" ? obj.status : "";
          const completed =
            typeof obj.completed === "number" ? obj.completed : null;
          const total = typeof obj.total === "number" ? obj.total : null;
          const percent =
            completed !== null && total !== null && total > 0
              ? Math.round((completed / total) * 100)
              : null;
          if (typeof onProgress === "function") {
            onProgress({ status, percent, completed, total });
          }
          if (status === "success") return;
        } catch (_) {
          // ignore non-JSON lines
        }
      }
    }
  },

  deleteModel: async (name) => {
    const modelName = typeof name === "string" ? name.trim() : "";
    if (!modelName) {
      throw new FrontendApiError("invalid_argument", "Model name is required");
    }

    try {
      const response = await withTimeout(
        () =>
          fetch(`${OLLAMA_BASE}/api/delete`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: modelName }),
          }),
        5000,
        "ollama_delete_timeout",
        "Ollama delete request timed out",
      );

      if (!response.ok) {
        throw new FrontendApiError(
          "ollama_http_error",
          `Failed to delete Ollama model (${response.status})`,
          null,
          { status: response.status, model: modelName },
        );
      }
    } catch (error) {
      throw toFrontendApiError(
        error,
        "ollama_delete_failed",
        "Failed to delete Ollama model",
        { model: modelName },
      );
    }
  },
});

export default createOllamaApi;
