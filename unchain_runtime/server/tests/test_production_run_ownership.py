from __future__ import annotations

import copy
import sys
from pathlib import Path
from types import SimpleNamespace


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

from production_run_ownership import (  # noqa: E402
    PupuProductionProviderTurnOwnershipFactory,
    ProductionRunOwnershipError,
    production_ownership_factory_for_agent,
)
import unchain_adapter  # noqa: E402
from completion_diagnostics import build_completion_diagnostics  # noqa: E402
from unchain.agent import Agent  # noqa: E402
from unchain.kernel.run_ledger import RunLedger  # noqa: E402
from unchain.providers import OpenAIModelIO  # noqa: E402
from unchain.providers.base import ModelTurnRequest  # noqa: E402
from unchain.retry import RetryConfig  # noqa: E402
from unchain.run_bundle import (  # noqa: E402
    ProviderCallReceipt,
    RunBundleReducer,
    RunDescriptor,
    RunIdentity,
    RunLifecycle,
)
from unchain.tools import Toolkit  # noqa: E402


def _identity() -> RunIdentity:
    return RunIdentity(
        execution_id="execution-memory-off",
        attempt_id="attempt-memory-off",
        root_run_id="attempt-memory-off",
        run_id="attempt-memory-off",
        parent_run_id=None,
        relation="root",
    )


class _OpenAIStream:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def __iter__(self):
        yield SimpleNamespace(
            type="response.output_text.delta",
            delta="durable ",
        )
        yield SimpleNamespace(
            type="response.completed",
            response=SimpleNamespace(
                id="response-memory-off",
                output=[
                    {
                        "type": "message",
                        "role": "assistant",
                        "content": [
                            {
                                "type": "output_text",
                                "text": "durable result",
                            }
                        ],
                    }
                ],
                usage={
                    "input_tokens": 2,
                    "output_tokens": 2,
                    "total_tokens": 4,
                },
            ),
        )


def _model_io(send_calls: list[dict]):
    class _Responses:
        def create(self, **kwargs):
            send_calls.append(copy.deepcopy(kwargs))
            return _OpenAIStream()

    class _Client:
        responses = _Responses()

    return OpenAIModelIO(
        model="gpt-test",
        api_key="test-key",
        client_factory=lambda **_kwargs: _Client(),
        default_payloads={},
        model_capabilities={},
    )


def _request() -> ModelTurnRequest:
    return ModelTurnRequest(
        messages=[{"role": "user", "content": "execute exactly once"}],
        payload={},
        callback=None,
        run_id=_identity().run_id,
        iteration=0,
        toolkit=Toolkit(),
        emit_stream=True,
    )


def _state(owner):
    ledger = RunLedger(
        identity=owner.identity,
        identity_source="explicit",
    )
    ledger.bind_provider_turn_ownership(owner)
    return SimpleNamespace(run_ledger=ledger)


def _fetch(owner, *, send_calls: list[dict]):
    return owner.fetch_turn(
        state=_state(owner),
        model_io=_model_io(send_calls),
        request=_request(),
        occurrence_id="agent_turn:attempt-memory-off:0",
        purpose="agent_turn",
        iteration=0,
        request_sha256="e" * 64,
        retry_config=RetryConfig(max_retries=0),
        provider="openai",
        model="gpt-test",
    )


def test_factory_reuses_one_exact_owner_and_atomic_store(tmp_path):
    factory = PupuProductionProviderTurnOwnershipFactory(
        root_directory=tmp_path / "production_runs_v1",
    )
    first = factory.bind(identity=_identity())
    second = factory.bind(identity=_identity())

    assert first is second
    assert first.factory is factory
    assert first.service.store is first.ledger
    assert first.identity == _identity()


def test_missing_data_directory_fails_closed_before_provider_send(
    monkeypatch,
):
    monkeypatch.delenv("UNCHAIN_DATA_DIR", raising=False)
    send_calls = []
    model_io = _model_io(send_calls)
    agent = Agent(
        name="missing-production-owner",
        instructions="respond once",
        provider="openai",
        model="gpt-test",
        model_io_factory=lambda _spec, _context: model_io,
    )

    try:
        agent.run(
            "hello",
            run_id=_identity().run_id,
            _run_bundle_identity=_identity(),
            _provider_turn_ownership_factory=(
                production_ownership_factory_for_agent()
            ),
        )
    except ProductionRunOwnershipError as error:
        assert "UNCHAIN_DATA_DIR" in str(error)
    else:
        raise AssertionError("missing durable data directory must fail closed")
    assert send_calls == []


def test_memory_off_crash_cold_replay_is_zero_resend_with_canonical_receipt(
    tmp_path,
):
    root = tmp_path / "production_runs_v1"
    first_factory = PupuProductionProviderTurnOwnershipFactory(
        root_directory=root,
    )
    first_owner = first_factory.bind(identity=_identity())
    first_sends: list[dict] = []

    # The provider result and accounting receipt commit before a Kernel result
    # or RunBundle is returned.  Dropping this state simulates that crash gap.
    first_result = _fetch(first_owner, send_calls=first_sends)
    assert first_result.final_text == "durable result"
    assert len(first_sends) == 1

    restarted_factory = PupuProductionProviderTurnOwnershipFactory(
        root_directory=root,
    )
    restarted_owner = restarted_factory.bind(identity=_identity())
    restart_sends: list[dict] = []
    recovered = _fetch(restarted_owner, send_calls=restart_sends)

    assert recovered.final_text == first_result.final_text
    assert restart_sends == []
    receipts = restarted_owner.ledger.load_receipts(
        root_run_id=_identity().root_run_id,
        owner_run_id=_identity().run_id,
        attempt_id=_identity().attempt_id,
    )
    assert len(receipts) == 1
    receipt = receipts[0]
    expected_identity = _identity()
    assert type(receipt) is ProviderCallReceipt
    assert ProviderCallReceipt.from_dict(receipt.to_dict()) == receipt
    assert receipt.identity.execution_id == expected_identity.execution_id
    assert receipt.identity.attempt_id == expected_identity.attempt_id
    assert receipt.identity.root_run_id == expected_identity.root_run_id
    assert receipt.identity.owner_run_id == expected_identity.run_id
    assert receipt.identity.parent_run_id == expected_identity.parent_run_id
    assert receipt.status == "completed"
    assert receipt.usage.source in {
        "provider_observed",
        "provider_observed_partial",
    }
    assert receipt.usage.input_total_tokens == 2
    assert receipt.usage.output_total_tokens == 2
    assert receipt.usage.total_tokens == 4
    assert receipt.receipt_sha256


def test_diagnostics_revision_cold_reloads_from_the_authoritative_ledger(
    tmp_path,
):
    root = tmp_path / "production_runs_v1"
    owner = PupuProductionProviderTurnOwnershipFactory(
        root_directory=root,
    ).bind(identity=_identity())
    initial = RunBundleReducer.reduce(
        identity=_identity(),
        lifecycle=RunLifecycle(
            status="completed",
            started_at="2026-08-14T00:00:00.000000000Z",
            completed_at="2026-08-14T00:00:01.000000000Z",
            continued_from_run_id=None,
        ),
        descriptor=RunDescriptor(
            model="openai:gpt-test",
            display_model="GPT Test",
            active_agent="developer",
            agent_orchestration="default",
            iteration=0,
        ),
        receipts=(),
    )
    owner.ledger.persist_bundle(initial)
    diagnostics = build_completion_diagnostics(
        {"mode": "shadow", "available_input_tokens": 1_234}
    )

    projected = unchain_adapter._bind_completion_diagnostics_to_run_bundle(
        initial.to_dict(),
        diagnostics,
        run_bundle_ledger=owner.ledger,
        run_id=_identity().run_id,
    )

    assert projected["revision"] == initial.revision + 1
    restarted = PupuProductionProviderTurnOwnershipFactory(
        root_directory=root,
    ).bind(identity=_identity())
    durable = restarted.ledger.list_bundles(
        root_run_id=_identity().root_run_id,
        run_id=_identity().run_id,
        attempt_id=_identity().attempt_id,
    )
    assert len(durable) == 1
    assert durable[0].to_dict() == projected
