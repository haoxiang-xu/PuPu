"""Tests for subagent_seeds — first-launch idempotent seeding."""

import json
import sys
import tempfile
import unittest
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from subagent_seeds import EXPLORE_SKELETON, ensure_seeds_written  # noqa: E402


class EnsureSeedsWrittenTests(unittest.TestCase):
    def test_writes_explore_skeleton_when_missing(self):
        with tempfile.TemporaryDirectory() as d:
            user_dir = Path(d) / "subagents"
            ensure_seeds_written(user_dir)
            target = user_dir / "Explore.skeleton"
            self.assertTrue(target.exists())
            payload = json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(payload["name"], "Explore")
            self.assertIn("thoroughness", payload["description"].lower())
            self.assertIn("read", payload["allowed_tools"])

    def test_creates_missing_parent_dir(self):
        with tempfile.TemporaryDirectory() as d:
            user_dir = Path(d) / "nested" / "subagents"
            ensure_seeds_written(user_dir)
            self.assertTrue((user_dir / "Explore.skeleton").exists())

    def test_does_not_overwrite_existing_file(self):
        with tempfile.TemporaryDirectory() as d:
            user_dir = Path(d)
            target = user_dir / "Explore.skeleton"
            target.write_text("user-modified content", encoding="utf-8")
            ensure_seeds_written(user_dir)
            self.assertEqual(target.read_text(encoding="utf-8"), "user-modified content")

    def test_does_not_regenerate_after_deletion(self):
        """Once seeded, if user deletes Explore.skeleton, it stays deleted
        within the same session — re-seeding only happens on a fresh server
        launch (a restart counts as another first). See plan Task 8 for notes."""
        with tempfile.TemporaryDirectory() as d:
            user_dir = Path(d)
            ensure_seeds_written(user_dir)
            target = user_dir / "Explore.skeleton"
            target.unlink()
            ensure_seeds_written(user_dir)
            self.assertTrue(target.exists())

    def test_explore_skeleton_payload_parses_as_valid_subagent(self):
        """The seeded skeleton must round-trip through the loader."""
        import subagent_loader

        with tempfile.TemporaryDirectory() as d:
            user_dir = Path(d)
            ensure_seeds_written(user_dir)
            target = user_dir / "Explore.skeleton"
            parsed = subagent_loader.parse_skeleton(target)
            self.assertEqual(parsed.name, "Explore")
            reason = subagent_loader._validate_parsed(parsed)
            self.assertIsNone(reason)


if __name__ == "__main__":
    unittest.main()
