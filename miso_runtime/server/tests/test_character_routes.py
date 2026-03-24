import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

MISO_SRC = SERVER_ROOT.parents[2] / "miso" / "src"
if MISO_SRC.exists() and str(MISO_SRC) not in sys.path:
    sys.path.insert(0, str(MISO_SRC))

import app as miso_app  # noqa: E402
import memory_factory  # noqa: E402


def _character_payload():
    return {
        "name": "Mina",
        "gender": "female",
        "role": "product manager",
        "persona": "observant and busy",
        "speaking_style": ["direct", "polite"],
        "talkativeness": 0.35,
        "politeness": 0.8,
        "autonomy": 0.65,
        "timezone": "America/Vancouver",
        "schedule": {
            "timezone": "America/Vancouver",
            "default_status": "free",
            "blocks": [
                {
                    "days": ["weekday"],
                    "start_time": "13:00",
                    "end_time": "15:00",
                    "status": "meeting",
                    "availability": "busy",
                    "interruption_tolerance": 0.05,
                }
            ],
        },
    }


class CharacterRouteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.env_patch = mock.patch.dict(
            os.environ,
            {"MISO_DATA_DIR": self.tempdir.name},
            clear=False,
        )
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)
        memory_factory._qdrant_clients.clear()
        self.client = miso_app.create_app().test_client()

    def tearDown(self) -> None:
        memory_factory._qdrant_clients.clear()

    def test_character_crud_preview_and_build_round_trip(self) -> None:
        save_response = self.client.post("/characters", json=_character_payload())
        self.assertEqual(save_response.status_code, 200)
        saved = save_response.get_json()
        character_id = saved["id"]

        get_response = self.client.get(f"/characters/{character_id}")
        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(get_response.get_json()["name"], "Mina")

        list_response = self.client.get("/characters")
        self.assertEqual(list_response.status_code, 200)
        listed = list_response.get_json()
        self.assertEqual(listed["count"], 1)
        self.assertEqual(listed["characters"][0]["id"], character_id)

        preview_response = self.client.post(
            "/characters/preview",
            json={
                "character_id": character_id,
                "now": "2026-03-23T13:30:00-07:00",
            },
        )
        self.assertEqual(preview_response.status_code, 200)
        preview = preview_response.get_json()
        self.assertEqual(preview["decision"]["action"], "defer")
        self.assertEqual(preview["evaluation"]["availability"], "busy")

        build_response = self.client.post(
            "/characters/build",
            json={
                "character_id": character_id,
                "thread_id": "main thread",
            },
        )
        self.assertEqual(build_response.status_code, 200)
        build_payload = build_response.get_json()
        self.assertEqual(
            build_payload["session_id"],
            f"character_{character_id}__dm__main_thread",
        )
        self.assertEqual(
            build_payload["relationship_namespace"],
            f"character_{character_id}__rel__local_user",
        )
        self.assertIn("Self profile", build_payload["instructions"])

    def test_delete_character_removes_profiles_sessions_and_collections(self) -> None:
        saved = self.client.post("/characters", json=_character_payload()).get_json()
        character_id = saved["id"]
        build_payload = self.client.post(
            "/characters/build",
            json={
                "character_id": character_id,
                "thread_id": "main thread",
            },
        ).get_json()

        session_id = build_payload["session_id"]
        self_namespace = build_payload["self_namespace"]
        relationship_namespace = build_payload["relationship_namespace"]
        data_dir = memory_factory._normalize_data_dir(memory_factory._data_dir())

        memory_factory._atomic_write_json(
            memory_factory._session_store_path(data_dir, session_id),
            {
                "messages": [{"role": "user", "content": "hello"}],
                "vector_collection_tag": "tag123",
            },
        )
        memory_factory._atomic_write_json(
            memory_factory._session_store_path(data_dir, self_namespace),
            {
                "messages": [{"role": "assistant", "content": "notes"}],
                "vector_collection_tag": "selftag",
            },
        )
        memory_factory._atomic_write_json(
            memory_factory._long_term_profile_path(data_dir, self_namespace),
            {"history": "likes product strategy"},
        )
        memory_factory._atomic_write_json(
            memory_factory._long_term_profile_path(data_dir, relationship_namespace),
            {"familiarity": "new stranger"},
        )

        expected_short_collections = {
            memory_factory._session_collection_name(
                session_id=session_id,
                collection_prefix=memory_factory._vector_collection_prefix("tag123"),
            ),
            memory_factory._session_collection_name(
                session_id=self_namespace,
                collection_prefix=memory_factory._vector_collection_prefix("selftag"),
            ),
        }
        expected_long_collections = {
            f"long_term_1234567890ab_{memory_factory._safe_long_term_namespace(self_namespace)}",
            f"long_term_1234567890ab_{memory_factory._safe_long_term_namespace(relationship_namespace)}",
        }

        class FakeQdrantClient:
            def __init__(self, collection_names):
                self.collection_names = list(collection_names)
                self.deleted = []

            def get_collections(self):
                return types.SimpleNamespace(
                    collections=[
                        types.SimpleNamespace(name=name)
                        for name in self.collection_names
                    ]
                )

            def delete_collection(self, collection_name=None):
                self.deleted.append(collection_name)

        fake_client = FakeQdrantClient(
            [
                *expected_short_collections,
                *expected_long_collections,
            ]
        )

        with mock.patch.object(memory_factory, "_QDRANT_AVAILABLE", True), mock.patch.object(
            memory_factory,
            "_get_or_create_qdrant_client",
            return_value=fake_client,
        ):
            delete_response = self.client.delete(f"/characters/{character_id}")

        self.assertEqual(delete_response.status_code, 200)
        payload = delete_response.get_json()
        self.assertTrue(payload["ok"])
        self.assertFalse(os.path.exists(memory_factory._session_store_path(data_dir, session_id)))
        self.assertFalse(os.path.exists(memory_factory._session_store_path(data_dir, self_namespace)))
        self.assertFalse(os.path.exists(memory_factory._long_term_profile_path(data_dir, self_namespace)))
        self.assertFalse(
            os.path.exists(
                memory_factory._long_term_profile_path(data_dir, relationship_namespace)
            )
        )
        self.assertTrue(expected_short_collections.issubset(set(fake_client.deleted)))
        self.assertTrue(expected_long_collections.issubset(set(fake_client.deleted)))

        get_response = self.client.get(f"/characters/{character_id}")
        self.assertEqual(get_response.status_code, 404)

    def test_session_export_uses_store_path_sanitization(self) -> None:
        data_dir = memory_factory._normalize_data_dir(memory_factory._data_dir())
        session_id = "unsafe:chat/id"
        memory_factory._atomic_write_json(
            memory_factory._session_store_path(data_dir, session_id),
            {"messages": [{"role": "user", "content": "hello"}]},
        )

        response = self.client.get(
            f"/memory/session/export?session_id={session_id}",
        )
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["messages"], [{"role": "user", "content": "hello"}])


if __name__ == "__main__":
    unittest.main()
