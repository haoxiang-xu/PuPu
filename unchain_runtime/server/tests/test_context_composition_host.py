from __future__ import annotations

import sys
from pathlib import Path

import pytest


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import context_composition_host as host  # noqa: E402
from context_composition_capability import (  # noqa: E402
    ContextCompositionCapabilityVerdict,
)


def _utf16_units(value: str) -> int:
    return len(value.encode("utf-16-le")) // 2


def _public_hint(prefix: str) -> dict:
    return {
        "schema": "pupu.context_composition_hint.v2",
        "contributions": [
            {
                "category": "skills",
                "subtype": "expanded_invocation",
                "surface": "messages",
                "prefix_utf16_units": _utf16_units(prefix),
                "utf8_bytes": len(prefix.encode("utf-8")),
                "source_count": 1,
            }
        ],
    }


@pytest.mark.parametrize(
    "prefix",
    (
        "skill prompt",
        "技能提示",
        "🧠技能提示",
    ),
)
def test_fresh_hint_recomputes_authoritative_utf8_from_js_utf16_boundary(
    prefix: str,
) -> None:
    private = host.admit_fresh_context_composition_hint(
        _public_hint(prefix),
        authoritative_message=f"{prefix}\n\nuser request",
    )

    assert private == {
        "category": "skills",
        "subtype": "expanded_invocation",
        "surface": "messages",
        "utf8_bytes": len(prefix.encode("utf-8")),
        "source_count": 1,
    }


@pytest.mark.parametrize(
    "mutate,message",
    (
        (
            lambda value: value.update(schema="pupu.context_composition_hint.v1"),
            "skill",
        ),
        (lambda value: value.update(extra=True), "skill"),
        (
            lambda value: value["contributions"][0].update(source_count=2),
            "skill",
        ),
        (
            lambda value: value["contributions"][0].update(source_count=1.0),
            "skill",
        ),
        (
            lambda value: value["contributions"][0].update(utf8_bytes=999),
            "skill",
        ),
        (
            lambda value: value["contributions"][0].update(prefix_utf16_units=True),
            "skill",
        ),
        (
            lambda value: value["contributions"][0].update(
                prefix_utf16_units=(1 << 53)
            ),
            "skill",
        ),
        (
            lambda value: value["contributions"][0].update(prefix_utf16_units=0),
            "skill",
        ),
    ),
)
def test_fresh_hint_rejects_closed_shape_range_and_byte_mismatches(
    mutate,
    message: str,
) -> None:
    value = _public_hint("skill")
    mutate(value)

    with pytest.raises(host.ContextCompositionHintError) as raised:
        host.admit_fresh_context_composition_hint(
            value,
            authoritative_message=message,
        )

    assert raised.value.code == "fresh_hint_invalid"


@pytest.mark.parametrize(
    "message,boundary",
    (
        ("🧠skill", 1),
        ("\ud800skill", 1),
        ("\udc00skill", 1),
        ("skill", 99),
    ),
)
def test_fresh_hint_rejects_split_unpaired_or_out_of_range_utf16_prefix(
    message: str,
    boundary: int,
) -> None:
    value = _public_hint("skill")
    value["contributions"][0]["prefix_utf16_units"] = boundary

    with pytest.raises(host.ContextCompositionHintError) as raised:
        host.admit_fresh_context_composition_hint(
            value,
            authoritative_message=message,
        )

    assert raised.value.code == "fresh_hint_invalid"


def test_private_hint_normalization_is_exact_and_canonical() -> None:
    unordered = {
        "source_count": 1,
        "utf8_bytes": 5,
        "surface": "messages",
        "subtype": "expanded_invocation",
        "category": "skills",
    }

    normalized = host.normalize_private_context_composition_hint(unordered)

    assert list(normalized) == [
        "category",
        "subtype",
        "surface",
        "utf8_bytes",
        "source_count",
    ]
    assert normalized == {
        "category": "skills",
        "subtype": "expanded_invocation",
        "surface": "messages",
        "utf8_bytes": 5,
        "source_count": 1,
    }

    with pytest.raises(host.ContextCompositionHintError):
        host.normalize_private_context_composition_hint(
            dict(unordered, source_count=1.0)
        )


def test_optional_official_module_factory_failure_degrades_to_unavailable(
    monkeypatch,
) -> None:
    class _BrokenBootstrap:
        @classmethod
        def from_private_hint(cls, _private_hint):
            raise RuntimeError("optional module failed")

    monkeypatch.setattr(
        host,
        "resolve_context_composition_capability",
        lambda: ContextCompositionCapabilityVerdict(
            ready=True,
            reason="available",
            bootstrap_module=_BrokenBootstrap,
        ),
    )

    assert (
        host.build_context_composition_bootstrap_module(
            {
                "category": "skills",
                "subtype": "expanded_invocation",
                "surface": "messages",
                "utf8_bytes": 5,
                "source_count": 1,
            }
        )
        is None
    )
