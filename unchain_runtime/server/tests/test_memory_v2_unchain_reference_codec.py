from __future__ import annotations

import pytest

from memory_v2_unchain_runtime_factory import _PupuUnchainReferenceCodec
from unchain.journal import ResourceRef
from unchain.memory.toolkit import ReferencePurpose


def test_curator_candidate_reference_round_trips_as_candidate_not_memory() -> None:
    codec = _PupuUnchainReferenceCodec("binding-chat-a")
    ref = ResourceRef("memory_candidate", "candidate-a", 3)

    encoded = codec.encode(ref)

    assert encoded == "pupu://memory/candidate/candidate-a@3"
    assert codec.decode(
        encoded,
        purpose=ReferencePurpose.CANDIDATE,
    ) == ref


def test_curator_review_reference_preserves_target_space_scope() -> None:
    codec = _PupuUnchainReferenceCodec("binding-chat-a")
    ref = ResourceRef(
        "memory_review",
        "review-a",
        1,
        "space-chat-a",
    )

    encoded = codec.encode(ref)

    assert encoded == "pupu://memory/review/space-chat-a/review-a@1"
    assert codec.decode(
        encoded,
        purpose=ReferencePurpose.MEMORY,
    ) == ref


@pytest.mark.parametrize(
    "uri",
    (
        "pupu://memory/candidate/candidate-a@0",
        "pupu://memory/review/space-chat-a/review-a@0",
        "pupu://memory/review/space-chat-a/../review-a@1",
    ),
)
def test_curator_reference_codec_rejects_noncanonical_refs(uri: str) -> None:
    codec = _PupuUnchainReferenceCodec("binding-chat-a")

    with pytest.raises(ValueError, match="invalid|unsupported"):
        codec.decode(uri, purpose=ReferencePurpose.MEMORY)
