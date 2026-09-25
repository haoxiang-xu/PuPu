"""Generate issue 274 preview/reset evidence from one installed Unchain wheel.

This deterministic committed candidate uses no model inference. The wheel
must be the installed distribution archive, not a mutable source checkout.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
from importlib.metadata import distribution
import itertools
import json
from pathlib import Path

from unchain.context import ContextCompiler, ContextRuntime
from unchain.events import RuntimeEventBridge
from unchain.runtime.runtime_protocol import runtime_protocol_manifest


def generate(wheel: Path) -> dict:
    wheel_hash = hashlib.sha256(wheel.read_bytes()).hexdigest()
    direct_url = json.loads(distribution("unchain").read_text("direct_url.json"))
    installed_hash = direct_url.get("archive_info", {}).get("hashes", {}).get("sha256")
    if installed_hash != wheel_hash:
        raise ValueError("installed Unchain is not the supplied wheel")
    manifest = runtime_protocol_manifest()
    ownership = next(item for item in manifest["protocols"]
                     if item["id"] == "provider_turn_ownership")
    if "ollama_reasoning_preview_v1" not in ownership["features"]:
        raise ValueError("installed Unchain lacks the preview protocol")

    ids = itertools.count(1)
    bridge = RuntimeEventBridge(
        session_id="ticket-274-live",
        id_factory=lambda: f"preview-evt-{next(ids)}",
        clock=lambda: datetime(2026, 9, 25, tzinfo=timezone.utc),
    )
    host_raw = []
    live_events = []
    durable_raw = []

    def host(event):
        host_raw.append(event)
        live_events.extend(item.to_dict() for item in bridge.normalize(event))

    runtime = ContextRuntime._for_test(
        owner_id="context-v2",
        compiler=ContextCompiler(),
        request_factory=lambda _context: None,
        durable_event_sink=durable_raw.append,
        partial_attempt_sink=lambda _event, _error: None,
    )
    callback = runtime.compose_event_callback(host)
    failed_id = "a" * 32
    accepted_id = "b" * 32
    next_run_id = "c" * 32

    def reasoning(run_id, delta):
        return {"type": "reasoning", "run_id": run_id, "iteration": 1,
                "provider": "ollama", "delta": delta}

    failed = reasoning("ticket-274-run-1", "discard this")
    callback.emit_provisional_reasoning(failed, failed_id)
    callback.discard_provisional_reasoning(
        preview_id=failed_id, run_id="ticket-274-run-1", iteration=1
    )
    accepted = reasoning("ticket-274-run-1", "accepted plan")
    callback.emit_provisional_reasoning(accepted, accepted_id)
    callback.commit_provisional_reasoning(accepted)
    callback({"type": "token_delta", "run_id": "ticket-274-run-1",
              "iteration": 1, "provider": "ollama", "delta": "first"})
    second = reasoning("ticket-274-run-2", "second plan")
    callback.emit_provisional_reasoning(second, next_run_id)
    callback.commit_provisional_reasoning(second)
    callback({"type": "token_delta", "run_id": "ticket-274-run-2",
              "iteration": 1, "provider": "ollama", "delta": "second"})

    cold_ids = itertools.count(1)
    cold_bridge = RuntimeEventBridge(
        session_id="ticket-274-live",
        id_factory=lambda: f"cold-evt-{next(cold_ids)}",
        clock=lambda: datetime(2026, 9, 25, tzinfo=timezone.utc),
    )
    cold_events = [item.to_dict() for raw in durable_raw
                   for item in cold_bridge.normalize(raw)]
    return {
        "qualification": "deterministic installed-wheel candidate; no model inference",
        "source_dirty": False,
        "wheel_sha256": f"sha256:{wheel_hash}",
        "runtime_manifest_digest": manifest["manifest_digest"],
        "host_raw": host_raw,
        "durable_raw": durable_raw,
        "live_events": live_events,
        "cold_events": cold_events,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wheel", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    output = generate(arguments.wheel)
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(hashlib.sha256(arguments.output.read_bytes()).hexdigest())
