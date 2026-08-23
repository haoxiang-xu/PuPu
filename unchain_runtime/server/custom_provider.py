"""Custom Model Provider — server-side parse, validation, redaction, and model_io factory.

This module implements the Flask/adapter half (S2) of the "Custom Model Provider"
feature (see ``docs/features/custom-model-providers.md``). It is deliberately kept
separate from ``unchain_adapter.py`` so the megafile only gains a handful of
``cfg is not None`` integration branches; the parsing/validation/factory weight
lives here.

Protocol-twin mapping (design §1.1):

    protocol          spec.provider (twin)   ModelIO
    ---------------   --------------------   -----------------
    anthropic         hyperspace             HyperspaceModelIO
    openai-responses  openai                 OpenAIModelIO
    ollama            ollama                 OllamaModelIO

The custom identity ``custom.<slug>`` only exists in the PuPu layer (modelId
prefix + ``options.custom_provider.id``). The twin name is what unchain's kernel
dispatch sees, so anthropic-protocol custom providers ride the ``hyperspace``
first-class path and get structural fail-closed behaviour (no memory-summary key
leak, no ``4.5→4-5`` model-name rewrite, durable-resume provider match).

Security invariants (design §9):
  - The custom API key is read ONLY from the specialised options fields
    ``custom_provider_api_key`` / ``customProviderApiKey`` (decision A8). It is
    never read from the generic ``api_key`` / ``apiKey`` channel.
  - The custom key is never filled into a built-in ModelIO construction (factory
    fallback branch uses ``spec.api_key`` only).
  - All log/error surfaces that print options / custom_provider / test bodies must
    pass through ``redact_secrets`` first.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any, Dict, Tuple
from urllib.parse import urlsplit

from net_tls import get_outbound_ssl_context


# ── Constants ────────────────────────────────────────────────────────────────

CUSTOM_PROVIDER_KEY_PREFIX = "custom."

_PROTOCOLS = ("anthropic", "openai-responses", "ollama")

# Protocol → unchain spec.provider twin name (design §1.1).
TWIN_BY_PROTOCOL: Dict[str, str] = {
    "anthropic": "hyperspace",
    "openai-responses": "openai",
    "ollama": "ollama",
}

_AUTH_MODES = ("x-api-key", "bearer", "header", "none")

# Slug reserved words (must match the frontend schema `not.enum`, design §2.1).
_RESERVED_SLUGS = frozenset(
    {"openai", "anthropic", "ollama", "hyperspace", "auto", "custom", "default", "system", "unknown"}
)
_SLUG_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$")

# Header-name grammar (design §2.1).
_HEADER_NAME_PATTERN = re.compile(r"^[A-Za-z0-9-]{1,64}$")

# extra_headers keys that would smuggle authentication material — rejected
# (case-insensitive; design §2.3).
_EXTRA_HEADER_DENYLIST = frozenset(
    {"authorization", "x-api-key", "api-key", "cookie", "proxy-authorization", "x-auth-token"}
)

# Prototype-pollution / dangerous object keys rejected at any nesting level
# (design §2.3 / §9.5).
_FORBIDDEN_KEYS = frozenset({"__proto__", "constructor", "prototype"})

# Payload key names that look like secrets — stripped from default_payload
# (defence in depth; design §2.3).
#
# FULLY ANCHORED (^...$) to match the frontend normalizer's
# ``/^(api[_-]?key|apikey|token|secret)$/i`` exactly (custom_provider_store.js).
# An unanchored ``re.search`` matched the substring "token" inside legitimate
# payload keys such as ``max_tokens`` / ``max_output_tokens`` and silently
# stripped them, so the user's output-length cap never took effect (defect C2).
# Anchoring strips only exact secret-shaped keys, never keys that merely
# *contain* a secret-shaped substring.
_SECRET_FIELD_PATTERN = re.compile(r"^(api[_-]?key|apikey|token|secret)$", re.IGNORECASE)

# Model-capabilities normalizer fallback for context window (design §7.2/§7).
_DEFAULT_MAX_CONTEXT_WINDOW_TOKENS = 32768

# allowed_payload_keys forced into the ModelIO capabilities so user payload keys
# survive `_merged_payload` (native.py) instead of being silently dropped
# (design §7.3). Values chosen to match each protocol's maxTokens parameter name
# plus the generic sampling knobs PuPu forwards.
PROTOCOL_ALLOWED_PAYLOAD_KEYS: Dict[str, Tuple[str, ...]] = {
    "anthropic": (
        "temperature",
        "max_tokens",
        "top_p",
        "top_k",
        "thinking",
        # Anthropic's reasoning-effort knob. Admitted here so an anthropic-
        # protocol custom provider can carry effort at all; whether a given
        # endpoint honours it is that endpoint's business, and PuPu only
        # sends it for models that declare `reasoning_efforts`.
        "output_config",
        "stop_sequences",
    ),
    "openai-responses": ("temperature", "max_output_tokens", "top_p", "reasoning"),
    "ollama": ("temperature", "num_predict", "top_p", "top_k"),
}

# Redaction pattern for log/error surfaces (design §9.4).
_REDACT_KEY_PATTERN = re.compile(r"(api[_-]?key|authorization|x-api-key|token|secret)", re.IGNORECASE)
_REDACT_PLACEHOLDER = "***"


# ── Errors ───────────────────────────────────────────────────────────────────

class CustomProviderError(Exception):
    """Structured custom-provider failure surfaced through the existing error frame.

    ``route_chat._normalize_stream_error`` reads ``getattr(exc, "code", "")`` and
    surfaces ``str(exc)`` to the client, so the message MUST already be redacted.
    """

    def __init__(self, code: str, message: str = "") -> None:
        self.code = str(code or "custom_provider_error")
        safe_message = redact_text(str(message or code or ""))
        super().__init__(safe_message)


# ── Redaction (design §9.4) ──────────────────────────────────────────────────

def redact_secrets(obj: Any) -> Any:
    """Return a deep copy of ``obj`` with secret-shaped values masked.

    A dict value is masked when its KEY matches ``/(api[_-]?key|authorization|
    x-api-key|token|secret)/i``. Recurses into nested dicts/lists. Never mutates
    the input. Use before logging or embedding options/custom_provider anywhere.
    """
    if isinstance(obj, dict):
        redacted: Dict[Any, Any] = {}
        for key, value in obj.items():
            if isinstance(key, str) and _REDACT_KEY_PATTERN.search(key):
                redacted[key] = _REDACT_PLACEHOLDER
            else:
                redacted[key] = redact_secrets(value)
        return redacted
    if isinstance(obj, (list, tuple)):
        return [redact_secrets(item) for item in obj]
    return obj


def redact_text(text: str) -> str:
    """Best-effort scrub of key-like substrings inside a free-text message.

    Masks ``key=VALUE`` / ``key: VALUE`` / ``key VALUE`` shaped fragments whose
    key half matches the redaction pattern, plus bare bearer / sk- tokens. This
    protects error messages that interpolate SDK exception text.
    """
    if not isinstance(text, str) or not text:
        return text
    # key=..., key: ..., "key": "..." shaped fragments.
    scrubbed = re.sub(
        r"(?i)(api[_-]?key|authorization|x-api-key|token|secret)"
        r"(\"?\s*[:=]\s*\"?)([^\s,\"'}]+)",
        lambda m: f"{m.group(1)}{m.group(2)}{_REDACT_PLACEHOLDER}",
        text,
    )
    # Bearer <token>
    scrubbed = re.sub(r"(?i)\bBearer\s+[A-Za-z0-9._\-]+", "Bearer " + _REDACT_PLACEHOLDER, scrubbed)
    # Standalone sk- / sk-ant- style keys.
    scrubbed = re.sub(r"\bsk-[A-Za-z0-9._\-]{6,}", _REDACT_PLACEHOLDER, scrubbed)
    return scrubbed


# ── Config dataclass (design §7.1) ───────────────────────────────────────────

@dataclass(frozen=True)
class CustomProviderConfig:
    slug: str
    provider_key: str  # "custom.<slug>"
    display_name: str
    protocol: str  # "anthropic" | "openai-responses" | "ollama"
    base_url: str
    auth_mode: str  # "x-api-key" | "bearer" | "header" | "none"
    auth_header_name: str | None
    extra_headers: Tuple[Tuple[str, str], ...]
    timeout_seconds: int
    default_model: str
    models: Dict[str, Dict[str, Any]]  # model_id -> {capabilities, default_payload}

    @property
    def twin(self) -> str:
        return TWIN_BY_PROTOCOL[self.protocol]

    def requires_key(self) -> bool:
        return self.auth_mode != "none"

    def has_model(self, model: str) -> bool:
        return str(model or "") in self.models

    def default_model_id(self) -> str:
        if self.default_model and self.default_model in self.models:
            return self.default_model
        # First declared model (parser preserves declaration order).
        return next(iter(self.models), "")

    def max_context_window_tokens(self, model: str) -> int:
        entry = self.models.get(str(model or ""))
        if not isinstance(entry, dict):
            return _DEFAULT_MAX_CONTEXT_WINDOW_TOKENS
        caps = entry.get("capabilities")
        if isinstance(caps, dict):
            raw = caps.get("max_context_window_tokens")
            if isinstance(raw, (int, float)) and not isinstance(raw, bool) and raw > 0:
                return int(raw)
        return _DEFAULT_MAX_CONTEXT_WINDOW_TOKENS


# ── Address helpers (design §4.1) ────────────────────────────────────────────

def custom_provider_key(slug: str) -> str:
    return CUSTOM_PROVIDER_KEY_PREFIX + str(slug or "")


def is_custom_provider_key(provider_key: str) -> bool:
    return isinstance(provider_key, str) and provider_key.startswith(CUSTOM_PROVIDER_KEY_PREFIX)


def parse_custom_model_id(model_id: str) -> Tuple[str, str] | None:
    """Split ``custom.<slug>:<model>`` → (``custom.<slug>``, ``<model>``).

    Uses ``split(":", 1)`` so model ids containing further colons round-trip
    (design §4.2). Returns None when the value is not a custom-prefixed id.
    """
    if not isinstance(model_id, str):
        return None
    value = model_id.strip()
    if not value.startswith(CUSTOM_PROVIDER_KEY_PREFIX) or ":" not in value:
        return None
    provider_key, model_part = value.split(":", 1)
    provider_key = provider_key.strip()
    model_part = model_part.strip()
    if not provider_key.startswith(CUSTOM_PROVIDER_KEY_PREFIX) or not model_part:
        return None
    return provider_key, model_part


# ── Key extraction (decision A8, design §9.1) ────────────────────────────────

def extract_custom_provider_api_key(options: Dict[str, Any] | None) -> str:
    """Read the custom key ONLY from the specialised fields.

    Never falls back to the generic ``api_key`` / ``apiKey`` channel — that is the
    built-in provider key channel and mixing them is the leak vector A8 guards.
    """
    if not isinstance(options, dict):
        return ""
    for field in ("custom_provider_api_key", "customProviderApiKey"):
        candidate = options.get(field)
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return ""


# ── Full server-side revalidation (design §2.3, do NOT trust the frontend) ───

def _forbidden_key_scan(obj: Any) -> None:
    """Reject __proto__ / constructor / prototype anywhere in the structure."""
    if isinstance(obj, dict):
        for key, value in obj.items():
            if isinstance(key, str) and key in _FORBIDDEN_KEYS:
                raise CustomProviderError("forbidden_key", f"forbidden key: {key}")
            _forbidden_key_scan(value)
    elif isinstance(obj, (list, tuple)):
        for item in obj:
            _forbidden_key_scan(item)


def _sanitize_default_payload(raw: Any) -> Dict[str, Any]:
    """Copy a model's default_payload with secret-shaped keys stripped.

    Only JSON scalars and one level of nesting are kept (design §2.3). Keys that
    start with ``__`` or look like secrets are dropped.
    """
    if not isinstance(raw, dict):
        return {}
    result: Dict[str, Any] = {}
    for key, value in raw.items():
        if not isinstance(key, str) or key.startswith("__"):
            continue
        if _SECRET_FIELD_PATTERN.search(key):
            continue
        if isinstance(value, (str, int, float, bool)) or value is None:
            result[key] = value
        elif isinstance(value, dict):
            nested: Dict[str, Any] = {}
            for nkey, nval in value.items():
                if not isinstance(nkey, str) or nkey.startswith("__"):
                    continue
                if _SECRET_FIELD_PATTERN.search(nkey):
                    continue
                if isinstance(nval, (str, int, float, bool)) or nval is None:
                    nested[nkey] = nval
            result[key] = nested
        # lists / deeper nesting silently dropped (§2.3 one-level rule)
    return result


def _normalize_capabilities(raw: Any) -> Dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    caps: Dict[str, Any] = {}
    for key in (
        "supports_tools",
        "supports_vision",
        "supports_reasoning",
        "max_tokens",
        "max_context_window_tokens",
    ):
        if key in raw:
            caps[key] = raw[key]
    return caps


def parse_custom_provider(options: Dict[str, Any] | None) -> CustomProviderConfig | None:
    """Parse + fully revalidate ``options.custom_provider``.

    Returns None when no custom provider is present. Raises ``CustomProviderError``
    with a redacted message when a custom provider is present but invalid — never
    silently ignores it (design §7.1, decision A5).
    """
    if not isinstance(options, dict):
        return None
    raw = options.get("custom_provider")
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise CustomProviderError("custom_provider_invalid", "custom_provider must be an object")

    # Prototype-pollution scan before touching any field.
    _forbidden_key_scan(raw)

    slug = str(raw.get("id") or "").strip()
    if not _SLUG_PATTERN.match(slug) or slug in _RESERVED_SLUGS:
        raise CustomProviderError("custom_provider_invalid_slug", f"invalid provider id: {slug!r}")

    protocol = str(raw.get("protocol") or "").strip()
    if protocol not in _PROTOCOLS:
        raise CustomProviderError("custom_provider_invalid_protocol", f"invalid protocol: {protocol!r}")

    base_url = str(raw.get("base_url") or "").strip()
    if not base_url:
        raise CustomProviderError("custom_provider_invalid_base_url", "base_url is required")
    try:
        parsed_url = urlsplit(base_url)
    except Exception as exc:  # pragma: no cover - urlsplit rarely raises
        raise CustomProviderError("custom_provider_invalid_base_url", f"base_url unparseable") from exc
    if parsed_url.scheme not in ("http", "https") or not parsed_url.netloc:
        raise CustomProviderError(
            "custom_provider_invalid_base_url", "base_url must be an http(s) URL with a host"
        )

    # ── auth ──
    auth = raw.get("auth")
    if not isinstance(auth, dict):
        raise CustomProviderError("custom_provider_invalid_auth", "auth is required")
    auth_mode = str(auth.get("mode") or "").strip()
    if auth_mode not in _AUTH_MODES:
        raise CustomProviderError("custom_provider_invalid_auth", f"invalid auth mode: {auth_mode!r}")
    auth_header_name: str | None = None
    if auth_mode == "header":
        auth_header_name = str(auth.get("header_name") or "").strip()
        if not auth_header_name or not _HEADER_NAME_PATTERN.match(auth_header_name):
            raise CustomProviderError(
                "custom_provider_invalid_auth", "auth.header_name required for header auth"
            )
        if auth_header_name.lower() in _EXTRA_HEADER_DENYLIST or auth_header_name.lower() == "authorization":
            # A custom header-auth name that itself is a reserved auth header is fine
            # ("authorization"/"x-api-key" are exactly what header mode drives); the
            # denylist below is for *extra_headers* smuggling, not the auth header.
            pass

    # ── extra_headers (reject auth-header smuggling) ──
    extra_headers_list: list[tuple[str, str]] = []
    raw_extra = raw.get("extra_headers")
    if raw_extra is not None:
        if not isinstance(raw_extra, dict):
            raise CustomProviderError("custom_provider_invalid_headers", "extra_headers must be an object")
        if len(raw_extra) > 10:
            raise CustomProviderError("custom_provider_invalid_headers", "too many extra_headers")
        for hkey, hval in raw_extra.items():
            if not isinstance(hkey, str) or not _HEADER_NAME_PATTERN.match(hkey):
                raise CustomProviderError("custom_provider_invalid_headers", "invalid header name")
            if hkey.lower() in _EXTRA_HEADER_DENYLIST:
                raise CustomProviderError(
                    "auth_header_in_extra_headers", f"header {hkey} not allowed in extra_headers"
                )
            if not isinstance(hval, str) or len(hval) > 200:
                raise CustomProviderError("custom_provider_invalid_headers", "invalid header value")
            extra_headers_list.append((hkey, hval))

    # ── timeout ──
    timeout_raw = raw.get("timeout_seconds")
    if isinstance(timeout_raw, bool) or not isinstance(timeout_raw, (int, float)):
        timeout_seconds = 600
    else:
        timeout_seconds = int(timeout_raw)
    timeout_seconds = max(5, min(900, timeout_seconds))

    # ── models (non-empty, de-duped, whitespace-free ids) ──
    raw_models = raw.get("models")
    if not isinstance(raw_models, list) or not raw_models:
        raise CustomProviderError("custom_provider_no_models", "models must be a non-empty array")
    models: Dict[str, Dict[str, Any]] = {}
    for entry in raw_models:
        if not isinstance(entry, dict):
            raise CustomProviderError("custom_provider_invalid_model", "model entry must be an object")
        model_id = str(entry.get("id") or "").strip()
        if not model_id or re.search(r"\s", model_id) or len(model_id) > 128:
            raise CustomProviderError("custom_provider_invalid_model", f"invalid model id: {model_id!r}")
        if model_id in models:
            raise CustomProviderError("custom_provider_duplicate_model", f"duplicate model id: {model_id}")
        models[model_id] = {
            "capabilities": _normalize_capabilities(entry.get("capabilities")),
            "default_payload": _sanitize_default_payload(entry.get("default_payload")),
        }

    default_model = str(raw.get("default_model") or "").strip()
    if default_model and default_model not in models:
        # clear an out-of-range default rather than erroring (design §2.3 warning)
        default_model = ""

    return CustomProviderConfig(
        slug=slug,
        provider_key=custom_provider_key(slug),
        display_name=str(raw.get("display_name") or slug).strip()[:100] or slug,
        protocol=protocol,
        base_url=base_url,
        auth_mode=auth_mode,
        auth_header_name=auth_header_name,
        extra_headers=tuple(extra_headers_list),
        timeout_seconds=timeout_seconds,
        default_model=default_model,
        models=models,
    )


# ── model_io factory (design §7.3) ───────────────────────────────────────────

def make_custom_model_io_factory(cfg: CustomProviderConfig, api_key: str):
    """Return a ``factory(spec, call_context) -> ModelIO`` closure.

    - When ``spec`` targets this custom provider (twin name + declared model),
      build the protocol's ModelIO pointed at ``cfg.base_url`` with the custom key
      wired into the client (never into logs/config).
    - When ``spec`` uses the same twin name but an *undeclared* model, raise
      (v1 limit, documented — the custom session does not guess endpoints).
    - When ``spec`` uses any other built-in provider (a subagent/template on
      openai/anthropic/ollama), fall back to the default registry using
      ``spec.api_key`` — the custom key is NEVER filled into a built-in ModelIO.
    """
    twin = cfg.twin
    # Import lazily so this module stays importable without unchain on the path
    # (e.g. for pure-validation unit tests).
    from unchain.providers import HyperspaceModelIO, OllamaModelIO, OpenAIModelIO
    from unchain.agent.model_io import ModelIOFactoryRegistry

    allowed_payload_keys = list(PROTOCOL_ALLOWED_PAYLOAD_KEYS[cfg.protocol])
    base_url = cfg.base_url
    extra_headers = dict(cfg.extra_headers)
    auth_mode = cfg.auth_mode
    auth_header_name = cfg.auth_header_name
    timeout_seconds = cfg.timeout_seconds

    def _default_headers() -> Dict[str, str]:
        headers = dict(extra_headers)
        if auth_mode == "header" and auth_header_name:
            headers[auth_header_name] = api_key
        return headers

    def _caps_for(model: str, entry: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        declared = entry.get("capabilities") if isinstance(entry, dict) else {}
        merged: Dict[str, Any] = dict(declared or {})
        # Exact-hit key + forced allowed_payload_keys so user payload is not
        # silently dropped by native._merged_payload (design §7.3).
        merged["provider_model"] = model
        # Union the protocol's static allowlist with EVERY key the model's own
        # default_payload declares (design §2.3: any scalar key is allowed).
        # Without this, keys outside PROTOCOL_ALLOWED_PAYLOAD_KEYS — e.g. openai
        # ``truncation``, ollama ``repeat_penalty`` / ``seed``, anthropic
        # ``metadata`` — were silently filtered out by native._merged_payload's
        # final allowed-key pass (defect C8). Order-preserving de-dup so the
        # static keys come first and declared extras follow.
        keys: list[str] = list(allowed_payload_keys)
        declared_payload = entry.get("default_payload") if isinstance(entry, dict) else {}
        if isinstance(declared_payload, dict):
            seen = set(keys)
            for payload_key in declared_payload:
                if isinstance(payload_key, str) and payload_key not in seen:
                    keys.append(payload_key)
                    seen.add(payload_key)
        merged["allowed_payload_keys"] = keys
        return {model: merged}

    def _payloads_for(model: str, entry: Dict[str, Any]) -> Dict[str, Dict[str, Any]]:
        default_payload = entry.get("default_payload") if isinstance(entry, dict) else {}
        return {model: dict(default_payload or {})}

    def factory(spec, call_context):  # noqa: ANN001 - unchain AgentSpec / AgentCallContext
        spec_provider = str(getattr(spec, "provider", "") or "").strip().lower()
        spec_model = str(getattr(spec, "model", "") or "").strip()

        if spec_provider != twin or spec_model not in cfg.models:
            if spec_provider == twin:
                # Same twin name but the model was not declared in this custom
                # provider — do not guess an endpoint (v1 limit, FM19).
                raise CustomProviderError(
                    "custom_provider_model_not_declared",
                    f"model {spec_model!r} is not declared for provider {cfg.provider_key}",
                )
            # Built-in provider subagent/template: default registry, spec's own
            # key. The custom key is never passed here.
            return ModelIOFactoryRegistry().create(
                provider=spec_provider,
                model=spec_model,
                api_key=getattr(spec, "api_key", None),
            )

        entry = cfg.models[spec_model]
        caps = _caps_for(spec_model, entry)
        payloads = _payloads_for(spec_model, entry)
        headers = _default_headers()

        if cfg.protocol == "anthropic":
            def _anthropic_client_factory(api_key: str, **kwargs: Any):  # noqa: A002
                import anthropic

                client_kwargs: Dict[str, Any] = {"base_url": base_url}
                if headers:
                    client_kwargs["default_headers"] = dict(headers)
                # Timeout: honour the caller-supplied timeout, else cfg timeout.
                if "timeout" in kwargs and kwargs["timeout"] is not None:
                    client_kwargs["timeout"] = kwargs["timeout"]
                else:
                    client_kwargs["timeout"] = timeout_seconds
                if auth_mode == "bearer":
                    client_kwargs["auth_token"] = api_key
                else:
                    # x-api-key (default) and header/none: pass api_key so the SDK
                    # sets x-api-key; header-mode also injected via default_headers.
                    client_kwargs["api_key"] = api_key
                return anthropic.Anthropic(**client_kwargs)

            return HyperspaceModelIO(
                model=spec_model,
                api_key=api_key or "not-needed",
                base_url=base_url,
                client_factory=_anthropic_client_factory,
                model_capabilities=caps,
                default_payloads=payloads,
            )

        if cfg.protocol == "openai-responses":
            def _openai_client_factory(api_key: str, **kwargs: Any):  # noqa: A002
                from openai import OpenAI

                client_kwargs: Dict[str, Any] = {"base_url": base_url}
                if headers:
                    client_kwargs["default_headers"] = dict(headers)
                client_kwargs["timeout"] = timeout_seconds
                # bearer/header/x-api-key: OpenAI SDK authenticates via api_key
                # (Authorization: Bearer). header mode also injected via headers.
                client_kwargs["api_key"] = api_key or "not-needed"
                return OpenAI(**client_kwargs)

            return OpenAIModelIO(
                model=spec_model,
                api_key=api_key or "not-needed",
                client_factory=_openai_client_factory,
                model_capabilities=caps,
                default_payloads=payloads,
            )

        # ollama (no auth; native base_url support)
        return OllamaModelIO(
            model=spec_model,
            base_url=base_url,
            model_capabilities=caps,
            default_payloads=payloads,
        )

    return factory


# ── Test-connection (design §7.6) ────────────────────────────────────────────

_TEST_TIMEOUT_SECONDS = 15


def _test_failure(code: str, message: str) -> Dict[str, Any]:
    """Design §7.6 contract: failures are ``{ok: False, error: {code, message}}``."""
    return {"ok": False, "error": {"code": code, "message": message}}


def test_custom_provider(custom_provider: Dict[str, Any], api_key: str) -> Dict[str, Any]:
    """Send a minimal request to the custom provider's endpoint.

    ``custom_provider`` is the (frontend-supplied, untrusted) provider definition;
    ``api_key`` is a one-shot key that is NEVER persisted. Returns
    ``{"ok": True, "latency_ms": <int>, "model": <id>}`` on success or
    ``{"ok": False, "error": {"code": ..., "message": <redacted>}}`` on failure. The whole thing is bounded by a 15s hard
    timeout; every error message is passed through ``redact_text``.

    Error codes: provider_unreachable / provider_timeout / provider_auth_failed /
    provider_bad_response / (plus the custom_provider_* validation codes).
    """
    # Reuse the same parse/validation the chat path uses (do not trust the input).
    options = {"custom_provider": custom_provider, "custom_provider_api_key": api_key}
    try:
        cfg = parse_custom_provider(options)
    except CustomProviderError as exc:
        return _test_failure(exc.code, redact_text(str(exc)))
    if cfg is None:
        return _test_failure("custom_provider_invalid", "missing custom_provider")

    if cfg.requires_key() and not str(api_key or "").strip():
        return _test_failure(
            "custom_provider_missing_api_key",
            "custom provider requires an API key",
        )

    model_id = cfg.default_model_id()
    if not model_id:
        return _test_failure("custom_provider_no_models", "no model to test")

    resolved_key = str(api_key or "").strip()
    factory = make_custom_model_io_factory(cfg, resolved_key)

    spec = SimpleNamespace(provider=cfg.twin, model=model_id, api_key=resolved_key or None)

    try:
        model_io = factory(spec, None)
    except CustomProviderError as exc:
        return _test_failure(exc.code, redact_text(str(exc)))
    except Exception as exc:  # pragma: no cover - construction errors are rare
        return _test_failure("provider_bad_response", redact_text(str(exc)))

    return _probe_model_io(cfg, model_io, model_id)


def _classify_probe_error(exc: Exception) -> Tuple[str, str]:
    """Map a provider SDK / transport exception to (code, redacted_message)."""
    name = type(exc).__name__.lower()
    text = str(exc)
    lower = text.lower()

    status = getattr(exc, "status_code", None)
    if status is None:
        response = getattr(exc, "response", None)
        status = getattr(response, "status_code", None)

    if status in (401, 403) or "authentication" in name or "permission" in name or any(
        p in lower for p in ("invalid api key", "invalid x-api-key", "unauthorized", "forbidden")
    ):
        return "provider_auth_failed", "Authentication failed — check the API key."
    if "timeout" in name or "timeout" in lower or "timed out" in lower:
        return "provider_timeout", "The provider did not respond in time."
    if any(p in name for p in ("connect", "connection")) or any(
        p in lower for p in ("connection refused", "failed to establish", "name or service not known",
                             "could not resolve", "connection error")
    ):
        return "provider_unreachable", "Could not reach the provider endpoint."
    # 404 / unexpected shape (e.g. Responses API not implemented by a chat-only gateway)
    return "provider_bad_response", redact_text(text) or "The provider returned an unexpected response."


def _probe_model_io(cfg: CustomProviderConfig, model_io: Any, model_id: str) -> Dict[str, Any]:
    """Issue the smallest possible request against the constructed ModelIO."""
    import concurrent.futures

    def _do_probe() -> None:
        if cfg.protocol == "anthropic":
            client = model_io._client_factory(api_key=model_io.api_key)  # type: ignore[attr-defined]
            client.messages.create(
                model=model_id,
                max_tokens=1,
                messages=[{"role": "user", "content": "ping"}],
            )
        elif cfg.protocol == "openai-responses":
            client = model_io._client_factory(api_key=model_io.api_key)  # type: ignore[attr-defined]
            client.responses.create(model=model_id, input="ping", max_output_tokens=16)
        else:  # ollama
            import httpx

            with httpx.Client(
                timeout=_TEST_TIMEOUT_SECONDS,
                verify=get_outbound_ssl_context(),
            ) as http_client:
                resp = http_client.post(
                    f"{cfg.base_url.rstrip('/')}/api/chat",
                    json={
                        "model": model_id,
                        "messages": [{"role": "user", "content": "ping"}],
                        "stream": False,
                    },
                )
                resp.raise_for_status()

    started = time.monotonic()
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(_do_probe)
            future.result(timeout=_TEST_TIMEOUT_SECONDS)
    except concurrent.futures.TimeoutError:
        return _test_failure("provider_timeout", "The provider did not respond in time.")
    except Exception as exc:  # noqa: BLE001 - map every provider failure to a code
        code, message = _classify_probe_error(exc)
        return _test_failure(code, message)

    return {
        "ok": True,
        "latency_ms": int((time.monotonic() - started) * 1000),
        "model": model_id,
    }
