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
        self.assertEqual(recipe.subagent_profile.allowed_modes, ("delegate",))
        self.assertEqual(recipe.subagent_profile.output_mode, "summary")
        self.assertEqual(recipe.subagent_profile.memory_policy, "ephemeral")
        self.assertIs(recipe.subagent_profile.parallel_safe, False)

    def test_parses_worker_safe_subagent_profile(self):
        data = self._minimal()
        data["subagent_profile"] = {
            "allowed_modes": ["delegate", "worker"],
            "output_mode": "last_message",
            "memory_policy": "scoped_persistent",
            "parallel_safe": True,
        }

        recipe = parse_recipe_json(data)

        self.assertEqual(
            recipe.subagent_profile.allowed_modes,
            ("delegate", "worker"),
        )
        self.assertEqual(recipe.subagent_profile.output_mode, "last_message")
        self.assertEqual(
            recipe.subagent_profile.memory_policy,
            "scoped_persistent",
        )
        self.assertIs(recipe.subagent_profile.parallel_safe, True)

    def test_rejects_worker_mode_without_parallel_safety(self):
        data = self._minimal()
        data["subagent_profile"] = {
            "allowed_modes": ["delegate", "worker"],
            "parallel_safe": False,
        }

        with self.assertRaisesRegex(
            RecipeValidationError,
            "worker mode requires parallel_safe=true",
        ):
            parse_recipe_json(data)

    def test_rejects_invalid_subagent_profile_values(self):
        invalid_profiles = (
            {"allowed_modes": []},
            {"allowed_modes": ["delegate", "delegate"]},
            {"allowed_modes": ["magic"]},
            {"output_mode": "raw"},
            {"memory_policy": "global"},
            {"parallel_safe": "yes"},
        )
        for profile in invalid_profiles:
            with self.subTest(profile=profile):
                data = self._minimal()
                data["subagent_profile"] = profile
                with self.assertRaises(RecipeValidationError):
                    parse_recipe_json(data)

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

    def test_parses_recipe_subagent_ref(self):
        data = self._minimal()
        data["subagent_pool"] = [
            {"kind": "recipe_ref", "recipe_name": "Explore", "disabled_tools": ["shell"]}
        ]
        recipe = parse_recipe_json(data)
        entry = recipe.subagent_pool[0]
        self.assertEqual(entry.kind, "recipe_ref")
        self.assertEqual(entry.recipe_name, "Explore")
        self.assertEqual(entry.disabled_tools, ("shell",))

    def test_rejects_recipe_subagent_ref_without_recipe_name(self):
        data = self._minimal()
        data["subagent_pool"] = [{"kind": "recipe_ref"}]
        with self.assertRaises(RecipeValidationError):
            parse_recipe_json(data)

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

    def test_merge_with_user_selected_defaults_to_true(self):
        recipe = parse_recipe_json(self._minimal())
        self.assertIs(recipe.merge_with_user_selected, True)

    def test_merge_with_user_selected_false_round_trip(self):
        data = self._minimal()
        data["merge_with_user_selected"] = False
        recipe = parse_recipe_json(data)
        self.assertIs(recipe.merge_with_user_selected, False)

    def test_merge_with_user_selected_must_be_bool(self):
        data = self._minimal()
        data["merge_with_user_selected"] = "yes"
        with self.assertRaises(RecipeValidationError):
            parse_recipe_json(data)

    def _graph_recipe(self):
        data = self._minimal()
        data["nodes"] = [
            {"id": "start", "type": "start", "outputs": [{"name": "text", "type": "string"}]},
            {"id": "a1", "type": "agent", "override": {"prompt": "{{#start.text#}}"}, "outputs": [{"name": "output", "type": "string"}]},
            {"id": "a2", "type": "agent", "override": {"prompt": "{{#a1.output#}}"}, "outputs": [{"name": "output", "type": "string"}]},
            {"id": "end", "type": "end"},
            {"id": "tp", "type": "toolpool", "toolkits": [{"id": "core"}], "merge_with_user_selected": True},
        ]
        data["edges"] = [
            {"id": "e1", "kind": "flow", "source_node_id": "start", "source_port_id": "out", "target_node_id": "a1", "target_port_id": "in"},
            {"id": "e2", "kind": "flow", "source_node_id": "a1", "source_port_id": "out", "target_node_id": "a2", "target_port_id": "in"},
            {"id": "e3", "kind": "flow", "source_node_id": "a2", "source_port_id": "out", "target_node_id": "end", "target_port_id": "in"},
            {"id": "a1tp", "kind": "attach", "source_node_id": "a1", "source_port_id": "attach_top", "target_node_id": "tp", "target_port_id": "attach_bot"},
        ]
        return data

    def test_parses_and_preserves_graph_fields(self):
        recipe = parse_recipe_json(self._graph_recipe())
        self.assertEqual(len(recipe.nodes), 5)
        self.assertEqual(len(recipe.edges), 4)
        self.assertEqual(recipe.nodes[-1]["type"], "toolkit_pool")

    def test_rejects_non_string_graph_edge_kind(self):
        for invalid_kind in (["flow"], {"kind": "flow"}):
            with self.subTest(invalid_kind=invalid_kind):
                data = self._graph_recipe()
                data["edges"][0]["kind"] = invalid_kind

                with self.assertRaisesRegex(
                    RecipeValidationError,
                    "kind must be a string or null",
                ):
                    parse_recipe_json(data)

    def test_rejects_non_string_graph_prompt_formats(self):
        for invalid_format in (["soul"], {"format": "soul"}):
            with self.subTest(location="agent", invalid_format=invalid_format):
                data = self._graph_recipe()
                data["nodes"][1]["override"]["prompt_format"] = invalid_format

                with self.assertRaisesRegex(
                    RecipeValidationError,
                    "override.prompt_format must be soul or skeleton",
                ):
                    parse_recipe_json(data)

            with self.subTest(location="subagent", invalid_format=invalid_format):
                data = self._graph_recipe()
                data["nodes"].append(
                    {
                        "id": "sp",
                        "type": "subagent_pool",
                        "subagents": [
                            {
                                "kind": "inline",
                                "name": "Reviewer",
                                "prompt_format": invalid_format,
                                "template": {},
                                "disabled_tools": [],
                            }
                        ],
                    }
                )
                data["edges"].append(
                    {
                        "id": "a1sp",
                        "kind": "attach",
                        "source_node_id": "a1",
                        "source_port_id": "attach_top",
                        "target_node_id": "sp",
                        "target_port_id": "attach_bot",
                    }
                )

                with self.assertRaisesRegex(
                    RecipeValidationError,
                    "subagents.*prompt_format must be soul or skeleton",
                ):
                    parse_recipe_json(data)

    def test_graph_inline_subagent_prompt_format_may_be_omitted(self):
        data = self._graph_recipe()
        data["nodes"].append(
            {
                "id": "sp",
                "type": "subagent_pool",
                "subagents": [
                    {
                        "kind": "inline",
                        "name": "Reviewer",
                        "template": {},
                        "disabled_tools": [],
                    }
                ],
            }
        )
        data["edges"].append(
            {
                "id": "a1sp",
                "kind": "attach",
                "source_node_id": "a1",
                "source_port_id": "attach_top",
                "target_node_id": "sp",
                "target_port_id": "attach_bot",
            }
        )

        recipe = parse_recipe_json(data)

        subagent_pool = next(node for node in recipe.nodes if node["id"] == "sp")
        self.assertNotIn("prompt_format", subagent_pool["subagents"][0])

    def test_rejects_branching_graph(self):
        data = self._graph_recipe()
        data["nodes"].insert(3, {"id": "a3", "type": "agent", "outputs": [{"name": "output", "type": "string"}]})
        data["edges"].append({"id": "branch", "kind": "flow", "source_node_id": "start", "source_port_id": "out", "target_node_id": "a3", "target_port_id": "in"})
        with self.assertRaises(RecipeValidationError):
            parse_recipe_json(data)

    def test_rejects_missing_variable_reference(self):
        data = self._graph_recipe()
        data["nodes"][1]["override"]["prompt"] = "{{#a2.output#}}"
        with self.assertRaises(RecipeValidationError):
            parse_recipe_json(data)


if __name__ == "__main__":
    unittest.main()
