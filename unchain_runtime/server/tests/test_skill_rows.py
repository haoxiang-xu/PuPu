import sys
import unittest
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from skill_rows import normalize_skill_rows  # noqa: E402


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
                    "title": "Plan First",
                    "description": "Draft a plan first.",
                    "body": "Draft a plan using ({tools}).",
                    "tools": ["plan_start", "plan_update"],
                    "phase": "composer",
                },
                {
                    "name": "quick",
                    "title": "quick",
                    "description": "",
                    "body": "Do it.",
                    "tools": [],
                    "phase": "composer",
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
                {"name": "ok", "body": "duplicate dropped"},
            ]
        )
        self.assertEqual([row["name"] for row in rows], ["ok"])
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


if __name__ == "__main__":
    unittest.main()
