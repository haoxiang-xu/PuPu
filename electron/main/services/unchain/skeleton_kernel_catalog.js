const { authorizeSkeletonProfile, trustedCustomProviders } = require("./skeleton_credentials");

const record = (value) => value && typeof value === "object" && !Array.isArray(value);
const positiveInt = (value) => Number.isSafeInteger(value) && value > 0;

// The registry is Main-owned. Project only the existing Kernel contract, and
// run the same target admission used immediately before credential resolution.
function withConfiguredKernelProfiles(catalog, readRegistry) {
  if (!Array.isArray(catalog?.profiles) || !Array.isArray(catalog?.unavailable)) return catalog;
  let registrations;
  try {
    registrations = trustedCustomProviders(readRegistry() || { status: "unavailable" });
  } catch {
    return catalog;
  }

  const profiles = [...catalog.profiles];
  const unavailable = [...catalog.unavailable];
  const seen = new Set([...profiles, ...unavailable].map((entry) => entry?.id));
  for (const registration of registrations) {
    if (registration.enabled !== true || !Array.isArray(registration.models)) continue;
    const provider = `custom.${registration.id}`;
    const models = [...registration.models].sort((a, b) =>
      Number(b?.id === registration.default_model) - Number(a?.id === registration.default_model));
    for (const entry of models) {
      if (!record(entry) || typeof entry.id !== "string" || !entry.id || entry.id !== entry.id.trim()) continue;
      const model = entry.id;
      const id = `${provider}:${model}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const target = {
        id, provider, model, credential_ref: provider,
        protocol: registration.protocol, endpoint: registration.base_url, auth_mode: registration.auth?.mode,
      };
      try {
        authorizeSkeletonProfile(target, registrations);
      } catch (error) {
        unavailable.push({ id, provider, model, reason: "profile_refused", code: error.code, path: ["kernel", "profile"] });
        continue;
      }
      const context_window = entry.capabilities?.max_context_window_tokens;
      const output_limit = entry.capabilities?.max_tokens;
      const reason = !positiveInt(context_window) || context_window < 2 ? "context_window_unknown"
        : !positiveInt(output_limit) ? "output_limit_unknown" : null;
      if (reason) {
        unavailable.push({ id, provider, model, reason });
        continue;
      }
      profiles.push({
        ...target, context_window, output_limit,
        capabilities: { json_schema: false, images: entry.capabilities.supports_vision === true, files: false },
      });
    }
  }
  return { profiles, unavailable };
}

module.exports = { withConfiguredKernelProfiles };
