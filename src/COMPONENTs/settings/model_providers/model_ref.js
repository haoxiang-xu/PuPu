/* Single source of truth for how a catalog entry (`name` + optional size
 * variant) turns into the string used in BOTH roles:
 *   1. the pull target handed to `ollama /api/pull`
 *   2. the pull_store key that progress / cancel are bound to
 *
 * These used to be derived independently in three places, which silently broke
 * for models the library page lists without any size chip (`nomic-embed-text`,
 * `mixtral`, the cloud-only entries — 30 of 232 entries at time of writing):
 * the card built the key `"nomic-embed-text:"` while the hook pulled
 * `"nomic-embed-text:nomic-embed-text"`. Keep every derivation going through
 * buildModelRef so the two can never drift again. */
export const buildModelRef = (modelName, size) => {
  const name = typeof modelName === "string" ? modelName.trim() : "";
  const variant = typeof size === "string" ? size.trim() : "";
  if (!name) return "";
  return variant ? `${name}:${variant}` : name;
};

/* `ollama list` always reports a fully qualified `name:tag`, and a ref pulled
 * without an explicit variant lands as `name:latest`. Match on both so a
 * size-less model that IS installed still shows the installed state. */
export const isModelRefInstalled = (installedNames, modelName, size) => {
  if (!installedNames || typeof installedNames.has !== "function") return false;
  const ref = buildModelRef(modelName, size);
  if (!ref) return false;
  return (
    installedNames.has(ref) ||
    installedNames.has(modelName) ||
    installedNames.has(`${ref}:latest`)
  );
};

/* A catalog entry tagged `cloud` with no local size variants only exists on
 * Ollama Cloud — there are no weights to pull onto this machine, so the pull
 * action is shown disabled rather than blank or falsely clickable.
 * Entries that carry the cloud tag AND local sizes (gpt-oss, qwen3.5, gemma4,
 * nemotron-3-*) stay fully pullable — do not widen this to the tag alone. */
export const isCloudOnlyModel = (model) =>
  Array.isArray(model?.tags) &&
  model.tags.includes("cloud") &&
  (!Array.isArray(model?.sizes) || model.sizes.length === 0);

export default buildModelRef;
