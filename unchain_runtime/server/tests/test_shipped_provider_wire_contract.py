"""BC-002 consumer side — the backend accepts a shipped provider unchanged (#202).

PuPu 0.1.11 makes DeepSeek and Kimi first-class providers. What changes is where
their DEFINITION is resolved from (the app bundle instead of a copy written into
user storage on first key save); what travels does not change: the same
``custom.<slug>:<model>`` addressing and the same ``options.custom_provider``
object this module already revalidates.

This test refuses to restate that claim in a hand-written fixture. It loads the
REAL producer artifact emitted by the PuPu-side suite
(``src/SERVICEs/shipped_provider_wire_contract.test.js`` →
``docs/implementation/ticket-202-evidence/shipped_provider_wire.json``) and runs
it through the strict consumer, so a producer-side drift fails here rather than
in front of a user.

Admission, stated precisely: the producer is CLOSED by whitelist construction
and the consumer is constructive-read — it builds ``CustomProviderConfig`` from
named fields and never iterates the incoming object. A field the producer does
not emit therefore cannot influence the consumer, which the "inert unknown
field" test below asserts directly rather than assuming.
"""
import copy
import json
import sys
import unittest
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import custom_provider as cp  # noqa: E402

REPO_ROOT = SERVER_ROOT.parents[1]
ARTIFACT = (
    REPO_ROOT
    / "docs"
    / "implementation"
    / "ticket-202-evidence"
    / "shipped_provider_wire.json"
)


def _load_artifact():
    if not ARTIFACT.exists():
        raise AssertionError(
            f"missing producer artifact {ARTIFACT}. Regenerate it by running the "
            "PuPu suite src/SERVICEs/shipped_provider_wire_contract.test.js."
        )
    return json.loads(ARTIFACT.read_text(encoding="utf-8"))


class ShippedProviderWireContractTests(unittest.TestCase):
    def setUp(self):
        artifact = _load_artifact()
        self.assertEqual(artifact.get("contract"), "BC-002")
        self.providers = artifact["providers"]
        self.assertTrue(self.providers, "artifact declares no providers")

    def test_every_shipped_provider_is_accepted(self):
        for slug, provider in self.providers.items():
            with self.subTest(slug=slug):
                cfg = cp.parse_custom_provider({"custom_provider": provider})
                self.assertIsNotNone(cfg)
                self.assertEqual(cfg.slug, slug)
                self.assertEqual(cfg.provider_key, f"custom.{slug}")
                self.assertEqual(cfg.base_url, provider["base_url"])
                self.assertEqual(cfg.protocol, provider["protocol"])
                self.assertEqual(cfg.auth_mode, provider["auth"]["mode"])
                self.assertEqual(
                    sorted(cfg.models),
                    sorted(m["id"] for m in provider["models"]),
                )

    def test_declared_default_model_survives(self):
        for slug, provider in self.providers.items():
            declared = provider.get("default_model")
            if not declared:
                continue
            with self.subTest(slug=slug):
                cfg = cp.parse_custom_provider({"custom_provider": provider})
                self.assertEqual(cfg.default_model, declared)

    def test_kimi_non_thinking_tool_default_survives_strict_consumer(self):
        for slug in ("kimi", "kimi-cn"):
            cfg = cp.parse_custom_provider({"custom_provider": self.providers[slug]})
            for model_id, model in cfg.models.items():
                if model_id == "kimi-k2.7-code":
                    continue
                with self.subTest(slug=slug, model=model_id):
                    self.assertEqual(
                        model["default_payload"], {"thinking": {"type": "disabled"}}
                    )

    def test_both_auth_modes_shipped_today_are_admitted(self):
        modes = {p["auth"]["mode"] for p in self.providers.values()}
        # DeepSeek is x-api-key, Kimi is bearer — the two shipped today. If a
        # future preset introduces a third mode this assertion documents that it
        # was a considered change, not an accident.
        self.assertTrue(modes.issubset(cp._AUTH_MODES))
        self.assertEqual(modes, {"x-api-key", "bearer"})

    # ── negative cases ───────────────────────────────────────────────────────

    def test_unknown_field_is_inert_not_honoured(self):
        """An unknown key changes nothing about the parsed config."""
        slug, provider = next(iter(self.providers.items()))
        baseline = cp.parse_custom_provider({"custom_provider": provider})

        polluted = copy.deepcopy(provider)
        polluted["shipped_origin"] = "trust-me"
        polluted["enabled"] = False
        polluted["source"] = "preset"
        parsed = cp.parse_custom_provider({"custom_provider": polluted})

        self.assertEqual(parsed.slug, baseline.slug)
        self.assertEqual(parsed.base_url, baseline.base_url)
        self.assertEqual(parsed.auth_mode, baseline.auth_mode)
        self.assertEqual(parsed.models.keys(), baseline.models.keys())
        self.assertFalse(hasattr(parsed, "shipped_origin"))
        self.assertFalse(hasattr(parsed, "enabled"))

    def test_forbidden_key_is_rejected(self):
        slug, provider = next(iter(self.providers.items()))
        polluted = copy.deepcopy(provider)
        polluted["constructor"] = {"polluted": True}

        with self.assertRaises(cp.CustomProviderError):
            cp.parse_custom_provider({"custom_provider": polluted})

    def test_a_changed_base_url_is_revalidated_not_trusted(self):
        slug, provider = next(iter(self.providers.items()))
        broken = copy.deepcopy(provider)
        broken["base_url"] = "file:///etc/passwd"

        with self.assertRaises(cp.CustomProviderError) as ctx:
            cp.parse_custom_provider({"custom_provider": broken})
        self.assertEqual(ctx.exception.code, "custom_provider_invalid_base_url")

    def test_a_shipped_slug_is_not_a_reserved_backend_slug(self):
        """The backend must not treat a shipped slug as an impersonation attempt."""
        for slug in self.providers:
            with self.subTest(slug=slug):
                self.assertNotIn(slug, cp._RESERVED_SLUGS)
                self.assertIsNotNone(cp._SLUG_PATTERN.match(slug))

    def test_a_secret_shaped_field_in_default_payload_is_stripped(self):
        slug, provider = next(iter(self.providers.items()))
        smuggling = copy.deepcopy(provider)
        smuggling["models"][0]["default_payload"] = {
            "api_key": "sk-should-never-survive",
            "max_tokens": 4096,
        }

        cfg = cp.parse_custom_provider({"custom_provider": smuggling})
        payload = cfg.models[smuggling["models"][0]["id"]]["default_payload"]

        self.assertNotIn("api_key", payload)
        self.assertEqual(payload.get("max_tokens"), 4096)


if __name__ == "__main__":
    unittest.main()
