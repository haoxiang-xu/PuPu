import {
  FrontendApiError,
  OLLAMA_BASE,
  assertBridgeMethod,
  hasBridgeMethod,
  safeJson,
  toFrontendApiError,
  withTimeout,
} from "./api.shared";
import { createLogger } from "./console_logger";

const OLLAMA_EMBEDDING_FAMILY_PREFIXES = ["bert", "nomic-bert", "bge"];
const ollamaLogger = createLogger("OLLAMA", "src/SERVICEs/api.ollama.js");

const normalizeOllamaFamily = (rawFamily) =>
  typeof rawFamily === "string" ? rawFamily.trim().toLowerCase() : "";

const isEmbeddingFamily = (rawFamily) => {
  const family = normalizeOllamaFamily(rawFamily);
  return OLLAMA_EMBEDDING_FAMILY_PREFIXES.some(
    (prefix) => family === prefix || family.startsWith(`${prefix}-`),
  );
};

const normalizeInstalledOllamaModels = (payload) =>
  (payload?.models || [])
    .map((item) => {
      const details =
        item?.details && typeof item.details === "object" ? item.details : {};
      const rawFamilies = [
        ...(Array.isArray(details.families) ? details.families : []),
        details.family,
      ];
      const families = [...new Set(rawFamilies.map(normalizeOllamaFamily))].filter(
        Boolean,
      );
      const rawName =
        typeof item?.name === "string" && item.name.trim()
          ? item.name
          : item?.model;
      const rawSize = Number(item?.size);
      return {
        name: typeof rawName === "string" ? rawName.trim() : "",
        size: Number.isFinite(rawSize) ? rawSize : 0,
        families,
      };
    })
    .filter((item) => item.name)
    .sort((a, b) => b.size - a.size);

const fetchInstalledOllamaModels = async ({
  timeoutCode,
  timeoutMessage,
  failureCode,
  failureMessage,
}) => {
  try {
    if (hasBridgeMethod("ollamaAPI", "listInstalledModels")) {
      const method = assertBridgeMethod("ollamaAPI", "listInstalledModels");
      const payload = await withTimeout(
        () => method(),
        3000,
        timeoutCode,
        timeoutMessage,
      );
      return normalizeInstalledOllamaModels(payload);
    }

    const response = await withTimeout(
      () =>
        fetch(`${OLLAMA_BASE}/api/tags`, {
          method: "GET",
        }),
      3000,
      timeoutCode,
      timeoutMessage,
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
    return normalizeInstalledOllamaModels(json);
  } catch (error) {
    const frontendError = toFrontendApiError(error, failureCode, failureMessage);
    ollamaLogger.error("api_tags_failed", {
      endpoint: `${OLLAMA_BASE}/api/tags`,
      code: frontendError.code,
      message: frontendError.message,
    });
    throw frontendError;
  }
};

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
    const models = await fetchInstalledOllamaModels({
      timeoutCode: "ollama_list_timeout",
      timeoutMessage: "Ollama model list request timed out",
      failureCode: "ollama_list_failed",
      failureMessage: "Failed to load Ollama models",
    });
    return models.map(({ name, size }) => ({ name, size }));
  },

  listChatModels: async () => {
    const models = await fetchInstalledOllamaModels({
      timeoutCode: "ollama_chat_list_timeout",
      timeoutMessage: "Ollama chat model list request timed out",
      failureCode: "ollama_chat_list_failed",
      failureMessage: "Failed to load Ollama chat models",
    });
    return models
      .filter(({ families }) => !families.some(isEmbeddingFamily))
      .map(({ name, size }) => ({ name, size }));
  },

  /**
   * List only embedding-capable models installed locally.
   * Filters by checking `details.families` for known embedding families.
   */
  listEmbeddingModels: async () => {
    const models = await fetchInstalledOllamaModels({
      timeoutCode: "ollama_embed_list_timeout",
      timeoutMessage: "Ollama embedding model list request timed out",
      failureCode: "ollama_embed_list_failed",
      failureMessage: "Failed to load Ollama embedding models",
    });
    return models
      .filter(({ families }) => families.some(isEmbeddingFamily))
      .map(({ name, size }) => ({ name, size }));
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
        "audio",
      ]);
      const SIZE_RE = /^[a-z]?\d+(\.\d+)?[kmbx](-[a-z0-9]+)?$/i;

      const models = [];
      const anchors = doc.querySelectorAll("a[href^='/library/']");

      anchors.forEach((a) => {
        const href = a.getAttribute("href") || "";
        const slug = href.replace(/^\/library\//, "");
        if (!slug || slug.includes("/")) return;

        const descEl = a.querySelector("p");
        const description = descEl ? descEl.textContent.trim() : "";

        const fullText = a.textContent || "";
        const pullsMatch = fullText.match(/([\d.]+[kKmMbB])\s+Pulls/i);
        const pulls = pullsMatch ? pullsMatch[1] : "";
        const pullsToken = pulls.toLowerCase();

        const textNodes = Array.from(a.querySelectorAll("span, p"))
          .map((el) => el.textContent.trim().toLowerCase())
          .filter(Boolean);

        const tags = [];
        const sizes = [];

        textNodes.forEach((t) => {
          if (CATEGORY_KEYWORDS.has(t)) {
            if (!tags.includes(t)) tags.push(t);
          } else if (t !== pullsToken && SIZE_RE.test(t)) {
            if (!sizes.includes(t)) sizes.push(t);
          }
        });

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

    const startedAt = Date.now();
    ollamaLogger.log("pull_start", { model: modelName });

    let response;
    try {
      response = await withTimeout(
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
    } catch (fetchErr) {
      ollamaLogger.error("pull_fetch_failed", {
        model: modelName,
        error: fetchErr?.message || String(fetchErr),
      });
      throw fetchErr;
    }

    ollamaLogger.log("pull_http_response", {
      model: modelName,
      status: response.status,
      ok: response.ok,
    });

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
      ollamaLogger.error("pull_no_stream", { model: modelName });
      throw new FrontendApiError("stream_error", "No response body stream");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let frameCount = 0;
    let lastFrameAt = Date.now();
    let lastStatus = null;
    let lastCompleted = null;
    let lastDigest = null;
    let stagnantRepeats = 0;

    while (true) {
      const readStartedAt = Date.now();
      const gapSinceLastFrame = readStartedAt - lastFrameAt;
      if (gapSinceLastFrame > 5000) {
        ollamaLogger.warn("pull_stall", {
          model: modelName,
          gapMs: gapSinceLastFrame,
          lastStatus,
          lastCompleted,
          lastDigest,
        });
      }

      let readResult;
      try {
        readResult = await reader.read();
      } catch (readErr) {
        ollamaLogger.error("pull_read_failed", {
          model: modelName,
          elapsedMs: Date.now() - startedAt,
          frameCount,
          lastStatus,
          error: readErr?.message || String(readErr),
        });
        throw readErr;
      }

      const { done, value } = readResult;
      if (done) {
        ollamaLogger.log("pull_stream_closed", {
          model: modelName,
          elapsedMs: Date.now() - startedAt,
          frameCount,
          lastStatus,
        });
        break;
      }

      const chunkBytes = value?.length ?? 0;
      const chunkGap = Date.now() - readStartedAt;
      if (chunkGap > 3000) {
        ollamaLogger.warn("pull_slow_read", {
          model: modelName,
          readMs: chunkGap,
          bytes: chunkBytes,
        });
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let obj;
        try {
          obj = JSON.parse(trimmed);
        } catch (parseErr) {
          ollamaLogger.warn("pull_parse_failed", {
            model: modelName,
            line: trimmed.slice(0, 200),
            error: parseErr?.message || String(parseErr),
          });
          continue;
        }

        const status = typeof obj.status === "string" ? obj.status : "";
        const errorMsg = typeof obj.error === "string" ? obj.error : null;
        const completed =
          typeof obj.completed === "number" ? obj.completed : null;
        const total = typeof obj.total === "number" ? obj.total : null;
        const digest = typeof obj.digest === "string" ? obj.digest : null;
        const percent =
          completed !== null && total !== null && total > 0
            ? Math.round((completed / total) * 100)
            : null;

        frameCount += 1;
        const nowFrameAt = Date.now();
        const frameGap = nowFrameAt - lastFrameAt;
        lastFrameAt = nowFrameAt;

        // Detect explicit error from Ollama backend (e.g. "pull model manifest: file does not exist")
        if (errorMsg) {
          ollamaLogger.error("pull_error_frame", {
            model: modelName,
            frame: frameCount,
            error: errorMsg,
            raw: obj,
          });
          throw new FrontendApiError(
            "ollama_pull_error",
            errorMsg,
            null,
            { model: modelName, frame: frameCount, raw: obj },
          );
        }

        // Frame with no status and no error — likely an unknown payload, dump raw obj
        if (!status) {
          ollamaLogger.warn("pull_unknown_frame", {
            model: modelName,
            frame: frameCount,
            raw: obj,
          });
        }

        // Detect stagnation: same digest with same completed value across frames
        const isDownloading = status.startsWith("downloading");
        if (isDownloading && digest === lastDigest && completed === lastCompleted) {
          stagnantRepeats += 1;
        } else {
          if (stagnantRepeats >= 3) {
            ollamaLogger.warn("pull_layer_stagnant", {
              model: modelName,
              digest: lastDigest,
              completed: lastCompleted,
              repeats: stagnantRepeats,
            });
          }
          stagnantRepeats = 0;
        }

        ollamaLogger.log("pull_frame", {
          model: modelName,
          frame: frameCount,
          gapMs: frameGap,
          status,
          percent,
          completed,
          total,
          digest,
        });

        if (isDownloading) {
          lastDigest = digest;
          lastCompleted = completed;
        }
        lastStatus = status;

        if (typeof onProgress === "function") {
          onProgress({ status, percent, completed, total });
        }
        if (status === "success") {
          ollamaLogger.log("pull_success", {
            model: modelName,
            elapsedMs: Date.now() - startedAt,
            frameCount,
          });
          return;
        }
      }
    }

    // Stream closed without ever seeing "success" — treat as failure
    ollamaLogger.error("pull_incomplete", {
      model: modelName,
      frameCount,
      lastStatus,
    });
    throw new FrontendApiError(
      "ollama_pull_incomplete",
      `Pull stream ended without success (last status: "${lastStatus || "none"}")`,
      null,
      { model: modelName, frames: frameCount, lastStatus },
    );
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
