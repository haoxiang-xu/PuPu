/* Which model a legacy inline subagent becomes, as the real runtime decides.
 *
 * Captured 2026-10-15 against the repaired fixed installation pair —
 * `unchain==0.2.0`, wheel SHA-256
 * 5b0f16dcb0a4d41592dcb00cba8f659e6782bb28d5b05526f864988971139648, runtime
 * manifest
 * sha256:f6daf3894dd947723ee7dc60392277896b88c4890d35373b26442a1833a28101,
 * CPython 3.12.10 — by asking the real store. Every row is one
 * `SkeletonResourceStore.convert_legacy_pools` call against a migrated legacy
 * recipe, with the answer read back out of the stored document afterwards;
 * the earlier capture built the entry the way the store builds it and called
 * the runtime directly, which measured the same two functions but not the
 * producer. A refusal is recorded only after checking that the resource is
 * byte-for-byte what it was before the call.
 *
 * Why this corpus exists. An inline entry has no Agent to reference, so the
 * conversion materialises one, and that needs a Kernel the author chose. But
 * the entry may already DECLARE a model, and then the runtime does not take
 * the author's choice as an instruction — it compares the two and refuses
 * `identity_mismatch` if they differ, writing nothing. So the panel cannot
 * offer the conversion without first answering the runtime's question, and it
 * cannot answer it by reading `_model_matches` and writing something that
 * looks like it. Two measured reasons:
 *
 *   - the comparison is on `str.strip()`-ed text, and that is NOT `trim()`.
 *     A model name carrying U+001F, U+0085 or U+00A0 is stripped by the
 *     runtime and matches; one carrying U+FEFF is NOT stripped and does not.
 *     `trim()` has it exactly backwards on all four — see
 *     `mirror-the-rule-not-a-lookalike`, where the same two character sets
 *     cost a round on the endpoint rule.
 *   - the split is `split(":", 1)`, so `ollama:llama3:8b` is provider
 *     `ollama` and model `llama3:8b`, while the same name written bare —
 *     `llama3:8b` — is read as provider `llama3` and model `8b` and matches
 *     nothing. A tag is not a qualifier here.
 *
 * `accepted` is the store's own verdict and nothing here states what the
 * editor reads out of the entry: the mirror's answer is composed with
 * `profile_holds_model` in the test and compared against this column, so a
 * capture row cannot agree with the mirror by restating it.
 *
 * `template` is the entry's `template` object as JSON TEXT, parsed at load: a
 * legacy entry reaches the editor by being parsed, and `legacy_fields` is the
 * old node's keys copied verbatim, so a JS literal cannot state every shape
 * one can hold. */

const MODEL_MATCHES = [
  {"label": "no model key at all, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\"}", "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "no model key at all, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\"}", "provider": "anthropic", "model": "claude-x", "accepted": true, "carried_model": "claude-x"},
  {"label": "no model key at all, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\"}", "provider": "ollama", "model": "llama3:8b", "accepted": true, "carried_model": "llama3:8b"},
  {"label": "no model key at all, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\"}", "provider": "openai", "model": "llama3:8b", "accepted": true, "carried_model": "llama3:8b"},
  {"label": "an explicit null, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": null}", "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "an explicit null, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": null}", "provider": "anthropic", "model": "claude-x", "accepted": true, "carried_model": "claude-x"},
  {"label": "an explicit null, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": null}", "provider": "ollama", "model": "llama3:8b", "accepted": true, "carried_model": "llama3:8b"},
  {"label": "an explicit null, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": null}", "provider": "openai", "model": "llama3:8b", "accepted": true, "carried_model": "llama3:8b"},
  {"label": "empty, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\"}", "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "empty, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\"}", "provider": "anthropic", "model": "claude-x", "accepted": true, "carried_model": "claude-x"},
  {"label": "empty, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\"}", "provider": "ollama", "model": "llama3:8b", "accepted": true, "carried_model": "llama3:8b"},
  {"label": "empty, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\"}", "provider": "openai", "model": "llama3:8b", "accepted": true, "carried_model": "llama3:8b"},
  {"label": "only spaces, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"   \"}", "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "only spaces, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"   \"}", "provider": "anthropic", "model": "claude-x", "accepted": true, "carried_model": "claude-x"},
  {"label": "only spaces, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"   \"}", "provider": "ollama", "model": "llama3:8b", "accepted": true, "carried_model": "llama3:8b"},
  {"label": "only spaces, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"   \"}", "provider": "openai", "model": "llama3:8b", "accepted": true, "carried_model": "llama3:8b"},
  {"label": "the bare model name, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\"}", "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "the bare model name, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "the bare model name, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\"}", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "the bare model name, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "the bare name, padded, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \" gpt-4.1 \"}", "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "the bare name, padded, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \" gpt-4.1 \"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "the bare name, padded, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \" gpt-4.1 \"}", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "the bare name, padded, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \" gpt-4.1 \"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "provider and model, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1\"}", "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "provider and model, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1\"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "provider and model, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1\"}", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "provider and model, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1\"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "the provider's case changed, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"OpenAI:gpt-4.1\"}", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "the provider's case changed, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"OpenAI:gpt-4.1\"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "the provider's case changed, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"OpenAI:gpt-4.1\"}", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "the provider's case changed, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"OpenAI:gpt-4.1\"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "the model's case changed, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:GPT-4.1\"}", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "the model's case changed, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:GPT-4.1\"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "the model's case changed, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:GPT-4.1\"}", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "the model's case changed, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:GPT-4.1\"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a space after the colon, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai: gpt-4.1\"}", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "a space after the colon, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai: gpt-4.1\"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a space after the colon, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai: gpt-4.1\"}", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a space after the colon, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai: gpt-4.1\"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a different provider, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"anthropic:gpt-4.1\"}", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "a different provider, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"anthropic:gpt-4.1\"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a different provider, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"anthropic:gpt-4.1\"}", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a different provider, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"anthropic:gpt-4.1\"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a shorter model name, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4\"}", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "a shorter model name, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4\"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a shorter model name, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4\"}", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a shorter model name, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4\"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a tag appended to a bare name, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1:latest\"}", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "a tag appended to a bare name, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1:latest\"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a tag appended to a bare name, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1:latest\"}", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a tag appended to a bare name, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1:latest\"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a model name holding a colon, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"ollama:llama3:8b\"}", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "a model name holding a colon, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"ollama:llama3:8b\"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a model name holding a colon, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"ollama:llama3:8b\"}", "provider": "ollama", "model": "llama3:8b", "accepted": true, "carried_model": "llama3:8b"},
  {"label": "a model name holding a colon, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"ollama:llama3:8b\"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "that model name, bare, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"llama3:8b\"}", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "that model name, bare, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"llama3:8b\"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "that model name, bare, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"llama3:8b\"}", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "that model name, bare, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"llama3:8b\"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a provider and nothing else, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:\"}", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "a provider and nothing else, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:\"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a provider and nothing else, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:\"}", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a provider and nothing else, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:\"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a colon and a model, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \":gpt-4.1\"}", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "a colon and a model, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \":gpt-4.1\"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a colon and a model, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \":gpt-4.1\"}", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a colon and a model, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \":gpt-4.1\"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "three parts, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1:extra\"}", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "three parts, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1:extra\"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "three parts, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1:extra\"}", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "three parts, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1:extra\"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a C1 control before it, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\u001fgpt-4.1\"}", "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "a C1 control before it, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\u001fgpt-4.1\"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a C1 control before it, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\u001fgpt-4.1\"}", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a C1 control before it, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\u001fgpt-4.1\"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a C1 control after it, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\\u001f\"}", "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "a C1 control after it, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\\u001f\"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a C1 control after it, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\\u001f\"}", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a C1 control after it, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\\u001f\"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a NEL before it, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\u0085gpt-4.1\"}", "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "a NEL before it, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\u0085gpt-4.1\"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a NEL before it, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\u0085gpt-4.1\"}", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a NEL before it, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\u0085gpt-4.1\"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a byte order mark before it, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\ufeffgpt-4.1\"}", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "a byte order mark before it, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\ufeffgpt-4.1\"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a byte order mark before it, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\ufeffgpt-4.1\"}", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a byte order mark before it, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\ufeffgpt-4.1\"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a byte order mark after it, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\\ufeff\"}", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "a byte order mark after it, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\\ufeff\"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a byte order mark after it, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\\ufeff\"}", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a byte order mark after it, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\\ufeff\"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a non-breaking space before it, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\u00a0gpt-4.1\"}", "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "a non-breaking space before it, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\u00a0gpt-4.1\"}", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a non-breaking space before it, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\u00a0gpt-4.1\"}", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a non-breaking space before it, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\u00a0gpt-4.1\"}", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
];

export const CAPTURED_INLINE_MODEL_MATCHES = Object.freeze(
  MODEL_MATCHES.map((entry) =>
    Object.freeze({ ...entry, template: JSON.parse(entry.template) }),
  ),
);

/* Which legacy prompt format keeps the entry's declared model.
 *
 * Both of them, since the repair. The store now converts an inline entry of
 * either format through the same structured template IR — a Soul entry's
 * `template` is handed over with its own prompt as the instructions instead
 * of being serialised into frontmatter — so `model` survives into
 * `legacy_template` and constrains the conversion the same way in both.
 *
 * Measured as the store's answer twice per row rather than as a value read
 * out of it: once against the profile the entry declares and once against a
 * different one. A row that declares nothing is accepted by both, a row that
 * declares a model is accepted only by its own. Before the repair every Soul
 * row was accepted by both, which is what made the model loss visible from
 * out here. */

const DECLARED_BY_FORMAT = [
  {"label": "a provider and model, skeleton format", "prompt_format": "skeleton", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1\"}", "against_declared": {"provider": "openai", "model": "gpt-4.1"}, "accepted_against_declared": true, "against_other": {"provider": "anthropic", "model": "claude-x"}, "accepted_against_other": false, "carried_prompt": "Be brief."},
  {"label": "a provider and model, soul format", "prompt_format": "soul", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1\"}", "against_declared": {"provider": "openai", "model": "gpt-4.1"}, "accepted_against_declared": true, "against_other": {"provider": "anthropic", "model": "claude-x"}, "accepted_against_other": false, "carried_prompt": "Be brief."},
  {"label": "the bare model name, skeleton format", "prompt_format": "skeleton", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\"}", "against_declared": {"provider": "openai", "model": "gpt-4.1"}, "accepted_against_declared": true, "against_other": {"provider": "anthropic", "model": "claude-x"}, "accepted_against_other": false, "carried_prompt": "Be brief."},
  {"label": "the bare model name, soul format", "prompt_format": "soul", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\"}", "against_declared": {"provider": "openai", "model": "gpt-4.1"}, "accepted_against_declared": true, "against_other": {"provider": "anthropic", "model": "claude-x"}, "accepted_against_other": false, "carried_prompt": "Be brief."},
  {"label": "an explicit null, skeleton format", "prompt_format": "skeleton", "template": "{\"prompt\": \"Be brief.\", \"model\": null}", "against_declared": {"provider": "openai", "model": "gpt-4.1"}, "accepted_against_declared": true, "against_other": {"provider": "anthropic", "model": "claude-x"}, "accepted_against_other": true, "carried_prompt": "Be brief."},
  {"label": "an explicit null, soul format", "prompt_format": "soul", "template": "{\"prompt\": \"Be brief.\", \"model\": null}", "against_declared": {"provider": "openai", "model": "gpt-4.1"}, "accepted_against_declared": true, "against_other": {"provider": "anthropic", "model": "claude-x"}, "accepted_against_other": true, "carried_prompt": "Be brief."},
  {"label": "no model key at all, skeleton format", "prompt_format": "skeleton", "template": "{\"prompt\": \"Be brief.\"}", "against_declared": {"provider": "openai", "model": "gpt-4.1"}, "accepted_against_declared": true, "against_other": {"provider": "anthropic", "model": "claude-x"}, "accepted_against_other": true, "carried_prompt": "Be brief."},
  {"label": "no model key at all, soul format", "prompt_format": "soul", "template": "{\"prompt\": \"Be brief.\"}", "against_declared": {"provider": "openai", "model": "gpt-4.1"}, "accepted_against_declared": true, "against_other": {"provider": "anthropic", "model": "claude-x"}, "accepted_against_other": true, "carried_prompt": "Be brief."},
];

export const CAPTURED_INLINE_DECLARED_MODEL = Object.freeze(
  DECLARED_BY_FORMAT.map((entry) =>
    Object.freeze({ ...entry, template: JSON.parse(entry.template) }),
  ),
);

/* What a converted entry keeps of what it declared.
 *
 * The panel states that converting keeps the tools, delegation modes, memory
 * and parallel safety each subagent already declared. This is that statement
 * measured, in both legacy formats, with values that are not the defaults —
 * an empty `allowed_tools` among them, because the default is `null`, which
 * means unrestricted: a lost restriction here would be a widened one.
 *
 * `description` is in `declared` and is NOT kept: the template IR the store
 * converts through carries the six policy fields and the model, and the
 * entry's description is set from its name. The panel's statement does not
 * name descriptions, and nothing here invents one. */

export const CAPTURED_INLINE_PRESERVED_POLICY = Object.freeze([
  Object.freeze({"prompt_format": "skeleton", "declared": {"allowed_modes": ["handoff"], "output_mode": "full_trace", "memory_policy": "scoped_persistent", "parallel_safe": false, "allowed_tools": [], "description": "declared on the entry"}, "stored": {"allowed_modes": ["handoff"], "output_mode": "full_trace", "memory_policy": "scoped_persistent", "parallel_safe": false, "allowed_tools": [], "description": ""}, "disabled_tools": ["write"], "carried_prompt": "Be brief."}),
  Object.freeze({"prompt_format": "soul", "declared": {"allowed_modes": ["handoff"], "output_mode": "full_trace", "memory_policy": "scoped_persistent", "parallel_safe": false, "allowed_tools": [], "description": "declared on the entry"}, "stored": {"allowed_modes": ["handoff"], "output_mode": "full_trace", "memory_policy": "scoped_persistent", "parallel_safe": false, "allowed_tools": [], "description": ""}, "disabled_tools": ["write"], "carried_prompt": "Be brief."}),
]);

/* What the supplied Kernel hands over, field by field.
 *
 * An inline entry's Agent is built with no Kernel of its own, so it is the
 * supplied one that stands, with exactly one field replaced: `prompt`, by the
 * entry's own legacy prompt. (`max_iterations` is replaced too, but only from
 * a legacy `max_iterations`, and the template IR does not produce one — so
 * for an inline entry the supplied value stands.)
 *
 * Everything else is carried verbatim, which is why `json_schema` is dropped
 * before handing it over: the parent's structured-output contract is not the
 * subagent's, and a schema left in would be forced on every Agent this
 * conversion builds. Measured below with a schema set on the supplied side
 * and read back on the carried side. */

export const CAPTURED_EMBEDDED_KERNEL = Object.freeze({
  legacy_prompt: "Be brief.",
  supplied: {"schema_version": 1, "profile": {"id": "openai:gpt-4.1", "provider": "openai", "model": "gpt-4.1", "protocol": "openai-responses", "endpoint": "https://api.openai.com/v1", "credential_ref": "openai", "context_window": 128000, "output_limit": 4096, "capabilities": {"json_schema": true, "images": true, "files": true}}, "prompt": "the parent's prompt", "max_iterations": 6, "output_tokens": 2048, "history": "none", "overflow": "compress", "json_schema": {"type": "object", "properties": {"a": {"type": "string"}}, "required": ["a"], "additionalProperties": false}},
  carried: {"history": "none", "json_schema": {"additionalProperties": false, "properties": {"a": {"type": "string"}}, "required": ["a"], "type": "object"}, "max_iterations": 6, "output_tokens": 2048, "overflow": "compress", "profile": {"capabilities": {"files": true, "images": true, "json_schema": true}, "context_window": 128000, "credential_ref": "openai", "endpoint": "https://api.openai.com/v1", "id": "openai:gpt-4.1", "model": "gpt-4.1", "output_limit": 4096, "protocol": "openai-responses", "provider": "openai"}, "prompt": "Be brief.", "schema_version": 1},
});
