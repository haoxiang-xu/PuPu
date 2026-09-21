"""Real shipped-provider producer -> PuPu factory -> installed Unchain contract."""

import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

SERVER = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVER))

from custom_provider import make_custom_model_io_factory, parse_custom_provider


def _providers():
    artifact = SERVER.parents[1] / "docs/implementation/ticket-202-evidence/shipped_provider_wire.json"
    return json.loads(artifact.read_text())["providers"]


@pytest.mark.parametrize("slug", ["kimi", "kimi-cn", "deepseek"])
def test_shipped_factory_selects_only_k27_code_replay_profile(slug):
    provider = _providers()[slug]
    cfg = parse_custom_provider({"custom_provider": provider})
    factory = make_custom_model_io_factory(cfg, "fixture-key")
    for model in provider["models"]:
        model_id = model["id"]
        io = factory(SimpleNamespace(provider=cfg.twin, model=model_id), None)
        if slug in {"kimi", "kimi-cn"} and model_id == "kimi-k2.7-code":
            assert io.provider_replay_profile == {
                "profile": "kimi.unsigned-thinking.v1",
                "endpoint": provider["base_url"],
                "model": model_id,
            }
            assert io._merged_payload({}).get("thinking") != {"type": "disabled"}
        else:
            assert io.provider_replay_profile is None
            if slug in {"kimi", "kimi-cn"}:
                assert io._merged_payload({})["thinking"] == {"type": "disabled"}


def test_custom_endpoint_cannot_inherit_kimi_profile_by_model_name():
    provider = _providers()["kimi"]
    provider["base_url"] = "https://example.invalid/anthropic"
    cfg = parse_custom_provider({"custom_provider": provider})
    io = make_custom_model_io_factory(cfg, "fixture-key")(
        SimpleNamespace(provider=cfg.twin, model="kimi-k2.7-code"), None,
    )
    assert io.provider_replay_profile is None


@pytest.mark.parametrize("signature", ["absent", None, "", "valid-signature", 123])
def test_pinned_sdk_stream_and_final_message_replay(signature):
    import anthropic
    import httpx
    from unchain.kernel import ModelTurnRequest
    from unchain.kernel.provider_replay import ProviderReplayFrameError
    from unchain.providers import HyperspaceModelIO

    model, endpoint = "kimi-k2.7-code", "https://api.moonshot.ai/anthropic"
    thinking = {"type": "thinking", "thinking": ""}
    if signature != "absent":
        thinking["signature"] = signature
    events = [
        {"type": "message_start", "message": {
            "id": "msg_fixture", "type": "message", "role": "assistant", "model": model,
            "content": [], "stop_reason": None, "stop_sequence": None,
            "usage": {"input_tokens": 1, "output_tokens": 0},
        }},
        {"type": "content_block_start", "index": 0, "content_block": thinking},
        {"type": "content_block_delta", "index": 0,
         "delta": {"type": "thinking_delta", "thinking": "plan"}},
        {"type": "content_block_stop", "index": 0},
        {"type": "content_block_start", "index": 1, "content_block": {
            "type": "tool_use", "id": "toolu_1", "name": "demo_tool", "input": {},
        }},
        {"type": "content_block_delta", "index": 1,
         "delta": {"type": "input_json_delta", "partial_json": '{"x":2}'}},
        {"type": "content_block_stop", "index": 1},
        {"type": "message_delta", "delta": {"stop_reason": "tool_use", "stop_sequence": None},
         "usage": {"output_tokens": 3}},
        {"type": "message_stop"},
    ]
    body = "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in events)

    def factory(**kwargs):
        return anthropic.Anthropic(**kwargs, base_url=endpoint, http_client=httpx.Client(
            transport=httpx.MockTransport(lambda req: httpx.Response(
                200, headers={"Content-Type": "text/event-stream"}, text=body,
            )),
        ))

    io = HyperspaceModelIO(model=model, api_key="fixture-key", base_url=endpoint, client_factory=factory)
    request = ModelTurnRequest(messages=[{"role": "user", "content": "use tool"}])
    if signature == 123:
        with pytest.raises(ProviderReplayFrameError, match="signature"):
            io.fetch_turn(request)
        return
    turn = io.fetch_turn(request)
    expected = {"type": "thinking", "thinking": "plan"}
    if signature == "valid-signature":
        expected["signature"] = signature
    assert turn.provider_replay_frame["items"][-1]["content"][0] == expected
