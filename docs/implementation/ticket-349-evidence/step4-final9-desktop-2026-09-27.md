# Step 4 — final9 real desktop verification

Date: 2026-09-27. Ticket #349, direct Release parent #216.

**Scoped result: PASS.** The missing real-application and frozen-sidecar evidence
identified in the September 26 final9 audit is now present. This is a Step 4
checkpoint, not completion of the whole Memory V3 ticket. Activity wording and
the final controlled performance comparison remain outstanding; keep #349 Open /
In Progress.

## What ran

An isolated Electron instance loaded the candidate PuPu source and the existing
final9 wheel installed in a dedicated Python 3.12 environment. Memory V2 was
enabled in `all` mode with Unchain store ownership. Both before and after a full
application restart, the sidecar reported ready, active protocol verification,
and the expected runtime manifest. Sidecar PID changed from 6702 to 19860.

All 854 production-source hashes still match the prior audit manifest. All 330
installed Unchain Python modules match the reused wheel byte-for-byte. No product
code changed during this verification. Prior compiler/boundary test results
remain applicable; they were not rerun or counted as new tests here.

The real renderer/Test API sent four requests to `openai:gpt-4.1`:

| Request | Result | Test API completion latency |
|---|---|---:|
| Initial synthetic marker | `READY` | 3.706 s |
| Recall previous conversation message, no tools | Exact marker returned | 2.521 s |
| Explicit `memory_list` | One actual call; empty entries and chat space reported | 5.510 s |
| Restart app, continue same chat | Marker and prior tool outcome retained | 3.714 s |

These are API-reported completion latencies, not time to first token or isolated
model latency. Four different prompts without a matched baseline cannot establish
a speedup, median or p95. The displayed stream duration is slightly shorter than
this API boundary.

## Persisted evidence

- Five complete context builds and five provider wire snapshots/results were
  produced by the four requests: the explicit tool request needs two model calls.
- The first two requests contain no tool call/output. Their provider inputs
  contain required instructions, pinned task state and ordered conversation.
- The journal contains one `memory_list` call and one matching durable result.
  The continuation's provider wire includes the matching call and output once,
  in that order. Wire artifact bytes match their recorded SHA-256 hashes.
- After restart, the provider input retains the complete historical tool exchange,
  including arguments, call identity, result and full-output reference, in the
  untrusted-history projection. The renderer displays the correct final answer.
- No consolidation job was created for these no-write turns.
- The isolated profile has no saved older memories. This live probe therefore
  proves explicit retrieval and tool continuity, but does not independently prove
  exclusion of seeded unrelated memories; that remains covered by the fixed-wheel
  boundary tests recorded in the preceding audit.

## Packaging and identity

Built a local arm64 PyInstaller sidecar from this exact installed wheel and the
candidate PuPu server, with the server's pinned dependencies. The existing
`runPackagedSidecarSmoke` verifier passed all five checks: startup, unauthenticated
rejection, authenticated health, authenticated context status and exact runtime /
snapshot compatibility. Its subprocess had empty source overrides and Python path.

This is a diagnostic frozen sidecar plus a source-based Electron run, not a signed
desktop installer or release certification. The diagnostic bundle archives the
854 verified source files, wheel, frozen binary, feature snapshot and launch
helpers; it contains no user profile or credentials. It is a provenance bundle,
not a portable installer. The programmatic smoke uses a manifest evidence file;
it does not claim the release CLI's clean-source provenance admission.

- Source candidate: `sha256:1049090eb0472fda65be4b6908ff6ce504ac071e04c1a457fbb4e7035e609da8`
- Reused wheel: `sha256:5df9bd1b6b2b4d084acb199bbc342cad8819be758910e1fbbffa95831d65f52f`
- Runtime manifest: `sha256:84bc5ed2b528ad4d36d4798837834b8539b951287406b0c3ae6a7ba2e943643e`
- Frozen sidecar: `sha256:6ac8748bdcb89dfe7f3e217691cffcf24a4bfc262a678c3546c79e6069efd326`
- Diagnostic bundle: `sha256:6713b0b529d0d59b8ba8d1e983e959ba2c1c2d542e3e43b27d032afc60538482`

Bundle: `.local/ticket-349-final9-desktop/candidate-diagnostic.tar.gz`.
Machine-readable results: [step4-final9-desktop-result.json](step4-final9-desktop-result.json).
Screenshot: [step4-final9-desktop.png](step4-final9-desktop.png).

This closes the scoped BC-349-05 / AC-349-09 application evidence gap and exercises
the applicable ordinary-chat, tool-continuation and restart portions of
SEQ-349-01/02/07. It does not claim live crash-during-tool, approval-cycle,
large-context pressure, every provider or full recovery-matrix coverage.

## Cleanup and next work

Deleted the synthetic chat through the application API and verified it disappeared.
Stopped the isolated app, its sidecar and development server. Removed the private
copied settings/profile and temporary dependency/snapshot links. The user's
original desktop was not replaced or restarted.

Next implementation slice: ordinary activity wording and truthful background
status display, followed by the matched final latency comparison. No commit,
push, pull request, issue closure or release publication was performed.
