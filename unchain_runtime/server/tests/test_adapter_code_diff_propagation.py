"""Regression test: PuPu adapter propagates code_diff interact fields."""
import sys
import unittest
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import unchain_adapter  # noqa: E402


class _FakeReq:
    def __init__(self, raw):
        self._raw = raw

    def to_dict(self):
        return dict(self._raw)


class AdapterCodeDiffPropagationTests(unittest.TestCase):
    def test_code_diff_interact_fields_preserved(self):
        cfg = {
            "title": "Edit /abs/foo.py",
            "operation": "edit",
            "path": "/abs/foo.py",
            "unified_diff": (
                "--- a/foo.py\n+++ b/foo.py\n@@ -1 +1 @@\n-old\n+new\n"
            ),
            "truncated": False,
            "total_lines": 5,
            "displayed_lines": 5,
            "fallback_description": "edit /abs/foo.py (+1 -1)",
        }
        req = _FakeReq({
            "tool_name": "write",
            "call_id": "c-xyz",
            "arguments": {"path": "/abs/foo.py", "content": "new"},
            "description": "Edit /abs/foo.py",
            "interact_type": "code_diff",
            "interact_config": cfg,
        })

        payload = unchain_adapter._build_tool_confirmation_request_payload(req)

        self.assertEqual(payload["interact_type"], "code_diff")
        self.assertEqual(payload["interact_config"], cfg)
        self.assertEqual(payload["tool_name"], "write")
        self.assertEqual(
            payload["arguments"],
            {"path": "/abs/foo.py", "content": "new"},
        )

    def test_default_interact_type_is_confirmation(self):
        req = _FakeReq({
            "tool_name": "write",
            "call_id": "c-2",
            "arguments": {},
            "description": "",
        })
        payload = unchain_adapter._build_tool_confirmation_request_payload(req)
        self.assertEqual(payload["interact_type"], "confirmation")
        self.assertEqual(payload["interact_config"], {})


if __name__ == "__main__":
    unittest.main()
