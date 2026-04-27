import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from recipe_loader import (
    delete_recipe,
    list_recipes,
    list_subagent_refs,
    load_recipe,
    recipes_dir,
    save_recipe,
)


class RecipesDirTests(unittest.TestCase):
    def test_uses_user_home(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                self.assertEqual(
                    recipes_dir(), Path(tmp) / ".pupu" / "agent_recipes"
                )


class ListRecipesTests(unittest.TestCase):
    def test_returns_empty_list_when_dir_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                self.assertEqual(list_recipes(), [])

    def test_lists_valid_recipes(self):
        with tempfile.TemporaryDirectory() as tmp:
            recipe_dir = Path(tmp) / ".pupu" / "agent_recipes"
            recipe_dir.mkdir(parents=True)
            (recipe_dir / "Coder.recipe").write_text(
                json.dumps({
                    "name": "Coder",
                    "description": "code",
                    "model": "anthropic:claude-sonnet-4-6",
                    "max_iterations": 30,
                    "agent": {"prompt_format": "soul", "prompt": "x"},
                    "toolkits": [{"id": "core", "enabled_tools": None}],
                    "subagent_pool": [],
                })
            )
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                recipes = list_recipes()
                self.assertEqual(len(recipes), 1)
                self.assertEqual(recipes[0]["name"], "Coder")
                self.assertEqual(recipes[0]["description"], "code")
                self.assertEqual(recipes[0]["model"], "anthropic:claude-sonnet-4-6")
                self.assertEqual(recipes[0]["toolkit_ids"], ["core"])
                self.assertEqual(recipes[0]["subagent_count"], 0)

    def test_skips_broken_recipes_with_warn(self):
        with tempfile.TemporaryDirectory() as tmp:
            recipe_dir = Path(tmp) / ".pupu" / "agent_recipes"
            recipe_dir.mkdir(parents=True)
            (recipe_dir / "Bad.recipe").write_text("{ not json")
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                self.assertEqual(list_recipes(), [])


class LoadRecipeTests(unittest.TestCase):
    def test_returns_none_when_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                self.assertIsNone(load_recipe("Ghost"))

    def test_loads_valid_recipe(self):
        with tempfile.TemporaryDirectory() as tmp:
            recipe_dir = Path(tmp) / ".pupu" / "agent_recipes"
            recipe_dir.mkdir(parents=True)
            (recipe_dir / "Coder.recipe").write_text(
                json.dumps({
                    "name": "Coder",
                    "description": "",
                    "model": None,
                    "max_iterations": None,
                    "agent": {"prompt_format": "soul", "prompt": "hi"},
                    "toolkits": [],
                    "subagent_pool": [],
                })
            )
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                recipe = load_recipe("Coder")
                self.assertIsNotNone(recipe)
                self.assertEqual(recipe.name, "Coder")

    def test_returns_none_for_invalid_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                self.assertIsNone(load_recipe("bad/name"))


class SaveRecipeTests(unittest.TestCase):
    def _valid_dict(self, name="NewRecipe"):
        return {
            "name": name,
            "description": "",
            "model": None,
            "max_iterations": None,
            "agent": {"prompt_format": "soul", "prompt": "x"},
            "toolkits": [],
            "subagent_pool": [],
        }

    def test_save_writes_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                save_recipe(self._valid_dict("MyAgent"))
                expected = Path(tmp) / ".pupu" / "agent_recipes" / "MyAgent.recipe"
                self.assertTrue(expected.exists())

    def test_save_roundtrip(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                save_recipe(self._valid_dict("Rt"))
                loaded = load_recipe("Rt")
                self.assertIsNotNone(loaded)
                self.assertEqual(loaded.name, "Rt")

    def test_save_rejects_invalid_name(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                with self.assertRaises(ValueError):
                    save_recipe(self._valid_dict("bad/name"))

    def test_save_rejects_invalid_schema(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                bad = self._valid_dict("Valid")
                bad["agent"]["prompt_format"] = "xml"
                with self.assertRaises(ValueError):
                    save_recipe(bad)


class DeleteRecipeTests(unittest.TestCase):
    def test_delete_removes_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                save_recipe({
                    "name": "Gone",
                    "description": "",
                    "model": None,
                    "max_iterations": None,
                    "agent": {"prompt_format": "soul", "prompt": "x"},
                    "toolkits": [],
                    "subagent_pool": [],
                })
                delete_recipe("Gone")
                self.assertIsNone(load_recipe("Gone"))

    def test_delete_rejects_default(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                with self.assertRaises(ValueError):
                    delete_recipe("Default")

    def test_delete_missing_is_noop(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                delete_recipe("NotThere")


class ListSubagentRefsTests(unittest.TestCase):
    def test_empty_when_dir_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                self.assertEqual(list_subagent_refs(), [])

    def test_lists_soul_and_skeleton(self):
        with tempfile.TemporaryDirectory() as tmp:
            sa_dir = Path(tmp) / ".pupu" / "subagents"
            sa_dir.mkdir(parents=True)
            (sa_dir / "Explore.skeleton").write_text(
                json.dumps({
                    "name": "Explore",
                    "description": "scout",
                    "instructions": "look",
                })
            )
            (sa_dir / "Reviewer.soul").write_text(
                "---\nname: Reviewer\ndescription: reviews\n---\nBody\n"
            )
            with patch("pathlib.Path.home", return_value=Path(tmp)):
                refs = list_subagent_refs()
                names = {r["name"] for r in refs}
                self.assertEqual(names, {"Explore", "Reviewer"})
                formats = {r["name"]: r["format"] for r in refs}
                self.assertEqual(formats["Explore"], "skeleton")
                self.assertEqual(formats["Reviewer"], "soul")


if __name__ == "__main__":
    unittest.main()
