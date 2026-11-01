# #357 exact-pair backend control

QA-only branch; these changes must not be merged into product dev. Dispatch the
existing `release-qa.yml` workflow on this branch with exact Host SHA, Core SHA,
canonical artifact run id and raw wheel SHA-256. The wheel is downloaded and
verified, never rebuilt here. Core/Host Git identities are provenance; runtime
capabilities still come from the actual installed module's protocol manifest.

Dependency preparation and the PyInstaller build may download dependencies.
Both verification cells run as the non-root runner uid in new Linux network
namespaces with only loopback and no external route, an empty environment except
explicit QA paths, and disposable HOME/TMPDIR. No real provider credentials.
No local Mac App/Main launch or Chromium sandbox modification.

- Source cell: existing real production-host Code/Workflow/Hook/import tests,
  installed canonical wheel, strict offline SDK fixtures. Code workers execute
  where those tests require them. The pytest provenance plugin checks every
  imported Core module against the installed site and the exact wheel bytes.
- Binary cell: build one Linux sidecar from that same wheel; authenticate actual
  HTTP profile/source/pin/import requests. Use different profiles in two private
  stores, retain old fixed versions, reject stale tokens/missing bindings, and
  cold-read both stores. The graph is hand-built, not a React producer capture.
  This cell does not execute Chat, Kernel or Code. Supervisor process cleanup is
  not product-side quit acceptance.

Raw HTTP and process records are written before assertions. Failure artifacts
remain failures, even when the always-run upload step succeeds. A successful
source cell or binary cell alone does not close #357, certify all eight UI items,
or establish full-release/Memory/real-provider acceptance. The exported binary
and wheel identity are intended for the subsequent hosted-Linux App control.
