# Debug Chat Stream Issue

Diagnose why a chat stream is stuck, erroring, or not completing.

## Arguments
- $ARGUMENTS: Symptom description (e.g. "no tokens after request_messages", "tool confirmation not showing", "stream hangs with anthropic")

## Steps

1. Identify the layer where the issue occurs:

   | Symptom | Likely Layer | Key File |
   |---------|-------------|----------|
   | No stream at all | Electron bridge | `electron/main/services/miso/service.js` |
   | Stream starts, no tokens | Provider SDK / API timeout | `miso/src/unchain/providers/model_io.py` |
   | Stuck after tool_call | Confirmation deadlock | `unchain_runtime/server/unchain_adapter.py` (line ~325) |
   | No continue prompt | Max iterations / callback | `unchain_runtime/server/unchain_adapter.py` (line ~385) |
   | Error not shown in UI | SSE parsing / frame handling | `electron/preload/stream/unchain_stream_client.js` |
   | Tokens stream but no done | SSE termination | `electron/main/services/miso/service.js` (streamMisoSseToRenderer) |

2. Trace the request path end-to-end:
   ```
   use_chat_stream.js → api.unchain.startStreamV2()
     → unchain_stream_client.js (IPC send STREAM_START_V2)
       → register_handlers.js → unchainService.handleStreamStartV2()
         → HTTP POST to Flask /chat/stream/v2
           → routes.py: chat_stream_v2() → stream_events() generator
             → unchain_adapter.py: stream_chat_events()
               → agent.run() in worker thread
                 → unchain kernel → provider SDK
   ```

3. Check for common root causes:
   - **Context overflow**: 48+ messages + 55 tools on 200K context model
   - **No API key**: Provider key missing or invalid
   - **Tool confirmation blocking**: `threading.Event.wait()` with no timeout in `_make_tool_confirm_callback`
   - **Continuation blocking**: `_make_continuation_callback` also blocks indefinitely
   - **Provider timeout**: Anthropic SDK default read timeout is 600s (now reduced to 120s)
   - **SSE boundary**: Missing `\n\n` delimiter in stream output

4. For frontend-side issues, check:
   - `use_chat_stream.js` onFrame handler (line ~1180-1600)
   - `pendingContinuationRequest` state not being set
   - `toolConfirmationUiStateById` not rendering
   - `streamHandleRef` being cleared prematurely

5. Recommend a fix with specific file and line references
