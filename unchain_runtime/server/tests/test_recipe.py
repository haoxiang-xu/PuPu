import unittest
from recipe import parse_recipe_json, RecipeValidationError


class ParseRecipeTests(unittest.TestCase):
    def _minimal(self):
        return {
            "name": "Coder",
            "description": "",
            "model": None,
            "max_iterations": None,
            "agent": {"prompt_format": "soul", "prompt": "You are..."},
            "toolkits": [],
            "subagent_pool": [],
        }

    def test_parses_minimal_recipe(self):
        recipe = parse_recipe_json(self._minimal())
        self.assertEqual(recipe.name, "Coder")
        self.assertIsNone(recipe.model)
        self.assertEqual(recipe.agent.prompt_format, "soul")
        self.assertEqual(recipe.toolkits, ())
        self.assertEqual(recipe.subagent_pool, ())

    def test_parses_toolkit_ref_with_enabled_tools(self):
        data = self._minimal()
        data["toolkits"] = [
            {"id": "core", "enabled_tools": None},
            {"id": "workspace", "enabled_tools": ["read", "grep"]},
        ]
        recipe = parse_recipe_json(data)
        self.assertIsNone(recipe.toolkits[0].enabled_tools)
        self.assertEqual(recipe.toolkits[1].enabled_tools, ("read", "grep"))

    def test_parses_subagent_ref(self):
        data = self._minimal()
        data["subagent_pool"] = [
            {"kind": "ref", "template_name": "Explore", "disabled_tools": ["shell"]}
        ]
        recipe = parse_recipe_json(data)
        entry = recipe.subagent_pool[0]
        self.assertEqual(entry.kind, "ref")
        self.assertEqual(entry.template_name, "Explore")
        self.assertEqual(entry.disabled_tools, ("shell",))

    def test_parses_inline_subagent(self):
        data = self._minimal()
        data["subagent_pool"] = [
            {
                "kind": "inline",
                "name": "Reviewer",
                "prompt_format": "skeleton",
                "template": {
                    "name": "Reviewer",
                    "description": "Reviews code",
                    "instructions": "Review carefully.",
                },
                "disabled_tools": [],
            }
        ]
        recipe = parse_recipe_json(data)
        entry = recipe.subagent_pool[0]
        self.assertEqual(entry.kind, "inline")
        self.assertEqual(entry.name, "Reviewer")
        self.assertEqual(entry.prompt_format, "skeleton")

    def test_rejects_invalid_name(self):
        data = self._minimal()
        data["name"] = "no/slashes"
        with self.assertRaises(RecipeValidationError):
            parse_recipe_json(data)

    def test_rejects_missing_agent(self):
        data = self._minimal()
        del data["agent"]
        with self.assertRaises(RecipeValidationError):
            parse_recipe_json(data)

    def test_rejects_unknown_prompt_format(self):
        data = self._minimal()
        data["agent"]["prompt_format"] = "xml"
        with self.assertRaises(RecipeValidationError):
            parse_recipe_json(data)

    def test_rejects_unknown_subagent_kind(self):
        data = self._minimal()
        data["subagent_pool"] = [{"kind": "magic"}]
        with self.assertRaises(RecipeValidationError):
            parse_recipe_json(data)


if __name__ == "__main__":
    unittest.main()
