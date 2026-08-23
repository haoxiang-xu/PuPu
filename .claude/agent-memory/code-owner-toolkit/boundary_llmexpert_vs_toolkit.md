---
name: boundary-llmexpert-vs-toolkit
description: Ownership line between pupu-dev-toolkit (tool UI/install) and pupu-llm-expert (tool-schema / invocation semantics)
metadata:
  type: project
---

The line between my surface and pupu-llm-expert's.

**Mine (pupu-dev-toolkit):** how a tool gets installed and displayed in the UI.

**llm-expert's:** how the *model* uses a tool — tool-schema and invocation semantics.

**Why:** "Install/show a tool" and "let the model call a tool" are different concerns; keeps me out of the invocation layer.

**How to apply:** If a task is about how the model calls/interprets a tool (schema shape, invocation semantics), route to llm-expert. If it's about installing/displaying the tool in the toolkit UI, it's mine. See [[team-roster]].
