import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import unchain_adapter  # noqa: E402
from skill_packs import (  # noqa: E402
    SkillPackError,
    delete_skill_pack,
    get_installed_skill_pack,
    install_skill_pack,
    list_installed_skill_packs,
)


def _pack(toolkit_id="skillpack.superpowers", name="Superpowers", skills=None):
    return {
        "toolkitId": toolkit_id,
        "toolkitName": name,
        "toolkitDescription": "A pack",
        "skills": skills
        if skills is not None
        else [
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


class SkillPackStoreTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.data_dir = Path(self._tmp.name)

    def tearDown(self):
        self._tmp.cleanup()

    def test_install_persists_and_lists_pure_skill_pack(self):
        result = install_skill_pack(_pack(), data_dir=self.data_dir)
        tk = result["toolkit"]
        self.assertEqual(tk["toolkitId"], "skillpack.superpowers")
        self.assertEqual(tk["source"], "skillpack")
        self.assertEqual(tk["tools"], [])
        self.assertEqual(tk["toolCount"], 0)
        self.assertEqual(len(tk["skills"]), 1)
        self.assertEqual(tk["skills"][0]["name"], "brainstorming")
        self.assertEqual(tk["skills"][0]["phase"], "composer")

        listed = list_installed_skill_packs(data_dir=self.data_dir)
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]["toolkitId"], "skillpack.superpowers")

    def test_install_rejects_non_skillpack_id(self):
        with self.assertRaises(SkillPackError) as ctx:
            install_skill_pack(_pack(toolkit_id="mcp.custom.x"), data_dir=self.data_dir)
        self.assertEqual(ctx.exception.code, "invalid_skill_pack")

    def test_install_rejects_pack_with_no_valid_skills(self):
        with self.assertRaises(SkillPackError) as ctx:
            install_skill_pack(_pack(skills=[{"name": "", "body": ""}]), data_dir=self.data_dir)
        self.assertEqual(ctx.exception.code, "skill_pack_empty")

    def test_duplicate_install_is_409(self):
        install_skill_pack(_pack(), data_dir=self.data_dir)
        with self.assertRaises(SkillPackError) as ctx:
            install_skill_pack(_pack(), data_dir=self.data_dir)
        self.assertEqual(ctx.exception.code, "skill_pack_already_installed")
        self.assertEqual(ctx.exception.status, 409)

    def test_delete_removes_pack(self):
        install_skill_pack(_pack(), data_dir=self.data_dir)
        delete_skill_pack("skillpack.superpowers", data_dir=self.data_dir)
        self.assertEqual(list_installed_skill_packs(data_dir=self.data_dir), [])
        self.assertIsNone(get_installed_skill_pack("skillpack.superpowers", data_dir=self.data_dir))

    def test_delete_missing_is_404(self):
        with self.assertRaises(SkillPackError) as ctx:
            delete_skill_pack("skillpack.nope", data_dir=self.data_dir)
        self.assertEqual(ctx.exception.status, 404)

    def test_store_normalizes_untrusted_client_skills(self):
        # A row with an illegal command name is dropped by normalize_skill_rows,
        # so the store never surfaces garbage into the catalog.
        pack = _pack(
            skills=[
                {"name": "good", "description": "d", "body": "b", "phase": "composer"},
                {"name": "has spaces", "description": "d", "body": "b"},
            ]
        )
        result = install_skill_pack(pack, data_dir=self.data_dir)
        names = [s["name"] for s in result["toolkit"]["skills"]]
        self.assertEqual(names, ["good"])


class SkillPackCatalogTests(unittest.TestCase):
    def test_catalog_v2_appends_installed_skill_packs(self):
        with mock.patch.object(unchain_adapter, "_resolve_toolkit_base", return_value=None), \
             mock.patch.object(unchain_adapter, "list_installed_mcp_toolkits", return_value=[]), \
             mock.patch.object(
                 unchain_adapter,
                 "list_installed_skill_packs",
                 return_value=[
                     {
                         "toolkitId": "skillpack.superpowers",
                         "toolkitName": "Superpowers",
                         "toolkitDescription": "A pack",
                         "toolkitIcon": {"type": "builtin", "name": "command"},
                         "source": "skillpack",
                         "tools": [],
                         "skills": [
                             {
                                 "name": "brainstorming",
                                 "title": "Brainstorming",
                                 "description": "Explore intent",
                                 "body": "# Brainstorming",
                                 "phase": "composer",
                                 "tools": [],
                             }
                         ],
                     }
                 ],
             ):
            payload = unchain_adapter.get_toolkit_catalog_v2()

        entry = next(
            e for e in payload["toolkits"] if e["toolkitId"] == "skillpack.superpowers"
        )
        self.assertEqual(entry["tools"], [])
        self.assertEqual(entry["source"], "skillpack")
        self.assertEqual(entry["skills"][0]["name"], "brainstorming")

    def test_installing_skill_pack_never_opens_an_mcp_connection(self):
        """Architect M6: a pure skill plugin must not trigger any MCP connect.
        The install path is validate-and-write only; assert the MCP runtime
        factory / connect machinery is never invoked while installing and then
        surfacing a pack through catalog v2."""
        with tempfile.TemporaryDirectory() as tmp:
            data_dir = Path(tmp)
            with mock.patch("mcp_toolkits._default_toolkit_factory") as factory, \
                 mock.patch("mcp_toolkits._discover_tools") as discover, \
                 mock.patch("mcp_toolkits.build_mcp_runtime_toolkit") as build_runtime:
                install_skill_pack(_pack(), data_dir=data_dir)
                packs = list_installed_skill_packs(data_dir=data_dir)

                factory.assert_not_called()
                discover.assert_not_called()
                build_runtime.assert_not_called()

            self.assertEqual(packs[0]["toolkitId"], "skillpack.superpowers")


if __name__ == "__main__":
    unittest.main()
