import os
import sys
import unittest
from pathlib import Path
from unittest import mock


SERVER_ROOT = Path(__file__).resolve().parents[1]
UNCHAIN_SRC = Path(__file__).resolve().parents[4] / "unchain" / "src"
for candidate in (SERVER_ROOT, UNCHAIN_SRC):
    if str(candidate) not in sys.path:
        sys.path.insert(0, str(candidate))

from memory_v2_context import inspect_memory_v2_rollout_intent
from memory_v2_rollout import resolve_memory_v2_rollout


class MemoryV2RolloutTests(unittest.TestCase):
    def test_defaults_are_consistently_off(self):
        config = resolve_memory_v2_rollout({})

        self.assertEqual(config.feature_ceiling, "off")
        self.assertEqual(config.configured_mode, "off")
        self.assertEqual(config.rollout_mode, "off")
        self.assertEqual(config.canary_percent, 5)
        self.assertTrue(config.valid)
        self.assertRegex(config.fingerprint, r"^[0-9a-f]{64}$")

    def test_missing_mode_does_not_disagree_with_the_feature_ceiling(self):
        environment = {"PUPU_FEATURE_MEMORY_V2": "all"}
        config = resolve_memory_v2_rollout(environment)

        self.assertEqual(config.feature_ceiling, "all")
        self.assertEqual(config.configured_mode, "off")
        self.assertEqual(config.rollout_mode, "off")
        with mock.patch.dict(os.environ, environment, clear=True):
            intent = inspect_memory_v2_rollout_intent(
                {"enable_memory_v2": True},
                owner_chat_id="chat_default",
            )
        self.assertEqual(intent["effective_rollout_mode"], config.rollout_mode)
        self.assertEqual(intent["rollout_fingerprint"], config.fingerprint)

    def test_fingerprint_matches_the_electron_canonical_form(self):
        config = resolve_memory_v2_rollout(
            {
                "PUPU_FEATURE_MEMORY_V2": "all",
                "PUPU_MEMORY_V2_MODE": "canary",
                "PUPU_MEMORY_V2_CANARY_PERCENT": "25",
                "PUPU_MEMORY_V2_READ_ONLY_DEGRADED": "0",
            }
        )

        self.assertEqual(config.rollout_mode, "canary")
        self.assertEqual(
            config.fingerprint,
            "7d87fdbb95886175fa88db7e61153f9a2e5a782b9080e3b9fe6723702a4824a3",
        )

    def test_invalid_process_configuration_fails_closed_and_is_auditable(self):
        config = resolve_memory_v2_rollout(
            {
                "PUPU_FEATURE_MEMORY_V2": "all",
                "PUPU_MEMORY_V2_MODE": "all",
                "PUPU_MEMORY_V2_CANARY_PERCENT": "not-a-number",
            }
        )

        self.assertFalse(config.valid)
        self.assertEqual(config.error_code, "memory_v2_rollout_config_invalid")
        self.assertEqual(config.rollout_mode, "off")

    def test_environment_read_is_identical_to_explicit_mapping(self):
        values = {
            "PUPU_FEATURE_MEMORY_V2": "all",
            "PUPU_MEMORY_V2_MODE": "shadow",
            "PUPU_MEMORY_V2_CANARY_PERCENT": "12",
            "PUPU_MEMORY_V2_READ_ONLY_DEGRADED": "1",
        }
        with mock.patch.dict(os.environ, values, clear=True):
            implicit = resolve_memory_v2_rollout()

        self.assertEqual(implicit, resolve_memory_v2_rollout(values))


if __name__ == "__main__":
    unittest.main()
