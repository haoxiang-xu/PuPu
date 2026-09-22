"""Generate ticket 274 contract evidence from an installed wheel, without inference.

Run with the Python environment containing the immutable wheel from
scripts/release-qa/build-unchain-artifact.mjs. Only HTTPX MockTransport is used.
This is a parser/renderer contract fixture, not live model qualification.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
from importlib.metadata import distribution
import itertools
import json
from pathlib import Path

import httpx
from unchain.events import RuntimeEventBridge
from unchain.providers import ModelTurnRequest, OllamaModelIO
from unchain.runtime.runtime_protocol import runtime_protocol_manifest


def generate(evidence: dict) -> dict:
    manifest = runtime_protocol_manifest()
    direct_url = json.loads(distribution("unchain").read_text("direct_url.json"))
    wheel_hash = direct_url.get("archive_info", {}).get("hashes", {}).get("sha256")
    expected_hash = evidence["artifact"]["sha256"].removeprefix("sha256:")
    if wheel_hash != expected_hash:
        raise ValueError("installed runtime must be the recorded immutable wheel")
    if manifest != evidence["runtime_manifest"]:
        raise ValueError("imported protocol manifest differs from artifact evidence")

    cases = []
    for model in ("deepseek-r1:32b", "qwen3:32b", "gpt-oss:20b"):
        ids = itertools.count(1)
        bridge = RuntimeEventBridge(
            session_id="ticket-274-chat",
            id_factory=lambda: f"evt-{next(ids)}",
            clock=lambda: datetime(2026, 9, 22, tzinfo=timezone.utc),
        )
        events = []
        results = []
        for index in (1, 2):
            run_id = f"ticket-274-run-{index}"
            raw_events = []
            chunks = [
                {"message": {"thinking": "Check "}},
                {"message": {"thinking": "the sum.", "content": "1"}},
                {"message": {"content": "0"}},
                {"message": {"content": ""}, "done": True,
                 "prompt_eval_count": 7, "eval_count": 3},
            ]

            def handle(request):
                assert request.url == "http://fixture.invalid/api/chat"
                assert json.loads(request.content)["model"] == model
                return httpx.Response(
                    200, content="\n".join(json.dumps(chunk) for chunk in chunks),
                )

            def capture(raw):
                raw_events.append(raw)
                events.extend(event.to_dict() for event in bridge.normalize(raw))

            capture({"type": "run_started", "run_id": run_id})
            with httpx.Client(transport=httpx.MockTransport(handle)) as client:
                result = OllamaModelIO(
                    model=model, base_url="http://fixture.invalid",
                    stream_factory=client.stream,
                ).fetch_turn(ModelTurnRequest(
                    messages=[{"role": "user", "content": "What is 5+5?"}],
                    run_id=run_id, iteration=1, emit_stream=True, callback=capture,
                ))
            capture({"type": "final_message", "run_id": run_id,
                     "iteration": 1, "content": result.final_text})
            capture({"type": "run_completed", "run_id": run_id})
            results.append({
                "run_id": run_id, "final_text": result.final_text,
                "reasoning_items": result.reasoning_items,
                "raw_deltas": [raw for raw in raw_events
                               if raw["type"] in ("reasoning", "token_delta")],
            })
        cases.append({"model": model, "events": events, "results": results})
    return {
        "qualification": "deterministic transport only; no model inference",
        "unchain_revision": evidence["source"]["revision"],
        "wheel_sha256": f"sha256:{wheel_hash}",
        "runtime_manifest_digest": manifest["manifest_digest"],
        "cases": cases,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    output = generate(json.loads(args.evidence.read_text()))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(hashlib.sha256(args.output.read_bytes()).hexdigest())
