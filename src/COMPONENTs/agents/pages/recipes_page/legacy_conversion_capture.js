/* Which model a legacy inline subagent becomes, as the real runtime decides.
 *
 * Captured 2026-10-15 against the fixed installation pair — `unchain==0.2.0`,
 * wheel SHA-256
 * df33867b3737569fa4a5272b6fdd735fa76a6ec92343517d06e278b9c537c178, CPython
 * 3.12.10 — by building each legacy inline entry exactly as
 * `skeleton_resource_store._expand_legacy_subagent_pools` builds it, handing
 * it to `convert_legacy_definition` and then to `materialize_legacy_agent`
 * with the profile named on the row, and recording what came back.
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
 * `declared` is what the runtime ends up holding as the entry's model after
 * its own conversion, which is where the stripping happens
 * (`legacy.py:_template_metadata`, `model.strip() or None`); the comparison
 * strips again, so the second pass is a no-op and the capture shows it.
 *
 * `template` is the entry's `template` object as JSON TEXT, parsed at load: a
 * legacy entry reaches the editor by being parsed, and `legacy_fields` is the
 * old node's keys copied verbatim, so a JS literal cannot state every shape
 * one can hold. */

const MODEL_MATCHES = [
  {"label": "no model key at all, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\"}", "declared": null, "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "no model key at all, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\"}", "declared": null, "provider": "anthropic", "model": "claude-x", "accepted": true, "carried_model": "claude-x"},
  {"label": "no model key at all, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\"}", "declared": null, "provider": "ollama", "model": "llama3:8b", "accepted": true, "carried_model": "llama3:8b"},
  {"label": "no model key at all, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\"}", "declared": null, "provider": "openai", "model": "llama3:8b", "accepted": true, "carried_model": "llama3:8b"},
  {"label": "an explicit null, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": null}", "declared": null, "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "an explicit null, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": null}", "declared": null, "provider": "anthropic", "model": "claude-x", "accepted": true, "carried_model": "claude-x"},
  {"label": "an explicit null, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": null}", "declared": null, "provider": "ollama", "model": "llama3:8b", "accepted": true, "carried_model": "llama3:8b"},
  {"label": "an explicit null, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": null}", "declared": null, "provider": "openai", "model": "llama3:8b", "accepted": true, "carried_model": "llama3:8b"},
  {"label": "empty, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\"}", "declared": null, "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "empty, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\"}", "declared": null, "provider": "anthropic", "model": "claude-x", "accepted": true, "carried_model": "claude-x"},
  {"label": "empty, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\"}", "declared": null, "provider": "ollama", "model": "llama3:8b", "accepted": true, "carried_model": "llama3:8b"},
  {"label": "empty, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\"}", "declared": null, "provider": "openai", "model": "llama3:8b", "accepted": true, "carried_model": "llama3:8b"},
  {"label": "only spaces, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"   \"}", "declared": null, "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "only spaces, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"   \"}", "declared": null, "provider": "anthropic", "model": "claude-x", "accepted": true, "carried_model": "claude-x"},
  {"label": "only spaces, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"   \"}", "declared": null, "provider": "ollama", "model": "llama3:8b", "accepted": true, "carried_model": "llama3:8b"},
  {"label": "only spaces, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"   \"}", "declared": null, "provider": "openai", "model": "llama3:8b", "accepted": true, "carried_model": "llama3:8b"},
  {"label": "the bare model name, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\"}", "declared": "gpt-4.1", "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "the bare model name, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\"}", "declared": "gpt-4.1", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "the bare model name, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\"}", "declared": "gpt-4.1", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "the bare model name, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\"}", "declared": "gpt-4.1", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "the bare name, padded, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \" gpt-4.1 \"}", "declared": "gpt-4.1", "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "the bare name, padded, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \" gpt-4.1 \"}", "declared": "gpt-4.1", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "the bare name, padded, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \" gpt-4.1 \"}", "declared": "gpt-4.1", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "the bare name, padded, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \" gpt-4.1 \"}", "declared": "gpt-4.1", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "provider and model, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1\"}", "declared": "openai:gpt-4.1", "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "provider and model, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1\"}", "declared": "openai:gpt-4.1", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "provider and model, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1\"}", "declared": "openai:gpt-4.1", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "provider and model, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1\"}", "declared": "openai:gpt-4.1", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "the provider's case changed, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"OpenAI:gpt-4.1\"}", "declared": "OpenAI:gpt-4.1", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "the provider's case changed, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"OpenAI:gpt-4.1\"}", "declared": "OpenAI:gpt-4.1", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "the provider's case changed, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"OpenAI:gpt-4.1\"}", "declared": "OpenAI:gpt-4.1", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "the provider's case changed, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"OpenAI:gpt-4.1\"}", "declared": "OpenAI:gpt-4.1", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "the model's case changed, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:GPT-4.1\"}", "declared": "openai:GPT-4.1", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "the model's case changed, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:GPT-4.1\"}", "declared": "openai:GPT-4.1", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "the model's case changed, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:GPT-4.1\"}", "declared": "openai:GPT-4.1", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "the model's case changed, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:GPT-4.1\"}", "declared": "openai:GPT-4.1", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a space after the colon, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai: gpt-4.1\"}", "declared": "openai: gpt-4.1", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "a space after the colon, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai: gpt-4.1\"}", "declared": "openai: gpt-4.1", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a space after the colon, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai: gpt-4.1\"}", "declared": "openai: gpt-4.1", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a space after the colon, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai: gpt-4.1\"}", "declared": "openai: gpt-4.1", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a different provider, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"anthropic:gpt-4.1\"}", "declared": "anthropic:gpt-4.1", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "a different provider, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"anthropic:gpt-4.1\"}", "declared": "anthropic:gpt-4.1", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a different provider, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"anthropic:gpt-4.1\"}", "declared": "anthropic:gpt-4.1", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a different provider, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"anthropic:gpt-4.1\"}", "declared": "anthropic:gpt-4.1", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a shorter model name, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4\"}", "declared": "openai:gpt-4", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "a shorter model name, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4\"}", "declared": "openai:gpt-4", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a shorter model name, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4\"}", "declared": "openai:gpt-4", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a shorter model name, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4\"}", "declared": "openai:gpt-4", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a tag appended to a bare name, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1:latest\"}", "declared": "gpt-4.1:latest", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "a tag appended to a bare name, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1:latest\"}", "declared": "gpt-4.1:latest", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a tag appended to a bare name, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1:latest\"}", "declared": "gpt-4.1:latest", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a tag appended to a bare name, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1:latest\"}", "declared": "gpt-4.1:latest", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a model name holding a colon, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"ollama:llama3:8b\"}", "declared": "ollama:llama3:8b", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "a model name holding a colon, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"ollama:llama3:8b\"}", "declared": "ollama:llama3:8b", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a model name holding a colon, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"ollama:llama3:8b\"}", "declared": "ollama:llama3:8b", "provider": "ollama", "model": "llama3:8b", "accepted": true, "carried_model": "llama3:8b"},
  {"label": "a model name holding a colon, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"ollama:llama3:8b\"}", "declared": "ollama:llama3:8b", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "that model name, bare, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"llama3:8b\"}", "declared": "llama3:8b", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "that model name, bare, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"llama3:8b\"}", "declared": "llama3:8b", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "that model name, bare, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"llama3:8b\"}", "declared": "llama3:8b", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "that model name, bare, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"llama3:8b\"}", "declared": "llama3:8b", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a provider and nothing else, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:\"}", "declared": "openai:", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "a provider and nothing else, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:\"}", "declared": "openai:", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a provider and nothing else, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:\"}", "declared": "openai:", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a provider and nothing else, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:\"}", "declared": "openai:", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a colon and a model, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \":gpt-4.1\"}", "declared": ":gpt-4.1", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "a colon and a model, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \":gpt-4.1\"}", "declared": ":gpt-4.1", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a colon and a model, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \":gpt-4.1\"}", "declared": ":gpt-4.1", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a colon and a model, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \":gpt-4.1\"}", "declared": ":gpt-4.1", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "three parts, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1:extra\"}", "declared": "openai:gpt-4.1:extra", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "three parts, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1:extra\"}", "declared": "openai:gpt-4.1:extra", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "three parts, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1:extra\"}", "declared": "openai:gpt-4.1:extra", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "three parts, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1:extra\"}", "declared": "openai:gpt-4.1:extra", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a C1 control before it, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\u001fgpt-4.1\"}", "declared": "gpt-4.1", "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "a C1 control before it, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\u001fgpt-4.1\"}", "declared": "gpt-4.1", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a C1 control before it, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\u001fgpt-4.1\"}", "declared": "gpt-4.1", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a C1 control before it, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"\\u001fgpt-4.1\"}", "declared": "gpt-4.1", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a C1 control after it, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\\u001f\"}", "declared": "gpt-4.1", "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "a C1 control after it, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\\u001f\"}", "declared": "gpt-4.1", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a C1 control after it, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\\u001f\"}", "declared": "gpt-4.1", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a C1 control after it, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\\u001f\"}", "declared": "gpt-4.1", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a NEL before it, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\"}", "declared": "gpt-4.1", "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "a NEL before it, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\"}", "declared": "gpt-4.1", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a NEL before it, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\"}", "declared": "gpt-4.1", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a NEL before it, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\"}", "declared": "gpt-4.1", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a byte order mark before it, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"﻿gpt-4.1\"}", "declared": "﻿gpt-4.1", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "a byte order mark before it, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"﻿gpt-4.1\"}", "declared": "﻿gpt-4.1", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a byte order mark before it, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"﻿gpt-4.1\"}", "declared": "﻿gpt-4.1", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a byte order mark before it, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"﻿gpt-4.1\"}", "declared": "﻿gpt-4.1", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a byte order mark after it, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1﻿\"}", "declared": "gpt-4.1﻿", "provider": "openai", "model": "gpt-4.1", "accepted": false, "code": "identity_mismatch"},
  {"label": "a byte order mark after it, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1﻿\"}", "declared": "gpt-4.1﻿", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a byte order mark after it, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1﻿\"}", "declared": "gpt-4.1﻿", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a byte order mark after it, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1﻿\"}", "declared": "gpt-4.1﻿", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a non-breaking space before it, against openai:gpt-4.1", "template": "{\"prompt\": \"Be brief.\", \"model\": \" gpt-4.1\"}", "declared": "gpt-4.1", "provider": "openai", "model": "gpt-4.1", "accepted": true, "carried_model": "gpt-4.1"},
  {"label": "a non-breaking space before it, against anthropic:claude-x", "template": "{\"prompt\": \"Be brief.\", \"model\": \" gpt-4.1\"}", "declared": "gpt-4.1", "provider": "anthropic", "model": "claude-x", "accepted": false, "code": "identity_mismatch"},
  {"label": "a non-breaking space before it, against ollama:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \" gpt-4.1\"}", "declared": "gpt-4.1", "provider": "ollama", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
  {"label": "a non-breaking space before it, against openai:llama3:8b", "template": "{\"prompt\": \"Be brief.\", \"model\": \" gpt-4.1\"}", "declared": "gpt-4.1", "provider": "openai", "model": "llama3:8b", "accepted": false, "code": "identity_mismatch"},
];

export const CAPTURED_INLINE_MODEL_MATCHES = Object.freeze(
  MODEL_MATCHES.map((entry) =>
    Object.freeze({ ...entry, template: JSON.parse(entry.template) }),
  ),
);

/* Which legacy prompt format keeps the entry's declared model at all.
 *
 * Measured, and the answer is only one of them. For `prompt_format:
 * "skeleton"` the store hands the entry's whole `template` to
 * `convert_legacy_definition`, so `model` survives into `legacy_template` and
 * constrains the conversion. For `"soul"` the store builds the soul text
 * itself — `f"---\nname: {name}\ndescription: {name}\n---\n{prompt}"` — and
 * that frontmatter carries NO model line, so the entry's declared model is
 * dropped before the runtime ever sees it and every profile is accepted.
 *
 * That is a gap on the runtime's side of acceptance 7, not this editor's: a
 * soul-format inline entry's model is lost by the conversion rather than
 * preserved. It is recorded here because the panel's statements must match
 * what actually happens, and reported to #356 rather than worked around —
 * guessing the dropped model back would be the editor inventing a model
 * again. */

const DECLARED_BY_FORMAT = [
  {"label": "a provider and model, skeleton format", "prompt_format": "skeleton", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1\"}", "declared": "openai:gpt-4.1"},
  {"label": "a provider and model, soul format", "prompt_format": "soul", "template": "{\"prompt\": \"Be brief.\", \"model\": \"openai:gpt-4.1\"}", "declared": null},
  {"label": "the bare model name, skeleton format", "prompt_format": "skeleton", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\"}", "declared": "gpt-4.1"},
  {"label": "the bare model name, soul format", "prompt_format": "soul", "template": "{\"prompt\": \"Be brief.\", \"model\": \"gpt-4.1\"}", "declared": null},
  {"label": "an explicit null, skeleton format", "prompt_format": "skeleton", "template": "{\"prompt\": \"Be brief.\", \"model\": null}", "declared": null},
  {"label": "an explicit null, soul format", "prompt_format": "soul", "template": "{\"prompt\": \"Be brief.\", \"model\": null}", "declared": null},
  {"label": "no model key at all, skeleton format", "prompt_format": "skeleton", "template": "{\"prompt\": \"Be brief.\"}", "declared": null},
  {"label": "no model key at all, soul format", "prompt_format": "soul", "template": "{\"prompt\": \"Be brief.\"}", "declared": null},
];

export const CAPTURED_INLINE_DECLARED_MODEL = Object.freeze(
  DECLARED_BY_FORMAT.map((entry) =>
    Object.freeze({ ...entry, template: JSON.parse(entry.template) }),
  ),
);

/* What the supplied Kernel hands over, field by field.
 *
 * `materialize_legacy_agent` copies the supplied Kernel into the embedded
 * Agent and then replaces exactly one field for an inline entry: `prompt`,
 * with the entry's own legacy prompt. (`max_iterations` is replaced too, but
 * only from a legacy `max_iterations`, and `_template_metadata` does not
 * produce one — so for an inline entry it is the supplied value that stands.)
 *
 * Everything else is carried verbatim, which is why `json_schema` is dropped
 * before handing it over: the parent's structured-output contract is not the
 * subagent's, and a schema left in would be forced on every Agent this
 * conversion builds. Measured below with a schema set on the supplied side
 * and read back on the carried side. */

export const CAPTURED_EMBEDDED_KERNEL = Object.freeze({
  legacy_prompt: "Be brief.",
  supplied: {"schema_version": 1, "profile": {"id": "openai:gpt-4.1", "provider": "openai", "model": "gpt-4.1", "protocol": "openai-responses", "endpoint": "https://api.openai.com/v1", "credential_ref": "openai", "context_window": 128000, "output_limit": 4096, "capabilities": {"json_schema": true, "images": true, "files": true}}, "prompt": "the parent's prompt", "max_iterations": 6, "output_tokens": 2048, "history": "none", "overflow": "compress", "json_schema": {"type": "object", "properties": {"a": {"type": "string"}}, "required": ["a"], "additionalProperties": false}},
  carried: {"schema_version": 1, "profile": {"id": "openai:gpt-4.1", "provider": "openai", "model": "gpt-4.1", "protocol": "openai-responses", "endpoint": "https://api.openai.com/v1", "credential_ref": "openai", "context_window": 128000, "output_limit": 4096, "capabilities": {"json_schema": true, "images": true, "files": true}}, "prompt": "Be brief.", "max_iterations": 6, "output_tokens": 2048, "history": "none", "overflow": "compress", "json_schema": {"type": "object", "properties": {"a": {"type": "string"}}, "required": ["a"], "additionalProperties": false}},
});
