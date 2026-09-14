<!-- release-feature-audit:v2 -->
## Issue feature audit — 2026-09-13
Release: #203
Overall: FAIL — both newly curated skill commands fail before model execution.

1. i18n: PASS — full current scan of all 10 translated locales: no missing, orphan or placeholder-mismatch keys; no missing English source keys. Dynamic/dead-key candidates remain recorded, not deleted.
2. UI: N/A — the feature changes catalog data and descriptions, with no new UI primitive/layout. Actual packaged Store, install, slash-menu and error output were exercised as part of check 5.
3. model × agent builder: N/A — no model/provider selection or builder schema change. Real calls use openai:gpt-4.1.
4. static rules: PASS — scoped delivery consists of catalog JSON and implementation/evidence documentation. No renderer IPC, component localStorage write, router, TypeScript or Electron twin-test implementation change was introduced by this feature.
5. end-to-end: FAIL — both installed instruction-only packs expand their canonical slash commands but are attached as runtime toolkits and rejected. A separate ordinary-message control with the same packaged app, fixed wheel and GPT-4.1 succeeds and renders `BASELINE283`.

Candidate digest: sha256:1e44164c86132b7eb00b4ded5b8ff2e407a9ee270e2f7bb2065f19e6fcdc517d
Unchain wheel SHA-256: sha256:f2e6ddeb85363f1ae54583c7c7ea9d9c6effb1f5c2cba5d7a39c0607d0bec9b7
Runtime manifest digest: sha256:ab00567fe76a80e8661415eaea0ab57bba1d1c76ad19158153c51f1e64f2c6fc

### Blocking finding — P1: installed skill-pack commands cannot run

Fresh chats in the actual packaged renderer reproduce:

| Command | Observed result |
| --- | --- |
| `/audit-prep-assistant` plus a synthetic calculator audit-preparation request | `Requested toolkit is unavailable: skillpack.trailofbits-audit-prep` |
| `/web-design-guidelines` plus synthetic pasted HTML | `Requested toolkit is unavailable: skillpack.vercel-web-review` |
| Ordinary message, with no slash command: `Reply with BASELINE283 only. Do not call tools.` | PASS: assistant status `done`, exact response `BASELINE283`, visible in UI |

Both packs install through the real Store download/scan/import/persistence path; their commands remain discoverable after a cold app/sidecar restart. Persisted user messages contain the real expanded upstream templates (404 lines for Trail of Bits; 30 lines for Vercel), proving this is beyond a display-only test. Both failures happen before the provider can answer the skill request.

The scope-specific cause is visible in the delivered source:
- [plugin_skill_sync.js](https://github.com/haoxiang-xu/PuPu/blob/7b3ad7a8f47ae1ebebc7521e22a59d519de7b385/src/SERVICEs/plugin_skill_sync.js#L116) registers each command with `sourceToolkitId`, and using it selects that plugin for the run.
- [unchain_adapter.py](https://github.com/haoxiang-xu/PuPu/blob/7b3ad7a8f47ae1ebebc7521e22a59d519de7b385/unchain_runtime/server/unchain_adapter.py#L4942) defines installed skill packs as pure instruction plugins with zero tools.
- [runtime attachment](https://github.com/haoxiang-xu/PuPu/blob/7b3ad7a8f47ae1ebebc7521e22a59d519de7b385/unchain_runtime/server/unchain_adapter.py#L6127) nevertheless resolves these IDs as generic `unchain.toolkits` factories and raises when they are absent.

Required fix outcome: installed pure-skill commands must keep their template expansion while avoiding construction of a nonexistent runtime toolkit; real MCP/toolkit skills and genuinely unknown toolkit IDs must retain their intended attachment and rejection behavior. Re-run both commands through the packaged renderer with the same selected wheel, plus an ordinary-message control. No product fix is included in this report-first audit.

### Candidate and boundary evidence

- PuPu source: `7b3ad7a8f47ae1ebebc7521e22a59d519de7b385` (contains merged #284 and #285). A real unsigned macOS arm64 `PuPu.app` was built in an isolated clone. Candidate digest identifies the **packaged app tree**, including `app.asar`, Electron, the frozen sidecar and bundled MCP runtimes; it is not a source-archive digest. `candidate-tree.json` records the canonical hashing method and every file/symlink.
- Selected runtime: `4986ad4a42d81d728a3fac250be83a81c20c586d`, the exact default pinned in `.github/workflows/release-qa.yml`. Built once into the wheel above; installed into an isolated build environment and reused for the final frozen sidecar, packaged smoke and live app. Imported runtime status matches the recorded manifest.
- Package smoke: PASS, 5 real checks against the binary inside the final `.app`, including unauthenticated rejection, authenticated health/context status and manifest/snapshot correspondence. The diagnostic snapshot enables Memory V2 with all/all, and actual app status is ready/active.
- BC-283-001 / AC-283-006: all four MCP entries are visible with GET/Set up in the actual packaged Store; Microsoft Learn installation succeeds. This follows the owner's availability decision and does not award Verified. Paid Brave/Tavily/Firecrawl workflows remain NOT_RUN.
- BC-283-002 / SEQ-283-001: real Store installs and cold persistence are observed. Previous archive/hash/duplicate/uninstall/reinstall evidence remains linked in the implementation plan; no complete fresh sequence-matrix PASS is invented here. The required renderer → command expansion → runtime → model → UI path fails as described.
- BC-283-003: the real Microsoft Learn connection installs, but no paid-provider, graph/subagent, retry/resume or second-interaction certification is inferred. These failures cannot be waived by previous catalog/CI PASS results.
- Test setup correction: the first local diagnostic build used Unchain dev `8cd77590` and failed on the `artifacts` constructor argument. It was superseded by the workflow-pinned runtime above. That initial mismatch is **not** the final product finding. Off/default build snapshots were also rejected by active smoke before preparing the final active diagnostic snapshot.
- GitNexus queries were bound to PuPu; its index was two commits behind, so the direct delivered source and actual runtime evidence establish this finding. No product symbols were edited, no code committed, and the original running user app was retained.

Evidence prepared locally (not committed or pushed): `docs/implementation/ticket-283-acceptance-2026-09-13/` — `results.json`, `candidate-tree.json`, `unchain-artifact.json`, `package-smoke-selected.json`, `imported-runtime-status.json`, `synthetic-chat-observations.json`, installed skill descriptors, full i18n output and three real UI screenshots. The durable finding, reproduction, identities and disposition are included in this comment independently of those local files.

Disposition: keep #283 OPEN / In Progress. No acceptance PASS, Done, closure, security waiver, Verified badge or Release #203 closure. The skill invocation defect must be fixed and re-audited.

Cleanup: isolated app stopped; synthetic chats, installed test plugins and the copied encrypted OpenAI credential row were removed with the entire test profile. Original app PID 65905 is still running: True. Candidate and wheel remain local for reproduction.
