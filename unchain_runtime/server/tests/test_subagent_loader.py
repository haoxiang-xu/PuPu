"""Tests for subagent_loader parsing primitives."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import subagent_loader  # noqa: E402
from subagent_loader import LoaderParseError, parse_skeleton, parse_soul  # noqa: E402


class SoulParserTests(unittest.TestCase):
    def _write(self, text: str) -> Path:
        tmp = tempfile.NamedTemporaryFile("w", suffix=".soul", delete=False, encoding="utf-8")
        tmp.write(text)
        tmp.close()
        return Path(tmp.name)

    def test_parse_minimal_valid_soul(self):
        p = self._write(
            "---\n"
            "name: HelperBot\n"
            "description: A helper.\n"
            "---\n"
            "You are a helper.\n"
        )
        parsed = parse_soul(p)
        self.assertEqual(parsed.name, "HelperBot")
        self.assertEqual(parsed.description, "A helper.")
        self.assertEqual(parsed.instructions, "You are a helper.")
        self.assertIsNone(parsed.allowed_tools)
        self.assertIsNone(parsed.model)
        self.assertEqual(parsed.allowed_modes, ("delegate", "worker"))
        self.assertEqual(parsed.output_mode, "summary")
        self.assertEqual(parsed.memory_policy, "ephemeral")
        self.assertTrue(parsed.parallel_safe)

    def test_parse_soul_with_tools_list(self):
        p = self._write(
            "---\n"
            "name: Explore\n"
            "description: Explorer.\n"
            "tools: [read, grep, glob]\n"
            "model: claude-haiku-4-5\n"
            "---\n"
            "Explore the code.\n"
        )
        parsed = parse_soul(p)
        self.assertEqual(parsed.allowed_tools, ("read", "grep", "glob"))
        self.assertEqual(parsed.model, "claude-haiku-4-5")

    def test_parse_soul_rejects_missing_frontmatter(self):
        p = self._write("no frontmatter here")
        with self.assertRaises(LoaderParseError):
            parse_soul(p)

    def test_parse_soul_rejects_unterminated_frontmatter(self):
        p = self._write("---\nname: X\ndescription: Y\n")
        with self.assertRaises(LoaderParseError):
            parse_soul(p)

    def test_parse_soul_rejects_empty_body(self):
        p = self._write("---\nname: X\ndescription: Y\n---\n")
        with self.assertRaises(LoaderParseError):
            parse_soul(p)

    def test_parse_soul_rejects_missing_name(self):
        p = self._write("---\ndescription: Y\n---\nbody\n")
        with self.assertRaises(LoaderParseError):
            parse_soul(p)

    def test_parse_soul_rejects_bad_tools_type(self):
        p = self._write("---\nname: X\ndescription: Y\ntools: read\n---\nbody\n")
        with self.assertRaises(LoaderParseError):
            parse_soul(p)

    def test_parse_soul_handles_empty_tools_list(self):
        p = self._write("---\nname: X\ndescription: Y\ntools: []\n---\nbody\n")
        parsed = parse_soul(p)
        self.assertEqual(parsed.allowed_tools, ())

    def test_parse_soul_ignores_comments_and_blank_lines(self):
        p = self._write(
            "---\n"
            "# a comment\n"
            "\n"
            "name: X\n"
            "description: Y\n"
            "---\n"
            "body\n"
        )
        parsed = parse_soul(p)
        self.assertEqual(parsed.name, "X")


class SkeletonParserTests(unittest.TestCase):
    def _write(self, payload: dict) -> Path:
        tmp = tempfile.NamedTemporaryFile("w", suffix=".skeleton", delete=False, encoding="utf-8")
        tmp.write(json.dumps(payload))
        tmp.close()
        return Path(tmp.name)

    def test_parse_minimal_valid_skeleton(self):
        p = self._write(
            {
                "name": "Explore",
                "description": "Explorer.",
                "instructions": "You are Explore.",
            }
        )
        parsed = parse_skeleton(p)
        self.assertEqual(parsed.name, "Explore")
        self.assertEqual(parsed.allowed_modes, ("delegate", "worker"))
        self.assertEqual(parsed.output_mode, "summary")
        self.assertEqual(parsed.memory_policy, "ephemeral")
        self.assertTrue(parsed.parallel_safe)
        self.assertIsNone(parsed.allowed_tools)
        self.assertIsNone(parsed.model)

    def test_parse_skeleton_full_payload(self):
        p = self._write(
            {
                "name": "Debugger",
                "description": "Debug.",
                "instructions": "you are a debugger",
                "allowed_modes": ["delegate", "handoff"],
                "output_mode": "full_trace",
                "memory_policy": "scoped_persistent",
                "parallel_safe": False,
                "allowed_tools": ["read", "shell"],
                "model": "claude-opus-4-7",
            }
        )
        parsed = parse_skeleton(p)
        self.assertEqual(parsed.allowed_modes, ("delegate", "handoff"))
        self.assertEqual(parsed.output_mode, "full_trace")
        self.assertEqual(parsed.memory_policy, "scoped_persistent")
        self.assertFalse(parsed.parallel_safe)
        self.assertEqual(parsed.allowed_tools, ("read", "shell"))
        self.assertEqual(parsed.model, "claude-opus-4-7")

    def test_parse_skeleton_rejects_invalid_json(self):
        tmp = tempfile.NamedTemporaryFile("w", suffix=".skeleton", delete=False, encoding="utf-8")
        tmp.write("{not valid json")
        tmp.close()
        with self.assertRaises(LoaderParseError):
            parse_skeleton(Path(tmp.name))

    def test_parse_skeleton_rejects_array_top_level(self):
        tmp = tempfile.NamedTemporaryFile("w", suffix=".skeleton", delete=False, encoding="utf-8")
        tmp.write(json.dumps([{"name": "X"}]))
        tmp.close()
        with self.assertRaises(LoaderParseError):
            parse_skeleton(Path(tmp.name))

    def test_parse_skeleton_rejects_missing_instructions(self):
        p = self._write({"name": "X", "description": "Y"})
        with self.assertRaises(LoaderParseError):
            parse_skeleton(p)

    def test_parse_skeleton_rejects_bad_allowed_modes_type(self):
        p = self._write(
            {
                "name": "X",
                "description": "Y",
                "instructions": "i",
                "allowed_modes": "delegate",
            }
        )
        with self.assertRaises(LoaderParseError):
            parse_skeleton(p)


from subagent_loader import (  # noqa: E402
    _dedupe_by_precedence,
    _scan_dir,
    _validate_parsed,
    ParsedTemplate,
)


class ValidationTests(unittest.TestCase):
    def _make(self, **overrides):
        base = dict(
            name="Good",
            description="d",
            instructions="i",
            allowed_modes=("delegate",),
            output_mode="summary",
            memory_policy="ephemeral",
            parallel_safe=True,
            allowed_tools=None,
            model=None,
            source_path=Path("/tmp/x.soul"),
            source_scope="user",
            source_format=".soul",
        )
        base.update(overrides)
        return ParsedTemplate(**base)

    def test_accepts_valid_template(self):
        self.assertIsNone(_validate_parsed(self._make()))

    def test_rejects_bad_name_chars(self):
        reason = _validate_parsed(self._make(name="bad name"))
        self.assertIsNotNone(reason)
        self.assertIn("does not match", reason)

    def test_rejects_reserved_name(self):
        reason = _validate_parsed(self._make(name="delegate_to_subagent"))
        self.assertIn("reserved", reason)

    def test_rejects_bad_mode(self):
        reason = _validate_parsed(self._make(allowed_modes=("delete",)))
        self.assertIn("allowed_modes", reason)

    def test_rejects_empty_modes(self):
        reason = _validate_parsed(self._make(allowed_modes=()))
        self.assertIn("at least one mode", reason)

    def test_rejects_bad_output_mode(self):
        reason = _validate_parsed(self._make(output_mode="weird"))
        self.assertIn("output_mode", reason)

    def test_rejects_bad_memory_policy(self):
        reason = _validate_parsed(self._make(memory_policy="weird"))
        self.assertIn("memory_policy", reason)


class PrecedenceTests(unittest.TestCase):
    def _make(self, *, name, scope, fmt):
        return ParsedTemplate(
            name=name,
            description="d",
            instructions="i",
            allowed_modes=("delegate",),
            output_mode="summary",
            memory_policy="ephemeral",
            parallel_safe=True,
            allowed_tools=None,
            model=None,
            source_path=Path(f"/tmp/{scope}/{name}{fmt}"),
            source_scope=scope,
            source_format=fmt,
        )

    def test_user_skeleton_beats_user_soul(self):
        templates = [
            self._make(name="Explore", scope="user", fmt=".soul"),
            self._make(name="Explore", scope="user", fmt=".skeleton"),
        ]
        winners = _dedupe_by_precedence(templates)
        self.assertEqual(len(winners), 1)
        self.assertEqual(winners[0].source_format, ".skeleton")
        self.assertEqual(winners[0].source_scope, "user")

    def test_user_soul_beats_workspace_skeleton(self):
        templates = [
            self._make(name="Explore", scope="workspace", fmt=".skeleton"),
            self._make(name="Explore", scope="user", fmt=".soul"),
        ]
        winners = _dedupe_by_precedence(templates)
        self.assertEqual(len(winners), 1)
        self.assertEqual(winners[0].source_scope, "user")
        self.assertEqual(winners[0].source_format, ".soul")

    def test_workspace_skeleton_beats_workspace_soul(self):
        templates = [
            self._make(name="Explore", scope="workspace", fmt=".soul"),
            self._make(name="Explore", scope="workspace", fmt=".skeleton"),
        ]
        winners = _dedupe_by_precedence(templates)
        self.assertEqual(len(winners), 1)
        self.assertEqual(winners[0].source_format, ".skeleton")
        self.assertEqual(winners[0].source_scope, "workspace")

    def test_different_names_coexist(self):
        templates = [
            self._make(name="A", scope="user", fmt=".soul"),
            self._make(name="B", scope="workspace", fmt=".skeleton"),
        ]
        winners = _dedupe_by_precedence(templates)
        self.assertEqual({t.name for t in winners}, {"A", "B"})


class ScanDirTests(unittest.TestCase):
    def test_scan_empty_dir_returns_empty(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(_scan_dir(Path(d), "user"), [])

    def test_scan_missing_dir_returns_empty(self):
        self.assertEqual(_scan_dir(Path("/nonexistent/path/xyz"), "user"), [])

    def test_scan_ignores_non_matching_extensions(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "foo.txt").write_text("not a soul")
            (Path(d) / "bar.skeleton.bak").write_text("{}")
            self.assertEqual(_scan_dir(Path(d), "user"), [])

    def test_scan_picks_up_valid_files(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "Explore.skeleton").write_text(
                json.dumps(
                    {
                        "name": "Explore",
                        "description": "desc",
                        "instructions": "i",
                    }
                )
            )
            (Path(d) / "Helper.soul").write_text(
                "---\nname: Helper\ndescription: d\n---\nbody\n"
            )
            results = _scan_dir(Path(d), "user")
            self.assertEqual({t.name for t in results}, {"Explore", "Helper"})
            for r in results:
                self.assertEqual(r.source_scope, "user")

    def test_scan_skips_invalid_but_keeps_valid(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "Valid.skeleton").write_text(
                json.dumps(
                    {"name": "Valid", "description": "d", "instructions": "i"}
                )
            )
            (Path(d) / "Broken.skeleton").write_text("{not json")
            results = _scan_dir(Path(d), "user")
            self.assertEqual([t.name for t in results], ["Valid"])

    def test_scan_skips_reserved_name(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "delegate_to_subagent.skeleton").write_text(
                json.dumps(
                    {
                        "name": "delegate_to_subagent",
                        "description": "d",
                        "instructions": "i",
                    }
                )
            )
            results = _scan_dir(Path(d), "user")
            self.assertEqual(results, [])


from subagent_loader import load_templates  # noqa: E402


class _FakeTool:
    def __init__(self, name):
        self.name = name


class _FakeToolkit:
    def __init__(self, tool_names):
        self.tools = {n: _FakeTool(n) for n in tool_names}


class _FakeAgent:
    def __init__(self, *, name, instructions, provider, model, api_key, modules):
        self.name = name
        self.instructions = instructions
        self.provider = provider
        self.model = model
        self.api_key = api_key
        self.modules = modules


class _FakeToolsModule:
    def __init__(self, *, tools):
        self.tools = tools


class _FakePoliciesModule:
    def __init__(self, *, max_iterations):
        self.max_iterations = max_iterations


class _FakeSubagentTemplate:
    def __init__(
        self,
        *,
        name,
        description,
        agent,
        allowed_modes,
        output_mode,
        memory_policy,
        parallel_safe,
        allowed_tools,
        model,
    ):
        self.name = name
        self.description = description
        self.agent = agent
        self.allowed_modes = allowed_modes
        self.output_mode = output_mode
        self.memory_policy = memory_policy
        self.parallel_safe = parallel_safe
        self.allowed_tools = allowed_tools
        self.model = model


class LoadTemplatesTests(unittest.TestCase):
    def _call(self, *, user_dir, workspace_dir=None, toolkit_tools=("read", "grep")):
        return load_templates(
            toolkits=(_FakeToolkit(toolkit_tools),),
            provider="anthropic",
            model="claude-haiku-4-5",
            api_key=None,
            max_iterations=30,
            user_dir=user_dir,
            workspace_dir=workspace_dir,
            UnchainAgent=_FakeAgent,
            ToolsModule=_FakeToolsModule,
            PoliciesModule=_FakePoliciesModule,
            SubagentTemplate=_FakeSubagentTemplate,
        )

    def test_empty_dirs_returns_empty(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(self._call(user_dir=Path(d)), ())

    def test_workspace_dir_none_skipped(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "A.skeleton").write_text(
                json.dumps({"name": "A", "description": "d", "instructions": "i"})
            )
            templates = self._call(user_dir=Path(d), workspace_dir=None)
            self.assertEqual(len(templates), 1)
            self.assertEqual(templates[0].name, "A")

    def test_nonexistent_workspace_dir_falls_back(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "A.skeleton").write_text(
                json.dumps({"name": "A", "description": "d", "instructions": "i"})
            )
            templates = self._call(
                user_dir=Path(d),
                workspace_dir=Path("/nonexistent/xyz/subagents"),
            )
            self.assertEqual(len(templates), 1)

    def test_tools_intersection_all_missing_skips(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "Bad.skeleton").write_text(
                json.dumps(
                    {
                        "name": "Bad",
                        "description": "d",
                        "instructions": "i",
                        "allowed_tools": ["nonexistent_tool"],
                    }
                )
            )
            templates = self._call(user_dir=Path(d))
            self.assertEqual(templates, ())

    def test_tools_intersection_partial(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "Partial.skeleton").write_text(
                json.dumps(
                    {
                        "name": "Partial",
                        "description": "d",
                        "instructions": "i",
                        "allowed_tools": ["read", "nonexistent_tool"],
                    }
                )
            )
            templates = self._call(user_dir=Path(d))
            self.assertEqual(len(templates), 1)
            self.assertEqual(templates[0].allowed_tools, ("read",))

    def test_tools_null_inherits_all(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "Inherit.skeleton").write_text(
                json.dumps(
                    {"name": "Inherit", "description": "d", "instructions": "i"}
                )
            )
            templates = self._call(user_dir=Path(d))
            self.assertEqual(len(templates), 1)
            self.assertIsNone(templates[0].allowed_tools)

    def test_workspace_shadows_user(self):
        with tempfile.TemporaryDirectory() as u, tempfile.TemporaryDirectory() as w:
            (Path(u) / "Dup.skeleton").write_text(
                json.dumps(
                    {"name": "Dup", "description": "USER", "instructions": "i"}
                )
            )
            (Path(w) / "Dup.skeleton").write_text(
                json.dumps(
                    {"name": "Dup", "description": "WORKSPACE", "instructions": "i"}
                )
            )
            templates = self._call(user_dir=Path(u), workspace_dir=Path(w))
            self.assertEqual(len(templates), 1)
            self.assertEqual(templates[0].description, "USER")

    def test_model_override_used(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "A.skeleton").write_text(
                json.dumps(
                    {
                        "name": "A",
                        "description": "d",
                        "instructions": "i",
                        "model": "claude-opus-4-7",
                    }
                )
            )
            templates = self._call(user_dir=Path(d))
            self.assertEqual(templates[0].agent.model, "claude-opus-4-7")

    def test_model_null_inherits_main(self):
        with tempfile.TemporaryDirectory() as d:
            (Path(d) / "A.skeleton").write_text(
                json.dumps(
                    {"name": "A", "description": "d", "instructions": "i"}
                )
            )
            templates = self._call(user_dir=Path(d))
            self.assertEqual(templates[0].agent.model, "claude-haiku-4-5")


if __name__ == "__main__":
    unittest.main()
