"""S2 tests for the Custom Model Provider backend (design §13 pytest checklist).

Covers: the validation matrix, the model_io factory, the _build_payload protocol
branch, silent-fallback elimination, the key-non-crossover property family
(FM16 + downgrade + env-fallback block, focused on the openai twin), redaction,
stream_started modelId echo, and the twin's 4.5→4-5 normalization skip.
"""
import copy
import json
import os
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import custom_provider as cp  # noqa: E402
import unchain_adapter  # noqa: E402


# ── Fixtures ─────────────────────────────────────────────────────────────────

def _anthropic_provider():
    return {
        "config_version": 1,
        "id": "sap-hyperspace",
        "display_name": "SAP Hyperspace (local proxy)",
        "protocol": "anthropic",
        "base_url": "http://localhost:6655/anthropic",
        "auth": {"mode": "x-api-key", "key_label": "Hyperspace API Key"},
        "timeout_seconds": 600,
        "default_model": "anthropic--claude-4.5-haiku",
        "models": [
            {
                "id": "anthropic--claude-4.5-haiku",
                "display_name": "Claude 4.5 Haiku",
                "capabilities": {
                    "supports_tools": True,
                    "supports_vision": True,
                    "max_tokens": 8192,
                    "max_context_window_tokens": 200000,
                },
            },
            {
                "id": "anthropic--claude-4.5-sonnet",
                "capabilities": {"supports_tools": True, "max_context_window_tokens": 200000},
            },
        ],
    }


def _openai_provider():
    return {
        "id": "my-vllm",
        "display_name": "vLLM Responses",
        "protocol": "openai-responses",
        "base_url": "https://vllm.internal/v1",
        "auth": {"mode": "bearer"},
        "models": [{"id": "llama-3.3-70b", "capabilities": {"max_context_window_tokens": 128000}}],
    }


def _ollama_provider():
    return {
        "id": "remote-ollama",
        "display_name": "Remote Ollama",
        "protocol": "ollama",
        "base_url": "http://gpu-box:11434",
        "auth": {"mode": "none"},
        "models": [{"id": "deepseek-r1:14b"}],
    }


def _options(provider, api_key="hs-secret-key", model_suffix=None):
    model = model_suffix or provider["models"][0]["id"]
    return {
        "modelId": f"custom.{provider['id']}:{model}",
        "custom_provider": provider,
        "custom_provider_api_key": api_key,
    }


# ── Validation matrix (design §2.3) ──────────────────────────────────────────

class ParseValidationMatrixTests(unittest.TestCase):
    def test_none_when_absent(self):
        self.assertIsNone(cp.parse_custom_provider({}))
        self.assertIsNone(cp.parse_custom_provider(None))

    def test_valid_anthropic(self):
        cfg = cp.parse_custom_provider({"custom_provider": _anthropic_provider()})
        self.assertEqual(cfg.slug, "sap-hyperspace")
        self.assertEqual(cfg.provider_key, "custom.sap-hyperspace")
        self.assertEqual(cfg.twin, "hyperspace")
        self.assertEqual(cfg.protocol, "anthropic")
        self.assertTrue(cfg.requires_key())
        self.assertEqual(cfg.default_model_id(), "anthropic--claude-4.5-haiku")

    def test_twin_map(self):
        self.assertEqual(
            cp.parse_custom_provider({"custom_provider": _openai_provider()}).twin, "openai"
        )
        self.assertEqual(
            cp.parse_custom_provider({"custom_provider": _ollama_provider()}).twin, "ollama"
        )
        self.assertFalse(
            cp.parse_custom_provider({"custom_provider": _ollama_provider()}).requires_key()
        )

    def _expect_error(self, provider, code):
        with self.assertRaises(cp.CustomProviderError) as ctx:
            cp.parse_custom_provider({"custom_provider": provider})
        self.assertEqual(ctx.exception.code, code)

    def test_reserved_slug_rejected(self):
        for reserved in ("openai", "anthropic", "ollama", "hyperspace", "custom", "auto"):
            p = _anthropic_provider()
            p["id"] = reserved
            self._expect_error(p, "custom_provider_invalid_slug")

    def test_bad_slug_pattern(self):
        for bad in ("With Space", "UPPER", "-leading", "trailing-", "a" * 40):
            p = _anthropic_provider()
            p["id"] = bad
            self._expect_error(p, "custom_provider_invalid_slug")

    def test_invalid_protocol(self):
        p = _anthropic_provider()
        p["protocol"] = "openai-chat"
        self._expect_error(p, "custom_provider_invalid_protocol")

    def test_base_url_must_be_http(self):
        for bad in ("ftp://x", "not a url", "//host", "file:///etc/passwd"):
            p = _anthropic_provider()
            p["base_url"] = bad
            self._expect_error(p, "custom_provider_invalid_base_url")

    def test_header_mode_requires_header_name(self):
        p = _anthropic_provider()
        p["auth"] = {"mode": "header"}
        self._expect_error(p, "custom_provider_invalid_auth")

    def test_header_mode_valid(self):
        p = _anthropic_provider()
        p["auth"] = {"mode": "header", "header_name": "X-Custom-Auth"}
        cfg = cp.parse_custom_provider({"custom_provider": p})
        self.assertEqual(cfg.auth_mode, "header")
        self.assertEqual(cfg.auth_header_name, "X-Custom-Auth")

    def test_extra_headers_denylist(self):
        for denied in ("authorization", "Authorization", "x-api-key", "Cookie", "proxy-authorization"):
            p = _anthropic_provider()
            p["extra_headers"] = {denied: "sneaky"}
            self._expect_error(p, "auth_header_in_extra_headers")

    def test_extra_headers_allowed(self):
        p = _anthropic_provider()
        p["extra_headers"] = {"X-Tenant": "acme", "X-Region": "eu"}
        cfg = cp.parse_custom_provider({"custom_provider": p})
        self.assertEqual(dict(cfg.extra_headers), {"X-Tenant": "acme", "X-Region": "eu"})

    def test_forbidden_proto_key(self):
        p = _anthropic_provider()
        p["__proto__"] = {"polluted": True}
        self._expect_error(p, "forbidden_key")

    def test_forbidden_nested_constructor_key(self):
        p = _anthropic_provider()
        p["models"][0]["default_payload"] = {"constructor": "x"}
        self._expect_error(p, "forbidden_key")

    def test_empty_models_rejected(self):
        p = _anthropic_provider()
        p["models"] = []
        self._expect_error(p, "custom_provider_no_models")

    def test_duplicate_model_rejected(self):
        p = _anthropic_provider()
        p["models"].append({"id": "anthropic--claude-4.5-haiku"})
        self._expect_error(p, "custom_provider_duplicate_model")

    def test_model_id_with_whitespace_rejected(self):
        p = _anthropic_provider()
        p["models"][0]["id"] = "bad model"
        self._expect_error(p, "custom_provider_invalid_model")

    def test_model_id_with_colon_allowed(self):
        cfg = cp.parse_custom_provider({"custom_provider": _ollama_provider()})
        self.assertIn("deepseek-r1:14b", cfg.models)

    def test_out_of_range_default_model_cleared(self):
        p = _anthropic_provider()
        p["default_model"] = "not-declared"
        cfg = cp.parse_custom_provider({"custom_provider": p})
        # cleared → falls back to first declared model
        self.assertEqual(cfg.default_model_id(), "anthropic--claude-4.5-haiku")

    def test_secret_field_stripped_from_default_payload(self):
        p = _openai_provider()
        p["models"][0]["default_payload"] = {"temperature": 0.5, "api_key": "sk-leak", "token": "t"}
        cfg = cp.parse_custom_provider({"custom_provider": p})
        payload = cfg.models["llama-3.3-70b"]["default_payload"]
        self.assertIn("temperature", payload)
        self.assertNotIn("api_key", payload)
        self.assertNotIn("token", payload)

    def test_timeout_clamped(self):
        p = _anthropic_provider()
        p["timeout_seconds"] = 5000
        self.assertEqual(cp.parse_custom_provider({"custom_provider": p}).timeout_seconds, 900)
        p["timeout_seconds"] = 1
        self.assertEqual(cp.parse_custom_provider({"custom_provider": p}).timeout_seconds, 5)


# ── Key extraction (decision A8) ─────────────────────────────────────────────

class KeyExtractionTests(unittest.TestCase):
    def test_reads_specialised_fields_only(self):
        self.assertEqual(
            cp.extract_custom_provider_api_key({"custom_provider_api_key": "  hs-key  "}), "hs-key"
        )
        self.assertEqual(
            cp.extract_custom_provider_api_key({"customProviderApiKey": "camel-key"}), "camel-key"
        )

    def test_never_reads_generic_channel(self):
        # The generic api_key / apiKey channel is the built-in provider channel;
        # custom key extraction must never touch it (decision A8).
        for field in ("api_key", "apiKey", "openai_api_key", "anthropic_api_key", "unchainApiKey"):
            self.assertEqual(cp.extract_custom_provider_api_key({field: "official-key"}), "")


# ── Address / model-id round-trip (design §4.2) ──────────────────────────────

class AddressTests(unittest.TestCase):
    def test_double_colon_roundtrip(self):
        parsed = cp.parse_custom_model_id("custom.x:some:model:v1")
        self.assertEqual(parsed, ("custom.x", "some:model:v1"))

    def test_non_custom_returns_none(self):
        self.assertIsNone(cp.parse_custom_model_id("openai:gpt-5"))
        self.assertIsNone(cp.parse_custom_model_id("anthropic:claude-opus-4.6"))

    def test_ollama_style_model_roundtrip(self):
        parsed = cp.parse_custom_model_id("custom.remote-ollama:deepseek-r1:14b")
        self.assertEqual(parsed, ("custom.remote-ollama", "deepseek-r1:14b"))


# ── model_io factory (design §7.3) ───────────────────────────────────────────

class FactoryTests(unittest.TestCase):
    def test_anthropic_factory_wires_base_url_headers_timeout(self):
        p = _anthropic_provider()
        p["extra_headers"] = {"X-Tenant": "acme"}
        cfg = cp.parse_custom_provider({"custom_provider": p})
        factory = cp.make_custom_model_io_factory(cfg, "hs-secret")

        captured = {}

        class _FakeAnthropic:
            def __init__(self, **kwargs):
                captured.update(kwargs)

        spec = SimpleNamespace(provider="hyperspace", model="anthropic--claude-4.5-haiku", api_key=None)
        with mock.patch("anthropic.Anthropic", _FakeAnthropic):
            io = factory(spec, None)
            # trigger the client_factory closure the way AnthropicModelIO does
            io._client_factory(api_key=io.api_key, timeout=None)

        self.assertEqual(io.provider, "hyperspace")
        self.assertEqual(captured["base_url"], "http://localhost:6655/anthropic")
        self.assertEqual(captured["default_headers"], {"X-Tenant": "acme"})
        self.assertEqual(captured["api_key"], "hs-secret")
        self.assertEqual(captured["timeout"], 600)

    def test_anthropic_bearer_uses_auth_token(self):
        p = _anthropic_provider()
        p["auth"] = {"mode": "bearer"}
        cfg = cp.parse_custom_provider({"custom_provider": p})
        factory = cp.make_custom_model_io_factory(cfg, "bearer-key")
        captured = {}

        class _FakeAnthropic:
            def __init__(self, **kwargs):
                captured.update(kwargs)

        spec = SimpleNamespace(provider="hyperspace", model="anthropic--claude-4.5-haiku", api_key=None)
        with mock.patch("anthropic.Anthropic", _FakeAnthropic):
            io = factory(spec, None)
            io._client_factory(api_key=io.api_key)
        self.assertEqual(captured.get("auth_token"), "bearer-key")
        self.assertNotIn("api_key", captured)

    def test_capabilities_and_payload_injected(self):
        cfg = cp.parse_custom_provider({"custom_provider": _anthropic_provider()})
        factory = cp.make_custom_model_io_factory(cfg, "k")
        spec = SimpleNamespace(provider="hyperspace", model="anthropic--claude-4.5-haiku", api_key=None)
        with mock.patch("anthropic.Anthropic"):
            io = factory(spec, None)
        caps = io.model_capabilities["anthropic--claude-4.5-haiku"]
        # provider_model exact-hit + forced allowed_payload_keys so user payload
        # survives native._merged_payload.
        self.assertEqual(caps["provider_model"], "anthropic--claude-4.5-haiku")
        self.assertIn("max_tokens", caps["allowed_payload_keys"])
        self.assertIn("temperature", caps["allowed_payload_keys"])

    def test_openai_factory_provider_is_openai(self):
        cfg = cp.parse_custom_provider({"custom_provider": _openai_provider()})
        factory = cp.make_custom_model_io_factory(cfg, "sk-vllm")
        captured = {}

        class _FakeOpenAI:
            def __init__(self, **kwargs):
                captured.update(kwargs)

        spec = SimpleNamespace(provider="openai", model="llama-3.3-70b", api_key=None)
        with mock.patch("openai.OpenAI", _FakeOpenAI):
            io = factory(spec, None)
            io._client_factory(api_key=io.api_key)
        self.assertEqual(io.provider, "openai")
        self.assertEqual(captured["base_url"], "https://vllm.internal/v1")
        self.assertEqual(captured["api_key"], "sk-vllm")

    def test_ollama_factory_base_url(self):
        cfg = cp.parse_custom_provider({"custom_provider": _ollama_provider()})
        factory = cp.make_custom_model_io_factory(cfg, "")
        spec = SimpleNamespace(provider="ollama", model="deepseek-r1:14b", api_key=None)
        io = factory(spec, None)
        self.assertEqual(io.provider, "ollama")
        self.assertEqual(io.base_url, "http://gpu-box:11434")

    def test_undeclared_model_same_twin_raises(self):
        cfg = cp.parse_custom_provider({"custom_provider": _anthropic_provider()})
        factory = cp.make_custom_model_io_factory(cfg, "k")
        spec = SimpleNamespace(provider="hyperspace", model="not-declared", api_key=None)
        with self.assertRaises(cp.CustomProviderError) as ctx:
            factory(spec, None)
        self.assertEqual(ctx.exception.code, "custom_provider_model_not_declared")

    def test_builtin_fallback_uses_spec_key_not_custom_key(self):
        # A subagent on a different built-in provider must fall back to the default
        # registry with ITS OWN key — the custom key must never be filled in.
        captured = {}

        class _FakeRegistry:
            def create(self, *, provider, model, api_key):
                captured.update({"provider": provider, "model": model, "api_key": api_key})
                return object()

        # Patch at the import source BEFORE the factory closure captures it.
        with mock.patch("unchain.agent.model_io.ModelIOFactoryRegistry", _FakeRegistry):
            cfg = cp.parse_custom_provider({"custom_provider": _anthropic_provider()})
            factory = cp.make_custom_model_io_factory(cfg, "CUSTOM-SECRET-KEY")
            spec = SimpleNamespace(provider="openai", model="gpt-5", api_key="subagent-own-key")
            factory(spec, None)
        self.assertEqual(captured["provider"], "openai")
        self.assertEqual(captured["api_key"], "subagent-own-key")
        self.assertNotEqual(captured["api_key"], "CUSTOM-SECRET-KEY")


# ── _build_payload protocol branch (design §7.4) ─────────────────────────────

class BuildPayloadTests(unittest.TestCase):
    def test_anthropic_protocol_uses_max_tokens(self):
        opts = _options(_anthropic_provider())
        opts["maxTokens"] = 4096
        opts["temperature"] = 0.7
        # provider passed is the twin ("hyperspace") — would wrongly hit num_predict
        # without the protocol branch.
        payload = unchain_adapter._build_payload("hyperspace", opts)
        self.assertEqual(payload["max_tokens"], 4096)
        self.assertNotIn("num_predict", payload)
        self.assertEqual(payload["temperature"], 0.7)

    def test_openai_protocol_uses_max_output_tokens(self):
        opts = _options(_openai_provider())
        opts["maxTokens"] = 512
        payload = unchain_adapter._build_payload("openai", opts)
        self.assertEqual(payload["max_output_tokens"], 512)

    def test_ollama_protocol_uses_num_predict(self):
        opts = _options(_ollama_provider())
        opts["maxTokens"] = 256
        payload = unchain_adapter._build_payload("ollama", opts)
        self.assertEqual(payload["num_predict"], 256)

    def test_builtin_path_unchanged(self):
        # No custom_provider → behaves exactly as before.
        payload = unchain_adapter._build_payload("anthropic", {"maxTokens": 100})
        self.assertEqual(payload, {"max_tokens": 100})
        payload = unchain_adapter._build_payload("openai", {"maxTokens": 100})
        self.assertEqual(payload, {"max_output_tokens": 100})
        payload = unchain_adapter._build_payload("ollama", {"maxTokens": 100})
        self.assertEqual(payload, {"num_predict": 100})


class PresetAnthropicRouteTests(unittest.TestCase):
    def test_deepseek_and_kimi_presets_use_the_hyperspace_tool_route(self):
        presets_path = SERVER_ROOT.parents[1] / "src" / "SERVICEs" / "custom_provider_presets.json"
        presets = json.loads(presets_path.read_text(encoding="utf-8"))
        providers = {
            item["provider"]["id"]: item["provider"]
            for item in presets
            if isinstance(item, dict) and isinstance(item.get("provider"), dict)
        }
        expected_urls = {
            "deepseek": "https://api.deepseek.com/anthropic",
            "kimi": "https://api.moonshot.ai/anthropic",
            "kimi-cn": "https://api.moonshot.cn/anthropic",
        }

        for provider_id, base_url in expected_urls.items():
            with self.subTest(provider_id=provider_id):
                raw = providers[provider_id]
                cfg = cp.parse_custom_provider({"custom_provider": raw})
                self.assertEqual(cfg.protocol, "anthropic")
                self.assertEqual(cfg.twin, "hyperspace")
                self.assertEqual(cfg.base_url, base_url)
                model = cfg.default_model_id()
                factory = cp.make_custom_model_io_factory(cfg, "provider-key")
                spec = SimpleNamespace(
                    provider="hyperspace",
                    model=model,
                    api_key=None,
                )
                with mock.patch("anthropic.Anthropic"):
                    model_io = factory(spec, None)
                self.assertEqual(model_io.provider, "hyperspace")
                self.assertEqual(model_io.base_url, base_url)
                self.assertTrue(model_io.model_capabilities[model]["supports_tools"])


# ── Silent-fallback elimination (design §7.2 / A5) ───────────────────────────

class SilentFallbackEliminationTests(unittest.TestCase):
    def test_custom_prefix_without_cfg_raises(self):
        # custom.* modelId but no custom_provider attached → hard error, NOT the
        # old ollama:deepseek-r1:14b silent fallback.
        with self.assertRaises(cp.CustomProviderError) as ctx:
            unchain_adapter._parse_model_overrides({"modelId": "custom.ghost:some-model"})
        self.assertEqual(ctx.exception.code, "custom_provider_not_found")

    def test_custom_prefix_mismatched_cfg_raises(self):
        opts = {
            "modelId": "custom.other:m",
            "custom_provider": _anthropic_provider(),  # id = sap-hyperspace
        }
        with self.assertRaises(cp.CustomProviderError) as ctx:
            unchain_adapter._parse_model_overrides(opts)
        self.assertEqual(ctx.exception.code, "custom_provider_not_found")

    def test_valid_custom_returns_twin_overrides(self):
        opts = _options(_anthropic_provider())
        overrides = unchain_adapter._parse_model_overrides(opts)
        self.assertEqual(overrides["provider"], "hyperspace")
        self.assertEqual(overrides["model"], "anthropic--claude-4.5-haiku")

    def test_runtime_config_accepts_twin_under_cfg(self):
        opts = _options(_anthropic_provider())
        cfg = unchain_adapter.get_runtime_config(opts)
        self.assertEqual(cfg["provider"], "hyperspace")
        self.assertEqual(cfg["model"], "anthropic--claude-4.5-haiku")


# ── Key non-crossover property family (design §9.2, FM16/FM17) ───────────────

class KeyNonCrossoverTests(unittest.TestCase):
    def test_missing_key_raises_under_auth(self):
        opts = _options(_anthropic_provider(), api_key="")
        cfg = cp.parse_custom_provider(opts)
        with self.assertRaises(cp.CustomProviderError) as ctx:
            unchain_adapter._resolve_agent_api_key(opts, cfg.twin, cfg=cfg)
        self.assertEqual(ctx.exception.code, "custom_provider_missing_api_key")

    def test_env_openai_key_never_fills_custom_openai_twin(self):
        # openai twin is fail-open: an OPENAI_API_KEY in env must NOT be picked up
        # for a custom (auth) provider — that would leak the official key to the
        # custom endpoint (design §7.2, R4).
        opts = _options(_openai_provider(), api_key="")
        cfg = cp.parse_custom_provider(opts)
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-official", "UNCHAIN_API_KEY": "u"}):
            with self.assertRaises(cp.CustomProviderError) as ctx:
                unchain_adapter._resolve_agent_api_key(opts, cfg.twin, cfg=cfg)
            self.assertEqual(ctx.exception.code, "custom_provider_missing_api_key")

    def test_custom_key_returned_not_env(self):
        opts = _options(_openai_provider(), api_key="custom-only-key")
        cfg = cp.parse_custom_provider(opts)
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-official"}):
            key = unchain_adapter._resolve_agent_api_key(opts, cfg.twin, cfg=cfg)
        self.assertEqual(key, "custom-only-key")

    def test_none_auth_needs_no_key(self):
        opts = _options(_ollama_provider(), api_key="")
        cfg = cp.parse_custom_provider(opts)
        self.assertEqual(unchain_adapter._resolve_agent_api_key(opts, cfg.twin, cfg=cfg), "")

    def test_summary_generator_no_ops_under_custom(self):
        # FM16: the (currently unwired) summary generator must no-op when a custom
        # provider is present so it can never send the custom key to an official
        # endpoint if it is ever wired.
        opts = _options(_openai_provider())
        gen = unchain_adapter._build_summary_generator("openai", "llama-3.3-70b", "custom-key", opts)
        # Would otherwise try to hit api.openai.com; instead returns previous summary.
        result = gen("prev-summary", [{"role": "user", "content": "hi"}], 200, "llama-3.3-70b")
        self.assertEqual(result, "prev-summary")

    def test_builtin_resolve_api_key_unchanged(self):
        # No cfg → the original built-in env-fallback behaviour is intact.
        with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-builtin"}, clear=False):
            key = unchain_adapter._resolve_agent_api_key({}, "openai", cfg=None)
        self.assertEqual(key, "sk-builtin")


# ── Redaction (design §9.4) ──────────────────────────────────────────────────

class RedactionTests(unittest.TestCase):
    def test_redacts_keyed_secrets(self):
        obj = {
            "api_key": "sk-123",
            "apiKey": "sk-456",
            "authorization": "Bearer abc",
            "x-api-key": "hs-789",
            "token": "t",
            "secret": "s",
            "base_url": "http://localhost:6655",
            "nested": {"api_key": "sk-deep", "safe": "keep"},
            "list": [{"token": "x"}, "plain"],
        }
        red = cp.redact_secrets(obj)
        self.assertEqual(red["api_key"], "***")
        self.assertEqual(red["apiKey"], "***")
        self.assertEqual(red["authorization"], "***")
        self.assertEqual(red["x-api-key"], "***")
        self.assertEqual(red["token"], "***")
        self.assertEqual(red["secret"], "***")
        self.assertEqual(red["base_url"], "http://localhost:6655")
        self.assertEqual(red["nested"]["api_key"], "***")
        self.assertEqual(red["nested"]["safe"], "keep")
        self.assertEqual(red["list"][0]["token"], "***")
        # original not mutated
        self.assertEqual(obj["api_key"], "sk-123")

    def test_secret_value_not_in_redacted_output(self):
        red = cp.redact_secrets({"custom_provider_api_key": "hs-super-secret"})
        self.assertNotIn("hs-super-secret", str(red))

    def test_redact_text_scrubs_message(self):
        msg = "failed with api_key=sk-leak123 and Bearer tok-abc"
        scrubbed = cp.redact_text(msg)
        self.assertNotIn("sk-leak123", scrubbed)
        self.assertNotIn("tok-abc", scrubbed)

    def test_custom_provider_error_message_redacted(self):
        exc = cp.CustomProviderError("boom", "leaked api_key=sk-secretvalue")
        self.assertNotIn("sk-secretvalue", str(exc))
        self.assertEqual(exc.code, "boom")


# ── stream_started modelId echo (design §7.5) ────────────────────────────────

class StreamStartedEchoTests(unittest.TestCase):
    def test_custom_echoes_original_model_id(self):
        opts = _options(_anthropic_provider())
        self.assertEqual(
            unchain_adapter.get_display_model_id(opts),
            "custom.sap-hyperspace:anthropic--claude-4.5-haiku",
        )

    def test_builtin_echo_is_get_model_name(self):
        opts = {"modelId": "anthropic:claude-opus-4.6"}
        self.assertEqual(
            unchain_adapter.get_display_model_id(opts), unchain_adapter.get_model_name(opts)
        )


# ── Twin skips the 4.5→4-5 normalization (design §7.2) ───────────────────────

class NormalizationSkipTests(unittest.TestCase):
    def test_hyperspace_twin_model_passes_through(self):
        # The anthropic-provider model "anthropic--claude-4.5-haiku" must NOT be
        # rewritten to "...4-5..." — the twin resolves to hyperspace (no rewrite).
        opts = _options(_anthropic_provider())
        cfg = unchain_adapter.get_runtime_config(opts)
        self.assertEqual(cfg["model"], "anthropic--claude-4.5-haiku")

    def test_get_max_context_uses_cfg(self):
        cfg = cp.parse_custom_provider({"custom_provider": _anthropic_provider()})
        ctx = unchain_adapter.get_max_context_window_tokens(
            "hyperspace", "anthropic--claude-4.5-haiku", cfg=cfg
        )
        self.assertEqual(ctx, 200000)

    def test_get_max_context_fallback_never_zero(self):
        # A declared model without max_context_window_tokens gets the 32768 floor.
        p = _anthropic_provider()
        p["models"][0]["capabilities"].pop("max_context_window_tokens")
        cfg = cp.parse_custom_provider({"custom_provider": p})
        ctx = unchain_adapter.get_max_context_window_tokens(
            "hyperspace", "anthropic--claude-4.5-haiku", cfg=cfg
        )
        self.assertEqual(ctx, 32768)


if __name__ == "__main__":
    unittest.main()
