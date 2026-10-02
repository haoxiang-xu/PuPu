# Accepted baseline producer artifact — #384

Producer fixture preparation is complete; strict candidate-consumer evidence is still pending.

- Accepted Unchain source: `1ec49ddfc28d3b42ba035debada5e3db759dad1b` (the #386 baseline pinned by current `dev` Release QA).
- One prebuilt baseline wheel reused unchanged: `unchain-0.2.0-py3-none-any.whl`, 1,160,341 bytes, SHA-256 `f62aa13af4525e5e98548612bc15171cbc01c784e7be55f73d704c7840164889`.
- Original saved provenance records 344 exported package files matching that source. Copied from task-2's `validation-runtime` into this task's `.local/ticket-384-runtime`; this is the accepted baseline artifact, not #383's candidate wheel/source.
- Installed with `PIP_NO_INDEX=1`, `pip install --no-deps --target` into this task only. Actual import: `.local/ticket-384-runtime/site/unchain/__init__.py`.
- Manifest exported by that actual imported module: `sha256:a4448f85fc219f8535a6dafca8cfe1f8ba7963a3219ef1a0f00f8f14e30079be`, schema `unchain.runtime_protocol_manifest.v1`.

The original baseline `produce-events.py` fixture from #383 was copied unchanged into the isolated local producer directory and executed against this exact wheel. It uses KernelLoop, ToolExecutionHarness and RuntimeEventBridge with deterministic FakeModelIO and pure in-memory tools; socket connections are replaced with failures. All four producer cases (silent/content/observed batch and observed sequential) completed, each with two actual tool calls/results. Recorded network attempts: `[]`.

Canonical/raw events, full producer evidence and provenance remain under `.local/ticket-384-runtime/producer`. No application bridge, shared profile, durable user database, provider request, approval service or running sidecar was accessed. Prefixing this real producer output around calls/results can supply realistic isolated stop fixtures; those prefixes must not be described as actual live cancellation evidence.

Command (from this isolated checkout):

```
PYTHONPATH=$PWD/.local/ticket-384-runtime/site \
  /Users/red/Desktop/GITRepo/PuPu/.venv/bin/python \
  .local/ticket-384-runtime/producer/produce-events.py
```

No rebuild is required; subsequent acceptance must reuse and checksum this same wheel and actual imported manifest. Real deployed app/sidecar pairing and cold restart remain NOT_RUN, active rollout INCOMPLETE.
