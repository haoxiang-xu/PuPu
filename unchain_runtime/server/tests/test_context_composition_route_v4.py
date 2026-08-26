from __future__ import annotations

import sys
from pathlib import Path
from unittest import mock


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import app as miso_app  # noqa: E402
import context_composition_capability as capability  # noqa: E402
import routes as miso_routes  # noqa: E402


class _BootstrapModule:
    @classmethod
    def from_private_hint(cls, private_hint):
        return (cls, private_hint)


def _ready() -> capability.ContextCompositionCapabilityVerdict:
    return capability.ContextCompositionCapabilityVerdict(
        ready=True,
        reason="available",
        bootstrap_module=_BootstrapModule,
    )


def _hint(prefix: str) -> dict:
    return {
        "schema": "pupu.context_composition_hint.v2",
        "contributions": [
            {
                "category": "skills",
                "subtype": "expanded_invocation",
                "surface": "messages",
                "prefix_utf16_units": len(prefix.encode("utf-16-le")) // 2,
                "utf8_bytes": len(prefix.encode("utf-8")),
                "source_count": 1,
            }
        ],
    }


def _events():
    return iter(
        [
            {
                "type": "final_message",
                "run_id": "run-context-composition",
                "iteration": 0,
                "content": "done",
            }
        ]
    )


def test_fresh_v4_mints_private_hint_only_from_valid_top_level_public_v2() -> None:
    prefix = "🧠 skill"
    client = miso_app.create_app().test_client()
    with mock.patch(
        "context_composition_host.resolve_context_composition_capability",
        return_value=_ready(),
    ), mock.patch.object(
        miso_routes,
        "stream_chat_events",
        return_value=_events(),
    ) as stream:
        response = client.post(
            "/chat/stream/v4",
            json={
                "message": f"{prefix}\n\nrequest",
                "attempt_id": "attempt-context-composition",
                "context_composition_hint": _hint(prefix),
                "options": {
                    "_context_composition_hint_v1": {
                        "category": "skills",
                        "subtype": "expanded_invocation",
                        "surface": "messages",
                        "utf8_bytes": 999,
                        "source_count": 1,
                    }
                },
            },
        )
        response.get_data(as_text=True)

    assert response.status_code == 200
    options = stream.call_args.kwargs["options"]
    assert options["_context_composition_hint_v1"] == {
        "category": "skills",
        "subtype": "expanded_invocation",
        "surface": "messages",
        "utf8_bytes": len(prefix.encode("utf-8")),
        "source_count": 1,
    }


def test_fresh_v4_keeps_ascii_and_unicode_whitespace_authoritative() -> None:
    client = miso_app.create_app().test_client()
    # U+0085 is deliberately included: Python str.strip removes it while
    # ECMAScript String.trim does not, so a second host-side trim would drift
    # from the renderer's authoritative final message.
    for index, prefix in enumerate(
        (" \tskill", "\u2003\U0001f9e0 skill", "\u0085skill")
    ):
        message = f"{prefix}\n\nrequest \t"
        with mock.patch(
            "context_composition_host.resolve_context_composition_capability",
            return_value=_ready(),
        ), mock.patch.object(
            miso_routes,
            "stream_chat_events",
            return_value=_events(),
        ) as stream:
            response = client.post(
                "/chat/stream/v4",
                json={
                    "message": message,
                    "attempt_id": f"attempt-whitespace-{index}",
                    "context_composition_hint": _hint(prefix),
                },
            )
            response.get_data(as_text=True)

        assert response.status_code == 200
        assert stream.call_args.kwargs["message"] == message
        options = stream.call_args.kwargs["options"]
        assert options["_context_composition_hint_v1"]["utf8_bytes"] == len(
            prefix.encode("utf-8")
        )
        assert "_context_composition_availability_v2" not in options


def test_invalid_fresh_hint_is_composition_only_and_never_mints_private_state() -> None:
    client = miso_app.create_app().test_client()
    invalid = _hint("skill")
    invalid["contributions"][0]["utf8_bytes"] = 999
    with mock.patch(
        "context_composition_host.resolve_context_composition_capability",
        return_value=_ready(),
    ), mock.patch.object(
        miso_routes,
        "stream_chat_events",
        return_value=_events(),
    ) as stream:
        response = client.post(
            "/chat/stream/v4",
            json={
                "message": "skill\n\nrequest",
                "attempt_id": "attempt-invalid-composition",
                "context_composition_hint": invalid,
            },
        )
        response.get_data(as_text=True)

    assert response.status_code == 200
    options = stream.call_args.kwargs["options"]
    assert "_context_composition_hint_v1" not in options
    assert options["_context_composition_availability_v2"] == {
        "schema": "pupu.context_composition_availability.v2",
        "code": "fresh_hint_invalid",
    }


def test_resume_public_v2_is_not_accepted_as_private_resume_authority() -> None:
    client = miso_app.create_app().test_client()
    with mock.patch(
        "context_composition_host.resolve_context_composition_capability",
        return_value=_ready(),
    ), mock.patch.object(
        miso_routes,
        "resume_chat_interaction_events",
        return_value=_events(),
    ) as resume:
        response = client.post(
            "/chat/stream/v4",
            json={
                "mode": "resume_interaction",
                "threadId": "chat-context-composition",
                "attempt_id": "attempt-resume-composition",
                "source_attempt_id": "attempt-source-composition",
                "interaction_id": "interaction-composition",
                "context_composition_hint": _hint("skill"),
            },
        )
        response.get_data(as_text=True)

    assert response.status_code == 200
    options = resume.call_args.kwargs["options"]
    assert "_context_composition_hint_v1" not in options
    assert options["_context_composition_availability_v2"] == {
        "schema": "pupu.context_composition_availability.v2",
        "code": "resume_hint_invalid",
    }


def test_resume_private_declaration_is_forwarded_only_for_durable_equality() -> None:
    private = {
        "category": "skills",
        "subtype": "expanded_invocation",
        "surface": "messages",
        "utf8_bytes": 5,
        "source_count": 1,
    }
    client = miso_app.create_app().test_client()
    with mock.patch(
        "context_composition_host.resolve_context_composition_capability",
        return_value=_ready(),
    ), mock.patch.object(
        miso_routes,
        "resume_chat_interaction_events",
        return_value=_events(),
    ) as resume:
        response = client.post(
            "/chat/stream/v4",
            json={
                "mode": "resume_interaction",
                "threadId": "chat-context-composition",
                "attempt_id": "attempt-resume-private",
                "source_attempt_id": "attempt-source-private",
                "interaction_id": "interaction-private",
                "options": {"_context_composition_hint_v1": private},
            },
        )
        response.get_data(as_text=True)

    assert response.status_code == 200
    assert resume.call_args.kwargs["options"]["_context_composition_hint_v1"] == private


def test_capability_unavailable_never_blocks_ordinary_v4() -> None:
    client = miso_app.create_app().test_client()
    unavailable = capability.ContextCompositionCapabilityVerdict(
        ready=False,
        reason="capability_unavailable",
    )
    with mock.patch(
        "context_composition_host.resolve_context_composition_capability",
        return_value=unavailable,
    ), mock.patch.object(
        miso_routes,
        "stream_chat_events",
        return_value=_events(),
    ) as stream:
        response = client.post(
            "/chat/stream/v4",
            json={
                "message": "ordinary request",
                "attempt_id": "attempt-capability-unavailable",
            },
        )
        response.get_data(as_text=True)

    assert response.status_code == 200
    assert stream.called
    assert stream.call_args.kwargs["options"][
        "_context_composition_availability_v2"
    ] == {
        "schema": "pupu.context_composition_availability.v2",
        "code": "capability_unavailable",
    }
