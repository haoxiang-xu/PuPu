# Ticket 329: Humanizer Store skill

Ticket: https://github.com/haoxiang-xu/PuPu/issues/329
Release: #216 (v0.1.12)
Workspace: /Users/red/Desktop/GITRepo/pupu-329
Branch: codex/ticket-329-humanizer-skill
Base: dev @ bd94efe8facb38ed4afa7488a46e68d5e6cbb15a

## Goal and decisions

Add only the independently usable Humanizer instruction file, unchanged and hash pinned. No upstream code/scripts/hooks/agents packaging is installed or run. Current dev includes #291/#327: real YAML block descriptions are supported and installed skills feed the backend inventory/SkillsModule. Do not reimplement that work. User action: Store Skills → detail → Get → installed inventory → /humanizer on pasted text → model result. Restart preserves identity, uninstall removes it; failed hashes leave no partial install. No UI component changes or visual alternatives are needed; existing row/detail/install surfaces render the new data.

The intended scope is prose editing with preservation of facts/voice, not AI-authorship detection or detector evasion. File editing is not advertised as qualified; original skill file mode remains subject to whatever tools the user attached and their existing confirmation controls. No separate account, external embeddings or runtime service. Text goes to the selected model provider at ordinary cost. Selected content is 28,728 bytes, below 64KiB; it has no required sibling references, scripts or hooks. Wikipedia is an attributed informational source, not a runtime fetch dependency. The source repository contains a maintenance Python script which must not appear in the manifest. MIT notice is included verbatim in the shipped curation's source.licenseNotice (bundled with the app), with visible copyright/license attribution in the description. No new badge schema; Unverified.

## Research / graph

GitNexus index matches base. query skill pack download install identifies installStoreSkillPack → buildSkillPackFromScan and downloader/store boundaries. installStoreSkillPack impact HIGH: two direct callers, three processes including Store list and detail installation; no shared symbol is edited. Current source confirms only manifest-hit Markdown is retained, so root scripts are excluded. Existing unknown metadata fields are allowed in curation and unused by install payload. Prior #289 is document coauthoring, not a duplicate of focused prose editing.

## Contracts and acceptance

BC-329-001: curation/listing-record JSON → listStoreSkillPacks/detail/trust. OPEN metadata over required id/title/review/source/manifest identity, invalid mandatory identity is filtered. AC-329-001: real entry renders in gate, third_party + officially_curated + unverified, meaningful EN/ZH copy, source identity and full MIT notice remain in shipped data. No claim that directory audit badges prove safety.

BC-329-002: GitHub pinned archive → Electron downloader → scan/import → Python skill_packs store. CLOSED manifest (one SKILL.md, SHA-256 exact), persisted skill row follows current canonical shape including aliases/policy/metadata; no extra executable data. AC-329-002: real download/import yields one skill, full block description, body equals pinned content minus frontmatter, metadata version 3.0.0 and license MIT survive. Hash tamper fails integrity without partial writes; scripts outside manifest stay absent; malformed/missing identity is rejected by existing tests. SEQ-329-001 identity skillpack.humanizer: absent → install → duplicate 409 → second read → cold process read/inventory → uninstall → reinstall, with stable canonical identity and no stale inventory row after deletion.

BC-329-003: imported row → skills_inventory/Unchain SkillsModule → model. CLOSED inventory schema from current #291; no user-message expansion. AC-329-003: inventory identifies humanizer and invocation loads exactly the retained body, preserving original user text; first/second invocation and cold restart work. Model check uses synthetic prose containing fixed numbers/names/citations; no unintended tool access, facts preserved and embedded hostile instruction treated as text. Full isolated security certification and packaged-pair audit remain distinct from development evidence; mark NOT_RUN until actually run.

State matrix: first/second normal invocation and cold persistence covered; write interactions N/A for pasted-text/no-tools test; retry/resume not modified, no new state handler; graph/subagent mechanism not modified; actual packaged candidate + fixed wheel evidence required for release audit, no source test substituted for it.

## Formal plan / cheaper-model handoff

Suitable bounded slice: GPT-6 Sol appends the exact entry below and corresponding existing-shape listing record to plugin_listing_records.json, then runs catalog/import regressions and builds an opt-in real download/import/store/inventory lifecycle script under ticket-329-evidence. No implementation choices concerning new components, schemas, runtime or security wrappers are delegated. Allowed files: two catalog JSON files plus ticket-329 plan/evidence. Preserve unrelated data. Before editing helpers obey GitNexus impact; UNKNOWN requires text corroboration. Use parent-reviewed #289 evidence as a reference, but update schema assertions from current code. Never load installed personal skills or credentials; all stores/workspaces must be synthetic. No live model calls, commits, push, PR, audit or Project changes by worker.

Checkpoint 1 (only authorized slice): return diff and exact regression/lifecycle outcomes, failures and unresolved evidence. Parent reviews then owns live behavior check and final readiness. Stop on unexpected product code changes; do not repair shared mechanisms without parent decision.

## Exact catalog entry

```json
{
  "id": "skillpack.humanizer",
  "title": "Humanizer",
  "titleZh": "Humanizer 文字润色",
  "blurb": "Revise pasted prose for clearer language while keeping facts and the writer’s voice. This independent, third-party instruction skill runs with your selected model and its normal charges; text reaches that provider. No Humanizer account or separate service. English-oriented guidance; multilingual quality and file editing are not qualified. Unverified; it does not determine authorship or guarantee AI-detector results. MIT © 2025 Siqi Chen.",
  "blurbZh": "润色粘贴的文字，保留事实和作者语气。这是独立第三方指令技能，由你选择的模型执行并按正常方式计费，文字会发送给该模型服务商；不需要 Humanizer 账号或额外服务。指导以英语为主，多语言效果和文件编辑尚未验证。未经安全认证，不用于判断作者身份或保证 AI 检测结果。MIT © 2025 Siqi Chen。",
  "gradient": [
    "#536d8c",
    "#33445b"
  ],
  "source": {
    "provider": "github",
    "repo": "blader/humanizer",
    "sha": "9862685f575c65a8247f90369951df1b3416e3d6",
    "license": "MIT",
    "licenseNotice": "MIT License\n\nCopyright (c) 2025 Siqi Chen\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n"
  },
  "subset": [
    "humanizer"
  ],
  "manifest": [
    {
      "path": "SKILL.md",
      "sha256": "e8269e236bed06ed0fe4824c274112e54950b0cb46b0bafe5e1576ef7c9f93d5"
    }
  ],
  "review": {
    "recordId": "ticket-329-humanizer-selected-content",
    "reviewedAt": "2026-09-22",
    "reviewers": [
      "Codex (selected instruction content review)"
    ],
    "scope": "Pinned SKILL.md only. Maintenance scripts, host packaging and external Wikipedia content are excluded. Preliminary source/prompt review; no full security certification."
  },
  "commandPreviews": [
    {
      "name": "humanizer",
      "description": "Revise pasted prose while preserving its facts, citations and the writer’s voice.",
      "descriptionZh": "润色粘贴的文字，保留事实、引用与作者语气。"
    }
  ]
}
```

## Checkpoint 1 implementation evidence

The catalog now has exactly one `skillpack.humanizer` entry and one existing-shape listing record. `subset: ["humanizer"]` supplies the Store row's `/humanizer` display name; installation reads the independent manifest, whose only file remains the pinned root `SKILL.md`. The complete upstream MIT notice is retained in `source.licenseNotice`. No shared product symbol was edited. GitNexus previously rated the existing install path HIGH because two callers and three processes use it; this data-only slice leaves that path unchanged.

The opt-in probe and results are in `ticket-329-evidence/`. It passed real pinned archive download, exact byte/hash and independently fetched license checks, strict import and stored-row shape, multiline description and version/license metadata, isolated store and cold inventory, duplicate 409, uninstall/reinstall, and negative identity/duplicate-manifest/hash-tamper cases. Its separate scripted ModelIO check used the real PuPu developer-agent assembly and fixed Unchain wheel to verify exact Humanizer body activation, unchanged user text, a second turn, and a cold agent rebuild after reinstall. The three focused frontend suites passed 90 tests; the Electron downloader suite passed 36; the Python skill-pack/inventory suites passed 23 tests and 11 subtests. `git diff --check` passed. Scripted activation proves wiring only; live model prose quality and prompt safety, full security certification, and packaged artifact-pair qualification remain NOT_RUN for parent review and later gates.

Follow-up diagnostic packaging: an unsigned macOS arm64 ZIP was rebuilt after the Store row metadata correction with this clone's Humanizer web bundle and the fixed accepted Unchain sidecar. Candidate SHA-256: `cc846981b52023c5c389ec9ee64fd6201776feb52f9cfa40faf13d0487d08076`; wheel SHA-256: `6544306f55267482c9dfcd7fa346ed218a83ee8e4ec68a3ed761600f7119f194`; runtime manifest digest: `2d0587fa3670329bc42c1a936b37b85a8c9248e45896cc79ec31acd74628d12c`. ZIP integrity, exact packaged catalog/license and `/humanizer` row metadata, cached MCP runtime native smoke, and five packaged sidecar checks passed. See `ticket-329-evidence/package-build-results.json`. Full notices gate and release qualification are still NOT_RUN; the packaging worker did not run the app or a live model.


## Delivery behavior checkpoint

Real GPT-4.1 editing and ordinary second turn retain the supplied facts, with exact body once per provider wire. The native Store row filename preview defect was corrected in metadata only; final subset is [humanizer], immutable manifest still root SKILL.md. Native Store GET plus exact packaged sidecar real-model invocation pass. See final evidence README for sampled-quality limitations and the separately labelled source renderer / frozen sidecar diagnostic harness. Final candidate ZIP cc846981b52023c5c389ec9ee64fd6201776feb52f9cfa40faf13d0487d08076 supersedes d171f2…; no Verified attestation or release qualification.
