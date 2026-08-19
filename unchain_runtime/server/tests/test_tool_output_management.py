import sys
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from tool_output_management import (  # noqa: E402
    SUPPORTED_TOOL_OUTPUT_POLICIES,
    build_tool_result_projection,
    normalize_tool_output_policy,
)


class TestToolOutputManagement:
    def test_normalize_supported_and_fallback(self) -> None:
        assert normalize_tool_output_policy("artifact_only") == "artifact_only"
        assert normalize_tool_output_policy("HEAD_TAIL") == "head_tail"
        assert normalize_tool_output_policy(" default ") == "default"
        assert normalize_tool_output_policy("unknown") == "default"
        assert normalize_tool_output_policy(123) == "default"
        assert SUPPORTED_TOOL_OUTPUT_POLICIES == frozenset(
            {"default", "head_tail", "artifact_only"}
        )

    def test_build_default_projection_inline_behavior(self) -> None:
        full_ref = {"type": "artifact", "artifact_id": "art", "revision": 1}
        text = "short value"
        bytes_value = text.encode("utf-8")
        projection, metadata = build_tool_result_projection(
            bytes_value,
            policy="default",
            full_output_ref=full_ref,
            digest="digest",
            content_bytes=len(bytes_value),
            preview_chars=8,
            inline_chars=16,
            projection_version="v1",
        )
        assert projection["projection"] == "default"
        assert projection["inline"] is True
        assert projection["preview"] == text
        assert metadata["projection_policy"] == "default"
        assert metadata["projection_version"] == "v1"
        assert metadata["inline"] is True

    def test_build_default_projection_large(self) -> None:
        full_ref = {"type": "artifact", "artifact_id": "art", "revision": 1}
        text = "x" * 50
        bytes_value = text.encode("utf-8")
        projection, metadata = build_tool_result_projection(
            bytes_value,
            policy="default",
            full_output_ref=full_ref,
            digest="digest",
            content_bytes=len(bytes_value),
            preview_chars=8,
            inline_chars=10,
            projection_version="v1",
        )
        assert projection["projection"] == "default"
        assert projection["inline"] is False
        assert projection["preview"] == "x" * 8
        assert metadata["projection_policy"] == "default"

    def test_build_head_tail_projection(self) -> None:
        full_ref = {"type": "artifact", "artifact_id": "art", "revision": 1}
        text = "abc123" * 10
        bytes_value = text.encode("utf-8")
        projection, metadata = build_tool_result_projection(
            bytes_value,
            policy="head_tail",
            full_output_ref=full_ref,
            digest="digest",
            content_bytes=len(bytes_value),
            preview_chars=6,
            inline_chars=10,
            projection_version="v1",
        )
        assert projection["projection"] == "head_tail"
        assert projection["preview"] == text[:6]
        assert projection["tail_preview"] == text[-6:]
        assert projection["content_chars"] == len(text)
        assert metadata["projection_policy"] == "head_tail"

    def test_build_artifact_only_projection(self) -> None:
        full_ref = {"type": "artifact", "artifact_id": "art", "revision": 1}
        projection, metadata = build_tool_result_projection(
            b"value",
            policy="artifact_only",
            full_output_ref=full_ref,
            digest="digest",
            content_bytes=5,
            preview_chars=8,
            inline_chars=10,
            projection_version="v1",
        )
        assert projection["projection"] == "artifact_only"
        assert "preview" not in projection
        assert metadata["projection_policy"] == "artifact_only"

    def test_build_empty_projection(self) -> None:
        full_ref = {"type": "artifact", "artifact_id": "art", "revision": 1}
        projection, metadata = build_tool_result_projection(
            b"",
            policy="default",
            full_output_ref=full_ref,
            digest="digest",
            content_bytes=0,
            preview_chars=12,
            inline_chars=16,
            projection_version="v1",
        )
        assert projection["projection"] == "empty"
        assert projection["content_bytes"] == 0
        assert metadata["projection_policy"] == "default"
