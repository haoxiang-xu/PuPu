---
name: skillpack-import-security
description: S4 security review (2026-07-18) of open-skill-ecosystem import (S1-S3 commits 5d7cc6b/5f4fc29/be5b57d/af66998) — verdict, accepted behaviors, pending hardening
metadata:
  type: project
---

S4 light security review of the skillpack import slice cleared S5 (store curation) to proceed: no Critical/High findings.

**Why:** All trust-boundary paths were traced: /skillpacks* routes sit behind the blueprint-wide loopback gate + token (route_auth.py); delete path is encodeURIComponent → string-compare-only sink (no fs); scanSkillDir does NOT follow symlinks (withFileTypes dirent lstat semantics — **intentional behavior, do not "fix" as a bug**); 64KB body cap is backend-authoritative at install (skill_packs.py SKILL_BODY_MAX_BYTES); S2 renders template text as plain React text nodes (no HTML/markdown sink); parseComposer is a bounds-checked atomic gate.

**How to apply:**
- The one real (Medium) surface is LLM-layer by design: SKILL.md body enters the model as user-role text but is effectively never human-read (import preview shows counts only, bubble panel collapses >3 lines, expansion at send). Ruling D ("expansion = user-visible text") holds technically, not practically. **S5 curation = the named mitigation — the S5 vetting bar MUST include full-body review of every skill.** Pure packs get no capability amplification (tools=[], M6 no-connect, tool-confirmation still gates calls).
- Pending non-blocking hardening (proposed, CEO to dispose): (1) backend force phase="composer" + tools=[] in install_skill_pack — normalize_skill_rows accepts always/streaming + arbitrary tools from bypass callers; inert today (nothing consumes phase; plugin_skill_sync skips non-composer) but a landmine for the future phase:always spec; (2) bounded-fd read for oversized SKILL.md (service.js reads whole file then slices); (3) server caps on description/title/tools sizes and skill counts.
- The renderer-reachable arbitrary-fs family (READ_FILE/WRITE_FILE arbitrary read/write, deleteRuntimeDir/clearRuntimeDir arbitrary recursive delete in electron/main/services/runtime/service.js) PRE-DATES this slice; scanSkillDir is strictly weaker than existing primitives. This is the [[sec-001-accepted-posture]] — don't re-report it per slice, but revisit if the fs family gains network-reachable callers.
- The script-extension denylist in skill_pack_import.js is a POLICY filter, not an execution control (PuPu never executes folder files; only SKILL.md body is imported). Curation must not treat it as a security guarantee.
