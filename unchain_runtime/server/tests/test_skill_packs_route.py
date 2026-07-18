import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import app as miso_app  # noqa: E402
import routes as miso_routes  # noqa: E402


def _pack():
    return {
        "toolkitId": "skillpack.superpowers",
        "toolkitName": "Superpowers",
        "toolkitDescription": "A pack",
        "skills": [
            {
                "name": "brainstorming",
                "title": "Brainstorming",
                "description": "Explore intent",
                "body": "# Brainstorming\n\nExplore before building.",
                "phase": "composer",
                "tools": [],
            }
        ],
    }


class SkillPackRouteTests(unittest.TestCase):
    def setUp(self):
        self.app = miso_app.create_app()
        self.app.config["TESTING"] = True
        self.client = self.app.test_client()
        self._auth = mock.patch.object(miso_routes, "_is_authorized", return_value=True)
        self._auth.start()

    def tearDown(self):
        self._auth.stop()

    def test_install_list_delete_round_trip(self):
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.dict("os.environ", {"UNCHAIN_DATA_DIR": tmp}):
                install = self.client.post("/skillpacks/install", json={"pack": _pack()})
                self.assertEqual(install.status_code, 200)
                self.assertEqual(
                    install.get_json()["toolkit"]["toolkitId"], "skillpack.superpowers"
                )

                listed = self.client.get("/skillpacks")
                self.assertEqual(listed.status_code, 200)
                self.assertEqual(listed.get_json()["count"], 1)

                dup = self.client.post("/skillpacks/install", json={"pack": _pack()})
                self.assertEqual(dup.status_code, 409)

                deleted = self.client.delete("/skillpacks/skillpack.superpowers")
                self.assertEqual(deleted.status_code, 200)
                self.assertEqual(self.client.get("/skillpacks").get_json()["count"], 0)

    def test_install_invalid_pack_returns_error_code(self):
        with tempfile.TemporaryDirectory() as tmp:
            with mock.patch.dict("os.environ", {"UNCHAIN_DATA_DIR": tmp}):
                resp = self.client.post("/skillpacks/install", json={"pack": {"toolkitId": "mcp.x"}})
                self.assertEqual(resp.status_code, 400)


if __name__ == "__main__":
    unittest.main()
