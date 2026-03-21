const SETTINGS_KEY = "settings";
const EMBEDDING_PROVIDER_OPTIONS = new Set(["auto", "openai", "ollama"]);

const isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const clampInteger = (value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0 } = {}) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(numeric)));
};
const clampThreshold = (value, fallback = 0) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const clamped = Math.min(1, Math.max(0, numeric));
  return Number(clamped.toFixed(2));
};

const readRoot = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const writeRoot = (root) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(root));
  } catch {
    /* ignore */
  }
};

export const DEFAULT_MEMORY_SETTINGS = {
  enabled: true,
  long_term_enabled: true,
  long_term_extract_every_n_turns: 6,
  embedding_provider: "auto",
  ollama_embedding_model: "nomic-embed-text",
  openai_embedding_model: "text-embedding-3-small",
  last_n_turns: 8,
  vector_top_k: 4,
  vector_min_score: 0,
  long_term_top_k: 4,
  long_term_min_score: 0,
};

export const normalizeMemorySettings = (value) => {
  const raw = isObject(value) ? value : {};
  const embeddingProvider =
    typeof raw.embedding_provider === "string"
      ? raw.embedding_provider.trim().toLowerCase()
      : DEFAULT_MEMORY_SETTINGS.embedding_provider;
  const legacyLongTermTopK =
    raw.long_term_vector_top_k ??
    raw.long_term_episode_top_k ??
    raw.long_term_playbook_top_k;
  const legacyLongTermMinScore =
    raw.long_term_vector_min_score ??
    raw.long_term_episode_min_score ??
    raw.long_term_playbook_min_score;

  return {
    enabled:
      typeof raw.enabled === "boolean"
        ? raw.enabled
        : DEFAULT_MEMORY_SETTINGS.enabled,
    long_term_enabled:
      typeof raw.long_term_enabled === "boolean"
        ? raw.long_term_enabled
        : DEFAULT_MEMORY_SETTINGS.long_term_enabled,
    long_term_extract_every_n_turns: clampInteger(
      raw.long_term_extract_every_n_turns,
      {
        min: 1,
        max: 20,
        fallback: DEFAULT_MEMORY_SETTINGS.long_term_extract_every_n_turns,
      },
    ),
    embedding_provider: EMBEDDING_PROVIDER_OPTIONS.has(embeddingProvider)
      ? embeddingProvider
      : DEFAULT_MEMORY_SETTINGS.embedding_provider,
    ollama_embedding_model:
      typeof raw.ollama_embedding_model === "string" &&
      raw.ollama_embedding_model.trim()
        ? raw.ollama_embedding_model.trim()
        : DEFAULT_MEMORY_SETTINGS.ollama_embedding_model,
    openai_embedding_model:
      typeof raw.openai_embedding_model === "string" &&
      raw.openai_embedding_model.trim()
        ? raw.openai_embedding_model.trim()
        : DEFAULT_MEMORY_SETTINGS.openai_embedding_model,
    last_n_turns: clampInteger(raw.last_n_turns, {
      min: 1,
      max: 20,
      fallback: DEFAULT_MEMORY_SETTINGS.last_n_turns,
    }),
    vector_top_k: clampInteger(raw.vector_top_k, {
      min: 0,
      max: 10,
      fallback: DEFAULT_MEMORY_SETTINGS.vector_top_k,
    }),
    vector_min_score: clampThreshold(
      raw.vector_min_score,
      DEFAULT_MEMORY_SETTINGS.vector_min_score,
    ),
    long_term_top_k: clampInteger(raw.long_term_top_k ?? legacyLongTermTopK, {
      min: 0,
      max: 10,
      fallback: DEFAULT_MEMORY_SETTINGS.long_term_top_k,
    }),
    long_term_min_score: clampThreshold(
      raw.long_term_min_score ?? legacyLongTermMinScore,
      DEFAULT_MEMORY_SETTINGS.long_term_min_score,
    ),
  };
};

export const readMemorySettings = () => {
  const root = readRoot();
  const saved = isObject(root.memory) ? root.memory : {};
  return normalizeMemorySettings({ ...DEFAULT_MEMORY_SETTINGS, ...saved });
};

export const writeMemorySettings = (patch) => {
  const root = readRoot();
  const current = isObject(root.memory) ? root.memory : {};
  root.memory = normalizeMemorySettings({ ...current, ...patch });
  writeRoot(root);
};
