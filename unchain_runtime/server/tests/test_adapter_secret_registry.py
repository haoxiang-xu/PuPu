import json
import tempfile
import unittest
from pathlib import Path

from memory_v2_sanitizer import StorageTrust, sanitize_for_storage
from memory_v2_store import MemoryV2Store
from secret_scrub_registry import get_secret_scrub_registry
from unchain_adapter import _extract_api_key_from_options, _resolve_agent_api_key


class AdapterSecretRegistryTests(unittest.TestCase):
    def setUp(self):
        get_secret_scrub_registry().reset_for_tests()

    def tearDown(self):
        get_secret_scrub_registry().reset_for_tests()

    def test_option_and_resolved_provider_keys_register_before_storage(self):
        first = "provider-option-secret-2026"
        second = "provider-resolved-secret-2026"
        self.assertEqual(
            _extract_api_key_from_options({"openai_api_key": first}, "openai"),
            first,
        )
        self.assertEqual(
            _resolve_agent_api_key({"anthropic_api_key": second}, "anthropic"),
            second,
        )
        payload = sanitize_for_storage(
            f"{first} {second}".encode("utf-8"),
            declared_mime="text/plain",
            trust=StorageTrust.JOURNAL,
        )
        self.assertNotIn(first.encode("utf-8"), payload.data)
        self.assertNotIn(second.encode("utf-8"), payload.data)

    def test_registered_values_are_absent_from_cas_status_and_errors(self):
        secret = "provider-status-secret-2026"
        _extract_api_key_from_options({"api_key": secret}, "openai")
        with tempfile.TemporaryDirectory() as root:
            store = MemoryV2Store(Path(root) / "memory_v2")
            try:
                record = store.put_object(
                    sanitize_for_storage(
                        f"before {secret} after".encode("utf-8"),
                        declared_mime="text/plain",
                        trust=StorageTrust.JOURNAL,
                    )
                )
                self.assertNotIn(
                    secret.encode("utf-8"),
                    (store.objects_dir / record["object_id"]).read_bytes(),
                )
                self.assertNotIn(secret, json.dumps(store.status(), sort_keys=True))
            finally:
                store.close()


if __name__ == "__main__":
    unittest.main()
