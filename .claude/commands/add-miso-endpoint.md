# Add a New Miso Server Endpoint

Add a new Flask API endpoint to the unchain_runtime backend.

## Arguments
- $ARGUMENTS: Endpoint path and description (e.g. "/chat/export Export chat history as JSON/Markdown")

## Steps

1. Read `.github/skills/miso-server-endpoints.md` for endpoint patterns
2. Read `.github/skills/backend-api-facade.md` for the full request flow
3. Read `unchain_runtime/server/routes.py` for existing endpoint patterns

4. **Step 1: Add Flask route** in `unchain_runtime/server/routes.py`:
   ```python
   @api_blueprint.post("/my/endpoint")
   def my_endpoint() -> Response:
       if not _is_authorized():
           return jsonify({"error": {"code": "unauthorized", "message": "Invalid auth token"}}), 401

       payload = request.get_json(silent=True) or {}
       # ... validate and process
       return jsonify({"result": "..."})
   ```

5. **Step 2: Add IPC channel** in `electron/shared/channels.js`:
   ```js
   MISO: {
     // ... existing channels
     MY_ENDPOINT: "miso:my-endpoint",
   }
   ```

6. **Step 3: Add IPC handler** in `electron/main/ipc/register_handlers.js`:
   - Add to `IPC_HANDLE_CHANNELS` array
   - Register handler calling `unchainService.myEndpoint(payload)`

7. **Step 4: Add to miso service** in `electron/main/services/miso/service.js`:
   ```js
   const myEndpoint = async (payload) => {
     const response = await fetch(`http://${MISO_HOST}:${misoPort}/my/endpoint`, {
       method: "POST",
       headers: { "Content-Type": "application/json", "x-miso-auth": misoAuthToken },
       body: JSON.stringify(payload),
     });
     return response.json();
   };
   ```

8. **Step 5: Add preload bridge method** in `electron/preload/bridges/unchain_bridge.js`

9. **Step 6: Add frontend API method** in `src/SERVICEs/api.unchain.js`:
   ```js
   myEndpoint: async (payload) => {
     const method = assertBridgeMethod("unchainAPI", "myEndpoint");
     return withTimeout(() => method(payload), 10000, "my_endpoint_timeout", "...");
   },
   ```

10. Write a test in `unchain_runtime/server/tests/`
