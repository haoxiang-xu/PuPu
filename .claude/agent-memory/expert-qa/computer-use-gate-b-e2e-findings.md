---
name: computer-use-gate-b-e2e-findings
description: 2026-07-18 gate-B enable-path in-app e2e — full chain verified PASS; known low-sev findings (dead ok field, stale toolkit selection, byte_len mismatch)
metadata:
  type: project
---

# Computer-use Gate B in-app e2e (2026-07-18, branch feat/computer-use-gate-b @ 04754b7)

Full chain verified PASS in the real app (no PUPU_COMPUTER_USE env): consent store write → `enableComputerUse()` → IPC → main POST `/computer-use/config` (401 without token) → runtime override → funnel mounts `builtin.computer` (anthropic:claude-sonnet-4-6) → model executed `{"action":"screenshot"}` → accurate screen description (~22s). Disable path + crash-restart re-push (respawn env carries `PUPU_COMPUTER_USE=1`) both PASS. Transcript hygiene PASS: `data_omitted:true` + `media_id`, zero base64 in chats.db/durable stores; bytes live at `userData/tool_media/<session>/<media_id>.png` (UNCHAIN_DATA_DIR overrides tempdir), served by `/chat/tool-media/<id>`.

**Open findings (reported, not fixed):**
1. LOW — dead `ok` field: main's `pushComputerUseConfig` returns `{enabled}` (no `ok`), facade `setComputerUseEnabled` computes `ok:Boolean(response?.ok)` → always false on success. UI only checks `.pushed` so no visible impact today; latent contract trap. Files: `electron/main/services/unchain/service.js` (pushComputerUseConfig) vs `src/SERVICEs/bridges/unchain_bridge.js`.
2. MEDIUM (QA-blocking, not user-facing) — toolkit selection staleness: after `POST /v1/chats/:id/toolkits`, the next message's stream payload still carries the old toolkit set until the chat is deactivated+reactivated. Real UI path updates hook state directly, so likely test-api-only; worth a look in the test-api set-toolkits command source.
3. INFO — trace frame `byte_len` (387896) ≠ stored PNG size (290922); frame reports pre-encode/base64 length. Cosmetic.
4. INFO — `builtin.computer` never appears in the toolkit catalog (`/v1/catalog/toolkits`); mount is request-time funnel only. Intentional per design but surprises QA.

**Funnel conditions** (unchain_adapter `_build_builtin_toolkit`): flag enabled + not subagent run + anthropic model prefix in `_COMPUTER_USE_MODEL_PREFIXES` (sonnet-5, opus-4-8/7/6/5, sonnet-4-6). Model with tool mounted also keeps core toolkit tools.

How-to for rerunning this e2e: see [[worktree-e2e-testbed-recipe]].
