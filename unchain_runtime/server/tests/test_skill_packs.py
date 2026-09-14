import os
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
    SKILL_BODY_MAX_BYTES,
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

    def test_install_drops_bodies_over_the_64kb_cap(self):
        # The backend is the authority on the body cap (M2): an over-cap skill
        # is rejected even if a caller bypasses the renderer, while valid skills
        # in the same pack still install.
        oversize = "x" * (SKILL_BODY_MAX_BYTES + 1)
        pack = _pack(
            skills=[
                {"name": "small", "description": "d", "body": "ok", "phase": "composer"},
                {"name": "huge", "description": "d", "body": oversize, "phase": "composer"},
            ]
        )
        result = install_skill_pack(pack, data_dir=self.data_dir)
        names = [s["name"] for s in result["toolkit"]["skills"]]
        self.assertEqual(names, ["small"])

    def test_install_rejects_pack_that_is_only_over_cap_bodies(self):
        oversize = "x" * (SKILL_BODY_MAX_BYTES + 1)
        pack = _pack(
            skills=[{"name": "huge", "description": "d", "body": oversize, "phase": "composer"}]
        )
        with self.assertRaises(SkillPackError) as ctx:
            install_skill_pack(pack, data_dir=self.data_dir)
        self.assertEqual(ctx.exception.code, "skill_pack_empty")

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


class SkillPackRuntimeTests(unittest.TestCase):
    def test_installed_skill_commands_need_no_executable_toolkit(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": tmp}):
            ids = ["skillpack.trailofbits-audit-prep", "skillpack.vercel-web-review"]
            for toolkit_id in ids:
                install_skill_pack(_pack(toolkit_id=toolkit_id))
            # Read the real persisted catalog, as a fresh sidecar would.
            selected = [pack["toolkitId"] for pack in list_installed_skill_packs()]
            with mock.patch.object(unchain_adapter, "build_mcp_runtime_toolkit") as mcp, \
                 mock.patch.object(unchain_adapter, "_build_generic_toolkit") as generic:
                for _ in range(2):
                    self.assertEqual(unchain_adapter._build_selected_toolkits({"toolkits": selected}), [])
                self.assertEqual(unchain_adapter._build_toolkits_by_ids(selected, {"_recipe_subagent_run": True}), [])
                mcp.assert_not_called()
                generic.assert_not_called()

    def test_skill_selection_preserves_mcp_and_builtin_tools(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": tmp}):
            install_skill_pack(_pack())
            mcp_toolkit, builtin_toolkit = object(), object()
            with mock.patch.object(unchain_adapter, "build_mcp_runtime_toolkit", return_value=mcp_toolkit) as mcp, \
                 mock.patch.object(unchain_adapter, "_build_builtin_toolkit", return_value=builtin_toolkit) as builtin:
                result = unchain_adapter._build_selected_toolkits({
                    "toolkits": ["skillpack.superpowers", "mcp.memory.memory", "builtin.computer"]
                })
                self.assertEqual(result, [mcp_toolkit, builtin_toolkit])
                mcp.assert_called_once_with("mcp.memory.memory")
                self.assertEqual(builtin.call_count, 1)

    def test_missing_deleted_and_wrong_identity_remain_blocked(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": tmp}):
            install_skill_pack(_pack())
            for toolkit_id in ["skillpack.missing", "skillpack.Superpowers", "skillpack."]:
                with self.subTest(toolkit_id=toolkit_id), self.assertRaisesRegex(RuntimeError, "Requested toolkit is unavailable"):
                    unchain_adapter._build_selected_toolkits({"toolkits": [toolkit_id]})
            delete_skill_pack("skillpack.superpowers")
            with self.assertRaisesRegex(RuntimeError, "Requested toolkit is unavailable"):
                unchain_adapter._build_selected_toolkits({"toolkits": ["skillpack.superpowers"]})
            install_skill_pack(_pack())
            self.assertEqual(unchain_adapter._build_selected_toolkits({"toolkits": ["skillpack.superpowers"]}), [])

    def test_unknown_generic_toolkit_is_not_hidden_by_valid_skill(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.dict(os.environ, {"UNCHAIN_DATA_DIR": tmp}):
            install_skill_pack(_pack())
            with self.assertRaisesRegex(RuntimeError, "Requested toolkit is unavailable: MissingToolkit283"):
                unchain_adapter._build_selected_toolkits({"toolkits": ["skillpack.superpowers", "MissingToolkit283"]})


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
