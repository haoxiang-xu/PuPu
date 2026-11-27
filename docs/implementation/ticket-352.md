# #352 Tool Call and Skill Read — implementation plan

Ticket: https://github.com/haoxiang-xu/PuPu/issues/352 (direct child of #208 Release v0.2.0).
Workspace: `/Users/red/Desktop/GITRepo/pupu-352`, branch `claude/ticket-352-deterministic-steps`.
Base: **not dev** — by the project owner's instruction (2026-10-22) the base is the UI checkpoint tree
`32946a1ca727ab24ff8e0911e5c2180c459358ae` (= e24e993f + #351 Branch + Agents explorer + unified shell
patches). e24e993f is not on the remote, so the clone is an independent `git clone --no-hardlinks` of
`pupu-351-native-branch` with the three patches applied `--index`; the index equals the base tree, so
`git diff` shows #352 only. No commit, push or merge until the owner says so.
Evidence: `~/.codex/artifacts/pupu-356/356-parallel-dispatch-20261022/native-advanced/steps-352/`.

## Goal and non-goals

Goal: the two deterministic nodes in the native Agent editor — add, configure, connect, save, reopen — and
offline proof that what the page saves runs on the fixed installed runtime with the ticket's behaviour.

Non-goals: #357 (Code, Workflow Call, Hooks Pool); run-state display on the canvas (#210); running from the
builder's Run menu; any change to the fixed installed pair (unchain wheel + manifest) or to frozen evidence.

## Measured runtime contract (fixed pair, read from source and run offline)

Tool Call (`unchain/skeleton/execution.py`, `tool_runtime.py`, `skeleton_production_bindings.py`):

- Config is CLOSED: `{execution, tool: {name, on_error, approval_timeout_ms}}`; `on_error` ∈ `stop | continue`;
  `approval_timeout_ms` is an integer 1 … 86 400 000 and is always required.
- The tool's arguments are **the node's resolved inputs**, exactly: every input row becomes an argument.
  Input values are the shared binding grammar — `literal`, `ref`, `first_present` — with `missing` ∈
  `error | null | default`.
- Execution goes through `prepare_tool_confirmation` / `execute_confirmable_tool_call`, the same path as a
  model-initiated call. A tool needing confirmation returns `waiting` with a durable `tool_approval`
  interaction bound to the argument digest and tool schema digest; the wait expires at `approval_timeout_ms`.
- Result is CLOSED `{result, ok, error}`; `error` is `null` or `{code}` with `denied | tool_error`;
  `on_error = stop` fails the run with `tool_failed`.
- An interrupted dispatch is recorded `outcome_unknown` and is never re-dispatched.
- At run start the tool must be in the run's toolkit set = the chat's selected toolkits + every Toolkit Pool
  in the graph; otherwise the run is refused with `tool_unavailable`. The config names the tool only.

Skill Read:

- Config is CLOSED: `{execution, skill: {source, source_id, name}}`; any runtime input is refused.
- Read once by exact identity; the result `{content, name}` plus a persisted identity/revision snapshot.
  Not found / unreadable fails the node before publication.

Catalogs available to a UI today:

- `/toolkits/catalog/v2`: toolkits and their tools' `name, title, description, requiresConfirmation` —
  **no argument schema**.
- `/skills/inventory`: each skill's `source, source_id, name, description` — **no body**.
- The runtime's own schemas (`Toolkit.to_json()`: `{type, name, description, parameters}`, the source
  `SkeletonToolRuntime.tool_schemas()` documents as "for a UI host") are listable per toolkit with no
  workspace and no files written — but no route exposes them.

## Discrepancies with the ticket (reported, not invented around)

1. `error` is `{code}` (`denied` / `tool_error`), not the tool's public message; "Fail the run" stops with the
   generic `tool_failed`, not the tool's message. The UI describes what the runtime does.
2. An approval wait is bounded by the required `approval_timeout_ms` (≤ 24 h); "waits, including unattended"
   holds only up to that limit. The panel asks for the limit explicitly; no default is chosen for the author.
3. "Saving with a required argument unset is refused": drafts save with diagnostics (D-07) and the store has
   no tool schemas. The editor marks the unset required argument as a problem on the node and in the panel;
   it does not add a frontend-only save gate.
4. The contract plan says "stable toolkit/tool ID"; the runtime stores the tool name only. The toolkit is shown
   for orientation and not stored.
5. The design draws Input Variables and Arguments as two layers; the runtime has one (inputs are arguments).
   The Tool Call panel has one Arguments section built from the shared binding components.
6. Two read-only data actions are needed for the panels and are added on the existing Skeleton resource
   channel: the runtime's tool schemas per toolkit, and an exact-identity skill body for the preview.
7. `on_error = continue` keeps the failed tool's own payload in `result` (measured: a missing file gives
   `result: {error: "file not found: …"}`), where the ticket says "leaves result empty". The panel says so.
8. The builder has no chat workspace, so it lists user and installed-pack skills; a chat workspace's project
   skills are not listable here, and toolkit-embedded skills are not listed either (the list is read without
   toolkits). Measured: a project skill with the same name in the chat's workspace takes precedence at run time
   and the run fails `identity_mismatch` (F-B2).

## Functional flow

Tool Call: palette → node seeded `{execution: {inputs: [], outputs: []}}` (no `tool` until picked, so nothing
is invented) → panel: pick a tool (catalog v2, grouped by toolkit, confirmation shown) → its schema (new
action) renders one row per property: name, required mark, type, default, description, Value / Variable;
no free-form add; rows that are not properties of the chosen tool are kept, marked and removable → On error
(Fail the run = `stop`, Continue = `continue`, no preselection) → approval wait limit → Output Variables from
`result / ok / error` (existing) → canvas rows list each argument with its source dot or literal.
Skill Read: palette → seeded `{execution: {inputs: [], outputs: []}}` → panel: Input Variables locked ("No
inputs") → pick a skill (inventory) → read-only preview (new action) with size, marked "read at run time" →
Output Variables from `content / name` → canvas shows the skill and its source.

## Boundaries

- **BC-352-1** sidecar read `GET /skeleton_tools/schemas?toolkit=<id>` → Main → preload → facade
  `listSkeletonToolSchemas(toolkitId)`: CLOSED `{schema: "pupu.skeleton_tool_schemas.v1", toolkit_id, tools:
  [{name, description, parameters}]}`; unknown toolkit → `toolkit_missing`; real producer → strict consumer.
- **BC-352-2** sidecar `POST /skeleton_skills/preview {skill: {source, source_id, name}, include_user_dirs}`
  → Main → preload → facade `previewSkeletonSkill(identity, includeUserDirs)`: CLOSED `{schema:
  "pupu.skeleton_skill_preview.v1", identity, body, revision, bytes}`; the runtime's own exact-identity read
  (`SkeletonSkillRuntime`) over user roots (when on) and installed packs; a refused identity answers 404 with
  the code the run would fail with (`identity_mismatch`, else `skill_unavailable`) — not a new code.
- **BC-352-3** page Save → store: the documents the page writes are admitted by the real store, preflight and
  the fixed runtime (strict consumer = store + runtime, page payloads captured from the real page).
- **SEQ-352-1** tool approval: wait → approve → executes once; deny → Continue: `ok = false, error.code =
  denied`, Fail the run: run fails `tool_failed`; expired → the call never runs (measured: the run stays
  waiting until cancelled — finding F-A3); resume never re-runs a completed or unknown call.
- **SEQ-352-2** skill read snapshot: first execution reads; resume reuses the snapshot even after the skill
  file changes; a new run reads again.

## Slices and checkpoints

A. Tool Call — A1 data action (BC-352-1, twins), A2 node type / palette / identity / canvas rows, A3 panel,
   A4 page flow test and offline qualification (store + runtime + chat stream with an offline SDK; literal and
   bound args; continue and stop; confirmation wait/approve/deny; unknown outcome not repeated).
   **Checkpoint A** (re-runnable script + receipt) — then Skill Read.
B. Skill Read — B1 data action (BC-352-2, twins), B2 node type / palette / identity / canvas, B3 panel,
   B4 page flow and offline qualification (content bound into an agent input changes the scripted SDK request;
   missing skill fails; resume reuses the snapshot; new run re-reads). **Checkpoint B**, then stop for review.

Each slice keeps red-before-green for its new behaviour and key negatives, and reports actual changes,
targeted verification and remaining limits.

## Delegation assessment

Not suitable for a weaker model: every slice depends on runtime contracts measured above, two new cross-
process data actions with strict-consumer evidence, and live discrepancies with the ticket. The strong agent
implements all slices; no worker is dispatched.

## Constraints

Offline only (no provider calls, no real credentials, sentinel auth); no writes to the user library; one heavy
job at a time on the 18 GB machine, checking for Codex's jobs first; `.py` changes need a sidecar restart
before any app check; Electron `.js`/`.cjs` twins kept in step.

## Checkpoint A — Tool Call, measured (2026-10-22)

Evidence: `steps-352/qualify-a1/` (round 1) and the re-runnable `steps-352/tools/run_checkpoint_a.sh <round>`
with `verdict_checkpoint_a.py`. Page payloads come from the real page; the store, preflight and runtime are
the fixed pair's; Core `read`/`write` run for real in a disposable workspace (wrapped only to count calls);
the only fake is the OpenAI SDK factory. Two runs are derived from page payloads and labelled so: the
1-second approval limit (expiry) and Continue under denial.

What holds: CAS save / read-back equal / no draft diagnostics / preflight ok / stale token refused for both
page documents; bound `path` and fixed `limit: 5` reach Core `read` exactly and its result reaches the next
Agent's model request; Continue gives `ok: false, error: {code}` and routes an If / Else; Fail the run ends
with `tool_failed`; the write waits on the existing durable `tool_approval` interaction (exact arguments,
`resume_kind: skeleton`) and runs once on approval; repeated receipt/resume, denial, cancel-while-waiting,
expiry and a cold process after SIGKILL right after the write never run it again; a run whose tool is in no
Toolkit Pool and no chat toolkit is refused at launch with `tool_unavailable`. The runtime scores a result as
failed only when it is denied or an object with `ok: false` / a non-null `error`; returned text never is.

Findings (runtime/host, reported, nothing invented around them in the frontend):

- **F-A1** Branch base: `skeleton_branch_config` typed a Tool Call's `error` as text; it is `null | {code}`.
  Fixed here with red-before-green; the frozen Branch candidate in `pupu-351-native-branch` still has it.
- **F-A2** A denied call under Fail the run reaches the resume caller as the generic
  `skeleton_execution_failed`; `tool_failed` is only in the run state.
- **F-A3** An approval after its limit is accepted as a receipt, the resume is refused `interaction_expired`
  (a raw `SkeletonValidationError`), and the run stays `waiting` until cancelled.
- **F-A4** After the process dies mid-call the run stays `running`; resume/receipt/re-send are refused and
  only cancel ends it — recorded as `cancelled` although the write happened. The runtime's `recover()` would
  record `outcome_unknown`, but the host never calls it for a root run.
- **F-A5** The approval's trace frame carries empty `toolkit_id` / `toolkit_name` / `tool_display_name` for
  a graph-owned Tool Call.

## Checkpoint B — Skill Read, measured (2026-10-22)

Evidence: `steps-352/qualify-b3/` and the re-runnable `steps-352/tools/run_checkpoint_b.sh <round>` with
`verdict_checkpoint_b.py` (18/18). A user skill's identity is the absolute path of its SKILL.md and the
production store lives under HOME, so each round runs in one fixed sandbox path: base saved there, the skill
list and previews captured from the real routes there, the page's Save requests exported against that capture,
and a pristine copy restored to the same path for each case.

What holds: both page documents (Start → Skill → Router, and Start → Skill → Write with approval → Router)
CAS-save with no draft diagnostics and preflight ok, and store exactly the listed identity and no content; the
runtime's read is the panel's preview (same body, same revision) and reaches the Router's model request; a skill
that is gone fails the run `identity_mismatch` before any model call; the skill is read before the approval
wait, and after the SKILL.md changed while waiting the same run keeps what it read (Router saw v1, not v2),
while a new run reads it again (v2, new revision).

Findings:

- **F-B1** A user skill's stored identity is the absolute path of its SKILL.md (`source_id`), so a saved Agent
  carries the author's home path and does not resolve on another machine or after the folder moves; pack skills
  are portable (`source_id` = pack id).
- **F-B2** A chat workspace's project skill with the same name takes precedence at run time; the picked skill is
  then refused `identity_mismatch` and the run fails (the panel says so).
- **F-B3** Skill Read failures reach the caller as the generic `skeleton_execution_failed`; the specific code is
  only in the run state (same class as F-A2).
- **F-B4** A Skill Read with stored inputs passes preflight and fails only when the run reaches it; the panel
  reports and removes such rows.

## Review corrections R-352-01..03 (2026-10-22)

Independent review of tree `d125cb37` (`352-independent-review-20261023/report.md`) returned three P2s. Each was
reproduced red with the real controls before the fix, then green; the review's own probe suite was run on the
fixed tree (output path re-pointed only).

- **R-352-01** A required argument already stored as a value could not switch to Variable, and one stored as a
  variable could not switch to Value: each editor was gated on the *stored* kind, and a required row has no
  Unset. Each mode now always opens its editor; what is stored stays in the document and is shown ("Kept as it
  is until you replace it") until a replacement is actually picked or typed — a mode switch alone writes
  nothing. Stored several-source and unknown-kind values are replaceable the same way. Same line, found while
  fixing: a picked variable rebuilt the binding without its `default`, so a stored `missing: "default"` lost its
  default (a document the runtime refuses); it is now carried over.
- **R-352-02** The real store keeps any JSON shape at `skill.source` with no draft diagnostic (only preflight
  refuses it, `invalid_value` at that field), and `source_label` coerced the stored value to a property key —
  `{"toString": null}` threw and took the canvas down; a list `["user-unchain"]` was labelled as a known
  source. Only non-empty text is now looked up or shown; anything else reads "an unreadable source". Same class
  on the Tool Call node: a stored ref whose `node_id` or path item is not a name (the store keeps it, with a
  draft diagnostic at that field) was coerced with `String`/`join` and could throw, or a list `["start"]` was
  drawn as `start.message`; it now reads "an unreadable source". Reachability measured on the fixed pair:
  `steps-352/probe/stored-shapes-01.json` (8 shapes, all saved and read back exactly).
- **R-352-03** "Pick it again" could not repair an identity with an extra key: `same_identity` compares the
  three parts only, so the listed row counted as current and the pick was dropped as a no-op. Only an exact
  identity is now matched to a row; any other stored identity is its own option ("stored in a form the runtime
  cannot read") and is shown part by part, extra keys named, so picking a listed skill — the same one included
  — replaces it. Re-picking the skill a valid step already reads still writes nothing.

Not changed (outside #352): the shared IO editor's `MissingPolicySelect` draws a stored default with
`String(...)`, the same coercion class, in the #341 base.

## Review correction R-352-04 (2026-10-23)

Re-review of `a4102fb6` (`352-independent-review-c-20261023/report.md`) closed R-352-01..03 and found one residual
of the same class: the canvas drew a malformed stored ref safely, but opening its argument row handed the raw
ref to the shared `RefPicker`, whose `ref_key` coerces `node_id` and the first path item — `{"toString": null}`
in either threw. The IO editor's own rows check `expression_is_editable` before mounting the picker; the Tool Call
row did not. It now hands the picker only a ref that check accepts, and any other stored ref stays in the
document, shown as stored ("Kept as it is until you replace it"), until a variable is picked or a value typed;
opening the panel writes nothing. A list `node_id` (`["start"]`), which the picker read as `start.message`, is
treated the same way.

Same flow, found while fixing: the detail panel routed a store diagnostic about a Tool Call's or a Skill Read's
input to an Input Variables row, which neither node draws, so `invalid_value @ …inputs[0].value.node_id` was
shown nowhere. Their input rows are no longer counted, so such a diagnostic lands in the node notice
(the documented safe direction); other nodes' rows keep their own diagnostics. The store's answers used in the
tests are real (`steps-352/probe/stored-shapes-01`, `-02`).
