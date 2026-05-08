import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import app as miso_app  # noqa: E402


class RecipeRoutesTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)

        self.home_patch = mock.patch("pathlib.Path.home", return_value=self.tmpdir)
        self.home_patch.start()
        self.addCleanup(self.home_patch.stop)

        from recipe_seeds import ensure_recipe_seeds_written
        ensure_recipe_seeds_written(self.tmpdir / ".pupu" / "agent_recipes")

        self.app = miso_app.create_app()
        self.client = self.app.test_client()

    def test_list_returns_default(self):
        resp = self.client.get("/agent_recipes")
        self.assertEqual(resp.status_code, 200)
        body = resp.get_json()
        names = [r["name"] for r in body["recipes"]]
        self.assertIn("Default", names)

    def test_get_returns_full_recipe(self):
        resp = self.client.get("/agent_recipes/Default")
        self.assertEqual(resp.status_code, 200)
        body = resp.get_json()
        self.assertEqual(body["name"], "Default")

    def test_get_returns_404_for_missing(self):
        resp = self.client.get("/agent_recipes/Ghost")
        self.assertEqual(resp.status_code, 404)

    def test_post_saves_new_recipe(self):
        payload = {
            "name": "Coder",
            "description": "",
            "model": None,
            "max_iterations": None,
            "agent": {"prompt_format": "soul", "prompt": "hi"},
            "toolkits": [],
            "subagent_pool": [],
        }
        resp = self.client.post(
            "/agent_recipes",
            headers={"Content-Type": "application/json"},
            data=json.dumps(payload),
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue((self.tmpdir / ".pupu" / "agent_recipes" / "Coder.recipe").exists())

    def test_post_rejects_invalid_name(self):
        payload = {
            "name": "bad/name",
            "description": "",
            "model": None,
            "max_iterations": None,
            "agent": {"prompt_format": "soul", "prompt": "x"},
            "toolkits": [],
            "subagent_pool": [],
        }
        resp = self.client.post(
            "/agent_recipes",
            headers={"Content-Type": "application/json"},
            data=json.dumps(payload),
        )
        self.assertEqual(resp.status_code, 400)

    def test_delete_removes_recipe(self):
        self.client.post(
            "/agent_recipes",
            headers={"Content-Type": "application/json"},
            data=json.dumps({
                "name": "Tmp",
                "description": "",
                "model": None,
                "max_iterations": None,
                "agent": {"prompt_format": "soul", "prompt": "x"},
                "toolkits": [],
                "subagent_pool": [],
            }),
        )
        resp = self.client.delete("/agent_recipes/Tmp")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse((self.tmpdir / ".pupu" / "agent_recipes" / "Tmp.recipe").exists())

    def test_delete_refuses_default(self):
        resp = self.client.delete("/agent_recipes/Default")
        self.assertEqual(resp.status_code, 400)

    def test_subagent_refs_list(self):
        sa_dir = self.tmpdir / ".pupu" / "subagents"
        sa_dir.mkdir(parents=True)
        (sa_dir / "Explore.skeleton").write_text(
            json.dumps({"name": "Explore", "description": "scout", "instructions": "x"})
        )
        resp = self.client.get("/agent_recipes/subagent_refs")
        self.assertEqual(resp.status_code, 200)
        names = [r["name"] for r in resp.get_json()["refs"]]
        self.assertIn("Explore", names)


class RecipeRoutesAuthTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.tmpdir = Path(self._tmp.name)
        self.addCleanup(self._tmp.cleanup)
        self.env_patch = mock.patch.dict(
            os.environ, {"UNCHAIN_AUTH_TOKEN": "secret"}, clear=False,
        )
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)
        self.home_patch = mock.patch("pathlib.Path.home", return_value=self.tmpdir)
        self.home_patch.start()
        self.addCleanup(self.home_patch.stop)
        self.app = miso_app.create_app()
        self.client = self.app.test_client()

    def test_unauthorized_without_token(self):
        resp = self.client.get("/agent_recipes")
        self.assertEqual(resp.status_code, 401)


if __name__ == "__main__":
    unittest.main()
