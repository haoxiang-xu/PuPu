# T1: Backend Frame Envelope Slim

> **Depends on:** Nothing (first task)
> **Blocks:** T2 (Frontend Frame Consumer Adapt)
> **Output contract:** V3 frame — 6 fields: `{seq, ts, run_id, iteration, type, payload}`

## Scope

| Field | Action | Reason |
|-------|--------|--------|
| `stage` | **Remove** from frame output | Frontend never reads it; storage sanitizer stores but never reads back |
| `thread_id` | **Move** to `stream_started.payload` only | Frontend only uses it once in `onMeta` handler |
| `iteration` | **Keep** | Used by continuation_request + logging |

## Files x Changes

| File | Lines | Action |
|------|-------|--------|
| `unchain_runtime/server/route_chat.py` | 14-36 | Delete `_TRACE_STAGE_BY_EVENT_TYPE` dict |
| | 59-60 | Delete `_trace_stage()` function |
| | 112-131 | Rewrite `_build_trace_frame` — remove `thread_id` param + `stage` output |
| | 423-438 | stream_started call — remove `thread_id=`, add to payload |
| | 491-503 | Main loop call — remove `thread_id=` |
| | 510-520 | Done call — remove `thread_id=` |
| | 529-542 | Error call — remove `thread_id=` |
| `electron/preload/stream/unchain_stream_client.js` | 85 | `data.thread_id` -> `payload.thread_id` |

## Diffs

### 1. Delete dead code (route_chat.py:14-36, 59-60)

Delete entire `_TRACE_STAGE_BY_EVENT_TYPE` dict and `_trace_stage()` function.

### 2. `_build_trace_frame` (route_chat.py:112-131)

```python
# AFTER
def _build_trace_frame(
    *,
    seq: int,
    event_type: str,
    payload: Dict[str, object],
    run_id: str = "",
    iteration: int = 0,
    timestamp_ms: int | None = None,
) -> Dict[str, object]:
    return {
        "seq": seq,
        "ts": timestamp_ms if isinstance(timestamp_ms, int) else int(time.time() * 1000),
        "run_id": run_id,
        "iteration": iteration,
        "type": event_type,
        "payload": payload,
    }
```

### 3. stream_started (route_chat.py:423-438)

```python
# AFTER — thread_id moves into payload
            seq += 1
            yield _sse_event(
                "frame",
                _build_trace_frame(
                    seq=seq,
                    event_type="stream_started",
                    payload={
                        "model": root.get_model_name(options),
                        "started_at": started_at,
                        "trace_level": trace_level,
                        "thread_id": thread_id,
                    },
                    iteration=0,
                    timestamp_ms=started_at,
                ),
            )
```

### 4. Main loop (route_chat.py:491-503)

Remove `thread_id=thread_id,` from call.

### 5. Done frame (route_chat.py:510-520)

Remove `thread_id=thread_id,` from call.

### 6. Error frame (route_chat.py:529-542)

Remove `thread_id=thread_id,` from call.

### 7. Preload listener (unchain_stream_client.js:82-91)

```javascript
// AFTER — read from payload instead of frame envelope
        if (frameType === "stream_started") {
          if (typeof handlers.onMeta === "function") {
            handlers.onMeta({
              thread_id: payload.thread_id,
              model: payload.model,
              ...payload,
            });
          }
          return;
        }
```

## Verification

1. Start backend: `cd unchain_runtime/server && python main.py`
2. Send request to `/chat/stream/v2`
3. Verify frames have 6 fields: `seq, ts, run_id, iteration, type, payload`
4. Verify `stream_started.payload.thread_id` is present
5. Verify no `stage` or top-level `thread_id` on any frame

## Handoff to T2

T2 must verify:
- `frame.stage === undefined` causes no crash (grep: 0 functional reads)
- `frame.thread_id === undefined` causes no crash (only preload read, already fixed)
- `chat_storage_sanitize` stores `stage: ""` — harmless
