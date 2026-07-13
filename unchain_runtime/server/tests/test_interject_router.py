import sys
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

# Ensure unchain source is on sys.path by importing unchain_adapter first
# (its module-level _ensure_unchain_on_path() call does this; there is no
# conftest.py in this tests dir to do it for us).
import unchain_adapter as adapter  # noqa: E402

from interject_router import classify_interject, CLASSIFIER_SYSTEM_PROMPT  # noqa: E402


def test_classify_parses_each_label():
    for label in ("btw", "fyi", "queue", "clarify"):
        got = classify_interject("msg", "", {}, run_agent=lambda msgs: f" {label.upper()} ")
        assert got == label


def test_classify_falls_back_to_clarify_on_garbage_or_error():
    assert classify_interject("msg", "", {}, run_agent=lambda msgs: "no idea") == "clarify"
    def boom(msgs):
        raise RuntimeError("provider down")
    assert classify_interject("msg", "", {}, run_agent=boom) == "clarify"


def test_classify_rejects_legacy_steer_label():
    # "steer" is no longer a valid classifier label post-rename; an
    # off-prompt model that still emits it must degrade to clarify.
    assert classify_interject("msg", "", {}, run_agent=lambda msgs: "steer") == "clarify"


def test_prompt_contains_message_digest_and_labels():
    captured = {}
    def spy(msgs):
        captured["msgs"] = msgs
        return "fyi"
    classify_interject("please also add tests", "iterations: 2", {}, run_agent=spy)
    joined = str(captured["msgs"])
    assert "please also add tests" in joined
    assert "iterations: 2" in joined
    for label in ("btw", "fyi", "queue", "clarify"):
        assert label in CLASSIFIER_SYSTEM_PROMPT


def test_prompt_contains_no_legacy_steer_wording():
    assert "steer" not in CLASSIFIER_SYSTEM_PROMPT.lower()
