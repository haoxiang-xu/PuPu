"""Tests for unchain_adapter._resolve_recipe_toolkits merge semantics."""
import unittest
from types import SimpleNamespace
from unittest import mock

from recipe import Recipe, RecipeAgent, ToolkitRef


def _tk(tk_id, tools=None):
    return SimpleNamespace(id=tk_id, name=tk_id, tools=dict(tools or {}))


def _tk_with_runtime_meta(tk_id, tools=None):
    toolkit = SimpleNamespace(tools=dict(tools or {}))
    setattr(toolkit, "_pupu_toolkit_id", tk_id)
    setattr(toolkit, "_pupu_toolkit_name", tk_id)
    return toolkit


def _make_recipe(refs, *, merge=True):
    return Recipe(
        name="T",
        description="",
        model=None,
        max_iterations=None,
        agent=RecipeAgent(prompt_format="soul", prompt=""),
        toolkits=tuple(refs),
        subagent_pool=(),
        merge_with_user_selected=merge,
    )


class ResolveRecipeToolkitsTests(unittest.TestCase):
    def test_merge_off_returns_only_recipe_toolkits_already_in_user_selection(self):
        from unchain_adapter import _resolve_recipe_toolkits

        user = [
            _tk("core", {"read": object(), "write": object()}),
            _tk("external_api", {"fetch": object()}),
        ]
        recipe = _make_recipe(
            [ToolkitRef(id="external_api", enabled_tools=None)], merge=False
        )

        out = _resolve_recipe_toolkits(user, recipe, options=None)
        self.assertEqual([tk.id for tk in out], ["external_api"])

    def test_merge_on_unions_user_with_recipe_already_in_user(self):
        from unchain_adapter import _resolve_recipe_toolkits

        user = [
            _tk("core", {"read": object()}),
            _tk("external_api", {"fetch": object()}),
        ]
        recipe = _make_recipe(
            [ToolkitRef(id="external_api", enabled_tools=None)], merge=True
        )

        out = _resolve_recipe_toolkits(user, recipe, options=None)
        self.assertEqual(sorted(tk.id for tk in out), ["core", "external_api"])

    def test_recipe_narrowing_applies_in_merge_on(self):
        from unchain_adapter import _resolve_recipe_toolkits

        user = [_tk("core", {"read": object(), "grep": object(), "write": object()})]
        recipe = _make_recipe(
            [ToolkitRef(id="core", enabled_tools=("read", "grep"))], merge=True
        )

        out = _resolve_recipe_toolkits(user, recipe, options=None)
        self.assertEqual(len(out), 1)
        self.assertEqual(set(out[0].tools.keys()), {"read", "grep"})

    def test_recipe_narrowing_uses_runtime_toolkit_metadata(self):
        from unchain_adapter import _resolve_recipe_toolkits

        user = [
            _tk_with_runtime_meta(
                "core",
                {"read": object(), "grep": object(), "write": object()},
            ),
        ]
        recipe = _make_recipe(
            [ToolkitRef(id="core", enabled_tools=("read", "grep"))], merge=True
        )

        out = _resolve_recipe_toolkits(user, recipe, options=None)
        self.assertEqual(len(out), 1)
        self.assertEqual(set(out[0].tools.keys()), {"read", "grep"})

    def test_unknown_toolkit_is_skipped_with_warning(self):
        from unchain_adapter import _resolve_recipe_toolkits

        user = [_tk("core", {"read": object()})]
        recipe = _make_recipe(
            [ToolkitRef(id="ghost", enabled_tools=None)], merge=False
        )

        out = _resolve_recipe_toolkits(user, recipe, options=None)
        self.assertEqual(out, [])

    def test_merge_on_builds_recipe_toolkit_missing_from_user(self):
        """When merge=True and recipe references a toolkit not in user
        selection, _resolve_recipe_toolkits asks _build_toolkits_by_ids to
        synthesize it."""
        import unchain_adapter as ua

        user = [_tk("core", {"read": object()})]
        recipe = _make_recipe(
            [ToolkitRef(id="external_api", enabled_tools=None)], merge=True
        )

        synth = _tk("external_api", {"fetch": object()})

        with mock.patch.object(
            ua, "_build_toolkits_by_ids", return_value=[synth]
        ) as m:
            out = ua._resolve_recipe_toolkits(user, recipe, options={"x": 1})

        m.assert_called_once_with(["external_api"], {"x": 1})
        self.assertEqual(sorted(tk.id for tk in out), ["core", "external_api"])

    def test_merge_off_builds_recipe_only_toolkit(self):
        """When merge=False and recipe references a toolkit not in user
        selection, the toolkit is still built; user toolkits are dropped."""
        import unchain_adapter as ua

        user = [_tk("core", {"read": object()})]
        recipe = _make_recipe(
            [ToolkitRef(id="external_api", enabled_tools=None)], merge=False
        )

        synth = _tk("external_api", {"fetch": object()})

        with mock.patch.object(
            ua, "_build_toolkits_by_ids", return_value=[synth]
        ):
            out = ua._resolve_recipe_toolkits(user, recipe, options=None)

        self.assertEqual([tk.id for tk in out], ["external_api"])


class BuildToolkitsByIdsTests(unittest.TestCase):
    def test_empty_input_returns_empty(self):
        from unchain_adapter import _build_toolkits_by_ids

        self.assertEqual(_build_toolkits_by_ids([], None), [])

    def test_calls_build_selected_toolkits_per_id_and_collects(self):
        import unchain_adapter as ua

        synth_a = _tk("a", {"x": object()})
        synth_b = _tk("b", {"y": object()})

        def fake_build(opts):
            name = opts.get("toolkits", [None])[0]
            if name == "a":
                return [synth_a]
            if name == "b":
                return [synth_b]
            return []

        with mock.patch.object(ua, "_build_selected_toolkits", side_effect=fake_build):
            out = ua._build_toolkits_by_ids(["a", "b"], {"workspaceRoot": "/w"})

        self.assertEqual([t.id for t in out], ["a", "b"])

    def test_runtime_error_for_one_id_does_not_break_others(self):
        import unchain_adapter as ua

        synth = _tk("ok", {"x": object()})

        def fake_build(opts):
            name = opts.get("toolkits", [None])[0]
            if name == "broken":
                raise RuntimeError("not available")
            return [synth]

        with mock.patch.object(ua, "_build_selected_toolkits", side_effect=fake_build):
            out = ua._build_toolkits_by_ids(["broken", "ok"], None)

        self.assertEqual([t.id for t in out], ["ok"])


if __name__ == "__main__":
    unittest.main()
