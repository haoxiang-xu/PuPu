# #224 real-app test — deepseek-r1:8b — 2026-09-11

Result: FAIL at tool reachability. The real application completed a text response
instead of creating a human-input interaction. Submission/resume was therefore
not reachable in this run.

The user requested an 8B model for this test; local Ollama deepseek-r1:8b was used.
Ollama reports tools, thinking and completion capabilities; model digest
28f8fd6cdc677661426adab9338ce3c013d7e69a5bea9e704b364171a5d61a10,
8.0B Q4_K_M. This is one run, not a claim that every 8B model fails.

PuPu ran from /Users/red/Desktop/GITRepo/pupu-224 at http://localhost:2926 with
its real Electron/preload/sidecar/renderer. Dedicated user-data directory:
/Users/red/.codex/artifacts/ticket-224/live-8b/profile.
Electron PID 26045; fresh sidecar PID 26334, main.py in the ticket clone.
The existing Electron binary/Python dependency environment were reused without
editing the original checkout. Runtime loading used /tmp/224-wheel-layout/src,
a symlink to the installed fixed wheel at /tmp/224-wheel-site; layout metadata
exists only to select this wheel through the existing dev launcher.
Wheel SHA-256: f17a41d5b50da559b80c9c935832a74d6017334754eb3702aad6a19c2d860545.
The isolated app reported ready; Memory V2 was off by existing rollout settings.
No rollout controls or production app state were changed. This development run
is not a packaged-candidate smoke or active-app manifest-pair PASS.

Test message: 这是交互测试，不要创建或修改文件。我要你在我电脑上创建一个项目。动手之前，先用 ask_user_question 问我具体要放在哪个文件夹路径；收到回答后只复述该路径并结束。
This adds a no-file-mutation constraint and an explicit tool instruction to the
original path question. It is not claimed as an unchanged original-prompt run.

Observed:
- Actual provider route ollama.chat, model deepseek-r1:8b; one model attempt.
- Application completion in about 47.8 seconds.
- Text claims to use ask_user_question and prints a JSON code block with one
  guessed /home/user/Projects option and allow_other=true.
- Actual tool_calls=0, tool_results=0, interactions=0 in the run bundle.
- getPendingInteraction returned status=none; no direct input card was created.
- Actual assistant text is present in the persisted session JSON and UI screenshot.
- No user response was injected into a fake interaction; submit/resume remain untested.

Chat: chat-1789159308605-10e760c63c40e8
Attempt: unchain-1789159308632-d3eb246dcd844
Run bundle: rb_9fd3a8e7cf223755d1151cd0fe2e089109910f994548c3589a38b820426a10a8
Provider request SHA-256: e6d96d787af3c679d3129bcb2af770db19a639a3d50f65619fb6eca057d01e43

Evidence folder: /Users/red/.codex/artifacts/ticket-224/live-8b/
Contains 8b-result.png, chat-state.json (real trace/run bundle), run-state.json,
persisted-session-evidence.json, model-capabilities.json, pending.json,
runtime-status.json, and cleanup.json. Probe chat was deleted through the app API
and absence verified after preserving evidence. Task-started app/dev-server
processes were stopped. Original application remains untouched.

Audit remains FAIL. This real run now provides a concrete failed model-to-tool
path rather than only missing real-app evidence. Before attributing root cause
solely to model weakness, inspect the exact provider toolkit/prompt reaching the
model; this run establishes behavior but does not isolate that cause. No product
code was changed, no PR/commit/closure/clone cleanup was performed.
