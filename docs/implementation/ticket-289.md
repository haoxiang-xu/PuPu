# Ticket 289 implementation plan

Ticket: https://github.com/haoxiang-xu/PuPu/issues/289
Release: #216 (v0.1.12)
Workspace: /Users/red/Desktop/GITRepo/pupu-289
Branch: codex/ticket-289-doc-coauthoring-skill
Base: remote dev at c5209de25b29c45061cc22c201d40aa5fec1e4fa

## Goal and non-goals

Add one pinned, attributed, instruction-only skill pack, `skillpack.doc-coauthoring`, to the PuPu Store so a user can discover it, install it and invoke `/doc-coauthoring` to draft and revise a document with the capabilities PuPu actually provides. Catalog data only: no component, layout, IPC, schema, runtime-protocol, Python or Unchain change. The upstream SKILL.md is preserved byte for byte (hash-pinned); the PuPu capability mapping is expressed in the Store description, the command preview and this plan, and is checked by live evidence rather than by editing the skill text. Not in scope: security verification (the pack stays Unverified), a "verified" badge, bundling connectors, adding sub-agent templates, or rewriting the skill for PuPu.

## Settled decisions

- Source: `anthropics/skills` @ `34040c9c568585f6929bedeaad110ad08f079624` (upstream `main` tip on 2026-09-20; the skill folder's only commit is `00756142`, 2025-12-04, PR #134). Subset `skills/doc-coauthoring`; manifest `skills/doc-coauthoring/SKILL.md` sha256 `2e47d78846faeea4a56e9809c52700087a15a2155a3f293a3efbaded81398ef4`, 15,815 bytes, 375 lines, ASCII only.
- License: the catalog now displays `License not specified for this skill`. The folder has no `LICENSE.txt` (the only `skills/*` folder without one at this revision); the repository README says only "Many skills in this repo are open source (Apache 2.0)" and separately names `docx/pdf/pptx/xlsx` as source-available. Membership in the `example-skills` plugin is not a license grant. The latest `main` checked on 2026-09-22 is the pinned SHA and still has no per-skill license. PuPu catalogs metadata and users download the upstream file directly; the exact license is not asserted without explicit upstream confirmation. See the [read-only audit](ticket-289-evidence/audit-readonly-2026-09-22.md).
- Content review (2026-09-20, this agent, full read of the selected file): a three-stage co-authoring workflow (context gathering, section-by-section refinement, reader testing). No prompt-injection patterns, no credential or exfiltration instructions, no shell/network commands, no hidden characters, no sibling-file references (so no `degraded` flag), no scripts (so no `rejected`). One external URL, `https://claude.ai`, in the manual reader-test instructions. References to Claude-specific facilities: `create_file` and `str_replace` (artifact editing), "integrations"/connectors (Slack, Teams, Drive, SharePoint, MCP), Claude Code sub-agents.
- Capability mapping stated to the user (blurb, zh blurb, command preview): drafts and edits go to a markdown file in the workspace through PuPu's `write`/`edit` tools, each behind a confirmation card; context can come from pasted text or MCP servers the user installed; reader testing is manual in a new PuPu chat because normal chat has no sub-agents unless the user registered templates; everything goes to the user's selected model provider at that provider's price.
- No icon. Upstream ships no logo for this skill; the default command icon is used. Gradient reuses the Anthropic orange already used by `skillpack.frontend-design`.
- Review record: `recordId` `ticket-289-doc-coauthoring-content-review`, `reviewedAt` `2026-09-20`, reviewer "Claude (selected instruction content review)".

## Functional flow

1. Discover: Store → Skills rows come from `listStoreSkillPacks()` (`src/COMPONENTs/toolkit/utils/skill_pack_store_install.js`), which filters `plugin_store_curation.json#skillPacks` fail-closed. `SkillPackDetailPage` renders title/blurb by locale, `repo@sha`, SHA-256 verified, `reviewedAt · license`, and `commandPreviews`.
2. Install: `installStoreSkillPack(entry)` → Electron `downloadSkillRepo` (codeload tarball, manifest-hit SHA-256 check, `integrity` on mismatch) → `scanSkillDir` → `buildSkillPackFromScan` (scripts/64 KiB/degraded gates) → Flask `install_skill_pack` (`skill_packs.py`; 64 KiB cap re-enforced, duplicate → 409) → catalog v2 → `/doc-coauthoring` command.
3. Invoke: the user types `/doc-coauthoring …`; the pinned body expands into the user message; the selected model runs the workflow with the chat's attached tools.
4. Persist: `skill_packs.json` in the app data dir; a fresh sidecar reads it back and re-exposes the command.
5. Uninstall: `delete_skill_pack` removes the pack and the command.

## Boundaries, sequences and acceptance

BC-289-001 — catalog row → Store gate/detail/trust. Producers: `plugin_store_curation.json#skillPacks[]` and the listing provenance record in `plugin_listing_records.json` (`toolkitId`, `source: skillpack`, `sourceRepo`, `listing: officially_curated`; without it `resolvePluginListing` returns `""` and the badge shows no listing route — found at checkpoint 1). Consumers: `listStoreSkillPacks` (gate), `SkillPackDetailPage`, `resolvePluginTrust`/`resolvePluginListing`. Admission OPEN metadata (unknown keys ignored; e.g. `iconAttribution`, `licenseBasis`) over the gate's required identity fields (`skillpack.*` id, `title`, valid `manifest`, `review.recordId`, github `repo` + 40-hex `sha`). Failure: a row missing any required field silently does not exist to the UI. AC-289-001 positive: the real JSON lists the new id; trust is `third_party/unverified`, listing `officially_curated`. AC-289-003 negative: existing gate tests prove variants without sha/manifest/review are dropped.

BC-289-002 — immutable upstream archive → Electron downloader → scanner → importer → Python store. CLOSED to manifest-hit markdown with exact SHA-256; identity = `repo + sha + path + sha256`; installed identity forced to the curation id. Failure: hash mismatch → `integrity`, no partial output; oversize/scripts → rejected; duplicate → 409. AC-289-002: real download of the pinned archive imports exactly one skill `doc-coauthoring` with `rejected/skipped/degraded = []` and body sha256 equal to the manifest hash of the raw file (frontmatter stripped body is compared against the same file's body); duplicate 409; fresh Python process reads the identical body; uninstall/reinstall succeed; tampered hash fails closed. SEQ-289-001 (key: `skillpack.doc-coauthoring`): absent → download/scan/import → installed → duplicate rejected → fresh-process read → uninstall → reinstall → tampered manifest rejected.

BC-289-003 — command expansion → model → PuPu tools. The expanded user message is the unchanged SKILL.md body; the model's tool calls go to the attached Core toolkit (`write`/`edit` with confirmation). No wire, schema or protocol change; this is behaviour evidence. AC-289-004 (live dev app, `openai:gpt-4.1`): first message with `/doc-coauthoring` returns the workflow offer; drafting writes a workspace markdown file through `write` (confirmation card); a revision uses `edit`; the reader-test step yields manual instructions; after a sidecar restart the command is still listed and a second message in the same chat succeeds; uninstall removes the command. Any claude.ai wording or reference to a tool PuPu lacks is recorded as a limitation.

State matrix: (1) first normal message — AC-289-004; (2) second message same chat — AC-289-004; (3)/(4) interactions — the `write`/`edit` confirmation cards are interactions, covered by AC-289-004 first and second confirmations; (5) retry/durable resume — N/A, no journal/resume change; (6) sidecar cold restart — AC-289-004 restart step + SEQ-289-001 fresh-process read; (7) graph/subagent paths — N/A, pack contributes zero tools and no subagent templates; (8) provider/manifest/artifact identity change — packaged pair acceptance is the feature audit on `close`, `NOT_RUN` here.

## Graph evidence

Clone indexed with GitNexus 1.6.12 (40,546 nodes, 136,889 edges, 1,120 flows) at the base above. `listStoreSkillPacks` LOW, 1 direct caller (`PluginsCategoriesPage.packItems`). `installStoreSkillPack` HIGH, 3 processes (`PluginsCategoriesPage`, `handleInstallPack`, detail-page install). `buildSkillPackFromScan` HIGH, 4 processes (Store install and local folder import share it). `install_skill_pack` UNKNOWN (zero resolved edges); text search: `route_skillpacks.py:40` via the `routes.py` re-export. None of these symbols is edited; the HIGH consumers are exercised end to end by the lifecycle script.

## Delegation assessment and checkpoints

Partially suitable. Slice 1 (append the fully specified JSON entry, validate JSON, run the three catalog suites) is bounded, has closed identifiers and observable tests, and is delegated to a lower-cost model with the exact entry content below. Slice 2 (live lifecycle script, dev-app model run, evidence, plan updates) needs judgment about observed behaviour and stays with the strong agent. Checkpoint 1 after slice 1: diff review (only the new array element; byte-identical existing entries; JSON valid; tests green). Checkpoint 2 after slice 2: evidence review before implementation-ready. No commit, push, PR or audit until the user's `close`.

### Slice 1 handoff (worker)

Edit only `src/SERVICEs/plugin_store_curation.json`: append one object to `skillPacks` after `skillpack.ponytail`, preserving the file's 2-space indentation and trailing newline. Do not change any other byte. Content:

```json
{
  "id": "skillpack.doc-coauthoring",
  "title": "Doc Co-Authoring",
  "titleZh": "文档协作撰写",
  "blurb": "Anthropic's three-stage workflow for proposals, decision docs and specs: gather context, build each section by brainstorming and curation, then test the draft on a reader. In PuPu the draft lives in a markdown file in your workspace, written and revised through the write/edit tools with your confirmation; context comes from what you paste or from MCP servers you installed; reader testing is manual — open a new PuPu chat and paste the document. Your selected model does the work at its usual cost. Unverified; instruction only. PuPu does not bundle the skill body; it downloads from upstream when you install. The license for this specific skill is not specified upstream.",
  "blurbZh": "Anthropic 官方的三阶段文档协作流程：先收集背景，再逐节头脑风暴并筛选成稿，最后让读者试读找盲点。在 PuPu 中草稿保存为工作区的 markdown 文件，通过 write/edit 工具写入和修改并需要你确认；背景来自你粘贴的内容或已安装的 MCP 服务；读者测试需手动在新会话中粘贴文档进行。由你选择的模型执行，按其正常计费。未经验证，仅含指令。PuPu 不捆绑技能正文；安装时才从上游下载。上游未注明此技能的具体许可证。",
  "gradient": [
    "#d97757",
    "#b05730"
  ],
  "source": {
    "provider": "github",
    "repo": "anthropics/skills",
    "sha": "34040c9c568585f6929bedeaad110ad08f079624",
    "license": "License not specified for this skill"
  },
  "subset": [
    "skills/doc-coauthoring"
  ],
  "manifest": [
    {
      "path": "skills/doc-coauthoring/SKILL.md",
      "sha256": "2e47d78846faeea4a56e9809c52700087a15a2155a3f293a3efbaded81398ef4"
    }
  ],
  "review": {
    "recordId": "ticket-289-doc-coauthoring-content-review",
    "reviewedAt": "2026-09-20",
    "reviewers": [
      "Claude (selected instruction content review)"
    ],
    "licenseBasis": "No LICENSE.txt in skills/doc-coauthoring at this revision. The repository README says many skills are Apache-2.0 but does not identify this skill. Membership in the example-skills marketplace plugin is not a license grant; the exact license is not specified upstream."
  },
  "commandPreviews": [
    {
      "name": "doc-coauthoring",
      "description": "Guided drafting: context gathering, section-by-section refinement in a workspace file, then a manual reader test in a new chat.",
      "descriptionZh": "引导式撰写：收集背景、在工作区文件中逐节打磨，最后在新会话中手动做读者测试。"
    }
  ]
}
```

Then run, from the clone root, and report exact pass/fail counts:

```sh
node -e "const c=require('./src/SERVICEs/plugin_store_curation.json');const p=c.skillPacks.at(-1);console.log(p.id,c.skillPacks.length)"
CI=true npm test -- --watchAll=false --runInBand --runTestsByPath src/SERVICEs/plugin_trust.test.js src/COMPONENTs/toolkit/utils/skill_pack_store_install.test.js src/COMPONENTs/toolkit/pages/plugins_categories_page.test.js src/COMPONENTs/toolkit/pages/skill_pack_detail_page.test.js
```

Stop after reporting. Do not commit, do not edit other files, do not change existing entries, do not add an icon.

## Evidence

Recorded in `docs/implementation/ticket-289-evidence/` (README, opt-in live lifecycle script, dated results JSON, live model-run notes). Updated at each checkpoint.

## Implementation results (2026-09-21)

Checkpoint 1 (worker slice): the delegated Sonnet worker appended the entry exactly; its test run exposed the missing `plugin_listing_records.json` record (a handoff omission), which the strong agent added. Checkpoint 2 (strong-agent slice): 203 regression tests pass; the real lifecycle script passes every AC-289-002 / SEQ-289-001 cell; the live dev-app run covers AC-289-001 and AC-289-004 (discover, detail, real GET install, cold app+sidecar restart persistence, `/doc-coauthoring` expansion through the real composer, `write` scaffold and `edit` revision behind confirmation cards, manual reader-test instructions, uninstall). Details and limitations: [ticket-289-evidence/README.md](ticket-289-evidence/README.md).

Two findings worth carrying: (1) the test API's message endpoint does not run composer command expansion, so skill turns must be typed into the real composer during audits; (2) the unchanged upstream text sends users to claude.ai for the manual reader test, while PuPu's alternative lives in the Store copy — if the project owner wants the model itself to say "new PuPu chat", that would require a PuPu-side note injected alongside the skill body, which is a new import-chain capability outside this catalog-only ticket.

State matrix: cells 1, 2, 3, 4 and 6 observed in the dev app (first send, second send in the same chat, first and second confirmation interactions in one attempt, cold restart); 5 and 7 N/A; 8 (packaged pair) NOT_RUN. No commit, push, PR or audit until `close`.

## Resumption checkpoint (2026-09-22)

The original catalog changes were preserved and this clone fast-forwarded to remote dev `bd94efe8facb38ed4afa7488a46e68d5e6cbb15a`. #291/#327 have shipped, so the old expansion-based invocation evidence is historical: installed skill rows now feed the backend inventory and SkillsModule; the user's message remains verbatim and `/doc-coauthoring` activates a separately identifiable skill. BC-289-003 and AC-289-004 must be revalidated through that current path. Do not add a second activation implementation.

Bounded delegated slice (suitable): use GPT-6 Sol to refresh the existing opt-in lifecycle evidence script for the current real importer/store row shapes, verify the real pinned download → import → fresh-process store → inventory identity, and rerun affected catalog/import/inventory tests. Preserve strict key-set checks, update their expected schema from inspected current code rather than deleting checks. Also update this plan and the evidence README to distinguish old model observations from the current invocation flow. Allowed edits: ticket-289 plan/evidence only; catalog corrections require reporting to the strong parent first. Do not install into the user's profile, use personal credentials, start a live model run, commit, push, create PRs, audit, or change Project fields. Read the clone instructions and perform GitNexus impact on any existing helper before editing. Checkpoint: return exact diff, regression/lifecycle outcomes, artifact/runtime identity and remaining model/UI evidence requirements; parent reviews before further work. Parent handles live invocation and final delivery reporting while investigating #290/#329 independently.

### Bounded checkpoint result (2026-09-22)

The opt-in script now asserts the current closed key sets at three points: renderer importer output (`warnings`, aliases, invocation policy and metadata), Python's normalized persisted row (`model_invocable`/`user_invocable`, `degraded`), and `pupu.skill_inventory.v1` (top-level and entry keys). It uses a fresh Python process with workspace/user skill directories disabled and checks one `source=skillpack`, `source_id=skillpack.doc-coauthoring` row with `id=skillpack:skillpack.doc-coauthoring:doc-coauthoring`. The wheel is loaded directly from the preserved immutable #291/#327 audit artifact, checked against its artifact JSON before the test, and asserted as the imported Python module path; no mutable Unchain checkout is on `PYTHONPATH`. Its sha256 is `6544306f55267482c9dfcd7fa346ed218a83ee8e4ec68a3ed761600f7119f194`, source revision `fd7f7395ba39c5ce694191e5c160734f477e0957`, runtime manifest digest `2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c`. This is development evidence and does not qualify a #289 packaged artifact pair.

Lifecycle AC-289-002 / SEQ-289-001 PASS on `bd94efe8`: pinned GitHub download and file/body hashes, zero import warnings/skips/degradation/rejection, duplicate 409, identical fresh-process store and inventory read, uninstall/reinstall, tampered manifest integrity failure with no partial output. Focused regressions: renderer 194 passed / 7 suites, Electron downloader 36 passed / 1 suite, Python pack/inventory/agent 27 passed plus 11 subtests. Detailed results and reproduction variables are in [ticket-289-evidence/README.md](ticket-289-evidence/README.md) and [skill-results.json](ticket-289-evidence/skill-results.json). The only edited files in this checkpoint are this plan and `ticket-289-evidence/`.

The second bounded slice adds **BC-289-003 wiring evidence, scripted ModelIO only**. `verify_activation.py` reads the actual installed row in the isolated store, builds PuPu's real developer agent with the fixed wheel, and checks a `/doc-coauthoring` request: the 15,341-byte body appears exactly once under `skillpack:skillpack.doc-coauthoring:doc-coauthoring`, while the original user text reaches ModelIO verbatim. An ordinary second turn retains the same activation; a separate Python process rebuilds the agent from the store/transcript and retains that identity on a third turn. The actual `syncSkillInventory` command projection registers an unexpanded `/doc-coauthoring`, and uninstall clears the command and inventory. These checks pass in the updated `skill-results.json`. No credential, personal profile, provider call or product code was involved.

**AC-289-004 live model/UI evidence remains NOT_RUN on the current invocation path.** The 2026-09-21 model run is historical because #291/#327 replaced composer body expansion with verbatim user text plus inventory-backed SkillsModule activation. Remaining live evidence: Store discover/detail/install, invocation through the real composer and model, write/edit confirmation interactions, ordinary next turn, cold app/sidecar restart persistence, and UI uninstall. Parent agent handles this and any subsequent packaged-pair evidence; no product change is proposed by this bounded checkpoint.

### Metadata correction and unsigned diagnostic candidate (2026-09-22)

The subsequently authorized catalog correction changes only `skillpack.doc-coauthoring` metadata: `source.license` now says `License not specified for this skill`, `review.licenseBasis` describes the README's limited “many skills” statement accurately, and both blurbs say the body is downloaded from upstream at install time rather than bundled. Source commit, subset, SKILL.md hash, command preview, listing provenance and Unverified status remain unchanged. The opt-in verifier asserts the corrected metadata and passed a fresh pinned download/import/activation run; the affected renderer suite passed 194 tests in 7 suites.

An unsigned macOS arm64 diagnostic candidate was built without launching the app, reusing the preserved #291/#327 wheel and sidecar bytes plus the pinned MCP runtime cache. The complete candidate ZIP is `/Users/red/Desktop/GITRepo/pupu-289-candidate-evidence-2026-09-22/PuPu-289-macos-arm64.zip`, SHA-256 `6a691789348c604951cffbf64a1024672720594d4a2934f79a7b9d42c4a6dbb6`. Its `app.asar` SHA-256 is `70a6364524e27a735b2509f8853a87835d6eed20d76720021599a47757973906`; its bundled catalog chunk includes the corrected license and download disclosures with the unchanged upstream file hash. The sidecar binary inside the ZIP has SHA-256 `ffc8aada968f1d012a94f2ff88f82690d9452da548a2f88bd8ac034cb7ca9619`; the packaged sidecar protocol smoke passed 5 checks against the preserved wheel artifact and build snapshot. Full commands, hashes, limits and the smoke JSON are in [candidate-package-2026-09-22.md](ticket-289-evidence/candidate-package-2026-09-22.md). This is package construction and sidecar protocol evidence only: the full notices gate could not pass in the diagnostic clone because its build venv and staged runtime were absent, and #289 install/UI/model behavior within this candidate remains NOT_RUN.


## Delivery behavior checkpoint

Current inventory/SkillsModule activation, actual download/IPC install, real GPT-4.1 write/edit with confirmations, fresh-reader review, correction of the reader-detected budget mismatch, cold candidate-sidecar inventory and uninstall are now exercised. See the evidence README's final checkpoint; historical expansion-era evidence remains labelled historical. The skill still has no individually specified upstream license; the final catalog states that accurately and links to upstream without bundling its body. Candidate ZIP 6a691789348c604951cffbf64a1024672720594d4a2934f79a7b9d42c4a6dbb6 is the delivered diagnostic identity, using fixed wheel6544306f…f194 / manifest2d0587fa…d12c. No release qualification or Verified assertion.
