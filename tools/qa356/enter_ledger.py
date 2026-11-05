"""Strict validation for the QA sender's labelled Enter and terminal ledger rows."""


def verify_enter_ledger(ledger, wires):
    expected_labels = {1: "turn-1", 2: "turn-2"}
    # The complete App ledger also contains the separately labelled approval,
    # cancellation and child lifecycle sends. Scope this check to root chat
    # turns, retaining malformed `turn-*` labels and legacy numeric-turn rows
    # so neither can disappear into a fallback path.
    enters = [row for row in ledger if row.get("action") == "Enter" and (
        str(row.get("label", "")).startswith("turn-") or "turn" in row
    )]
    assert len(enters) == len(expected_labels), (
        f"enter_event_count_expected_{len(expected_labels)}_got_{len(enters)}"
    )

    for turn, label in expected_labels.items():
        matching = [row for row in enters if row.get("label") == label]
        assert len(matching) == 1, f"enter_label_count_expected_one:{label}:got_{len(matching)}"
        enter = matching[0]
        assert "turn" not in enter, f"enter_legacy_turn_field_forbidden:{label}"
        done = [row for row in ledger if row.get("action") == "root reply visible" and row.get("turn") == turn]
        assert len(done) == 1, f"root_reply_event_count_expected_one:turn-{turn}:got_{len(done)}"
        assert int(enter["at_ns"]) < int(wires[(turn - 1) * 2]["at_ns"]), (
            f"enter_must_precede_first_http_request:{label}"
        )
        assert int(wires[turn * 2 - 1]["at_ns"]) < int(done[0]["at_ns"]), (
            f"last_http_request_must_precede_terminal_reply:turn-{turn}"
        )
