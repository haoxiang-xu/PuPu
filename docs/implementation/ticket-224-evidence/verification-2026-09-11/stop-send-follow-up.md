# Immediate Send after Stop can lose the first send to a busy-session response

Observed on the final #224 local candidate, after resuming a human-input receipt
and while qwen3:32b was generating. Stop returned pending=none; an immediate normal
Send produced `session_execution_in_progress` (HTTP 409, retryable) with
“another execution currently owns this session”. Retrying after ownership settled
succeeded in the same chat and returned “测试完成”.

Evidence: `ticket-224-final2-stopped.json`, the first attempt in
`ticket-224-final2-followup.json` / screenshot, followed by the completed retry.
The message originates at `unchain_runtime/server/session_execution_guard.py:95`.
The cancellation lease and normal-send retry policy were not changed in this
patch. Further work should prove ownership release semantics and preserve the
user's send across a retryable busy response; no speculative fix or GitHub issue
was created here. This observation is not counted as a passing immediate-send test.
