# Ticket #204 — Model providers page (layer over chat)

- Ticket: https://github.com/haoxiang-xu/PuPu/issues/204
- Clone: `/Users/red/Desktop/GITRepo/pupu-204` · branch `codex/ticket-204-provider-page` · base dev @ `e40ee16e`
- Design picks: A1 https://claude.ai/artifact/1v8ioJYKDCxQHAuYUsu18B · B1 https://claude.ai/artifact/5SWh74fL7KEfx4n3ESrzuN · G3 https://claude.ai/artifact/K46kmF1mkXYKG4SuZivTRG
- The issue body is the brief (scope, ACs, SEQ). This file is the execution plan.

## Goal

Replace Settings → Model Providers with a `ModelProvidersModal` opened from the side menu's top group (beside Plugins / Agents / Workspaces): a 200 px rail of providers (B1 rows) and a pane per provider. Key providers show only key configuration; Ollama shows status / installed models with delete / downloads / library; custom providers keep their CRUD. First run shows the G3 welcome pane.

## Non-goals / decisions the worker must not revisit

- No model selection on this surface. The composer pill is untouched.
- The shell is `BUILTIN_COMPONENTs/modal/modal` (same as `ToolkitModal`), **not** a router route and **not** a new context provider.
- No change to `custom_provider_store.js`, wire payloads, IPC channels, Flask.
- `ProviderKeySection` stays the single key control; the page must not draw a second key field anywhere (G3 has no inline fields).
- Styling: inline styles, `isDark` from `ConfigContext`, shell colours via `var(--pupu-*)`, BUILTIN `Button`, z-index only from `layer/z_layers.js` (the Modal already handles it).

## Layout constants (from the picked designs)

- Modal: `width: 840, minWidth: 840, maxWidth: "92vw", height: 600, maxHeight: "80vh", padding: 0`, `backgroundColor: "var(--pupu-background)"`, flex row.
- Rail: `width: 200`, `backgroundColor: "var(--pupu-sidebar)"`, `borderRight: "1px solid var(--pupu-border)"`, padding `16px 10px 10px`, captions 10 px uppercase `letterSpacing 1.5px` at 0.3 opacity (same as Settings modal strip). Row: BUILTIN `Button` full width, `justifyContent: flex-start`, `fontSize: 13`, `padding: "6px 10px"`, `borderRadius: 7`, opacity 1 selected / 0.65 rest; content = 6 px dot (`var(--pupu-success, #5cc084)` when configured, `var(--pupu-border)` otherwise) + brand icon 16 px + title.
- Pane: `flex: 1`, `padding: "24px 32px"`, scrollable (`className="scrollable"`), title 22 px 600 `theme.font.titleFontFamily`, then one hairline `1px solid var(--pupu-border)`, then rows. Close button identical to `toolkit_modal.js`.

## Slices

### S1 (strong) — rail data + modal shell + key-provider pane + welcome pane
Files: `src/COMPONENTs/model-providers/{rail_entries.js, rail_entries.test.js, model_providers_modal.js, model_providers_modal_content.js, provider_rail.js, panes/key_provider_pane.js, panes/welcome_pane.js, model_providers_modal.test.js}`, `provider_key_section.js` (+`heading` prop), `model_providers/index.js` (export `NATIVE_PROVIDERS`, `OllamaLibraryBrowser`).
Done when: `rail_entries.test.js` covers native/shipped/ollama/custom/flag-off/registry-fixture; modal test asserts `modal_open` includes `model-providers-modal`, rail renders entries, selecting an entry swaps the pane, welcome pane shows when nothing configured.

### S2 (delegated to a Sonnet worker) — entries + retirement
S1 is done: `src/COMPONENTs/model-providers/model_providers_modal.js` exports `ModelProvidersModal({ open, onClose, initialEntryId })` and `MODEL_PROVIDERS_MODAL_ID`; `en.json` already has `side_menu.models`.

1. `src/COMPONENTs/side-menu/side_menu.js`
   - Add `const [modelProvidersOpen, setModelProvidersOpen] = useState(false);` and `if (modelProvidersOpen) lazyMountedRef.current.modelProviders = true;` next to the other lazy flags.
   - Lazy import like `MemoryInspectModal`: `const ModelProvidersModal = lazy(() => import("../model-providers/model_providers_modal").then((m) => ({ default: m.ModelProvidersModal })));`
   - In the top group, after the Workspaces `Button` (same style object), add a `Button` with `prefix_icon="pentagon"`, `label={t("side_menu.models")}`, `onClick={() => setModelProvidersOpen(true)}`.
   - Mount inside the existing `<Suspense>` block: `{lazyMountedRef.current.modelProviders && (<ModelProvidersModal open={modelProvidersOpen} onClose={() => setModelProvidersOpen(false)} />)}`.
   - Pass `onOpenModelProviders={() => { setSettingsOpen(false); setModelProvidersOpen(true); }}` to `<SettingsModal>`.
2. `src/COMPONENTs/settings/settings_modal.js`: accept `onOpenModelProviders` and forward it to `SettingsModalContent`.
3. `src/COMPONENTs/settings/settings_modal_content.js`: keep the `model_providers` entry in `BASE_SETTINGS_PAGES` (same icon/label) but make it an action: clicking it calls `onOpenModelProviders?.()` instead of `setSelectedPage`. Remove `ModelProvidersSettings` from `PAGE_COMPONENTS` and its import. If `onOpenModelProviders` is not provided, the button does nothing (no crash).
4. `src/COMPONENTs/settings/model_providers/index.js`: delete `ModelProvidersSettings` (and now-unused imports: `ProviderKeySection`, `CustomProvidersSection`, `isFeatureFlagEnabled`, `SHIPPED_PROVIDERS`, `NATIVE_PROVIDERS`). Keep `OllamaLibraryBrowser` (exported) and `OllamaSection` only if still referenced — `OllamaSection` is not; delete it. Update `index.test.js` accordingly (it may test `ModelProvidersSettings`; replace with a test that `OllamaLibraryBrowser` still renders its search input).
5. Tests: update `settings_modal.test.js` (its mock of `./model_providers` must no longer export `ModelProvidersSettings`; add a test that clicking the Model Providers item calls `onOpenModelProviders` and does not render any "Model Providers Content"). Add `src/COMPONENTs/side-menu/side_menu.model_providers_entry.test.js` if a side-menu test harness exists nearby (look at existing `side-menu/*.test.js` for the mocking pattern); if none is practical, say so in the report instead of forcing one.
6. Run: `CI=true npx react-scripts test --watchAll=false src/COMPONENTs/settings src/COMPONENTs/side-menu src/COMPONENTs/model-providers` and `npx eslint src/COMPONENTs/side-menu src/COMPONENTs/settings/settings_modal.js src/COMPONENTs/settings/settings_modal_content.js src/COMPONENTs/settings/model_providers/index.js`.
Checkpoint C1 after S2: strong agent reviews diff + runs the suites above.

### S3 (strong) — Ollama pane + custom panes
Files: `settings/local_storage/hooks/use_ollama_installed.js` (lifted from `local_storage/index.js` OllamaSection; Local Storage consumes it), `model-providers/panes/ollama_pane.js`, `panes/custom_provider_pane.js`, `panes/add_provider_pane.js`, tests with mocked `api.ollama`.

### S4 (delegated to a Sonnet worker) — i18n + docs
1. Locales: `src/locales/{de,es,fr,it,ja,ko,pt-BR,ru,zh-CN,zh-TW}.json` each get `side_menu.models` and the whole `model_providers.page` object, translated from `src/locales/en.json` (keep every `{host}` placeholder verbatim; keep key order identical to en; keep the file's 2-space indent and trailing newline; do not reformat other keys). Brand names (Ollama, PuPu) stay as-is.
2. `docs/features/custom-model-providers.md`: add a short erratum block at the top (after the #202 block) titled "Model Providers page (#204)" saying the Settings → Model Providers page is retired; the surface is `src/COMPONENTs/model-providers/` (`ModelProvidersModal`, rail from `rail_entries.js`, panes reuse `ProviderKeySection` / custom-provider components / Ollama library; installed-model management shares `settings/local_storage/hooks/use_ollama_installed.js`). Written in the same language/style as the surrounding erratum blocks (Chinese with English identifiers).
3. `docs/DEV_GUIDE.md`: if it has a key-files or components table, add one row for `src/COMPONENTs/model-providers/` — "Model Providers page (rail + panes; opened from the side menu)". If no such table exists, add nothing and say so.
4. Verify: `node -e "for (const l of ['de','es','fr','it','ja','ko','pt-BR','ru','zh-CN','zh-TW']) { const j=require('./src/locales/'+l+'.json'); const e=require('./src/locales/en.json'); const missing=Object.keys(e.model_providers.page).filter(k=>!(j.model_providers.page||{})[k]); if (missing.length||!j.side_menu.models) throw new Error(l+': '+missing.join(',')); } console.log('locales ok')"` and `CI=true npx react-scripts test --watchAll=false src/locales src/BUILTIN_COMPONENTs/mini_react/use_translation`.
Checkpoint C2 after S4: strong agent runs the i18n parity check and the full suite.

## Test commands

- `cd /Users/red/Desktop/GITRepo/pupu-204 && CI=true npx react-scripts test --watchAll=false src/COMPONENTs/model-providers`
- `CI=true npx react-scripts test --watchAll=false src/COMPONENTs/settings src/COMPONENTs/side-menu`
- Full: `CI=true npx react-scripts test --watchAll=false`
- Never `npx jest` directly.

## Stop conditions for a delegated worker

Report back instead of improvising when: a needed export does not exist, a test outside the slice fails, a locale file is malformed, or the plan contradicts the code. Do not commit or push.

## Round two (project owner, 2026-09-19, after the as-built preview)

Decisions: (5) Settings keeps a **narrow** Model Providers page — design **N1** accordion — sharing the pane components with the wide layer; the Settings item no longer redirects. (6) The Models modal matches the **Settings modal frame: 600 × 600, maxHeight 80vh** (the project owner tried the 920-wide Agent Builder frame and a fullscreen toggle on dev and reverted to the square). Rail 160 px; panes fit ~380 px; the expanded store card stacks its picker under the description at this width. (7) The Ollama store is redesigned — design **O3** card grid with an expanding card: search, Popular/Newest sort, category chips, Installed filter, a Featured row (curated JSON shipped with the app), and a per-tag size picker with real download size / context (new tags fetch). Mockups: https://claude.ai/artifact/Xh5etqFkYdPkAxor2rsBxD

### Boundary contracts (cross-boundary gate — IPC)

**BC-002 — renderer → main `ollama:library-tags`.** Producer: `api.ollama.fetchLibraryTags(name)` via preload `ollamaLibraryAPI.tags(name)`; consumer: `ollamaService.fetchLibraryTags({ name })`. Wire shape `{ name: string }`, admission **CLOSED**: `name` must match `/^[a-z0-9][a-z0-9._-]{0,63}$/i`; anything else is rejected in main with `Error("invalid model name")` (never fetched). Response: the raw HTML of `https://ollama.com/library/<name>/tags` (string), like the existing search channel; the renderer parser is defensive — an unparseable page yields `[]` and the picker falls back to the size tags from the list. Timeout 12 s → rejected promise → picker shows the fallback with a retry. Identity: channel constant `CHANNELS.OLLAMA.LIBRARY_TAGS = "ollama:library-tags"` in `electron/shared/channels.js`, listed in `IPC_HANDLE_CHANNELS` and `PRELOAD_INVOKE_CHANNELS` (parity test `ipc_channels.test.cjs`).

**BC-003 — `ollama:library-search` gains `sort`.** Payload `{ query, category, sort }`, `sort` ∈ `{"", "newest"}` **CLOSED**; main maps `"newest"` → `o=newest` on the ollama.com URL and treats any other value as the default (popular) ordering — never forwarded verbatim. Existing callers omitting `sort` are unchanged (negative test: `sort: "evil"` produces the default URL).

**AC-10** `ollamaLibraryAPI.tags("qwen3")` invokes `ollama:library-tags` with `{ name: "qwen3" }` (contract twin test); main rejects `"../x"`; a fixture of the real tags page parses into tags with size label, context and input; a garbage page parses to `[]`.
**AC-11** The store shows Featured (from the curated JSON, only entries the library search can resolve are clickable), Popular/Newest sort, categories, Installed filter; a card expands to the picker; Pull uses the existing pull path (`handlePull(name, tag)`), progress and cancel render in the expanded card; an installed tag shows a check.
**AC-12** Settings → Model Providers renders the N1 accordion: one row per rail entry (same `buildProviderRailEntries()`), expanding to the same key control / custom row; Ollama's row shows status and an "Open in Models" action that opens the wide layer on the Ollama entry.
**AC-13** The Models modal is 600 × 600 / 80vh (Settings frame), no fullscreen; the store grid and the expanded card reflow (auto-fill / auto-fit) to the ~380 px pane.

### Slices

- **R1 (strong)** modal size + fullscreen (`model_providers_modal.js`).
- **R2 (delegated)** Electron: `fetchLibraryTags` + `sort` in `electron/main/services/ollama/service.js`; channel constant; `register_handlers.js` (list + handle); `preload/channels.js`; `preload/bridges/ollama_library_bridge.js` (`search(query, category, sort)`, `tags(name)`); tests: `electron/tests/main/ollama_service.test.cjs` (fake https: URL built for sort, name validation rejects), `electron/tests/preload/api_contract.test.cjs` (both new calls). `.js` twins are `require` shims — verify they still load. Run `npm run test:electron`.
- **R3 (strong)** renderer: `api.ollama.searchLibrary({ query, category, sort })`, `api.ollama.fetchLibraryTags(name)` + parser + test with the saved fixture `src/SERVICEs/__fixtures__/ollama_tags_qwen3.html`; `use_ollama_library` gains `sort`; new `use_ollama_model_tags(name)`.
- **R4 (strong)** store UI: `src/COMPONENTs/model-providers/panes/ollama/{ollama_store.js, store_card.js, size_picker.js, featured.js}`, `src/SERVICEs/ollama_featured_models.json`, i18n `model_providers.store.*`.
- **R5 (delegated)** Settings N1 accordion: `settings/model_providers/index.js` exports `ModelProvidersSettings` again (accordion over `buildProviderRailEntries()`), `ProviderKeySection heading="none"` (control only), `settings_modal_content.js` restores the page, `side_menu.js` passes `initialEntryId` through `onOpenModelProviders(entryId)`.


## Round three (project owner, 2026-09-20, on dev)

- Models modal back to the **Settings square frame** (600 × 600 / 80vh); pane heading is a **fixed header**; the Plugins / Models side menus copy the Settings strip verbatim (content-box 140 → 161 px rendered).
- **Ollama pane = S4 + S3** (mockups https://claude.ai/artifact/M6oxtfPw7QTtGEf9uBnHLR): one group button (`SegmentedControl`, as in the Agents modal) switches **Installed** (the Local Storage rows with the hover trash icon, "N on disk", active downloads) and **Library** (design S3: tall search, category `Select`, Installed chip, "Try" chips from the curated JSON, one row per model with a size `Select` + icon Pull; the Select fetches the tags page on first touch and relabels with real GB; installed tag → trash icon → confirm → delete via the Local Storage path, both installed sets refreshed). **No Popular / Newest sort control** (owner); BC-003's `sort` stays in the IPC, unused by the UI. The O3 cards / expanding picker and the S2 model page are gone.
- Store strings reshaped (`model_providers.store.*`: search_count, all_categories, try, popular, results, tab_installed, tab_library, on_disk; sort/featured/library/choose_size/pull_tag/show_* removed).
