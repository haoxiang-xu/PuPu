import sys
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import app as miso_app  # noqa: E402
import routes as miso_routes  # noqa: E402


class ModelsCatalogRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = miso_app.create_app().test_client()

    def test_models_catalog_includes_model_capabilities(self) -> None:
        with (
            mock.patch.object(
                miso_routes,
                "get_runtime_config",
                return_value={"provider": "openai", "model": "gpt-5"},
            ),
            mock.patch.object(
                miso_routes,
                "get_capability_catalog",
                return_value={
                    "openai": ["gpt-5"],
                    "anthropic": [],
                    "ollama": [],
                },
            ),
            mock.patch.object(
                miso_routes,
                "get_model_capability_catalog",
                return_value={
                    "openai:gpt-5": {
                        "input_modalities": ["text", "image"],
                        "input_source_types": {"image": ["url"]},
                    }
                },
            ),
        ):
            response = self.client.get("/models/catalog")

        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["active"]["model_id"], "openai:gpt-5")
        self.assertEqual(
            payload["active"]["capabilities"],
            {
                "input_modalities": ["text", "image"],
                "input_source_types": {"image": ["url"]},
            },
        )
        self.assertIn("model_capabilities", payload)
        self.assertIn("openai:gpt-5", payload["model_capabilities"])

    def test_models_catalog_falls_back_to_text_only_for_unknown_active_model(self) -> None:
        with (
            mock.patch.object(
                miso_routes,
                "get_runtime_config",
                return_value={"provider": "openai", "model": "unknown-model"},
            ),
            mock.patch.object(
                miso_routes,
                "get_capability_catalog",
                return_value={
                    "openai": ["gpt-5"],
                    "anthropic": [],
                    "ollama": [],
                },
            ),
            mock.patch.object(
                miso_routes,
                "get_model_capability_catalog",
                return_value={
                    "openai:gpt-5": {
                        "input_modalities": ["text", "image", "pdf"],
                        "input_source_types": {"image": ["url", "base64"]},
                    }
                },
            ),
        ):
            response = self.client.get("/models/catalog")

        payload = response.get_json()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(payload["active"]["model_id"], "openai:unknown-model")
        self.assertEqual(
            payload["active"]["capabilities"],
            {
                "input_modalities": ["text"],
                "input_source_types": {},
            },
        )


if __name__ == "__main__":
    unittest.main()
