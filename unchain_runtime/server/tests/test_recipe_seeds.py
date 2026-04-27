import json
import tempfile
import unittest
from pathlib import Path

from recipe import parse_recipe_json
from recipe_seeds import ensure_recipe_seeds_written


class EnsureRecipeSeedsTests(unittest.TestCase):
    def test_creates_default_recipe_when_dir_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            target_dir = Path(tmp) / ".pupu" / "agent_recipes"
            ensure_recipe_seeds_written(target_dir)
            default_path = target_dir / "Default.recipe"
            explore_path = target_dir / "Explore.recipe"
            self.assertTrue(default_path.exists())
            self.assertTrue(explore_path.exists())

    def test_idempotent_does_not_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            target_dir = Path(tmp) / ".pupu" / "agent_recipes"
            target_dir.mkdir(parents=True)
            default_path = target_dir / "Default.recipe"
            default_path.write_text("{ user modified }")
            ensure_recipe_seeds_written(target_dir)
            self.assertEqual(default_path.read_text(), "{ user modified }")

    def test_respects_user_deletion(self):
        with tempfile.TemporaryDirectory() as tmp:
            target_dir = Path(tmp) / ".pupu" / "agent_recipes"
            ensure_recipe_seeds_written(target_dir)
            (target_dir / "Default.recipe").unlink()
            ensure_recipe_seeds_written(target_dir)
            self.assertTrue((target_dir / "Default.recipe").exists())

    def test_default_recipe_parses_cleanly(self):
        with tempfile.TemporaryDirectory() as tmp:
            target_dir = Path(tmp) / ".pupu" / "agent_recipes"
            ensure_recipe_seeds_written(target_dir)
            data = json.loads((target_dir / "Default.recipe").read_text())
            recipe = parse_recipe_json(data)
            self.assertEqual(recipe.name, "Default")
            self.assertEqual(
                recipe.agent.prompt,
                "{{USE_BUILTIN_DEVELOPER_PROMPT}}",
            )
            self.assertEqual(recipe.subagent_pool[0].kind, "recipe_ref")
            self.assertEqual(recipe.subagent_pool[0].recipe_name, "Explore")

    def test_explore_recipe_parses_cleanly(self):
        with tempfile.TemporaryDirectory() as tmp:
            target_dir = Path(tmp) / ".pupu" / "agent_recipes"
            ensure_recipe_seeds_written(target_dir)
            data = json.loads((target_dir / "Explore.recipe").read_text())
            recipe = parse_recipe_json(data)
            self.assertEqual(recipe.name, "Explore")
            self.assertTrue(recipe.nodes)
            self.assertIn("You are Explore", recipe.agent.prompt)

    def test_migrates_legacy_default_seed(self):
        with tempfile.TemporaryDirectory() as tmp:
            target_dir = Path(tmp) / ".pupu" / "agent_recipes"
            target_dir.mkdir(parents=True)
            default_path = target_dir / "Default.recipe"
            default_path.write_text(
                json.dumps({
                    "name": "Default",
                    "description": "PuPu 默认 agent 配置（复刻内置行为）",
                    "model": None,
                    "max_iterations": None,
                    "merge_with_user_selected": True,
                    "agent": {
                        "prompt_format": "skeleton",
                        "prompt": "{{USE_BUILTIN_DEVELOPER_PROMPT}}",
                    },
                    "toolkits": [{"id": "core", "enabled_tools": None}],
                    "subagent_pool": [
                        {"kind": "ref", "template_name": "Explore", "disabled_tools": []}
                    ],
                }),
                encoding="utf-8",
            )
            ensure_recipe_seeds_written(target_dir)
            data = json.loads(default_path.read_text(encoding="utf-8"))
            self.assertEqual(data["subagent_pool"][0]["kind"], "recipe_ref")


if __name__ == "__main__":
    unittest.main()
