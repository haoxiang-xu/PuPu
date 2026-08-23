# Memory V2 P0 Follow-ups

This list records non-blocking findings discovered during the locked P0
implementation. They do not reopen the P0 scope and must not delay the current
compiler, journal, workspace, Curator, or rollout cutover unless they become a
functional failure, durable corruption/data-loss risk, plaintext-secret leak,
or duplicate external effect.

## Review content presentation

- Full review diffs are scrubbed for host-shaped paths one page at a time in
  the renderer. A host path split exactly across two page boundaries might not
  match the display-only scrubber. The durable object remains scope-bound and
  is never resolved as a host path. A later UI hardening pass can scrub a small
  overlap window across page boundaries.
- Unchain review-content read failures are correctly fail-closed, but the
  current generic Context V2 content route can normalize some not-found or
  invalid-reference cases to HTTP 500 instead of a more precise 404/400. A
  later route-contract pass can preserve typed read error semantics without
  changing authorization or storage behavior.

## Rollout-off sticky chat continuity

- Turn mutation now distinguishes an exact chat with no durable V2 evidence
  from one with existing admission, session, generation, or deletion state.
  With the store owner set to `off`, a never-V2 chat may safely use the Legacy
  mutation path, while an existing V2 chat remains fail-closed. Before rollout
  modes can be lowered after admitting production chats, add a read-only,
  manifest-aware binding resolver that preserves the chat's durable
  `pupu_legacy` or `unchain` owner while `off` prevents only new admissions.
  This must cover head reads, rebase, normal runs, resume, graph, and subagent
  paths as one cutover; implementing it only for resend/edit/delete would give
  a false impression of sticky continuity.
- The current Unchain session-head route cold-opens the verified Generation
  API, whose initialization path may verify or initialize owner-scoped schema.
  A later route-contract pass should provide a strictly read-only head
  projection for GET requests. This does not change the current fail-closed
  ownership or rebase semantics.
