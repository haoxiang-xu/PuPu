"""Small captured-ledger controls for the exact QA Enter label schema."""
import unittest

from enter_ledger import verify_enter_ledger


def fixture():
    ledger = [
        {"action": "Enter", "label": "turn-1", "at_ns": "10"},
        {"action": "root reply visible", "turn": 1, "at_ns": "40"},
        {"action": "Enter", "label": "turn-2", "at_ns": "50"},
        {"action": "root reply visible", "turn": 2, "at_ns": "80"},
        {"action": "Enter", "label": "qa356-approval-agent", "at_ns": "90"},
        {"action": "Enter", "label": "qa356-cancel-agent", "at_ns": "100"},
    ]
    wires = [{"at_ns": str(value)} for value in (20, 30, 60, 70)]
    return ledger, wires


class EnterLedgerControls(unittest.TestCase):
    def test_captured_label_schema_passes_with_http_and_terminal_order(self):
        verify_enter_ledger(*fixture())

    def test_missing_enter_is_rejected(self):
        ledger, wires = fixture()
        ledger = [row for row in ledger if not (row["action"] == "Enter" and row["label"] == "turn-1")]
        with self.assertRaisesRegex(AssertionError, "enter_event_count_expected_2_got_1"):
            verify_enter_ledger(ledger, wires)

    def test_duplicate_enter_is_rejected(self):
        ledger, wires = fixture()
        ledger.insert(1, {"action": "Enter", "label": "turn-1", "at_ns": "11"})
        with self.assertRaisesRegex(AssertionError, "enter_event_count_expected_2_got_3"):
            verify_enter_ledger(ledger, wires)

    def test_wrong_label_is_rejected_without_numeric_fallback(self):
        ledger, wires = fixture()
        ledger[0] = {"action": "Enter", "label": "turn-one", "at_ns": "10", "turn": 1}
        with self.assertRaisesRegex(AssertionError, "enter_label_count_expected_one:turn-1:got_0"):
            verify_enter_ledger(ledger, wires)

    def test_enter_at_or_after_first_request_is_rejected(self):
        ledger, wires = fixture()
        ledger[0]["at_ns"] = "20"
        with self.assertRaisesRegex(AssertionError, "enter_must_precede_first_http_request:turn-1"):
            verify_enter_ledger(ledger, wires)

    def test_terminal_before_last_request_is_rejected(self):
        ledger, wires = fixture()
        ledger[1]["at_ns"] = "29"
        with self.assertRaisesRegex(AssertionError, "last_http_request_must_precede_terminal_reply:turn-1"):
            verify_enter_ledger(ledger, wires)

    def test_duplicate_terminal_is_rejected(self):
        ledger, wires = fixture()
        ledger.insert(2, {"action": "root reply visible", "turn": 1, "at_ns": "45"})
        with self.assertRaisesRegex(AssertionError, "root_reply_event_count_expected_one:turn-1:got_2"):
            verify_enter_ledger(ledger, wires)


if __name__ == "__main__":
    unittest.main()
