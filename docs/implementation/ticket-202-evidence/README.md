# Ticket 202 — audit evidence

Candidate: `eafd9fa65b2e7f5fa2a20b80866edcfe429e6a58`
Candidate digest: `sha256:33becd0d35d32cc051e9ba2137b74361eede85653bcc948b2d8e1f914d79c25d`
(`git archive --format=tar <sha> | shasum -a 256`)

## Provenance of the real-app run

The probe ran against an Electron process started from **this clone**, not from
the working checkout — the distinction that made the #283 audit unusable:

```
$ ps -p 65905 -o command=
/Users/red/Desktop/GITRepo/pupu-202/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron .
$ lsof -p 65905 | grep cwd
Electron 65905 red cwd DIR ... /Users/red/Desktop/GITRepo/pupu-202
```

The clone needed `bash scripts/init_python312_venv.sh` before the Miso sidecar
would start (a fresh clone has no `.venv`; the first launch reported
`status=not_found`). No Python source changed in this ticket, so no sidecar
restart was needed for code reasons — only to bring the sidecar up at all.

`enable_custom_model_providers` was at its shipped default `false` throughout:
the settings root carried no `feature_flags` namespace at probe start.

## What the probe established

| Evidence | Result |
| --- | --- |
| Section order with the flag off | `OpenAI, Anthropic, Gemini, DeepSeek, Kimi, Ollama` — no Custom Providers section |
| Sections rendered by one component | `provider-key-section-{openai_api_key,anthropic_api_key,gemini_api_key,deepseek,kimi}` |
| **AC-04** after saving a DeepSeek key | `custom_providers[]` stayed **empty**; only `custom_provider_secrets.deepseek` was written; no `shipped_providers` key |
| **AC-01** selector | DeepSeek group listed `DeepSeek V4 Flash` / `DeepSeek V4 Pro` on the saved key alone |
| **AC-02** end-to-end | Sending on `custom.deepseek:deepseek-v4-flash` reached the real provider: `Provider rejected the credentials (HTTP 401, code=invalid_request_error)` |
| **AC-06** clearing the key | Only the secret was removed; no definition left behind; the section returned to its empty-state field |
| **AC-12** / design A3 | OpenAI, Anthropic and DeepSeek render the identical flat row: `API Key ········ Replace Clear` |
| Design B2 | Kimi renders `Platform [Global · api.moonshot.ai ▾]` above the key row, host derived from the preset's `base_url` |

The 401 is the point of the run. A fake key was used deliberately, and the
failure lands **at provider authentication** — which means everything before it
worked: the definition was resolved from the app bundle, injected into
`options.custom_provider`, relayed through Electron, **accepted by the Flask
strict revalidator** (a rejection there would have surfaced as
`custom_provider_invalid*`, not an HTTP 401 from DeepSeek), and used by unchain
to make a real call to `api.deepseek.com`. The producer is not a hollow shell.

## Screenshots

| File | Shows |
| --- | --- |
| `ac01-shipped-sections-flag-off.png` | Model Providers pane with the flag off; DeepSeek in the flat saved row, identical to OpenAI/Anthropic |
| `b2-kimi-platform-row.png` | Kimi's Platform select row; no Custom Providers section after Ollama |
| `ac02-request-reached-provider.png` | The probe chat on `DeepSeek V4 Flash` with the real provider 401 |

## Contract artifact

`shipped_provider_wire.json` is the **real producer output** of
`buildProviderInjectionPayload(resolveShippedDefinition(slug))`, emitted by
`src/SERVICEs/shipped_provider_wire_contract.test.js` and consumed by
`unchain_runtime/server/tests/test_shipped_provider_wire_contract.py`, so both
sides of BC-002 are checked against one artifact rather than two fixtures.

## Finding: the model picker still badges a shipped provider "Custom"

In the chat model selector the DeepSeek group's rail item carries the `Custom`
badge and the title `DeepSeek (Custom)`. That badge is a deliberate
anti-impersonation defence for **user-authored** providers (custom-model-providers
design §4.1 / §9.5) and is correct for them. For a provider PuPu itself ships it
now contradicts the ticket's premise. No AC covers the chat picker — AC-12 is
scoped to the settings sections — so this is reported, not auto-fixed.

## NOT_RUN

- A **completed conversation** through a shipped provider. Needs a real DeepSeek
  or Kimi key; the probe deliberately used a fake one and stops at HTTP 401.
- The **Kimi** key path and its second site (`kimi-cn`), including switching the
  Platform select between two independently configured keys.
- **SEQ-001 step 5/6** — renderer cold restart with a shipped key configured, and
  the app-upgrade-changes-the-preset step — beyond what a single session shows.
- **SEQ-002** legacy-copy cleanup against a profile that actually carries a
  pre-#202 copy; the probe profile had none (`custom_providers[]` was empty), so
  only the unit tests cover it.

## Cleanup

The fake key was removed through the UI (which is also the AC-06 evidence above)
and the probe chat was deleted. The profile is back to `custom_provider_secrets: {}`
and `custom_providers: []`.
