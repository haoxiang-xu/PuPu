# #356 / #357: explicit Hook enable state

This is the bounded enable-state producer slice, based on frozen Core ef212e81
and PuPu 32bf9439. Existing snapshots, QA guards, policy and evidence are unchanged.
The separate UI slice follows only after the real producer and fixed pair agree.
No failure-policy, model, embedded graph or tool-matcher extension is included.

## BC-HE-001 — definition to active Hook bindings (CLOSED)

Producer: Core hooks_config validator; consumers: prepared Agent plan,
SkeletonHookRuntime, Kernel handler and PuPu dependency readers. A Hook keeps the
six required fields id/order/event/tool_name/workflow/force_approval and gains only
optional `enabled: boolean`. Missing retains legacy enabled behavior without
inserting a stored default; false excludes the entry from executable bindings
and dependency traversal. Shape validation still checks the complete disabled
entry. Unknown fields and non-boolean states are refused at their own paths.
Order remains (order,id), independent of attach layout. A pool with no active
entries contributes no Hook runtime. Native tool permission and approval rules
still apply. A prepared or parked execution retains its own full definition,
including the original enable state; editing the library does not alter it.

## BC-HE-002 — imported runtime to host/UI capability (VERSIONED + CLOSED)

The actual imported runtime advertises skeleton_execution 1.2 and feature
hook_enable_v1, and exports a detached, closed hook_entry_contract. PuPu checks
the actual manifest using its independent strict parser, requires that feature,
then separately validates the exact advertised field lists, schema and legacy
boolean. No Git, path, environment variable or cached authoring flag grants the
capability. The authenticated read-only capabilities response includes the real
manifest digest. Old/incomplete runtime replies fail closed; no older endpoint
or fabricated schema fallback is permitted. Existing graphs without the new
field retain baseline runtime requirements. Main/preload forward the declared
read action; the renderer strictly admits the response before offering a switch.

## SEQ-HE-001 / AC-HE-001 — enable state and old snapshots

Create legacy hook -> exact stored bytes unchanged -> prepare and run normally.
Explicit false -> store/reopen false -> no Hook resolver/child/callback/effect;
native tool policy still holds. Explicit true -> normal original Hook behavior.
Malformed flag -> exact invalid_type path. A missing disabled Workflow does not
become an executable dependency. A running/waiting definition with an enabled
Hook stays enabled after library edit; its resumed execution uses the fixed
definition/receipts. A new execution sees false. Repeated/resumed completion
must not invoke a disabled Hook or duplicate a committed effect.

## SEQ-HE-002 / AC-HE-002 — persistence and deployed pair

Save CAS -> reopen -> freeze dependency closure -> restore the same closure in
a new process -> preserve the explicit state and exact active dependency set.
Changing the current library or later re-enabling affects only a new frozen
selection. Tests use one newly built wheel throughout; installed module bytes,
manifest digest, source host and built sidecar identities are bound together.
Old wheel is a negative control, not an alternate passing configuration.

## AC-HE-003 — strict discovery/transport

Actual producer -> host validator -> authenticated capabilities route -> Main
action -> preload -> renderer parser. Check unknown fields, wrong schema,
tampered manifest digest, absent feature, wrong booleans and wrong field lists;
fail before exposing editing. No resource or credential is written by discovery.

## Limits and remaining scope

Status is INCOMPLETE until the applicable source and exact-pair cells are run.
UI enable controls and drag ordering are subsequent authoring work. Existing
fail-closed Hook decisions remain authoritative; no Run-it-anyway option is
introduced to satisfy stale ticket wording. Name/tool-set/embedded-Workflow
contracts remain separately unresolved. No real provider, desktop, full Builder,
live rollout or release completion is implied by this slice.
