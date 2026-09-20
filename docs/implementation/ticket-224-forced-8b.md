# #224 forced-tool diagnostic — 2026-09-11

User asked whether forcing tool use helps. Tested local deepseek-r1:8b with the
fixed wheel's actual ask_user_question definition and the prior test's system/user
messages. No generated tool was executed and no product code was changed.

| Test | Endpoint | Actual tool calls | Result |
| --- | --- | --- | --- |
| tool_choice=auto | /v1/chat/completions | 0 | Ordinary text, asks about project scope |
| tool_choice=required | /v1/chat/completions | 0 | Same ordinary-text behavior |
| Named ask_user_question tool_choice | /v1/chat/completions | 0 | Same ordinary-text behavior |
| Explicit MUST-call prompt + complete tool guidance | /api/chat | 0 | Correct options=[]/allow_other=true JSON, but printed as prose/code block |

Controls/limits: one request per case, temperature 0, max 1024 output tokens,
only ask_user_question tool exposed. These are provider diagnostics, not a PuPu
UI/resume PASS or full live-app comparison. Instruction-strength test adds the
complete rendered toolkit guidance and an explicit next-response instruction;
it is a separate condition from the API-parameter comparison.

Two concrete integration findings:
1. Local server /api/version is 0.33.3. In version-tagged official source,
   ChatCompletionRequest and native ChatRequest have no tool_choice field.
   Thus HTTP acceptance of required/named does not establish enforced selection.
   PuPu/Unchain currently writes auto in ollama.py and wire_preparer.py;
   wire_envelope.py explicitly accepts only auto. A production change requires
   coordinated provider-contract work, not an isolated string replacement.
2. Ollama's _debug_render_only diagnostic for the auto case confirms that the
   actual request includes the new tool description/schema, but the rendered
   model prompt omits options=[], allow_other, other_placeholder and
   selection_mode. The installed model template contains no tools variable;
   it has historical tool-call handling but does not render supplied tool
   definitions. This identifies a concrete prompt/template gap for the tested
   local model. Do not conclude from the previous live failure that all 8B
   models are unable to call tools.

Version-specific sources:
- https://github.com/ollama/ollama/blob/v0.33.3/openai/openai.go#L102
- https://github.com/ollama/ollama/blob/v0.33.3/api/types.go#L121
General documentation lists tool_choice for the OpenAI-compatible endpoint,
but the installed version's implementation and measured behavior govern this run.

Evidence: /Users/red/.codex/artifacts/ticket-224/forced-8b/
- auto.json, required.json, named.json: complete request/response and timings.
- strong-prompt.json: explicit instruction, response and zero actual calls.
- rendered-auto.json and rendered-prompt.txt: server-rendered model input.
- model-template.txt: template obtained from /api/show.

The stronger prompt improves request-content selection but not actual tool
reachability. Next corrective direction is the local model's tool template / tool
transport, followed by real-app re-verification. Do not coerce prose JSON into an
executed tool call or mark this as a successful interaction. Audit remains FAIL;
no scope/labels/status/PR/commit/closure changes were made.
