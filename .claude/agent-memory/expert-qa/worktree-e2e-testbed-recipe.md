---
name: worktree-e2e-testbed-recipe
description: How to run PuPu from an isolated worktree for in-app e2e — required symlinks, single-instance lock traps, test-api gotchas, renderer module access recipe
metadata:
  type: project
---

# Worktree in-app e2e testbed recipe (learned 2026-07-18, gate-B e2e)

**Why:** launching `npm start` from a git worktree fails silently in several distinct ways; each cost real time to diagnose.

**How to apply — prerequisites for a worktree app instance:**
- `node_modules` → symlink to main-tree node_modules (builders usually set this).
- `.venv` → symlink to `/Users/red/Desktop/GITRepo/PuPu/.venv` (sidecar python resolved at `app.getAppPath()/.venv`).
- Sibling `../unchain` → symlink to `/Users/red/Desktop/GITRepo/unchain` (sidecar needs `import unchain`; resolved via `resolveDevUnchainSourcePath()` = env `UNCHAIN_SOURCE_PATH` or sibling dir). Missing → Miso exits code=1 `ModuleNotFoundError: No module named 'unchain'`.

**Single-instance lock:** `app.requestSingleInstanceLock()` is keyed on userData (`~/Library/Application Support/PuPu`). Two dev instances (e.g. another agent session / a Codex session run from ChatGPT app) cannot coexist on the same userData; the loser exits silently (npm exit 144). Always verify OWNERSHIP, not just liveness: check the port-file pid's cwd via `lsof -a -p PID -d cwd`. HOME-override isolation works for the lock but doesn't defend against name-based `pkill -f Electron` from a competing session.

**test-api gotchas (beyond docs):**
- test-api binds the FIRST window's webContents at boot. If the main window is closed/destroyed, every endpoint returns `handler_error: Object has been destroyed` permanently — only an app restart fixes it (Phase-2 multi-window routing gap).
- `/debug/eval` with `await:true` wraps code as async body — you MUST `return`; result comes back in `value`.
- `POST /chats/:id/toolkits` body key is `toolkit_ids`. It updates storage + `/debug/state`, but the live stream payload keeps the STALE selection until you cycle activation (activate another chat, re-activate target). See [[computer-use-gate-b-e2e-findings]].
- contextBridge objects (`window.unchainAPI`) are frozen — monkey-patching throws. To reach renderer-internal modules use the webpack chunk trick: `let wr; window.webpackChunkPuPu.push([["__probe__"], {}, r => wr = r]); const mod = wr("./src/SERVICEs/xxx.js")` — module ids are source paths in dev.

**Sidecar debugging:** Flask INFO logs are invisible (logger level; runtime stdout/stderr goes to renderer console as `[unchain]` lines, but INFO isn't emitted). To query the sidecar directly, grab port via `lsof -p <sidecar pid> -iTCP -sTCP:LISTEN` and auth token from `ps eww <sidecar pid> | grep UNCHAIN_AUTH_TOKEN`, header `x-unchain-auth`.

**Installed 2026-07-18 into shared .venv:** `mss`, `pynput` (computer-use optional deps; pillow was already present).
