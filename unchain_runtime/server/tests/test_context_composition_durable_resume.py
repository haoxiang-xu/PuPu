from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from unittest import mock


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import durable_interaction_host as durable  # noqa: E402


PRIVATE = {
    "category": "skills",
    "subtype": "expanded_invocation",
    "surface": "messages",
    "utf8_bytes": 12,
    "source_count": 1,
}


def _with_data_dir():
    temporary = tempfile.TemporaryDirectory()
    patcher = mock.patch.dict(
        os.environ,
        {"UNCHAIN_DATA_DIR": temporary.name},
        clear=False,
    )
    patcher.start()
    return temporary, patcher


def test_private_hint_is_canonical_stable_resume_authority() -> None:
    temporary, patcher = _with_data_dir()
    try:
        durable.save_resume_context(
            session_id="chat-composition",
            run_id="run-composition",
            options={
                "modelId": "openai:gpt-5",
                "_context_composition_hint_v1": dict(reversed(list(PRIVATE.items()))),
            },
            provider="openai",
            model="gpt-5",
        )
        persisted = durable.load_resume_context(
            "chat-composition",
            "run-composition",
        )
        before = durable._context_path(
            "chat-composition",
            "run-composition",
        ).read_bytes()

        absent = durable.resolve_resume_options(
            session_id="chat-composition",
            run_id="run-composition",
            fresh_options={},
            expected_provider="openai",
            expected_model="gpt-5",
        )
        equal = durable.resolve_resume_options(
            session_id="chat-composition",
            run_id="run-composition",
            fresh_options={"_context_composition_hint_v1": dict(PRIVATE)},
            expected_provider="openai",
            expected_model="gpt-5",
        )
        after = durable._context_path(
            "chat-composition",
            "run-composition",
        ).read_bytes()

        assert persisted["options"]["_context_composition_hint_v1"] == PRIVATE
        assert absent["_context_composition_hint_v1"] == PRIVATE
        assert equal["_context_composition_hint_v1"] == PRIVATE
        assert after == before
    finally:
        patcher.stop()
        temporary.cleanup()


def test_resume_mismatch_or_no_baseline_never_overwrites_and_only_suppresses_composition() -> (
    None
):
    temporary, patcher = _with_data_dir()
    try:
        durable.save_resume_context(
            session_id="chat-composition",
            run_id="run-composition",
            options={
                "modelId": "openai:gpt-5",
                "_context_composition_hint_v1": PRIVATE,
            },
            provider="openai",
            model="gpt-5",
        )
        mismatch = dict(PRIVATE, utf8_bytes=13)
        resolved = durable.resolve_resume_options(
            session_id="chat-composition",
            run_id="run-composition",
            fresh_options={"_context_composition_hint_v1": mismatch},
            expected_provider="openai",
            expected_model="gpt-5",
        )
        persisted = durable.load_resume_context(
            "chat-composition",
            "run-composition",
        )

        durable.save_resume_context(
            session_id="chat-no-baseline",
            run_id="run-no-baseline",
            options={"modelId": "openai:gpt-5"},
            provider="openai",
            model="gpt-5",
        )
        no_baseline = durable.resolve_resume_options(
            session_id="chat-no-baseline",
            run_id="run-no-baseline",
            fresh_options={"_context_composition_hint_v1": PRIVATE},
            expected_provider="openai",
            expected_model="gpt-5",
        )

        assert resolved["_context_composition_hint_v1"] == PRIVATE
        assert resolved["_context_composition_availability_v2"]["code"] == (
            "resume_hint_mismatch"
        )
        assert persisted["options"]["_context_composition_hint_v1"] == PRIVATE
        assert "_context_composition_hint_v1" not in no_baseline
        assert no_baseline["_context_composition_availability_v2"]["code"] == (
            "resume_hint_no_baseline"
        )
    finally:
        patcher.stop()
        temporary.cleanup()


def test_mismatch_save_restart_then_absent_declaration_reuses_baseline() -> None:
    temporary, patcher = _with_data_dir()
    try:
        durable.save_resume_context(
            session_id="chat-restart-composition",
            run_id="run-before-mismatch",
            options={
                "modelId": "openai:gpt-5",
                "_context_composition_hint_v1": PRIVATE,
            },
            provider="openai",
            model="gpt-5",
        )
        mismatch = durable.resolve_resume_options(
            session_id="chat-restart-composition",
            run_id="run-before-mismatch",
            fresh_options={
                "_context_composition_hint_v1": dict(PRIVATE, utf8_bytes=13),
            },
            expected_provider="openai",
            expected_model="gpt-5",
        )
        assert mismatch["_context_composition_hint_v1"] == PRIVATE
        assert mismatch["_context_composition_availability_v2"]["code"] == (
            "resume_hint_mismatch"
        )

        durable.save_resume_context(
            session_id="chat-restart-composition",
            run_id="run-after-mismatch",
            options=mismatch,
            provider="openai",
            model="gpt-5",
        )
        persisted = durable.load_resume_context(
            "chat-restart-composition",
            "run-after-mismatch",
        )
        assert persisted["options"]["_context_composition_hint_v1"] == PRIVATE

        child_env = dict(os.environ)
        child_env["UNCHAIN_DATA_DIR"] = temporary.name
        child_env["PYTHONPATH"] = os.pathsep.join(
            filter(
                None,
                (str(SERVER_ROOT), child_env.get("PYTHONPATH", "")),
            )
        )
        child = subprocess.run(
            [
                sys.executable,
                "-c",
                (
                    "import json; "
                    "from durable_interaction_host import resolve_resume_options; "
                    "print(json.dumps(resolve_resume_options("
                    "session_id='chat-restart-composition', "
                    "run_id='run-after-mismatch', fresh_options={}, "
                    "expected_provider='openai', expected_model='gpt-5'), "
                    "sort_keys=True))"
                ),
            ],
            cwd=SERVER_ROOT,
            env=child_env,
            check=True,
            capture_output=True,
            text=True,
        )
        after_restart = json.loads(child.stdout)
        assert after_restart["_context_composition_hint_v1"] == PRIVATE
        assert "_context_composition_availability_v2" not in after_restart
    finally:
        patcher.stop()
        temporary.cleanup()


def test_invalid_resume_hint_suppresses_only_the_current_physical_call() -> None:
    temporary, patcher = _with_data_dir()
    try:
        durable.save_resume_context(
            session_id="chat-invalid-resume-composition",
            run_id="run-invalid-resume-composition",
            options={
                "modelId": "openai:gpt-5",
                "_context_composition_hint_v1": PRIVATE,
            },
            provider="openai",
            model="gpt-5",
        )

        resolved = durable.resolve_resume_options(
            session_id="chat-invalid-resume-composition",
            run_id="run-invalid-resume-composition",
            fresh_options={
                "_context_composition_hint_v1": dict(PRIVATE, source_count=2),
            },
            expected_provider="openai",
            expected_model="gpt-5",
        )

        assert resolved["_context_composition_hint_v1"] == PRIVATE
        assert resolved["_context_composition_availability_v2"]["code"] == (
            "resume_hint_invalid"
        )
    finally:
        patcher.stop()
        temporary.cleanup()


def test_invalid_private_hint_is_never_persisted() -> None:
    temporary, patcher = _with_data_dir()
    try:
        durable.save_resume_context(
            session_id="chat-invalid-composition",
            run_id="run-invalid-composition",
            options={
                "modelId": "openai:gpt-5",
                "_context_composition_hint_v1": dict(PRIVATE, source_count=2),
            },
            provider="openai",
            model="gpt-5",
        )

        persisted = durable.load_resume_context(
            "chat-invalid-composition",
            "run-invalid-composition",
        )

        assert "_context_composition_hint_v1" not in persisted["options"]
    finally:
        patcher.stop()
        temporary.cleanup()
