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
            self.assertTrue(default_path.exists())

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


if __name__ == "__main__":
    unittest.main()
