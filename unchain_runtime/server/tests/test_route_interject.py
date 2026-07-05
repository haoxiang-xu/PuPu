import sys
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

    monkeypatch.setattr(route_interject, "classify_interject", lambda *a, **k: "steer")
    ch = register_interject_channels("t-auto", "task")
    try:
        resp = client.post("/chat/interject", json={"thread_id": "t-auto", "text": "then do X"})
        assert resp.get_json()["resolved_channel"] == "steer"
        assert ch.fyi.pending_count() == 0  # steer 不动服务端任何队列
    finally:
        release_interject_channels("t-auto")
