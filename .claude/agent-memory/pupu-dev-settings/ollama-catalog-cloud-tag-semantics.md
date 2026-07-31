---
name: ollama-catalog-cloud-tag-semantics
description: Ollama library `cloud` tag does NOT mean unpullable — 5 cloud-tagged entries also ship local sizes; cloud-only = cloud tag AND sizes empty
metadata:
  type: project
---

In the scraped ollama.com library catalog, the `cloud` tag marks "served from
Ollama Cloud", **not** "cannot be installed locally". Measured against the live
`https://ollama.com/library` page on 2026-07-31 (232 entries): 17 entries carry
the `cloud` tag, but 5 of them (`gemma4`, `qwen3.5`, `gpt-oss`,
`nemotron-3-super`, `nemotron-3-nano`) also list local size variants and are
fully pullable. Only the 12 with `sizes === []` have nothing to fetch locally.

**Why:** when CEO approved showing cloud models in a disabled state, the obvious
reading — "tag contains cloud → disable" — would have silently broken the pull
button for 5 popular models that work today. The rule that survives the data is
`tags.includes("cloud") && sizes.length === 0`.

**How to apply:** any future logic keyed on the `cloud` tag (filters,
badges, default-model pickers, install gating) must pair the tag with a
`sizes`-empty check, or verify against the live catalog first. Never widen it to
the tag alone. Tag strings are lowercased by the parser, so the literal is
`"cloud"`.

Related: [[custom-model-providers-feature]]
