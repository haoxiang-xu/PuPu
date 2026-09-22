import sys
import unittest
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from skill_rows import (  # noqa: E402
    _row_bool,
    canonical_skill_name,
    normalize_skill_rows,
)


class NormalizeSkillRowsTests(unittest.TestCase):
    def test_full_row_passes_through_with_defaults_applied(self) -> None:
        rows = normalize_skill_rows(
            [
                {
                    "name": "plan",
                    "title": "Plan First",
                    "description": "Draft a plan first.",
                    "body": "Draft a plan using ({tools}).",
                    "tools": ["plan_start", "plan_update"],
                    "phase": "composer",
                },
                {"name": "quick", "body": "Do it."},
            ]
        )
        self.assertEqual(
            rows,
            [
                {
                    "name": "plan",
                    "aliases": [],
                    "title": "Plan First",
                    "description": "Draft a plan first.",
                    "body": "Draft a plan using ({tools}).",
                    "tools": ["plan_start", "plan_update"],
                    "phase": "composer",
                    "model_invocable": True,
                    "user_invocable": True,
                    "metadata": {},
                    "degraded": [],
                },
                {
                    "name": "quick",
                    "aliases": [],
                    "title": "quick",
                    "description": "",
                    "body": "Do it.",
                    "tools": [],
                    "phase": "composer",
                    "model_invocable": True,
                    "user_invocable": True,
                    "metadata": {},
                    "degraded": [],
                },
            ],
        )

    def test_invalid_rows_are_dropped_not_raised(self) -> None:
        rows = normalize_skill_rows(
            [
                "not-a-dict",
                {"name": "", "body": "b"},
                {"name": "no body"},
                {"name": "bad name!", "body": "b"},
                {"name": "ok", "body": "b"},
                {"name": "ok", "body": "duplicate kept under a suffixed name"},
            ]
        )
        self.assertEqual([row["name"] for row in rows], ["ok", "ok-2"])
        self.assertEqual(rows[0]["body"], "b")

    def test_bad_phase_falls_back_to_composer(self) -> None:
        (row,) = normalize_skill_rows([{"name": "x", "body": "b", "phase": "later"}])
        self.assertEqual(row["phase"], "composer")

    def test_non_list_input_yields_empty(self) -> None:
        self.assertEqual(normalize_skill_rows(None), [])
        self.assertEqual(normalize_skill_rows({"name": "x"}), [])

    def test_non_list_tools_is_dropped_not_iterated(self) -> None:
        # a string is iterable — must NOT decompose into characters
        (row,) = normalize_skill_rows(
            [{"name": "x", "body": "b", "tools": "echo"}]
        )
        self.assertEqual(row["tools"], [])
        (row,) = normalize_skill_rows(
            [{"name": "x", "body": "b", "tools": {"echo": 1}}]
        )
        self.assertEqual(row["tools"], [])

    def test_non_string_scalars_never_repr_coerced(self) -> None:
        rows = normalize_skill_rows(
            [
                {"name": 123, "body": "b"},
                {"name": "x", "body": {"nested": "garbage"}},
                {"name": "ok", "body": "b", "title": 42, "description": ["d"]},
            ]
        )
        self.assertEqual([row["name"] for row in rows], ["ok"])
        self.assertEqual(rows[0]["title"], "ok")
        self.assertEqual(rows[0]["description"], "")

    # -- P-D6: canonicalisation ------------------------------------------

    def test_canonicalisation_and_alias_examples(self) -> None:
        rows = normalize_skill_rows(
            [
                {"name": "Echo_Loud", "body": "b"},
                {"name": "plan", "body": "b"},
                {"name": "--Weird__Name--", "body": "b"},
                {"name": "a" * 70, "body": "b"},
            ]
        )
        by_name = {row["name"]: row for row in rows}
        self.assertEqual(sorted(by_name), sorted(["echo-loud", "plan", "weird-name", "a" * 64]))
        self.assertEqual(by_name["echo-loud"]["aliases"], ["Echo_Loud"])
        self.assertEqual(by_name["plan"]["aliases"], [])
        self.assertEqual(by_name["weird-name"]["aliases"], ["--Weird__Name--"])
        self.assertEqual(by_name["a" * 64]["aliases"], ["a" * 70])

    def test_explicit_aliases_are_merged_and_deduplicated(self) -> None:
        (row,) = normalize_skill_rows(
            [
                {
                    "name": "Echo_Loud",
                    "body": "b",
                    "aliases": ["Echo_Loud", "old-echo", "old-echo", "echo-loud", ""],
                }
            ]
        )
        self.assertEqual(row["name"], "echo-loud")
        # raw spelling first, then explicit aliases: deduped, never == canonical
        self.assertEqual(row["aliases"], ["Echo_Loud", "old-echo"])

    def test_canonical_helper_is_pure_and_matches_normalize_output(self) -> None:
        self.assertEqual(canonical_skill_name("Echo_Loud"), "echo-loud")
        self.assertEqual(canonical_skill_name("plan"), "plan")
        self.assertEqual(canonical_skill_name("--Weird__Name--"), "weird-name")
        self.assertEqual(canonical_skill_name(""), "")
        self.assertEqual(canonical_skill_name("___"), "")

    # -- P-D6: policy flags -------------------------------------------------

    def test_invalid_flags_are_restrictive_and_recorded_as_degraded(self) -> None:
        (row,) = normalize_skill_rows(
            [
                {
                    "name": "x",
                    "body": "b",
                    "disable-model-invocation": "maybe",
                    "user-invocable": "nope",
                }
            ]
        )
        self.assertIs(row["model_invocable"], False)
        self.assertIs(row["user_invocable"], False)
        self.assertIn("invalid_flag:disable-model-invocation", row["degraded"])
        self.assertIn("invalid_flag:user-invocable", row["degraded"])

    def test_invalid_flag_underscore_spelling_also_restrictive(self) -> None:
        (row,) = normalize_skill_rows(
            [
                {
                    "name": "x",
                    "body": "b",
                    "disable_model_invocation": 2,
                    "user_invocable": "sideways",
                }
            ]
        )
        self.assertIs(row["model_invocable"], False)
        self.assertIs(row["user_invocable"], False)
        self.assertIn("invalid_flag:disable-model-invocation", row["degraded"])
        self.assertIn("invalid_flag:user-invocable", row["degraded"])

    def test_valid_flag_combinations(self) -> None:
        cases = [
            (False, True, True, True),
            (False, "no", True, False),
            ("yes", True, False, True),
            ("on", "off", False, False),
        ]
        for disable_value, user_value, expect_model, expect_user in cases:
            (row,) = normalize_skill_rows(
                [
                    {
                        "name": "x",
                        "body": "b",
                        "disable-model-invocation": disable_value,
                        "user-invocable": user_value,
                    }
                ]
            )
            self.assertIs(row["model_invocable"], expect_model)
            self.assertIs(row["user_invocable"], expect_user)
            self.assertEqual(row["degraded"], [])

    def test_camel_case_flags_from_js_producer_are_accepted(self) -> None:
        # skill_pack_import.js pushes modelInvocable/userInvocable (camelCase);
        # normalize_skill_rows is the single normalisation point for that
        # producer too (via skill_packs.install_skill_pack).
        (row,) = normalize_skill_rows(
            [{"name": "x", "body": "b", "modelInvocable": False, "userInvocable": False}]
        )
        self.assertIs(row["model_invocable"], False)
        self.assertIs(row["user_invocable"], False)
        self.assertEqual(row["degraded"], [])

    # -- P-D6: metadata -------------------------------------------------

    def test_metadata_passthrough_when_json_safe(self) -> None:
        metadata = {
            "origin": "import",
            "count": 3,
            "ok": True,
            "tags": ["a", "b"],
            "nested": {"k": 1},
            "nothing": None,
        }
        (row,) = normalize_skill_rows([{"name": "x", "body": "b", "metadata": metadata}])
        self.assertEqual(row["metadata"], metadata)
        self.assertIsNot(row["metadata"], metadata)  # defensive copy

    def test_metadata_dropped_when_not_json_safe(self) -> None:
        (row,) = normalize_skill_rows(
            [{"name": "x", "body": "b", "metadata": {"bad": object()}}]
        )
        self.assertEqual(row["metadata"], {})

    def test_metadata_dropped_when_not_a_dict(self) -> None:
        (row,) = normalize_skill_rows(
            [{"name": "x", "body": "b", "metadata": ["not", "a", "dict"]}]
        )
        self.assertEqual(row["metadata"], {})

    # -- P-D6: collisions -------------------------------------------------

    def test_collision_retains_every_row_exact_spelling_owns_canonical(self) -> None:
        """Audit P2: a canonical-name collision must not drop a skill, and the
        row already spelled canonically owns the canonical name."""
        rows = normalize_skill_rows(
            [
                {"name": "Foo_Bar", "body": "FIRST"},
                {"name": "foo-bar", "body": "SECOND"},
            ]
        )
        self.assertEqual([(r["name"], r["body"]) for r in rows], [("foo-bar-2", "FIRST"), ("foo-bar", "SECOND")])
        self.assertEqual(rows[0]["aliases"], ["Foo_Bar"])
        self.assertEqual(rows[0]["degraded"], ["name_collision:foo-bar"])
        self.assertEqual(rows[1]["degraded"], ["name_collision:Foo_Bar"])
        # Idempotent: re-normalising the output changes nothing.
        self.assertEqual(normalize_skill_rows(rows), rows)

    def test_collision_without_exact_spelling_keeps_first_and_suffixes_the_rest(self) -> None:
        rows = normalize_skill_rows(
            [
                {"name": "Echo", "body": "first"},
                {"name": "echo", "body": "second"},
                {"name": "ECHO", "body": "third"},
            ]
        )
        # "echo" is the exact canonical spelling -> it owns the name.
        self.assertEqual([(r["name"], r["body"]) for r in rows], [("echo-2", "first"), ("echo", "second"), ("echo-3", "third")])
        self.assertEqual(rows[0]["aliases"], ["Echo"])
        self.assertEqual(rows[2]["aliases"], ["ECHO"])
        rows2 = normalize_skill_rows([{"name": "Echo", "body": "first"}, {"name": "ECHO", "body": "third"}])
        self.assertEqual([r["name"] for r in rows2], ["echo", "echo-2"])
        self.assertEqual(normalize_skill_rows(rows2), rows2)

    def test_invalid_explicit_policy_in_any_spelling_is_restrictive(self) -> None:
        """Audit P3: present-but-invalid flags never fall back to permissive defaults."""
        (row,) = normalize_skill_rows(
            [{"name": "demo", "description": "D", "body": "B", "model_invocable": "invalid", "userInvocable": "invalid"}]
        )
        self.assertFalse(row["model_invocable"])
        self.assertFalse(row["user_invocable"])
        self.assertEqual(sorted(row["degraded"]), ["invalid_flag:disable-model-invocation", "invalid_flag:user-invocable"])
        # Conflicting valid spellings combine restrictively.
        (row,) = normalize_skill_rows(
            [{"name": "demo", "body": "B", "model_invocable": True, "disableModelInvocation": True, "user_invocable": True, "user-invocable": "no"}]
        )
        self.assertFalse(row["model_invocable"])
        self.assertFalse(row["user_invocable"])
        self.assertEqual(row["degraded"], [])
        # Explicit null is present-but-invalid, never "absent" (audit re-check).
        (row,) = normalize_skill_rows(
            [{"name": "demo", "body": "B", "model_invocable": None, "user_invocable": None}]
        )
        self.assertFalse(row["model_invocable"])
        self.assertFalse(row["user_invocable"])
        self.assertEqual(sorted(row["degraded"]), ["invalid_flag:disable-model-invocation", "invalid_flag:user-invocable"])
        (row,) = normalize_skill_rows([{"name": "demo", "body": "B", "disable-model-invocation": None}])
        self.assertFalse(row["model_invocable"])
        self.assertTrue(row["user_invocable"])
        # Absent everywhere -> permissive defaults, no diagnostics.
        (row,) = normalize_skill_rows([{"name": "demo", "body": "B"}])
        self.assertTrue(row["model_invocable"] and row["user_invocable"])
        self.assertEqual(row["degraded"], [])

    # -- P-D6: idempotency -------------------------------------------------

    def test_idempotent_round_trip(self) -> None:
        raw = [
            {
                "name": "Echo_Loud",
                "title": "Echo",
                "description": "d",
                "body": "b",
                "tools": ["t1"],
                "phase": "streaming",
                "disable-model-invocation": "maybe",
                "user-invocable": False,
                "metadata": {"a": 1},
                "aliases": ["legacy-echo"],
            },
            {"name": "dup", "body": "one"},
            {"name": "dup", "body": "two"},
        ]
        once = normalize_skill_rows(raw)
        twice = normalize_skill_rows(once)
        self.assertEqual(once, twice)

    def test_idempotent_round_trip_with_js_camel_case_flags(self) -> None:
        raw = [{"name": "x", "body": "b", "modelInvocable": False, "userInvocable": True}]
        once = normalize_skill_rows(raw)
        twice = normalize_skill_rows(once)
        self.assertEqual(once, twice)


class CanonicalSkillNameTests(unittest.TestCase):
    def test_replaces_underscore_and_invalid_chars(self) -> None:
        self.assertEqual(canonical_skill_name("Echo_Loud"), "echo-loud")

    def test_leaves_already_canonical_name_unchanged(self) -> None:
        self.assertEqual(canonical_skill_name("plan"), "plan")

    def test_collapses_runs_and_strips_edges(self) -> None:
        self.assertEqual(canonical_skill_name("--Weird__Name--"), "weird-name")

    def test_truncates_to_64_chars(self) -> None:
        name = "a" * 70
        result = canonical_skill_name(name)
        self.assertEqual(result, "a" * 64)
        self.assertEqual(len(result), 64)

    def test_truncation_strips_a_dangling_trailing_hyphen(self) -> None:
        # 63 'a's + '-' lands the hyphen exactly at the 64-char cut point;
        # the trailing '-' must be stripped after truncation, not kept.
        name = ("a" * 63) + "-" + ("b" * 10)
        result = canonical_skill_name(name)
        self.assertEqual(result, "a" * 63)
        self.assertLessEqual(len(result), 64)

    def test_empty_after_normalisation(self) -> None:
        self.assertEqual(canonical_skill_name("___"), "")
        self.assertEqual(canonical_skill_name(""), "")

    def test_idempotent(self) -> None:
        for name in ("Echo_Loud", "plan", "--Weird__Name--", "a" * 70, "___"):
            once = canonical_skill_name(name)
            self.assertEqual(canonical_skill_name(once), once)


class RowBoolTests(unittest.TestCase):
    def test_missing_returns_default(self) -> None:
        self.assertIs(_row_bool(None, True), True)
        self.assertIs(_row_bool(None, False), False)

    def test_python_bool_passthrough(self) -> None:
        self.assertIs(_row_bool(True, False), True)
        self.assertIs(_row_bool(False, True), False)

    def test_recognized_strings_case_insensitive(self) -> None:
        for text in ("true", "TRUE", "True", "yes", "YES", "on", "ON", "1"):
            self.assertIs(_row_bool(text, False), True)
        for text in ("false", "FALSE", "False", "no", "NO", "off", "OFF", "0"):
            self.assertIs(_row_bool(text, True), False)

    def test_whitespace_is_tolerated(self) -> None:
        self.assertIs(_row_bool("  true  ", False), True)

    def test_unrecognized_value_is_invalid(self) -> None:
        self.assertIsNone(_row_bool("maybe", True))
        self.assertIsNone(_row_bool("", True))
        self.assertIsNone(_row_bool(2, True))
        self.assertIsNone(_row_bool(1, True))  # int 1, not the string "1"
        self.assertIsNone(_row_bool([], True))
        self.assertIsNone(_row_bool({}, True))


if __name__ == "__main__":
    unittest.main()
