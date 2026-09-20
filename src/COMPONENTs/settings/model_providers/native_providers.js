/* Native providers: a first-party ModelIO inside unchain, a dedicated storage
   key, a credential identity of its own. Shared by the Settings page and the
   Model Providers rail (#204) so both render the same list in the same order. */
export const NATIVE_PROVIDERS = Object.freeze([
  Object.freeze({
    id: "openai",
    title: "OpenAI",
    icon: "open_ai",
    storage_key: "openai_api_key",
    credential_id: "openai",
    placeholder: "sk-...",
    key_url: "https://platform.openai.com/api-keys",
  }),
  Object.freeze({
    id: "anthropic",
    title: "Anthropic",
    icon: "Anthropic",
    storage_key: "anthropic_api_key",
    credential_id: "anthropic",
    placeholder: "sk-ant-...",
    key_url: "https://console.anthropic.com/settings/keys",
  }),
  Object.freeze({
    id: "gemini",
    title: "Gemini",
    icon: "gemini",
    storage_key: "gemini_api_key",
    credential_id: "gemini",
    placeholder: "AIza...",
    key_url: "https://aistudio.google.com/apikey",
  }),
]);

export default NATIVE_PROVIDERS;
