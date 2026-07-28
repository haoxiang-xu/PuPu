# Unified Computer Toolkit

Status: implemented behind release gates  
Target release: 2026-07-31  
Toolkit id: `builtin.computer`

## Release objective

Computer is a normal PuPu toolkit. It is returned by the toolkit catalog,
selected through the ordinary toolkit picker, persisted as
`selectedToolkits: ["builtin.computer"]`, and mounted through the same runtime
toolkit path as every other built-in toolkit.

The toolkit uses the strongest supported protocol for the active provider:

| Provider | Wire protocol | Release status |
| --- | --- | --- |
| Anthropic | `computer_20251124`, beta `computer-use-2025-11-24` | Stable route |
| OpenAI | Responses built-in `{ "type": "computer" }` | Stable route |
| Ollama | `pupu.local.click3.v1` function adapter | Explicit local Beta |

Provider routing is strict. PuPu never silently falls back from a provider's
native Computer protocol to the local adapter.

## Architecture

```text
toolkit catalog
  -> model capability resolver
  -> provider wire adapter
  -> pupu.computer.actions/v1
  -> atomic batch validation
  -> one confirmation decision
  -> shared ComputerController
  -> screenshot/result adapter
  -> provider continuation
```

Provider adapters only translate transport formats. They do not inject input,
own the agent loop, bypass confirmation, or persist screenshots.

## Catalog contract

`GET /toolkits/catalog-v2` always includes one ordinary entry:

```json
{
  "toolkitId": "builtin.computer",
  "toolkitName": "Computer",
  "source": "builtin",
  "settingsKind": "computer_use",
  "capabilityRequirements": ["computer_use"],
  "tools": [{ "name": "computer" }]
}
```

The Installed page and attach selector both consume this entry. There is no
synthetic Computer row, hook, or menu-option builder in the renderer.

The generic renderer capability filter keeps an entry only when every declared
`capabilityRequirement` is met. For Computer this means:

- the master Computer switch is enabled;
- the platform can capture a screenshot;
- the active model's `computer_use.supported` value is true.

The backend remains authoritative when mounting the toolkit, so a stale client
selection cannot bypass these gates.

## Model capability contract

`GET /models/catalog` may add this object to each model:

```json
{
  "computer_use": {
    "supported": true,
    "mode": "native|local_beta|unsupported",
    "protocol": "provider protocol identifier",
    "stability": "stable|beta",
    "reason": ""
  }
}
```

The legacy Anthropic prefix list remains on `/computer-use/status` for one
compatibility release. New renderer code does not infer support from it.

## Unified action protocol

Provider actions normalize into this envelope before execution:

```json
{
  "schema": "pupu.computer.actions",
  "version": 1,
  "provider": "anthropic|openai|ollama",
  "protocol": "provider protocol identifier",
  "actions": [{ "type": "screenshot" }]
}
```

Canonical actions:

- `screenshot`, `wait`, `cursor_position`, `locate`;
- `move`, `click`, `drag`, `scroll`;
- `type`, `keypress`, `hold_key`, `mouse_button`.

Validation is atomic and fail-closed:

- maximum 12 actions per batch;
- maximum 8,192 typed characters;
- maximum 64 drag points;
- maximum five seconds for wait and hold operations;
- every number must be finite;
- every coordinate must be inside the current screenshot;
- coordinate actions require a prior screenshot;
- the complete batch validates before its first action runs;
- execution stops at the first failed action;
- held keys and mouse buttons are released in `finally`.

Only `screenshot`, `wait`, `cursor_position`, and `locate` are read-only and
confirmation-exempt. Every other action is confirmed once for the complete
batch before any mutation executes. Confirmation presentation reports typed
text length, never its content.

## Anthropic adapter

Anthropic receives the native predefined tool:

```json
{
  "type": "computer_20251124",
  "name": "computer",
  "display_width_px": 1512,
  "display_height_px": 982
}
```

The dimensions are tied to the screenshot long-edge budget so model
coordinates and returned screenshot pixels remain the same coordinate space.
Native action names normalize to the shared protocol, including modifier keys,
hold-key, and mouse-button state. `zoom` is intentionally unsupported in this
release.

## OpenAI adapter

OpenAI receives `{ "type": "computer" }`. A Responses output item of type
`computer_call` becomes the existing Unchain `ToolCall` with:

- name `computer`;
- the original call id;
- provider `openai`;
- protocol `openai.responses.computer.v1`;
- the ordered native `actions` array.

The raw native item is preserved in provider replay state. After the batch, the
toolkit takes a fresh screenshot and Unchain returns:

```json
{
  "type": "computer_call_output",
  "call_id": "...",
  "output": {
    "type": "computer_screenshot",
    "image_url": "data:image/png;base64,...",
    "detail": "original"
  }
}
```

The next Responses turn continues through the existing `previous_response_id`
path. If no screenshot is available, the Computer turn terminates; PuPu does
not fabricate a successful native result.

## Ollama and click3 local Beta

The local adapter is independently opt-in and defaults off. Candidate model
families are currently:

- `qwen3.5:4b*`;
- `llama3.2-vision:11b*`.

Enabling the Beta is not sufficient. The user must explicitly run a bounded
probe that checks:

1. `/api/tags` contains the requested model and records its digest;
2. `/api/show` reports both `vision` and `tools`;
3. one non-streaming `/api/chat` call emits exactly one structured screenshot
   action through the Computer function schema.

The total deadline is 45 seconds. Results are cached for 24 hours by Ollama
host, model name, and model digest. Normal catalog reads never run a model
probe.

The adapter is narrowly derived from
`instavm/clickclickclick@e4ce8f958b4d7748a95af6d7201d1fa12ca5d2cb`.
Only planner guidance, action mappings, the function declaration, and the
strict finder-bounds parser are included. click3's executor, server, autonomous
loop, PyAutoGUI/ADB paths, and cloud clients are excluded. The pinned MIT text
is included in the generated installer notices.

Ollama receives an ordinary tool result for call pairing followed by a
synthetic user image message containing the fresh screenshot. PuPu and Unchain
continue to own validation, confirmation, execution, history, and transport.

## Privacy and persistence

Computer screenshots and typed payloads have separate handling from unrelated
tools and user content:

- screenshot base64 is removed before SSE and durable transcript writes;
- typed action text is redacted before tool-call and confirmation SSE events;
- confirmation descriptions contain only the character count;
- typed text is removed from the durable JSON and kept only in the existing
  per-session TTL media store so an immediate resume can continue safely;
- private typed-text blobs cannot be served by the public tool-media image
  endpoint;
- if the TTL payload is gone, the restored action retains `text_omitted` and
  protocol validation returns `sensitive_payload_expired` instead of typing a
  placeholder;
- unrelated tool arguments and user messages are unchanged.

Computer is not mounted in recipe subagents because that execution path has no
confirmation callback.

## Feature gates and kill switches

- `enable_computer_use`: build/release flag in PuPu's shared feature-flag
  snapshot, default off. Electron converts it to the non-bypassable sidecar env
  ceiling `PUPU_FEATURE_COMPUTER_USE`;
- `PUPU_COMPUTER_USE`: user-desired enable state, default off and writable at
  runtime. It cannot bypass `PUPU_FEATURE_COMPUTER_USE`;
- `PUPU_COMPUTER_USE_LOCAL_BETA`: local Beta gate, default off;
- `PUPU_COMPUTER_USE_ANTHROPIC`: Anthropic route kill switch;
- `PUPU_COMPUTER_USE_OPENAI`: OpenAI route kill switch;
- `PUPU_COMPUTER_USE_LOCAL`: local route kill switch.

The provider switches are enabled unless explicitly set to a false value. The
master and local Beta switches remain opt-in. Electron re-pushes the renderer's
persisted ON or OFF state after sidecar restart.

## Platform scope

This release supports the primary display on macOS, Windows, and Linux/X11.
Wayland, headless sessions, and unsupported permission states fail closed.
Multi-monitor coordinates, virtual-machine isolation, browser-tool merging,
legacy Anthropic computer protocols, unknown OpenAI-compatible endpoints, and
Computer access in subagents are non-goals.

## Release verification

Automated gates:

- PuPu sidecar Python suite;
- Unchain provider/replay suite;
- renderer suite and production web build;
- Electron main/preload suite;
- third-party notices unit test and release notice generation;
- GitNexus `detect_changes` in both repositories.

Real-device gates for each supported operating system and native provider:

- five safety/protocol cases, all must pass;
- five task cases, at least four must pass;
- no provider 4xx caused by Computer wire format;
- no screenshot or typed-text leak in logs, SSE, or durable JSON.

The Ollama Beta additionally requires at least 90% structured-action validity,
at least four of five task cases per operating system, 100% safety cases, and no
more than 10 MB compressed package growth. Failure disables local Beta and does
not block the Anthropic or OpenAI routes.

## Release checklist

- [x] Unified action schema and atomic validation
- [x] Shared confirmation/execution path
- [x] Anthropic native route
- [x] OpenAI native route and replay/result support
- [x] Ollama explicit probe and click3-derived adapter
- [x] Catalog-native UI; synthetic option path removed
- [x] Active provider/protocol settings UI
- [x] Screenshot and typed-text privacy boundaries
- [x] Provider/local kill switches
- [x] MIT attribution wired into installer notice generation
- [x] Third-party notice release gate
- [x] macOS arm64 sidecar freeze build
- [ ] macOS real-device matrix
- [ ] Windows real-device matrix
- [ ] Linux/X11 real-device matrix
- [ ] Claude Mode B diff review
- [ ] LLM protocol-owner sign-off
- [ ] security-owner sign-off

Python sidecar changes require a sidecar restart before manual verification.
Do not commit from the implementation agent; leave the reviewed dirty trees for
the release owner.
