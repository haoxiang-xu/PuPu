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
