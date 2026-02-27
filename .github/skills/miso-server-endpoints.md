# Skill: Miso Server Endpoint Reference

Use this guide when you need to understand, call, or extend the Miso sidecar server in this repo.

---

## 1. Runtime architecture

Miso runs as a local Flask sidecar started by Electron main process.

- Flask app entry: `miso_runtime/server/main.py`
- Flask app setup: `miso_runtime/server/app.py`
- Flask routes: `miso_runtime/server/routes.py`
- Electron bridge and proxy: `public/electron.js`
- Renderer preload bridge: `public/preload.js`
- Frontend API facade: `src/SERVICEs/api.js`

The renderer should call Miso through `api.miso.*` in `src/SERVICEs/api.js`.
Do not call local sidecar HTTP endpoints directly from page/component files.

---

## 2. Auth model

When `MISO_AUTH_TOKEN` is set, protected routes require this header:

- `x-miso-auth: <token>`

Auth check is implemented in `miso_runtime/server/routes.py` via `_is_authorized()`.

---

## 3. Endpoint list (server HTTP)

Current Flask endpoints:

- `GET /health`
- `GET /models/catalog`
- `POST /chat/stream` (SSE)

These paths are mirrored in `public/electron.js`:

- `MISO_HEALTH_ENDPOINT = "/health"`
- `MISO_MODELS_CATALOG_ENDPOINT = "/models/catalog"`
- `MISO_STREAM_ENDPOINT = "/chat/stream"`

---

## 4. Endpoint params and response contract

### 4.1 `GET /health`

Purpose:
- Liveness/ready probe for sidecar bootstrap.

Request:
- Method: `GET`
- Headers:
  - `x-miso-auth` (optional; accepted when token exists)
- Query params: none
- Body: none

Response `200` JSON:
- `status`: string (currently `"ok"`)
- `version`: string
- `model`: string (for example `"ollama:deepseek-r1:14b"` or `"miso-unavailable"`)
- `threaded`: boolean

---

### 4.2 `GET /models/catalog`

Purpose:
- Return active provider/model and provider model lists.

Request:
- Method: `GET`
- Headers:
  - `x-miso-auth` (required when auth token is enabled)
- Query params: none
- Body: none

Response `200` JSON:
- `active`: object
  - `provider`: string (`"openai" | "anthropic" | "ollama"`)
  - `model`: string
  - `model_id`: string (`"<provider>:<model>"`)
- `providers`: object
  - `openai`: string[]
  - `anthropic`: string[]
  - `ollama`: string[]

Error `401` JSON:
- `error.code`: `"unauthorized"`
- `error.message`: `"Invalid auth token"`

---

### 4.3 `POST /chat/stream`

Purpose:
- Start assistant generation and stream tokens over SSE.

Request:
- Method: `POST`
- Headers:
  - `Content-Type: application/json`
  - `x-miso-auth` (required when auth token is enabled)
- Query params: none
- Body JSON:
  - `message`: string, required, non-empty after trim
  - `threadId`: string, optional
  - `thread_id`: string, optional (alias)
  - `history`: array, optional
    - each item:
      - `role`: `"system" | "user" | "assistant"`
      - `content`: string
  - `options`: object, optional
    - model/provider selectors:
      - `modelId` or `model_id` (for example `"openai:gpt-5"`)
      - `provider` (`"openai" | "anthropic" | "ollama"`)
      - `model` (supports plain model or `<provider>:<model>`)
    - generation:
      - `temperature`: number
      - `maxTokens`: number
    - API key pass-through:
      - `apiKey` / `api_key`
      - `openaiApiKey` / `openai_api_key`
      - `anthropicApiKey` / `anthropic_api_key`
      - `misoApiKey` / `miso_api_key`

SSE event stream (`text/event-stream`):
- `event: meta`
  - payload:
    - `thread_id`: string
    - `model`: string
    - `started_at`: number (epoch ms)
- `event: token`
  - payload:
    - `delta`: string
- `event: done`
  - payload:
    - `thread_id`: string
    - `finished_at`: number (epoch ms)
    - `usage`:
      - `prompt_tokens`: number
      - `completion_tokens`: number
      - `completion_chars`: number
- `event: error`
  - payload:
    - `code`: string
    - `message`: string

Error responses:
- `400` when `message` is missing/empty
  - `error.code`: `"invalid_request"`
  - `error.message`: `"message is required"`
- `401` when auth fails
  - `error.code`: `"unauthorized"`
  - `error.message`: `"Invalid auth token"`

---

## 5. Non-endpoint stream controls (Electron bridge)

There is no Flask endpoint for stream cancellation.
Cancellation is local in Electron by aborting fetch controller.

Preload bridge methods in `public/preload.js`:

- `misoAPI.getStatus()`
- `misoAPI.getModelCatalog()`
- `misoAPI.startStream(payload, handlers)`
- `misoAPI.cancelStream(requestId)` (bridge-level cancel)

---

## 6. How to add a new server endpoint safely

When adding an endpoint, update all layers in this order:

1. Add Flask route in `miso_runtime/server/routes.py`.
2. Add/adjust endpoint constant and proxy call in `public/electron.js`.
3. Expose bridge method in `public/preload.js`.
4. Add facade method in `src/SERVICEs/api.js` with timeout and `FrontendApiError`.
5. Use `api.miso.<method>()` from UI code.

Do not bypass the facade from pages/components.
