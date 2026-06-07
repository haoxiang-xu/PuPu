import json
import sys
import tempfile
import unittest
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from mcp_secrets import (  # noqa: E402
    delete_mcp_secret_values,
    get_mcp_secret_value,
    list_mcp_secret_status,
    save_mcp_secret_values,
)


class McpSecretsTests(unittest.TestCase):
    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.tmpdir.name)

    def tearDown(self):
        self.tmpdir.cleanup()

    def test_save_get_status_and_delete_secret_values(self):
        save_mcp_secret_values(
            "mcp.productivity.slack",
            {"SLACK_BOT_TOKEN": "xoxb-test"},
            data_dir=self.data_dir,
        )

        self.assertEqual(
            get_mcp_secret_value(
                "mcp.productivity.slack",
                "SLACK_BOT_TOKEN",
                data_dir=self.data_dir,
            ),
            "xoxb-test",
        )
        self.assertEqual(
            list_mcp_secret_status(
                "mcp.productivity.slack",
                data_dir=self.data_dir,
            ),
            [{"key": "SLACK_BOT_TOKEN", "configured": True}],
        )

        raw = json.loads((self.data_dir / "mcp_secrets.json").read_text())
        self.assertEqual(
            raw["toolkits"]["mcp.productivity.slack"]["SLACK_BOT_TOKEN"],
            "xoxb-test",
        )
        self.assertEqual(
            (self.data_dir / "mcp_secrets.json").stat().st_mode & 0o777,
            0o600,
        )

        delete_mcp_secret_values(
            "mcp.productivity.slack",
            data_dir=self.data_dir,
        )
        self.assertEqual(
            list_mcp_secret_status(
                "mcp.productivity.slack",
                data_dir=self.data_dir,
            ),
            [],
        )


if __name__ == "__main__":
    unittest.main()
