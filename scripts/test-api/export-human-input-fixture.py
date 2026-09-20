"""Generate/check BC-001 fixtures with the installed Unchain and PuPu producers.

Run with the ticket Unchain venv, or with the frozen wheel installed at close:
python scripts/test-api/export-human-input-fixture.py [--check]
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "unchain_runtime/server"))

from durable_interaction_host import _durable_response, _presentation_for_request
from unchain.input import HumanInputRequest, HumanInputResponse
from unchain.interaction import build_interaction_request
from unchain.interaction.runtime import response_contract_for_kind


def produce_fixture():
    cases = {}
    for mode in ("single", "multiple"):
        arguments = {
            "title": "Project folder", "question": "What folder path should I use?",
            "selection_mode": mode, "options": [], "allow_other": True,
            "other_label": "Folder path", "other_placeholder": "Enter the folder path",
        }
        human = HumanInputRequest.from_tool_arguments(arguments, request_id=f"folder-{mode}")
        interaction = build_interaction_request(
            session_id="free-text-contract", kind="human_input", source_run_id="run-free-text",
            occurrence=f"question-{mode}", payload=human.to_dict(),
            response_contract=response_contract_for_kind("human_input"), created_revision=0,
        )
        presentation = _presentation_for_request(interaction)
        # Only wall-clock presentation time is normalized for a reproducible fixture.
        presentation["trace_frame"]["ts"] = 0
        user_response = {
            **({"value": "__other__"} if mode == "single" else {"values": ["__other__"]}),
            "other_text": "/Users/example/项目",
        }
        response = _durable_response(
            request=interaction, approved=True, reason="",
            modified_arguments={"user_response": user_response},
        )
        parsed_response = HumanInputResponse.from_raw(response, request=human)
        assert parsed_response.to_dict() == response
        cases[mode] = {
            "tool_arguments": arguments,
            "pending": {
                "status": "awaiting_response", "session_id": interaction.session_id,
                "interaction_id": interaction.interaction_id,
                "source_run_id": interaction.source_run_id, "active_attempt_id": interaction.source_run_id,
                "kind": "human_input", "provider": "openai", "model": "gpt-5",
                "presentation": presentation, "resume_available": True, "resume_options": {},
            },
            "user_response": user_response, "runtime_response": response,
            "tool_result": parsed_response.to_tool_result(),
        }
    return cases


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    target = ROOT / "src/COMPONENTs/chat-bubble/interact/__fixtures__/human_input_free_text.json"
    generated = json.dumps(produce_fixture(), ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if target.read_text() != generated:
            raise SystemExit("Human-input fixture differs from the installed runtime/host producers")
        print("Human-input fixtures match installed Unchain and PuPu producers")
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(generated)
        print(target)
