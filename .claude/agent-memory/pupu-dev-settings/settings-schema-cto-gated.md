---
name: settings-schema-cto-gated
description: The localStorage `settings` single-object schema is a shared/CTO-gated artery — schema changes must be reported and trigger a sync meeting
metadata:
  type: project
---

The localStorage `settings` single object is read/written heavily by my surfaces, but its **schema is shared and CTO-gated**.

**Why:** Many surfaces across PuPu depend on the shape of the `settings` object; a quiet schema change here ripples cross-surface. localStorage writes also must go only through dedicated `SERVICEs` helpers, never direct from components.

**How to apply:** I own how settings are *presented and persisted* (the UI), but any change to the `settings` schema shape MUST be reported to pupu-cto and trigger a sync meeting before merge. Never privately modify the schema to suit my own feature. See [[team-roster]].
