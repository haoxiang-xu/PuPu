"""What the Kernel profile producer offers, and what it refuses to invent.

Every assertion here is about the installed runtime: the capability catalog
comes from the wheel, and every offered profile is handed to the wheel's own
``validate_kernel_config``. The point of the module under test is that the
editor never has to assemble a profile out of facts it cannot see, so a test
that stubbed the catalog everywhere would prove nothing about the thing the
builder actually gets. Stubs appear only where the real data cannot reach a
rule, and each of those says so.
"""
import unittest
from copy import deepcopy
from unittest.mock import patch

from unchain.skeleton.errors import SkeletonValidationError
from unchain.skeleton.kernel_config import validate_kernel_config
from unchain.skeleton.kernel_profile import _NATIVE_PROTOCOLS, _transport_for

import app as pupu_app
import skeleton_kernel_profiles as producer
from skeleton_production_bindings import _OFFICIAL


def _declared_by_model_id():
    """The catalog, keyed the way a profile names its model.

    ``_normalize_provider_model_name`` rewrites an Anthropic minor version —
    ``claude-haiku-4.5`` is called ``claude-haiku-4-5`` at the provider — so
    the profile's model is deliberately not the catalog's key, and a test that
    looked a profile up by it would miss exactly those models.
    """
    import unchain_adapter as adapter

    catalog = {}
    for name, declared in adapter._load_raw_capability_catalog().items():
        if not isinstance(declared, dict):
            continue
        provider = str(declared.get("provider", "")).strip().lower()
        model = adapter._normalize_provider_model_name(provider, name)
        if model:
            catalog[f"{provider}:{model}"] = declared
    return catalog


def _probe(profile):
    return {
        "schema_version": 1, "profile": profile, "prompt": "", "max_iterations": 1,
        "output_tokens": 1, "history": "root", "overflow": "error", "json_schema": None,
    }


class KernelProfileProducerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.result = producer.kernel_profiles()

    def test_the_answer_has_exactly_two_halves(self):
        self.assertEqual(set(self.result), {"profiles", "unavailable"})

    def test_it_offers_something_to_configure(self):
        self.assertGreater(len(self.result["profiles"]), 0)

    def test_every_offered_profile_is_one_the_runtime_admits(self):
        """The producer's own gate, re-run here against the same validator.

        A profile that only this module believes in would be a profile the
        editor has to refuse after the author picked it.
        """
        for profile in self.result["profiles"]:
            with self.subTest(profile=profile["id"]):
                validate_kernel_config(_probe(deepcopy(profile)))

    def test_every_offered_profile_survives_binding_its_transport(self):
        """`validate_kernel_config` does not check this pair; nothing does
        until the Kernel takes its first turn."""
        for profile in self.result["profiles"]:
            with self.subTest(profile=profile["id"]):
                _transport_for(profile)
                self.assertEqual(
                    profile["protocol"], _NATIVE_PROTOCOLS[profile["provider"]],
                )

    def test_an_official_endpoint_is_the_one_credentials_are_resolved_against(self):
        """Off by one character and every run needs a dedicated binding."""
        for profile in self.result["profiles"]:
            official = _OFFICIAL.get(profile["provider"])
            if official is None:
                continue
            with self.subTest(profile=profile["id"]):
                self.assertEqual(profile["endpoint"], official[0])

    def test_a_model_is_named_the_way_its_provider_is_called(self):
        """Not the way the catalog keys it: an Anthropic minor version is
        rewritten, and a profile carrying the catalog's spelling would reach
        the provider as an unknown model."""
        declared_by_id = _declared_by_model_id()
        rewritten = [
            entry for entry in self.result["unavailable"]
            if entry["model"] == "claude-haiku-4-5"
        ]
        self.assertEqual(len(rewritten), 1)
        self.assertIn("anthropic:claude-haiku-4-5", declared_by_id)

    def test_identity_is_the_model_it_is_for(self):
        ids = [profile["id"] for profile in self.result["profiles"]]
        self.assertEqual(len(ids), len(set(ids)))
        for profile in self.result["profiles"]:
            with self.subTest(profile=profile["id"]):
                self.assertEqual(
                    profile["id"], f"{profile['provider']}:{profile['model']}",
                )

    def test_a_reservation_can_actually_be_chosen(self):
        """``output_tokens`` must be at least one and below the window, so a
        profile whose limit leaves no room would be unconfigurable."""
        for profile in self.result["profiles"]:
            with self.subTest(profile=profile["id"]):
                self.assertGreaterEqual(profile["output_limit"], 1)
                self.assertGreater(profile["context_window"], 1)

    def test_structured_output_is_offered_for_every_native_protocol(self):
        """Including Anthropic, whose capability-file flag says otherwise.

        That flag is about the chat path's ``ResponseFormat`` adapter, which
        the Kernel deliberately passes ``None`` for; the Kernel sends
        ``output_config`` instead. Reading the flag here would deny Anthropic
        a capability this runtime has.
        """
        declared_by_id = _declared_by_model_id()
        anthropic = [p for p in self.result["profiles"] if p["provider"] == "anthropic"]
        self.assertGreater(len(anthropic), 0)
        for profile in anthropic:
            with self.subTest(profile=profile["id"]):
                self.assertIs(profile["capabilities"]["json_schema"], True)
                declared = declared_by_id[profile["id"]]
                self.assertIs(declared.get("supports_response_format"), False)

    def test_attachments_come_from_the_model_and_not_the_protocol(self):
        declared_by_id = _declared_by_model_id()
        seen = set()
        for profile in self.result["profiles"]:
            declared = declared_by_id[profile["id"]].get("input_modalities") or []
            with self.subTest(profile=profile["id"]):
                self.assertIs(profile["capabilities"]["images"], "image" in declared)
                self.assertIs(
                    profile["capabilities"]["files"],
                    any(item not in ("text", "image") for item in declared),
                )
            seen.add(profile["capabilities"]["files"])
        # Both answers actually occur in this catalog, so the rule is doing
        # something: gpt-6-sol declares text and image only, Claude declares pdf.
        self.assertEqual(seen, {True, False})

    def test_a_model_with_no_declared_output_cap_is_not_given_one(self):
        reasons = {entry["reason"] for entry in self.result["unavailable"]}
        self.assertIn("output_limit_unknown", reasons)
        offered = {profile["id"] for profile in self.result["profiles"]}
        declared_by_id = _declared_by_model_id()
        for entry in self.result["unavailable"]:
            if entry["reason"] != "output_limit_unknown":
                continue
            with self.subTest(model=entry["id"]):
                self.assertNotIn(entry["id"], offered)
                self.assertIsNone(
                    declared_by_id[entry["id"]].get("max_output_tokens"),
                )

    def test_nothing_is_both_offered_and_unavailable(self):
        offered = {profile["id"] for profile in self.result["profiles"]}
        self.assertEqual(
            offered & {entry["id"] for entry in self.result["unavailable"]}, set(),
        )

    def test_a_custom_provider_is_absent_rather_than_guessed(self):
        """Its endpoint lives in the per-request options PuPu sends with a
        chat, which is not readable here."""
        providers = {profile["provider"] for profile in self.result["profiles"]}
        providers |= {entry["provider"] for entry in self.result["unavailable"]}
        self.assertNotIn("hyperspace", providers)
        self.assertTrue(providers <= set(producer._DERIVABLE))


class KernelProfileDataRulesTest(unittest.TestCase):
    """Rules about the catalog that this wheel's catalog does not reach.

    The catalog is a file a later wheel can change, so these are stated
    rather than left as branches nobody has run.
    """

    CATALOG = {
        "capped": {"provider": "openai", "max_context_window_tokens": 100000,
                   "max_output_tokens": 8192, "input_modalities": ["text"]},
        "windowless": {"provider": "openai", "max_output_tokens": 8192,
                       "input_modalities": ["text"]},
        "zero-window": {"provider": "openai", "max_context_window_tokens": 0,
                        "max_output_tokens": 8192, "input_modalities": ["text"]},
        "fractional": {"provider": "openai", "max_context_window_tokens": 100.5,
                       "max_output_tokens": 8192, "input_modalities": ["text"]},
        "stringly": {"provider": "openai", "max_context_window_tokens": "100000",
                     "max_output_tokens": 8192, "input_modalities": ["text"]},
    }

    def _profiles(self, catalog):
        import unchain_adapter as adapter

        with patch.object(adapter, "_load_raw_capability_catalog", return_value=catalog):
            return producer.kernel_profiles()

    def test_a_model_with_no_window_is_reported_and_not_offered(self):
        result = self._profiles(self.CATALOG)
        self.assertEqual(
            {profile["model"] for profile in result["profiles"]}, {"capped"},
        )
        reasons = {entry["model"]: entry["reason"] for entry in result["unavailable"]}
        self.assertEqual(reasons, {
            "windowless": "context_window_unknown",
            "zero-window": "context_window_unknown",
            "fractional": "context_window_unknown",
            "stringly": "context_window_unknown",
        })

    def test_a_catalog_entry_that_is_not_an_object_is_skipped(self):
        result = self._profiles({**self.CATALOG, "broken": ["openai"]})
        self.assertNotIn("broken", {p["model"] for p in result["profiles"]})
        self.assertNotIn("broken", {e["model"] for e in result["unavailable"]})

    def test_a_profile_the_validator_refuses_carries_its_reason(self):
        """The producer's gate is not decoration: a catalog that produced an
        inadmissible profile has to report the validator's own verdict."""
        import unchain_adapter as adapter

        catalog = {"capped": dict(self.CATALOG["capped"])}
        with patch.object(adapter, "_load_raw_capability_catalog", return_value=catalog), \
                patch.object(producer, "_endpoint_for", return_value="https://host/v1?key=x"):
            result = producer.kernel_profiles()
        self.assertEqual(result["profiles"], [])
        self.assertEqual(len(result["unavailable"]), 1)
        entry = result["unavailable"][0]
        self.assertEqual(entry["reason"], "profile_refused")
        self.assertEqual(entry["code"], "invalid_value")
        self.assertEqual(entry["path"], ["kernel", "profile", "endpoint"])


class OllamaEndpointTest(unittest.TestCase):
    def test_the_configured_host_is_used(self):
        with patch.dict("os.environ", {"OLLAMA_HOST": "http://10.0.0.2:11434/"}):
            self.assertEqual(producer._ollama_endpoint(), "http://10.0.0.2:11434")

    def test_a_bare_host_and_port_becomes_an_address(self):
        """Ollama's own clients accept it; the validator refuses an address
        with no scheme, so a profile would be inadmissible."""
        with patch.dict("os.environ", {"OLLAMA_HOST": "localhost:11434"}):
            endpoint = producer._ollama_endpoint()
        self.assertEqual(endpoint, "http://localhost:11434")
        validate_kernel_config(_probe({
            "id": "ollama:m", "provider": "ollama", "model": "m", "protocol": "ollama",
            "endpoint": endpoint, "credential_ref": "ollama", "context_window": 128000,
            "output_limit": 4096,
            "capabilities": {"json_schema": True, "images": False, "files": False},
        }))

    def test_an_empty_setting_falls_back_to_the_local_daemon(self):
        with patch.dict("os.environ", {"OLLAMA_HOST": "   "}):
            self.assertEqual(producer._ollama_endpoint(), "http://localhost:11434")


if __name__ == "__main__":
    unittest.main()


class KernelProfileRouteTest(unittest.TestCase):
    """The producer through the real transport, which is how PuPu reaches it."""

    def test_the_route_answers_with_both_halves(self):
        client = pupu_app.create_app().test_client()
        response = client.get("/skeleton_kernel_profiles")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(set(payload), {"profiles", "unavailable"})
        self.assertEqual(payload, producer.kernel_profiles())

    def test_every_profile_that_crossed_json_is_still_admissible(self):
        """JSON is the boundary: a number that arrived as a float, or a key
        that did not survive the trip, would be a profile the editor refuses
        after the author picked it."""
        client = pupu_app.create_app().test_client()
        payload = client.get("/skeleton_kernel_profiles").get_json()
        self.assertGreater(len(payload["profiles"]), 0)
        for profile in payload["profiles"]:
            with self.subTest(profile=profile["id"]):
                admitted = validate_kernel_config(_probe(profile))
                self.assertEqual(admitted["profile"], profile)
                for key in ("context_window", "output_limit"):
                    self.assertIs(type(profile[key]), int)

    def test_it_is_refused_without_the_configured_token(self):
        authed = pupu_app.create_app()
        authed.config["UNCHAIN_AUTH_TOKEN"] = "secret-token"
        response = authed.test_client().get("/skeleton_kernel_profiles")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.get_json()["error"]["code"], "unauthorized")
