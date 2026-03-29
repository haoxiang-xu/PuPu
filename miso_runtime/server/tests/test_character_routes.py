import os
import sys
import tempfile
import types
import unittest
import json
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

MISO_SRC = SERVER_ROOT.parents[2] / "miso" / "src"
if MISO_SRC.exists() and str(MISO_SRC) not in sys.path:
    sys.path.insert(0, str(MISO_SRC))

import app as miso_app  # noqa: E402
import character_defaults  # noqa: E402
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

    def test_builtin_characters_are_seeded_once_with_profiles(self) -> None:
        first_list_response = self.client.get("/characters")
        self.assertEqual(first_list_response.status_code, 200)
        first_payload = first_list_response.get_json()
        self.assertEqual(first_payload["count"], 2)
        first_characters = {
            item["id"]: item for item in first_payload["characters"]
        }
        self.assertEqual(set(first_characters), {"lena", "nico"})
        self.assertEqual(first_characters["nico"]["name"], "Nico")
        self.assertEqual(first_characters["nico"]["timezone"], "Asia/Shanghai")
        self.assertEqual(first_characters["nico"]["metadata"]["age"], 22)
        self.assertEqual(first_characters["nico"]["metadata"]["mbti"], "INFP")
        self.assertEqual(first_characters["lena"]["name"], "Lena Sato")
        self.assertEqual(first_characters["lena"]["timezone"], "Asia/Tokyo")
        self.assertEqual(first_characters["lena"]["metadata"]["age"], 24)
        self.assertEqual(first_characters["lena"]["metadata"]["mbti"], "ENFP")

        second_list_response = self.client.get("/characters")
        self.assertEqual(second_list_response.status_code, 200)
        second_payload = second_list_response.get_json()
        self.assertEqual(second_payload["count"], 2)
        self.assertEqual(
            {item["id"] for item in second_payload["characters"]},
            {"lena", "nico"},
        )

        nico_response = self.client.get("/characters/nico")
        self.assertEqual(nico_response.status_code, 200)
        nico = nico_response.get_json()
        self.assertEqual(nico["role"], "22-year-old HR at an internet company")
        self.assertEqual(nico["metadata"]["list_tags"], ["INFP", "HR", "猫控", "古灵精怪"])

        lena_response = self.client.get("/characters/lena")
        self.assertEqual(lena_response.status_code, 200)
        lena = lena_response.get_json()
        self.assertEqual(
            lena["role"],
            "24-year-old Japanese-French dessert stylist and visual designer",
        )
        self.assertEqual(
            lena["metadata"]["list_tags"],
            ["ENFP", "设计师", "甜品控", "古灵精怪"],
        )

        data_dir = memory_factory._normalize_data_dir(memory_factory._data_dir())
        nico_self_profile = memory_factory._load_long_term_profile(
            data_dir,
            "character_nico__self",
        )
        nico_relationship_profile = memory_factory._load_long_term_profile(
            data_dir,
            "character_nico__rel__local_user",
        )
        self.assertEqual(
            nico_self_profile["core_identity"],
            "22岁，互联网公司 HR，INFP，小蝴蝶型，古灵精怪",
        )
        self.assertEqual(nico_relationship_profile["familiarity_stage"], "stranger")

        lena_self_profile = memory_factory._load_long_term_profile(
            data_dir,
            "character_lena__self",
        )
        lena_relationship_profile = memory_factory._load_long_term_profile(
            data_dir,
            "character_lena__rel__local_user",
        )
        self.assertEqual(
            lena_self_profile["core_identity"],
            "24岁，日法混血甜品视觉设计师，甜甜的，脑子快，有点小坏",
        )
        self.assertEqual(lena_relationship_profile["familiarity_stage"], "stranger")

    def test_seed_avatar_route_serves_avatar_png(self) -> None:
        response = self.client.get("/characters/seeds/nico/avatar")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "image/png")
        self.assertEqual(response.headers.get("Cache-Control"), "no-store")
        self.assertGreater(len(response.data), 0)

    def test_character_avatar_route_serves_builtin_avatar_png(self) -> None:
        response = self.client.get("/characters/nico/avatar")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "image/png")
        self.assertEqual(response.headers.get("Cache-Control"), "no-store")
        self.assertGreater(len(response.data), 0)

    def test_seed_avatar_route_rejects_missing_auth_token_when_configured(self) -> None:
        authed_app = miso_app.create_app()
        authed_app.config["MISO_AUTH_TOKEN"] = "secret-token"
        client = authed_app.test_client()

        response = client.get("/characters/seeds/nico/avatar")

        self.assertEqual(response.status_code, 401)
        payload = response.get_json()
        self.assertEqual(payload["error"]["code"], "unauthorized")

    def test_seed_avatar_route_accepts_query_auth_token(self) -> None:
        authed_app = miso_app.create_app()
        authed_app.config["MISO_AUTH_TOKEN"] = "secret-token"
        client = authed_app.test_client()

        response = client.get("/characters/seeds/nico/avatar?miso_auth=secret-token")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.mimetype, "image/png")

    def test_health_route_rejects_non_loopback_requests(self) -> None:
        response = self.client.get(
            "/health",
            environ_overrides={"REMOTE_ADDR": "192.168.1.10"},
        )

        self.assertEqual(response.status_code, 403)
        payload = response.get_json()
        self.assertEqual(payload["error"]["code"], "non_loopback_forbidden")

    def test_builtin_nico_legacy_registry_is_upgraded_with_default_model(self) -> None:
        data_dir = memory_factory._normalize_data_dir(memory_factory._data_dir())
        memory_factory._atomic_write_json(
            memory_factory._character_registry_path(data_dir),
            {
                "version": 1,
                "seed_version": 1,
                "updated_at": 0,
                "characters_by_id": {
                    "nico": {
                        "spec": {
                            "id": "nico",
                            "name": "Nico",
                            "gender": "female",
                            "role": "22-year-old HR at an internet company",
                            "persona": "legacy nico",
                            "speaking_style": ["casual"],
                            "talkativeness": 0.38,
                            "politeness": 0.74,
                            "autonomy": 0.68,
                            "timezone": "Asia/Shanghai",
                            "schedule": {
                                "timezone": "Asia/Shanghai",
                                "default_status": "free",
                                "blocks": [],
                            },
                            "metadata": {
                                "age": 22,
                                "mbti": "INFP",
                                "origin": "builtin_seed",
                            },
                        },
                        "avatar": None,
                        "created_at": 1,
                        "updated_at": 1,
                        "known_human_ids": ["local_user"],
                        "owned_session_ids": ["character_nico__self"],
                    }
                },
            },
        )

        response = self.client.get("/characters")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["count"], 2)
        characters_by_id = {item["id"]: item for item in payload["characters"]}
        self.assertEqual(
            characters_by_id["nico"]["metadata"]["default_model"],
            "openai:gpt-4.1",
        )

        with open(
            memory_factory._character_registry_path(data_dir),
            "r",
            encoding="utf-8",
        ) as handle:
            registry = json.load(handle)
        self.assertEqual(
            registry["seed_version"],
            character_defaults.DEFAULT_CHARACTER_SEED_VERSION,
        )
        self.assertEqual(
            registry["characters_by_id"]["nico"]["spec"]["metadata"]["default_model"],
            "openai:gpt-4.1",
        )
        self.assertIsInstance(registry["characters_by_id"]["nico"]["avatar"], dict)
        self.assertIn("lena", registry["characters_by_id"])

    def test_builtin_nico_avatar_backfills_even_when_seed_version_is_current(self) -> None:
        data_dir = memory_factory._normalize_data_dir(memory_factory._data_dir())
        memory_factory._atomic_write_json(
            memory_factory._character_registry_path(data_dir),
            {
                "version": 1,
                "seed_version": character_defaults.DEFAULT_CHARACTER_SEED_VERSION,
                "updated_at": 0,
                "characters_by_id": {
                    "nico": {
                        "spec": {
                            "id": "nico",
                            "name": "Nico",
                            "gender": "female",
                            "role": "22-year-old HR at an internet company",
                            "persona": "legacy nico",
                            "speaking_style": ["casual"],
                            "talkativeness": 0.38,
                            "politeness": 0.74,
                            "autonomy": 0.68,
                            "timezone": "Asia/Shanghai",
                            "schedule": {
                                "timezone": "Asia/Shanghai",
                                "default_status": "free",
                                "blocks": [],
                            },
                            "metadata": {
                                "age": 22,
                                "mbti": "INFP",
                                "origin": "builtin_seed",
                                "default_model": "openai:gpt-4.1",
                            },
                        },
                        "avatar": None,
                        "created_at": 1,
                        "updated_at": 1,
                        "known_human_ids": ["local_user"],
                        "owned_session_ids": ["character_nico__self"],
                    }
                },
            },
        )

        response = self.client.get("/characters")
        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertEqual(payload["count"], 1)
        avatar = payload["characters"][0]["avatar"]
        self.assertIsInstance(avatar, dict)
        self.assertTrue(
            avatar["absolute_path"].endswith("/character_seeds/nico/avatar.png"),
        )

        with open(
            memory_factory._character_registry_path(data_dir),
            "r",
            encoding="utf-8",
        ) as handle:
            registry = json.load(handle)

        persisted_avatar = registry["characters_by_id"]["nico"]["avatar"]
        self.assertIsInstance(persisted_avatar, dict)
        self.assertEqual(persisted_avatar["mime_type"], "image/png")
        self.assertTrue(
            persisted_avatar["absolute_path"].endswith("/character_seeds/nico/avatar.png"),
        )

    def test_builtin_nico_preview_and_build_use_seeded_profiles(self) -> None:
        morning_preview = self.client.post(
            "/characters/preview",
            json={
                "character_id": "nico",
                "now": "2026-03-24T10:30:00+08:00",
            },
        )
        self.assertEqual(morning_preview.status_code, 200)
        morning_payload = morning_preview.get_json()
        self.assertEqual(morning_payload["evaluation"]["status"], "working")
        self.assertEqual(morning_payload["evaluation"]["availability"], "limited")

        night_preview = self.client.post(
            "/characters/preview",
            json={
                "character_id": "nico",
                "now": "2026-03-24T02:30:00+08:00",
            },
        )
        self.assertEqual(night_preview.status_code, 200)
        night_payload = night_preview.get_json()
        self.assertEqual(night_payload["evaluation"]["status"], "sleeping")
        self.assertEqual(night_payload["evaluation"]["availability"], "offline")

        evening_preview = self.client.post(
            "/characters/preview",
            json={
                "character_id": "nico",
                "now": "2026-03-24T20:00:00+08:00",
            },
        )
        self.assertEqual(evening_preview.status_code, 200)
        evening_payload = evening_preview.get_json()
        self.assertEqual(evening_payload["evaluation"]["availability"], "available")

        build_response = self.client.post(
            "/characters/build",
            json={
                "character_id": "nico",
                "thread_id": "main thread",
                "now": "2026-03-24T10:30:00+08:00",
            },
        )
        self.assertEqual(build_response.status_code, 200)
        build_payload = build_response.get_json()
        self.assertEqual(build_payload["self_namespace"], "character_nico__self")
        self.assertEqual(
            build_payload["relationship_namespace"],
            "character_nico__rel__local_user",
        )
        self.assertEqual(
            build_payload["self_profile"]["core_identity"],
            "22岁，互联网公司 HR，INFP，小蝴蝶型，古灵精怪",
        )
        self.assertEqual(
            build_payload["relationship_profile"]["familiarity_stage"],
            "stranger",
        )
        self.assertEqual(build_payload["default_model"], "openai:gpt-4.1")

    def test_delete_seeded_nico_does_not_recreate_it(self) -> None:
        self.assertEqual(self.client.get("/characters").get_json()["count"], 2)

        delete_response = self.client.delete("/characters/nico")
        self.assertEqual(delete_response.status_code, 200)
        self.assertTrue(delete_response.get_json()["ok"])

        list_response = self.client.get("/characters")
        self.assertEqual(list_response.status_code, 200)
        list_payload = list_response.get_json()
        self.assertEqual(list_payload["count"], 1)
        self.assertEqual(
            {item["id"] for item in list_payload["characters"]},
            {"lena"},
        )

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
        self.assertEqual(listed["count"], 3)
        self.assertEqual(
            {item["id"] for item in listed["characters"]},
            {"lena", "nico", character_id},
        )

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
