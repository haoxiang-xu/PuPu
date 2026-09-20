# Ticket 202 — Standardize model provider sections, ship DeepSeek/Kimi first-class

- Ticket: https://github.com/haoxiang-xu/PuPu/issues/202
- Release parent: #203 (v0.1.11)
- Clone: `/Users/red/Desktop/GITRepo/pupu-202`
- Branch: `codex/ticket-202-first-class-providers`
- Base: `dev @ b6c3a0af25bd00e2e3facd074002b2a7c0abdf27`
- Design artifact (UI picks): https://claude.ai/code/artifact/0b70a80b-0bbe-46d8-a4cf-72ad404b7690

## Goal

DeepSeek and Kimi become first-class shipped providers: configured from the model
provider surface exactly like a built-in provider, with no experimental flag
involved. `enable_custom_model_providers` gates only user-authored providers.
Shipped preset definitions are resolved from the app at runtime so preset updates
reach users who already saved a key. Adding another shipped provider costs a
registry entry, a preset definition and an icon.

## Non-goals

- Native Unchain ModelIO classes for DeepSeek/Kimi. Ruled out on #74: both ride an
  Anthropic-compatible endpoint, so the class would duplicate `HyperspaceModelIO`.
- Gemini as a native provider (tracked separately).
- The 0.1.11 model provider page itself.
- Any UI for overriding a shipped definition.
- Flipping `enable_custom_model_providers` to `true`. It stays `false`; it simply
  stops gating shipped providers.

## Settled decisions the implementer must not revisit

1. **Wire addressing is unchanged.** A shipped model is still
   `custom.<slug>:<model-id>` and still travels as `options.custom_provider` plus
   the dedicated secret channel. No change in `unchain_runtime/` and none in the
   unchain repository.
2. **Shipped is not native.** Resolved definitions carry `origin: "shipped" | "user"`.
   Native providers (openai / anthropic / gemini / ollama) keep their own storage
   keys, catalog entries and fail-open behaviour. Shipped providers keep the
   custom-provider fail-closed behaviour and the custom-provider capability path.
3. **`readCustomProviders()` keeps its contract** (GitNexus upstream: CRITICAL, 36
   impacted, 10 direct callers) — it remains the *user-authored* definition list.
   The single behavioural change is that an entry whose id is a shipped slug is
   filtered out of it. Shipped resolution lives in new functions.
4. **Secrets do not move.** A shipped key already lives in
   `custom_provider_secrets[<slug>]` and keeps living there, so a key saved before
   this change keeps working with no secret migration.
5. **UI decision A3** — one API-key control for *all* provider sections, including
   OpenAI / Anthropic / Gemini. At rest a configured key is a flat settings row
   (label left; masked tail + Replace + Clear right, no box). Replace shows the
   34 px field, which is also the empty state. `APIKeyInput` and
   `PresetProviderSection` collapse into one component.
6. **UI decision B2** — Kimi shows a labelled `Platform` row using the builtin
   `Select` (the Appearance theme/language row shape). The two platforms stay two
   preset slugs with independent keys.
7. Section order, grouping and the Kimi brand mark are unchanged.

## Boundary contracts

### BC-001 — shipped-provider state ↔ settings persistence

**Revised during implementation.** The plan opened a new persisted key,
`model_providers.shipped_providers`, holding `{ enabled }` per slug. Building it
showed the key has nothing to hold: a shipped provider has no stored definition
to switch off, and "is a key configured" is a signal the codebase already
computes (`providerSecretConfigured`, SQL identity list OR legacy localStorage).
A persisted `enabled` would have been a second, drift-prone copy of that answer —
and losing it during the legacy-copy cleanup would silently hide a provider whose
key was still present.

So **no new persisted shape ships**. What remains of this boundary:

- Producer: `migrateShippedProviderCopies` — the only writer, and it only
  *removes* the pre-#202 copy from `custom_providers[]`.
- Consumer: `readCustomProviders`, which skips shipped slugs on read, so the
  removal is a cleanup rather than a correctness dependency.
- The secret keeps living in `custom_provider_secrets[<slug>]`. Nothing about a
  key saved before this change moves, so there is no secret migration.
- A high-`config_version` entry under a shipped slug is preserved verbatim
  (C10): a config only a newer PuPu understands outranks tidying.
- Accepted behaviour change: a copy stored as `enabled:false` while its key was
  still present becomes available after the cleanup, because availability is
  derived from the key. That is how the native provider sections already behave.
- AC: AC-04, AC-05, AC-10.

### BC-002 — renderer → Flask `options.custom_provider`

**Unchanged wire**, and the admission policy is now stated precisely from both
sides rather than assumed:

- Producer is **CLOSED by whitelist construction**: `buildProviderInjectionPayload`
  builds the object field by field, so provenance (`origin` / `source` /
  `enabled`), timestamps and secrets are structurally unreachable rather than
  deleted afterwards.
- Consumer is **constructive-read**: `parse_custom_provider` builds
  `CustomProviderConfig` from named fields and never iterates the incoming
  object. An unknown top-level field is therefore *inert*, not "silently
  dropped into behaviour" — the plan's original phrasing ("an unknown field must
  be rejected") described a rejection this boundary does not and need not
  perform. What the consumer does reject is a forbidden (prototype-pollution)
  key, a bad `base_url`, an invalid slug/protocol/model, and secret-shaped keys
  inside `default_payload`.
- Evidence is artifact-driven rather than two hand-written fixtures:
  `src/SERVICEs/shipped_provider_wire_contract.test.js` emits the **real**
  producer output to `docs/implementation/ticket-202-evidence/shipped_provider_wire.json`,
  and `unchain_runtime/server/tests/test_shipped_provider_wire_contract.py`
  reads that artifact back through the strict consumer.
- AC: AC-02, AC-09.

### SEQ-001 — shipped provider lifecycle

Identity key: shipped slug.

| # | Event | Observable |
| --- | --- | --- |
| 1 | no key | section visible, no model in selector |
| 2 | save key | definition resolved from app, enabled, model listed |
| 3 | first message | request carries app-resolved `custom_provider` |
| 4 | second message, same chat | same, no re-copy into storage |
| 5 | renderer cold restart | enabled + key survive, model still listed |
| 6 | app upgrade changes the preset | next catalog read and next request use the **new** definition |
| 7 | clear key | secret removed, provider disabled, model gone, no definition left behind |
| 8 | re-save key | back to state 2 |

### SEQ-002 — legacy copied preset migration

| # | Event | Observable |
| --- | --- | --- |
| 1 | launch after upgrade with a copied shipped entry in `custom_providers[]` | one migration: copy removed, `enabled` carried over, secret untouched |
| 2 | second launch | no-op, no duplicate row |
| 3 | Custom Providers list | never shows a shipped provider |

## Slices

Each slice ends with its own test run. `npx react-scripts test --watchAll=false`
scoped by path. **Never `npx jest`** — this repo errors on import.

### S1 — shipped provider registry (new)

`src/SERVICEs/shipped_provider_registry.js`

```
SHIPPED_PROVIDERS = [
  { id: "deepseek", title: "DeepSeek", icon: "deepseek", placeholder: "sk-...",
    sites: [{ slug: "deepseek" }] },
  { id: "kimi", title: "Kimi", icon: "kimi", placeholder: "sk-...",
    sites: [{ slug: "kimi",    labelKey: "model_providers.site_global" },
            { slug: "kimi-cn", labelKey: "model_providers.site_china" }] },
]
```

Exports: `SHIPPED_PROVIDERS`, `listShippedSlugs()`, `isShippedSlug(slug)`,
`findShippedProviderBySlug(slug)`, `readShippedPresetEnvelope(slug)` (from
`custom_provider_presets.json`), `resolveShippedDefinition(slug)` (envelope →
`normalizeCustomProvider` → definition with `origin: "shipped"`, or `null`).

Invariants: every registry site slug must have a preset envelope — a test asserts
this so a registry entry can never ship without its definition. The registry must
not import from `COMPONENTs`.

### S2 — store: resolution, shipped state, legacy filter

`src/SERVICEs/custom_provider_store.js`

- `readCustomProviders()` filters out entries whose id is a shipped slug.
- `resolveShippedDefinition(slug)` — bundled envelope → normalizer → definition
  carrying `origin: "shipped"` and `enabled: true` (see BC-001 above for why
  `enabled` is not stored).
- `resolveProviderDefinition(slug)` — shipped first, else user-authored with
  `origin: "user"`.
- `readRuntimeProviderDefinitions({ includeUserAuthored })` — enabled shipped
  definitions always, user-authored only when the caller passes the flag.
- `addCustomProvider` / `normalizeCustomProvider` reject a shipped slug the way a
  reserved slug is rejected (AC-07).
- `resolveCustomModelCapabilities` resolves through `resolveProviderDefinition`.

### S3 — legacy-copy migration

`migrateShippedProviderCopies` in `custom_provider_store.js`, fired by
`src/COMPONENTs/settings/model_providers/shipped_provider_migration_boot_sync.js`
next to `provider_secret_migration_boot_sync.js` in `App.js`. Idempotent; never
touches the secret; never deletes a high-version preserved raw entry. The
read-path filter in S2 means correctness does not depend on this having run, so
a throwing cleanup is not a boot failure.

### S4 — flag becomes a per-slug decision

Four sites currently early-return on `enable_custom_model_providers`:

- `src/SERVICEs/api.unchain.js` — `injectCustomProviderIntoPayload`,
  `mergeCustomProvidersIntoCatalog`, `testCustomProvider`
- `src/COMPONENTs/chat-input/hooks/use_chat_input_models.js` —
  `read_custom_provider_groups`

Each becomes: shipped slug → always allowed; user-authored slug → flag required.
Negative tests keep `custom_provider_disabled` for a user-authored slug with the
flag off.

### S5 — one API-key control (A3) + Kimi platform select (B2)

- New `src/COMPONENTs/settings/model_providers/components/provider_key_section.js`
  replacing both `api_key_input.js` and `preset_provider_section.js`.
- Credential backends stay distinct behind one prop: a native section writes
  through `storage.js` / `writeModelProviders`; a shipped section writes through
  the custom-provider secret sequence (`setCustomProviderSecret` → acknowledged →
  `setShippedProviderEnabled(slug, true)`).
- States: empty (field), editing/replacing (field), saved (flat row), saving,
  delete confirm. `ConfirmDeleteApiKeyModal` is reused unchanged.
- Masked tail renders the last 4 characters only.
- `model_providers/index.js` renders native sections and then
  `SHIPPED_PROVIDERS.map(...)`; only `CustomProvidersSection` stays flag-gated.

### S6 — i18n

New keys `model_providers.replace`, `.platform`, `.site_global`, `.site_china`
in all 11 locales. Cancel reuses the existing `common.cancel`.

### S7 — contract evidence

- BC-002 positive: the real producer artifact is accepted by the strict consumer,
  with slug, provider key, base_url, protocol, auth mode, model set and default
  model asserted field by field.
- BC-002 producer negative: a stray or secret-shaped field on the definition
  cannot reach the wire; an app-resolved definition and a stored copy produce
  byte-identical wire output.
- BC-002 consumer negative: an unknown field is inert (parsed config unchanged);
  a forbidden key, a `file://` base_url and a secret-shaped `default_payload`
  key are rejected or stripped.
- BC-001 negative: a high-`config_version` entry under a shipped slug survives
  the cleanup; a second cleanup run writes nothing.

## Verification

- Scoped suites per slice, then the full `react-scripts test` run before delivery.
- `unchain_runtime` pytest for the `custom_provider` module if S7 touches it.
- Python changes require a sidecar restart before any runtime check; note it in
  the evidence if it happens.
- In-app smoke against a real key is manual and is reported `NOT_RUN` unless
  actually performed.

## Known limitations

- Migrating a legacy copy discards edits a user made to an imported DeepSeek/Kimi
  preset through the Custom Providers editor. Accepted: the exposed population is
  dev builds only, and app-resolved definitions winning is the point of the ticket.
- Showing the last 4 characters of a stored key is a deliberate, small relaxation
  of never rendering key material, introduced by design pick A3.

## Deviations from the plan, and why

1. **No `shipped_providers` storage key.** See BC-001 above. Fewer moving parts,
   one less persisted contract, and no way for the cleanup to lose a provider
   whose key is still there.
2. **The saved row shows a fixed mask, not the key's last four characters.**
   Design pick A3 showed `sk-••••••8f2a`. In the Phase 4 steady state the secret
   is encrypted in SQL and the renderer cannot read it, so a real tail could only
   be shown for some providers on some machines. A mask that is sometimes real is
   worse than one that never is, so the tail is dropped. The row's shape — flat,
   boxless, label left, Replace and Clear right — is exactly as picked.
3. **Replace gained a Cancel.** A3 has an editing state the old components did
   not, so there has to be a way back out of it without saving.
4. **AC-09 restated.** "Unknown field is rejected" described a rejection the
   consumer does not perform; the accurate contract is producer-CLOSED by
   construction and consumer-constructive-read. See BC-002.

## Known pre-existing failure on dev

`src/SERVICEs/plugin_trust_locales.test.js` fails on `dev @ b6c3a0af` before any
change in this branch (verified by stashing this branch's work and re-running).
`en.json`'s `toolkit.trust_official_explanation` reads "Official plugins
published by PuPu are marked as verified by default." while the reviewed copy in
`docs/implementation/ticket-278-copy.json` says "Published by PuPu. Official
origin does not imply verification." — and those two sentences mean opposite
things, so this is worth someone's attention beyond a red test. Drift from #282.
Not caused by and not fixed by this ticket; reported to the project owner.
