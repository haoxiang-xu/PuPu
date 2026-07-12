import sys
import time
from pathlib import Path

import pytest

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import app as miso_app  # noqa: E402
import routes as miso_routes  # noqa: E402

assert miso_routes  # ensure route modules (incl. route_interject) are registered


@pytest.fixture()
def client():
    return miso_app.create_app().test_client()


def test_interject_without_active_run_returns_new_run(client):
    resp = client.post("/chat/interject", json={"thread_id": "t-none", "text": "hi"})
    assert resp.status_code == 200
    assert resp.get_json()["resolved_channel"] == "new_run"


def test_interject_missing_fields_400(client):
    assert client.post("/chat/interject", json={}).status_code == 400
    assert client.post("/chat/interject", json={"thread_id": "t", "text": "  "}).status_code == 400


def test_interject_invalid_channel_400(client):
    resp = client.post(
        "/chat/interject", json={"thread_id": "t", "text": "hi", "channel": "banana"}
    )
    assert resp.status_code == 400


def test_interject_explicit_queue_is_client_side_noop(client):
    from interaction_channels import register_interject_channels, release_interject_channels

    ch = register_interject_channels("t-queue", "task")
    try:
        resp = client.post(
            "/chat/interject", json={"thread_id": "t-queue", "text": "then do X", "channel": "queue"}
        )
        assert resp.get_json()["resolved_channel"] == "queue"
        assert ch.fyi.pending_count() == 0  # queue 不动服务端任何队列
    finally:
        release_interject_channels("t-queue")


def test_interject_legacy_steer_channel_normalizes_to_queue(client):
    # Pre-rename clients still send channel "steer"; server silently
    # normalizes it to "queue" with identical behavior (server-side noop).
    from interaction_channels import register_interject_channels, release_interject_channels

    ch = register_interject_channels("t-legacy-steer", "task")
    try:
        resp = client.post(
            "/chat/interject",
            json={"thread_id": "t-legacy-steer", "text": "then do X", "channel": "steer"},
        )
        assert resp.status_code == 200
        assert resp.get_json()["resolved_channel"] == "queue"
        assert ch.fyi.pending_count() == 0
    finally:
        release_interject_channels("t-legacy-steer")


def test_interject_fyi_posts_to_channel(client):
    from interaction_channels import register_interject_channels, release_interject_channels

    ch = register_interject_channels("t-fyi", "task")
    try:
        resp = client.post("/chat/interject", json={"thread_id": "t-fyi", "text": "note", "channel": "fyi"})
        body = resp.get_json()
        assert body["resolved_channel"] == "fyi" and body["message_id"]
        assert ch.fyi.pending_count() == 1
    finally:
        release_interject_channels("t-fyi")


def test_interject_btw_returns_answer_and_posts_system_note(client, monkeypatch):
    import route_interject
    from interaction_channels import register_interject_channels, release_interject_channels

    monkeypatch.setattr(route_interject, "_run_side_answer", lambda msgs, options: "about halfway")
    ch = register_interject_channels("t-btw", "task")
    try:
        resp = client.post("/chat/interject", json={"thread_id": "t-btw", "text": "eta?", "channel": "btw"})
        body = resp.get_json()
        assert body["resolved_channel"] == "btw" and body["answer"] == "about halfway"
        drained = ch.fyi.drain()  # system 一致性备注已回注
        assert len(drained) == 1 and drained[0].origin == "system"
        assert "eta?" in drained[0].text and "about halfway" in drained[0].text
    finally:
        release_interject_channels("t-btw")


def test_interject_auto_routes_via_classifier(client, monkeypatch):
    import route_interject
    from interaction_channels import register_interject_channels, release_interject_channels

    monkeypatch.setattr(route_interject, "classify_interject", lambda *a, **k: "queue")
    ch = register_interject_channels("t-auto", "task")
    try:
        resp = client.post("/chat/interject", json={"thread_id": "t-auto", "text": "then do X"})
        assert resp.get_json()["resolved_channel"] == "queue"
        assert ch.fyi.pending_count() == 0  # queue 不动服务端任何队列
    finally:
        release_interject_channels("t-auto")


def test_interject_auto_uses_run_options_snapshot(client, monkeypatch):
    """HIGH: absent request options, side-calls must use the run's snapshot
    (its actual provider/model) instead of falling back to server env
    defaults (which degrade to ollama under Electron)."""
    import route_interject
    from interaction_channels import register_interject_channels, release_interject_channels

    captured = {}

    def fake_classify(text, digest_summary, options, **kwargs):
        captured["options"] = options
        return "clarify"

    monkeypatch.setattr(route_interject, "classify_interject", fake_classify)
    ch = register_interject_channels("t-snap", "task", options={"provider": "anthropic", "modelId": "claude-x"})
    try:
        resp = client.post("/chat/interject", json={"thread_id": "t-snap", "text": "eta?"})
        assert resp.get_json()["resolved_channel"] == "clarify"
        assert captured["options"] == {"provider": "anthropic", "modelId": "claude-x"}
    finally:
        release_interject_channels("t-snap")


def test_interject_request_options_override_snapshot(client, monkeypatch):
    import route_interject
    from interaction_channels import register_interject_channels, release_interject_channels

    captured = {}

    def fake_classify(text, digest_summary, options, **kwargs):
        captured["options"] = options
        return "clarify"

    monkeypatch.setattr(route_interject, "classify_interject", fake_classify)
    ch = register_interject_channels(
        "t-snap-override", "task", options={"provider": "anthropic", "modelId": "claude-x"}
    )
    try:
        resp = client.post(
            "/chat/interject",
            json={
                "thread_id": "t-snap-override",
                "text": "eta?",
                "options": {"modelId": "claude-override"},
            },
        )
        assert resp.get_json()["resolved_channel"] == "clarify"
        # request payload overrides the snapshot's modelId but leaves other
        # snapshot keys (provider) intact.
        assert captured["options"] == {"provider": "anthropic", "modelId": "claude-override"}
    finally:
        release_interject_channels("t-snap-override")


def test_interject_btw_times_out_returns_504(client, monkeypatch):
    import route_interject
    from interaction_channels import register_interject_channels, release_interject_channels

    def slow_side_answer(msgs, options):
        time.sleep(0.2)
        return "too slow"

    monkeypatch.setattr(route_interject, "_run_side_answer", slow_side_answer)
    monkeypatch.setattr(route_interject, "BTW_TIMEOUT_S", 0.05)
    ch = register_interject_channels("t-btw-timeout", "task")
    try:
        resp = client.post("/chat/interject", json={"thread_id": "t-btw-timeout", "text": "eta?", "channel": "btw"})
        assert resp.status_code == 504
        assert resp.get_json()["error"]["code"] == "btw_timeout"
    finally:
        release_interject_channels("t-btw-timeout")
        time.sleep(0.3)  # let the orphaned worker thread finish before teardown


def test_interject_auto_classify_times_out_resolves_clarify(client, monkeypatch):
    import route_interject
    from interaction_channels import register_interject_channels, release_interject_channels

    def slow_classify(text, digest_summary, options, **kwargs):
        time.sleep(0.2)
        return "queue"

    monkeypatch.setattr(route_interject, "classify_interject", slow_classify)
    monkeypatch.setattr(route_interject, "CLASSIFY_TIMEOUT_S", 0.05)
    ch = register_interject_channels("t-classify-timeout", "task")
    try:
        resp = client.post("/chat/interject", json={"thread_id": "t-classify-timeout", "text": "then do X"})
        assert resp.get_json()["resolved_channel"] == "clarify"
    finally:
        release_interject_channels("t-classify-timeout")
        time.sleep(0.3)  # let the orphaned worker thread finish before teardown


def test_interject_fyi_toctou_returns_new_run_when_channel_released_mid_flight(client, monkeypatch):
    from interaction_channels import (
        get_interject_channels,
        register_interject_channels,
        release_interject_channels,
    )

    ch = register_interject_channels("t-fyi-toctou", "task")
    real_post = ch.fyi.post

    def racing_post(text, **kwargs):
        # Simulate the run ending (and releasing the registry entry) in the
        # window between route_interject's get_interject_channels() lookup
        # and the fyi.post() call.
        release_interject_channels("t-fyi-toctou", ch)
        return real_post(text, **kwargs)

    monkeypatch.setattr(ch.fyi, "post", racing_post)
    try:
        resp = client.post("/chat/interject", json={"thread_id": "t-fyi-toctou", "text": "note", "channel": "fyi"})
        assert resp.get_json()["resolved_channel"] == "new_run"
        assert get_interject_channels("t-fyi-toctou") is None
    finally:
        release_interject_channels("t-fyi-toctou", ch)


def test_interject_btw_toctou_skips_note_but_still_returns_answer(client, monkeypatch):
    import route_interject
    from interaction_channels import register_interject_channels, release_interject_channels

    ch = register_interject_channels("t-btw-toctou", "task")

    def side_answer_that_releases_mid_flight(msgs, options):
        # Simulate the run ending between our channels lookup and posting
        # the system-consistency note.
        release_interject_channels("t-btw-toctou", ch)
        return "about halfway"

    monkeypatch.setattr(route_interject, "_run_side_answer", side_answer_that_releases_mid_flight)
    try:
        resp = client.post("/chat/interject", json={"thread_id": "t-btw-toctou", "text": "eta?", "channel": "btw"})
        body = resp.get_json()
        assert body["resolved_channel"] == "btw" and body["answer"] == "about halfway"
        assert ch.fyi.pending_count() == 0  # note was skipped, not queued into a dead channel
    finally:
        release_interject_channels("t-btw-toctou", ch)
