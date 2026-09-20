# #278 — Plugin publisher origin and verification labels

Ticket: https://github.com/haoxiang-xu/PuPu/issues/278
Release: #203
Workspace: /Users/red/Desktop/GITRepo/pupu-278
Branch: codex/ticket-278-plugin-trust-labels
Base: remote dev @ add8dcd1feaf325d209bd30e2fd1a01ce1ca3f8f

## Outcome and selected UI

User selected C: one joined marker, publisher-origin cell on the left and a clickable verification-status cell on the right. Labels remain semantically independent. Expand an inline explanation under the marker; it must not navigate the enclosing plugin row or install anything. Use a border separator, 6px corners, quiet neutral/blue/amber text, existing font, icons and theme. Do not truncate essential labels; wrap on narrow cards. Reuse this component across discovery (hero, essentials, collection rows), store (MCP, builtin/catalog, skill packs), installed rows and both detail types. Existing installation, OAuth, command and toggle controls retain their behavior.

User explicitly requires translatable UI. Every new visible label, explanation and accessible name goes through useTranslation. Add the same keys to all 11 shipped locale files; use locale switching and long-label checks. No translation-hook changes.

## Research and evidence

Read AGENTS.md, CLAUDE.md, .claude/CLAUDE.md, docs/DEV_GUIDE.md, and the cross-boundary gate. Clone-local GitNexus index is at the exact base SHA. Query found discovery/detail/install flows. toPluginPresentation maps catalog entries but currently conflates technical source with provider text. It is not necessary to change that shared projection for this addition. Raw entry props can feed the new marker.

GitNexus component impacts are UNKNOWN because JSX reference callers are not resolved; ui-callers.txt corroborates actual references. PluginListRow is used by store and installed pages; the two card components by discovery; all pages by PluginsShell. toPluginPresentation has MEDIUM impact (8 callers/transitive symbols), and useTranslation has CRITICAL impact; both implementations remain untouched. New resolvePluginTrust and PluginTrustBadge symbols do not yet exist; graph lookup plus source search confirms that. Re-run impact on any existing symbol edited, including nested row renderers.

The current MCP registry contains trustLevel=verified without a defined verification scope. This alone must never produce a verified claim. needs_review means awaiting review, not approved. Skill-pack curation includes source pins, hashes and review record IDs, but installed catalog entries do not preserve artifact provenance; an ID match cannot establish that installed bytes were verified. The old pre-download “SHA-256 verified” detail label will be replaced with a factual “SHA-256 checked on download” label.

## Data decisions

Parent implements src/SERVICEs/plugin_trust.js and plugin_verification_records.js. resolvePluginTrust(entry) returns exactly { origin, status, publisher, scope, reviewedAt, reviewedBy, reference }.
- origin: official only for explicit backend source=builtin/core, never a missing-source default, name, icon, ID prefix, or trustLevel. Recognized mcp/mcp_registry/local/plugin/skillpack sources and GitHub skill-pack source objects are third_party. Otherwise unknown.
- status: unverified by default; needs_review / external_review map to pending with copy that makes no queue or approval claim. Missing/malformed entry is unknown. Plugin-supplied verified/verification/reviewed flags are ignored.
- Verified requires a complete application-bundled record, exact matching toolkit ID, source, version and source repository, nonempty approved scope codes, review date, reviewer and HTTPS evidence reference. Wrong/missing identity/version or malformed/unknown record fields fail closed to unverified. Pending record cannot imply completed checks.
- No evidence-backed scoped records exist in the current source; ship an empty bundled record list rather than invent endorsements. Verified rendering/normalization is tested using explicit synthetic records. This is an intentional accurate migration, not a verification service.
- publisher is PuPu for builtin, otherwise a declared publisher/author or source-repository owner when present; explanation identifies this as declared publisher information. No persisted trust cache; derive from the current entry on every render.
- scope codes: publisher_identity, source_ownership, permissions, content. Translate scope descriptions in the component. No rendering arbitrary HTML or external links from plugin metadata.

## Boundaries

Cross-boundary gate: NOT_APPLICABLE to deployed process/provider/persistence contracts. This is a renderer-only display derived from existing catalog fields and a bundled JavaScript policy constant. No IPC/HTTP shape, backend schema, stored object, install admission, or runtime protocol is changed. No new trust state is written or synchronized. Existing catalog and locale values are inputs; unknown fields cannot create a trusted claim. No wheel is changed or active rollout performed. SEQ: NOT_APPLICABLE to durable chat/interaction/retry/resume/replay; none are consumed or modified. Repeat rendering, locale switching and changing the selected entry are tested as UI lifecycle checks.

## Acceptance and verification

AC-001: Every reachable plugin row/card/detail shows explicit origin and status, including builtin Computer, imported skills, custom MCP and unknown entries.
AC-002: Official, third-party, pending and unverified remain distinct; missing source does not become official. Legacy verified flags, forged raw verification and same-ID/different-version records cannot become verified.
AC-003: A valid scoped bundled record exposes exactly its scope, reviewer/date/reference; click/keyboard opens explanation without row navigation. No service-quality, payment-fulfillment or fraud-free guarantee.
AC-004: All new text uses matching keys in 11 locales. Switching locale updates an open explanation. Narrow cards, Chinese and German labels fit; light/dark themes remain legible.
AC-005: Existing install, OAuth, toggle, store/installed routing and skill-pack error behavior remains green in targeted existing suites.
AC-006: Pre-download hash copy describes the download-time integrity check accurately, without an unsupported general verification claim.

Run CI=true npm test -- --watchAll=false --runInBand --testPathPattern='plugin_trust|plugin_list_row|plugins_discover_page|plugins_categories_page|plugins_installed_page|plugin_detail_page|skill_pack_detail_page|plugins_shell|use_translation'. Browser-check the actual shared component in light/dark themes and at narrow widths; report actual evidence. No commit, push, PR or feature audit during start.

## Delegation and checkpoints

Assessment: partially suitable. The parent owns trust policy, truthful migration, impact interpretation, integration and final review. Two bounded slices are suitable for gpt-5.6-sol (high): translation of a fixed key set into existing locale files; and the settled shared marker component with behavioral tests. This model is available and appropriate once interfaces and behavior are fixed.

Checkpoint 1: component-only worker returns its component/tests; stop before page integration. Parent checks selected C, keyboard/click behavior, localization and semantics. Locale worker edits only new toolkit.trust_* keys and verifies placeholders/key parity. Parent can build/test the resolver independently.
Checkpoint 2: after parent approval, integrate the reviewed marker at the inventoried surfaces, verify real entry props rather than defaulted presentation sources, and check existing regressions. Parent reviews final diff and browser evidence.

Component contract: default export PluginTrustBadge({ entry, isDark=false }); it calls resolvePluginTrust(entry), uses useTranslation and ConfigContext font, and has an inline expanded details section. Status icon names: verified / time (or a confirmed existing clock icon) / question_mark. Accessible translated toggle, aria-expanded/aria-controls, Escape closes and restores focus. Opening details must not bubble to the plugin row. No new portal/modal. Use the translation keys supplied in ticket-278-copy.json as the complete starting vocabulary.

## Implementation-ready evidence

Both checkpoints passed parent review. The shared C marker is integrated into discovery hero/essential/collection cards, all store row types, installed rows and both plugin detail pages. Detail explanations live at the top of the scrollable body so expanded translations do not push the fixed install controls off screen. Row icons/actions remain top-aligned. Collapsed discovery collections are inert to keep hidden marker buttons out of keyboard navigation. Pending uses the existing calendar icon. The final hash label is “SHA-256 check on download”.

All 27 new keys exist in all 11 shipped locales (297 translated entries), including explanations, scope labels and accessible toggle names. Key/placeholder parity and live switching with an open explanation are covered. Existing locale values were not changed.

Validation: 11 targeted suites / 213 tests passed. Evidence: `ticket-278-evidence/final-tests.txt`. This includes resolver truthfulness, synthetic scoped records, mismatched versions, real registry/curation inputs, shared component keyboard/click isolation and locale lifecycle, real page integrations, existing install/OAuth/toggle/error behavior and shell routing. `git diff --check` passed. No full release build, packaged Electron run or release feature audit has been performed at this implementation-ready stage.

Browser validation used the actual production components in a task-local fixture with real locale/theme contexts. Chinese light rows/cards and German dark skill detail were visually reviewed; expansion did not navigate rows, overflow the root or produce runtime errors. A 360px component check verified narrow wrapping and open-panel locale changes. These are component-fixture checks, not evidence of a packaged application rollout. Screenshots are in `/Users/red/.codex/visualizations/2026/09/12/01a09733-3425-7a13-9168-afc4ac44f0ca/implementation-qa/`.

Final GitNexus reindex succeeded (38,149 nodes / 131,124 edges / 1,103 flows). Full `detect_changes(scope=all)` includes the six new source/test files via a temporary alternate Git index, without staging the real checkout. Raw evidence: `ticket-278-evidence/detect-changes-full.json`: 30 code/locale files, 105 changed symbols, 28 affected processes, aggregate CRITICAL risk; no partial/truncated/error marker. The CLI's abbreviated prose was not treated as a complete check. The user was warned about the aggregate risk. Affected paths originate at plugin detail, store, installed and discovery pages; review confirms only display/prop wiring, layout and collapsed keyboard reachability changed there. Graph extraction/JSX resolution limits remain, so source-callsite corroboration and page tests supplement graph output; it is not a zero-impact claim.

Material limitation: the bundled scoped verification list is intentionally empty. Existing unscoped `trustLevel=verified` metadata now displays unverified; verified rendering is supported and tested, but no production plugin is newly endorsed. No backend, IPC, persistence or install-admission contract changed.

Delivery state: local implementation ready in the independent clone. The user subsequently requested a local commit (提交吧), authorizing that commit in this clone. Issue remains open / In Progress. Push, pull request, release audit and closure still await the user's requested `close` step. The commit includes the implementation plan, translation vocabulary and final verification evidence; intermediate research and failed-run logs remain local.

Pre-commit check: after staging the final documentation/evidence as well as code, the complete graph result contains 36 files / 112 symbols / 28 processes, still CRITICAL with no partial/truncated/error marker. This supersedes the code-only counts above in `detect-changes-full.json`; product code and the tested candidate remain unchanged.

## Requested close

The user subsequently requested push and close. PR #282 targets dev. Fresh dev at 53689bc6 merges without conflicts; no integration source changes were needed. The feature audit identified a bare-button reuse violation, and the implementing agent accepted the scoped correction to builtin Button. C geometry, supported ref/ARIA props and inline disclosure remain; builtin hover/press feedback is retained. Fresh upstream impact remained UNKNOWN due to JSX caller resolution, corroborated by all six actual call sites. The correction passed all 213 tests and the Chinese/light, German/dark browser fixtures again.

Full i18n audit: 766 English keys, no missing/orphan/placeholder mismatches in any locale, no code missingInEn. The scanner reports 57 statically unreferenced keys and 40 dynamic call sites; these are limitations/advisories, not deletion instructions. In particular the old hash label is now unused, retained to avoid unrelated locale cleanup.

Real-app evidence now supplements the earlier fixtures: an isolated Electron development candidate loaded this clone's renderer/main/preload and its own sidecar. Real catalog entries core, plan and agent_reach matched the Installed origin/status labels; Core's expanded explanation stayed in the list and its real detail showed the same marker and explanation. No catalog mocks or synthetic plugin injection were used. The test does not call an LLM because the changed behavior is catalog display. `live-installed.json`, `live-detail.json`, `live-detail.png` and `live-provenance.json` record the probe. The exact loaded bundle and modified component have SHA-256 hashes in provenance; the final audit comment will bind these to the pushed candidate archive digest.

Audit review: i18n PASS; builtin UI/theme PASS after correction; model/agent builder N/A; static rules PASS; actual catalog-to-UI behavior PASS. Unchain wheel/runtime-manifest fields are N/A because no boundary schema, producer, IPC, persistence or runtime contract changes and no packaged rollout are involved. This is feature acceptance, not release certification. Final structured audit and subsequent cleanup are recorded on #278, not inferred from this plan.
