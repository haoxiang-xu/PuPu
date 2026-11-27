# #356 checkpoint: host-owned Skeleton credentials

Baseline: PuPu `0e679fb1`, installed Unchain wheel `4e3efdc0acd9563e484ad91fa392cff0eeeb22c5793313e936c643614945427b`. This bounded checkpoint follows accepted UI `b4992157`; it does not include native graph creation, live providers, or complete CP17 acceptance.

## BC-030 — Main to authenticated sidecar credential discovery

Renderer selection remains `pupu.skeleton_chat_selection.v1`. Main ignores caller-provided `skeleton_credentials` / `skeleton_credential_scope`. Before a native start or any `mode=resume_interaction`, Main POSTs to `/skeleton_credentials/requirements` with an exact object:

```
{schema:"pupu.skeleton_credential_query.v1", mode:"start"|"resume",
 session_id, owner_chat_id, interaction_id, source_attempt_id,
 selection:null|<original selection>, recipe_name:""|<legacy name>,
 memory_agent_config:null|<existing four-field public config>}
```

Session and owner are exact nonempty identifiers. Start has empty interaction/source IDs; resume has an interaction ID, optional source ID, and does not consult the supplied selection. Existing Memory Agent sanitizer remains authoritative. A non-Skeleton resume returns exactly `{schema:"pupu.skeleton_credential_requirements.v1",kind:"not_skeleton"}`. Errors use `{error:{code,path,message}}` and non-2xx; errors never include supplied secret values.

Native success is CLOSED:

```
{schema:"pupu.skeleton_credential_requirements.v1",kind:"skeleton",
 scope:{schema:"pupu.skeleton_credential_scope.v1",mode,session_id,owner_chat_id,
        interaction_id,source_attempt_id,selection_digest,workflows_digest,
        launch_digest,memory_provider},
 profiles:[{id,credential_ref,provider,model,protocol,endpoint},...]}
```

Digests are lowercase SHA256 hex without a prefix. `launch_digest` is empty for start, SHA256 of the verified canonical launch descriptor for resume. The effective Memory Agent provider is its sanitized explicit provider, otherwise the first root Kernel's provider. Profiles cover the admitted recursive Agent closure, deduplicated by identical profile identity; conflicting profile IDs or shared credential targets are refused. No Store, SDK, capability admission, write, key read, or execution registration occurs merely to enumerate profiles after freezing.

Main validates all fields, identities and profiles before decrypting any key. Native official identities require the exact official endpoint/protocol/ref. Ollama is keyless. `custom.<slug>` requires an enabled Main-owned registration (including shipped registrations), the same endpoint/protocol/model and transport-equivalent authentication: Responses/bearer, Anthropic/x-api-key, Ollama/none, no extra headers. Other custom authentication or protocol combinations are explicitly unsupported, never silently adapted. Explicit custom Memory Agent credentials remain unsupported by this checkpoint because that separate legacy invoker lacks a scoped custom-target contract. Missing/disabled/malformed registrations and unknown refs fail closed. Keys are read only with the existing Main-internal vault reader.

The existing CLOSED per-ref `{provider,endpoint,api_key}` map is attached only to the outbound sidecar body. Official keys needed by the separately selected Memory Agent are additionally attached using existing dedicated provider aliases. Embedding descriptors remain separate. Credentials and scope are excluded from retained stream/replay options; renderer never receives them. Direct Python callers keep the existing explicit-map/exact-official environment fallback behavior.

## BC-031 / SEQ-031 — discovery to dispatch, resume, and refusal

Start freezes selection plus published Workflow dependencies for discovery. Actual dispatch freezes once again, requires the exact issued scope before registration/effects, and executes those very objects. A root/child/dependency edit during discovery yields `skeleton_credential_scope_stale` (409); no automatic retry or model substitution. This is optimistic concurrency, not a lease.

Resume discovery uses the verified pending launch, original root run, owner and interaction; it never reads current resources. Dispatch checks the same canonical launch/snapshot scope before execution binding, registration or parked-guard transfer. Current same-target keys can rotate; target changes are not inferred from the current resource or composer. Non-native resumes preserve existing credential injection. First/second messages each discover independently; repeated interactions and cold resume must remain valid. Discovery refusal leaves the pending receipt/parked owner untouched.

## Checkpoint acceptance

- AC-030-A: no composer model plus mixed official Kernels and recursive children receives only exact required keys; Ollama triggers no vault read.
- AC-030-B: endpoint/ref/protocol/model/auth mismatch, malformed/unknown wire, missing or disabled provider refuses before any key read or stream POST; legacy behavior remains unchanged.
- AC-030-C: first/second starts, concurrent root/child changes and stale handoffs are checked before effects; caller-supplied credentials/scope cannot become authority.
- AC-030-D: original frozen launch drives resume including a cold reload and current key rotation; live resource edits cannot retarget it; stale interaction/owner/source refuses.
- AC-030-E: Memory Agent official-provider resolution is independent of composer and scoped Kernel maps; embedding enrichment is preserved. No map or secret enters replay, launch, SSE/error or renderer data.
- AC-030-F: exact installed core wheel is used for host tests and real-producer-to-strict-Main-consumer captures. Host Python changes require a rebuilt sidecar pair before deployed acceptance. Fake sentinel keys and SDK factories only; real providers, app restart, frozen main HTTP and full Builder/CP17 remain NOT_RUN unless separately recorded.

Graph before editing: `startMisoStream` LOW (10 upstream, three direct entries, six IPC flows); `stream_skeleton_chat_events` LOW (2), `resume_skeleton_chat_events` LOW (1). Index is one commit behind; present-source call sites corroborated. New helpers require concrete consumer analysis rather than treating unindexed symbols as unused. Record final graph changes and focused regression evidence before commit.

## Implementation checkpoint evidence (2026-10-18)

Implemented the authenticated query, strict Main resolver, secret-only outbound binding and start/resume snapshot fence. Native sends ignore composer model descriptors while retaining both descriptor and existing inline OpenAI embedding credentials; official aliases minted for actual graph/Memory Agent targets take precedence. Cancelled discovery performs no vault read or stream POST. No Unchain-core, public selection, launch schema, renderer or user-library change.

Evidence directory: `/Users/red/.codex/artifacts/pupu-356/credential-binding-20261018/`. New tests: 31 pure host admission/launch tests, 11 authenticated route/dispatch tests, 54 Main helper cases and 17 actual Main outbound cases. The approved broader installed-wheel host group passes 98/98, with a real-user-library access guard; full Electron passes 61 suites / 1071 tests / five existing skips. The first Electron run had two environment-only failures because this clone has no installed Electron binary; the successful run temporarily used existing local runtime metadata, then removed it. No native application was launched. Initial missing endpoint/helper REDs, concrete start/resume missing-fence REDs and independent inline-embedding failure are retained separately.

Actual explicit-Store four-provider root/child output feeds the real strict Main consumer and the exact installed core binding factories; three fake secrets read, keyless Ollama reads zero. Actual CAS after discovery yields stale/409 without writes. Resume uses a validated original CLOSED launch descriptor and retained definitions; production approval/resume regressions pass. This does not claim a new full cold-process/main HTTP, real-provider or desktop test.

After force-refresh, `assert_credential_scope` is LOW (five upstream, two direct production callers); `resolveSkeletonCredentials` is CRITICAL (11 upstream, two direct including module export, all stream entrypoints), explicitly retained as risk. Staged change analysis is CRITICAL across 13 files; the complete structured result contains 248 touched symbols (155 test symbols, four document sections) and 166 reported flows. Global flow extraction itself reports caps, and change metadata omits `partial/truncated` (NOT_RETURNED); no zero/absence is used as an all-clear. Authority, legacy transport, resume, cancellation and shared stream paths are covered by the targeted plus full Electron regression above. A new host sidecar is to be built from this immutable checkpoint with the unchanged wheel; existing pairs remain unchanged. No rollout or user-app restart is part of this checkpoint.

Explicit limits remain: unsupported custom transport/auth combinations and custom Memory Agent are typed refusals, the 12 models lacking output limits remain unavailable, native creation/node/edge editing is a separate UI stage, and shared-reference/CAS whole-flow, full Builder/CP17, frozen main HTTP, real providers and desktop acceptance are INCOMPLETE/NOT_RUN. Stop for checkpoint review; no push, dev merge, ticket closure or next UI phase.
