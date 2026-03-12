const SETTINGS_KEY = "settings";

const isObject = (v) => v != null && typeof v === "object" && !Array.isArray(v);

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
};

export const readMemorySettings = () => {
  const root = readRoot();
  const saved = isObject(root.memory) ? root.memory : {};
  return { ...DEFAULT_MEMORY_SETTINGS, ...saved };
};

export const writeMemorySettings = (patch) => {
  const root = readRoot();
  const current = isObject(root.memory) ? root.memory : {};
  root.memory = { ...current, ...patch };
  writeRoot(root);
};
