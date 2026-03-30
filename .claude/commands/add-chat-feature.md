# Add a Chat Feature

Add a new feature to the chat interface (new frame type, input enhancement, message action, etc.).

## Arguments
- $ARGUMENTS: Feature name and description (e.g. "message_bookmark Allow users to bookmark important messages")

## Steps

1. Read `.github/skills/chat-runtime-memory-and-trace.md` for the chat architecture
2. Read `.github/skills/chat-storage-reference.md` for storage patterns
3. Identify which layers need changes:

   | Feature Type | Files to Modify |
   |-------------|----------------|
   | New message action | `src/COMPONENTs/chat-bubble/` |
   | New input feature | `src/COMPONENTs/chat-input/` |
   | New trace frame type | `src/COMPONENTs/chat-bubble/components/trace_chain.js` |
   | New stream event | `src/PAGEs/chat/hooks/use_chat_stream.js` (onFrame handler) |
   | New storage field | `src/SERVICEs/chat_storage.js` |
   | New toolbar action | `src/COMPONENTs/chat-header/` |

4. For features that add data to messages:
   - Add field to message shape in `use_chat_stream.js`
   - Update storage serialization in `chat_storage.js`
   - Ensure backward compatibility (new field should be optional)

5. For features that need backend support:
   - Follow `/add-miso-endpoint` pattern
   - Or add a new SSE frame type to `miso_runtime/server/routes.py`
   - Handle the frame in `use_chat_stream.js` onFrame handler

6. Follow conventions:
   - Inline styles with `isDark`
   - Extract complex logic into hooks
   - Callback props with `on` prefix
   - No new context providers unless absolutely necessary

7. Write tests for any new storage or service logic
8. Show the user where the feature integrates into the existing UI
