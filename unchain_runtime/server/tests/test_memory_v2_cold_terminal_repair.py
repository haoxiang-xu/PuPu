"""#389: repair terminal records only under an idle session's exact authority."""
from types import SimpleNamespace

import pytest

from execution_control import ExecutionControlRegistry
from memory_v2_unchain_generation_api import (
    MemoryV2UnchainGenerationAPIError, open_pupu_unchain_generation_api,
)
from test_memory_v2_unchain_generation_api import (
    _setup_generation_api, _single_step_graph_runtime, _rebase, _counts,
)
from memory_v2_unchain_host_event_boundary import (
    PupuUnchainHostEventAuthority, PupuUnchainHostEventBoundary,
    PupuUnchainHostEventBoundaryError,
)


@pytest.fixture(autouse=True)
def guard_protocol(tmp_path):
    from session_execution_guard import SessionExecutionGuardRegistry
    SessionExecutionGuardRegistry(data_dir=tmp_path).initialize_protocol()


@pytest.mark.parametrize('state', ['failed', 'cancelled', 'dead'])
def test_cold_graph_repairs_step_and_root_before_edit(tmp_path, state):
    setup = _setup_generation_api(tmp_path / 'memory_v2')
    plan, step, sink, repo = _single_step_graph_runtime(setup)
    controls = ExecutionControlRegistry(data_dir=tmp_path, process_pid=99999999)
    controls.register(setup.session_id, plan.orchestration_attempt.attempt_id)
    controls.mark_running(setup.session_id, plan.orchestration_attempt.attempt_id)
    if state == 'failed':
        controls.mark_failed(setup.session_id, plan.orchestration_attempt.attempt_id)
    if state == 'cancelled':
        controls.request_cancel(setup.session_id, plan.orchestration_attempt.attempt_id)
    api = open_pupu_unchain_generation_api(root_dir=setup.root_dir, owner_chat_id=setup.owner_chat_id)
    assert _rebase(api, setup)['session_revision'] == 2
    events = setup.store.bind_execution(setup.execution_id).capture_snapshot().events
    terminal_type = 'run_cancelled' if state == 'cancelled' else 'run_failed'
    for attempt in (step.attempt, plan.orchestration_attempt):
        terminal = [e for e in events if e.attempt == attempt and e.event_type == terminal_type]
        assert len(terminal) == 1
        assert terminal[0].payload['code'] == 'cold_terminal_repair'
    assert len([e for e in events if e.event_type == ('graph.step.cancelled' if state == 'cancelled' else 'graph.step.failed')]) == 1
    # Retrying the frozen request is idempotent; no second terminal.
    before = _counts(setup.store)
    assert _rebase(api, setup)['session_revision'] == 2
    assert _counts(setup.store) == before


@pytest.mark.parametrize('state', ['running', 'missing', 'completed', 'other_session'])
def test_cold_repair_never_guesses_dead_attempt(tmp_path, state):
    setup = _setup_generation_api(tmp_path / 'memory_v2')
    plan, step, sink, repo = _single_step_graph_runtime(setup)
    controls = ExecutionControlRegistry(data_dir=tmp_path)
    session = 'other-session' if state == 'other_session' else setup.session_id
    if state != 'missing':
        controls.register(session, plan.orchestration_attempt.attempt_id)
        controls.mark_running(session, plan.orchestration_attempt.attempt_id)
    if state == 'completed':
        controls.mark_completed(session, plan.orchestration_attempt.attempt_id)
    api = open_pupu_unchain_generation_api(root_dir=setup.root_dir, owner_chat_id=setup.owner_chat_id)
    before = _counts(setup.store)
    with pytest.raises(MemoryV2UnchainGenerationAPIError) as error:
        _rebase(api, setup)
    assert error.value.code == 'context_v2_rebase_in_progress'
    assert _counts(setup.store) == before


def _cold_event():
    return dict(type='run_cancelled', run_id='old-attempt', iteration=0,
                status='cancelled', code='cold_terminal_repair',
                message='Run cancelled', recoverable=False)


def _cold_boundary():
    return PupuUnchainHostEventBoundary(active_bridge=SimpleNamespace(execution_id='execution'),
                                       execution_id='execution', attempt_id='old-attempt', enqueue=lambda _: None)


def test_cold_terminal_boundary_accepts_closed_payload():
    authority = PupuUnchainHostEventAuthority(execution_id='execution', attempt_id='old-attempt', origin='cold_terminal_repair')
    bound = _cold_boundary().bind_semantic(_cold_event(), authority=authority)
    assert bound.event == _cold_event()


@pytest.mark.parametrize('mutation', [
    {'extra': 'unknown'}, {'run_id': 'new-attempt'}, {'type': 'run_completed'},
    {'code': 'arbitrary'}, {'iteration': True}, {'message': 'provider secret'},
    {'status': 'failed'}, {'recoverable': True},
])
def test_cold_terminal_boundary_rejects_drift(mutation):
    authority = PupuUnchainHostEventAuthority(execution_id='execution', attempt_id='old-attempt', origin='cold_terminal_repair')
    with pytest.raises(PupuUnchainHostEventBoundaryError):
        _cold_boundary().bind_semantic({**_cold_event(), **mutation}, authority=authority)


def test_cancelled_record_cannot_bypass_live_worker_guard(tmp_path):
    from session_execution_guard import SessionExecutionGuardRegistry
    setup = _setup_generation_api(tmp_path / 'memory_v2')
    plan, _, _, _ = _single_step_graph_runtime(setup)
    root_id = plan.orchestration_attempt.attempt_id
    guard = SessionExecutionGuardRegistry(data_dir=tmp_path)
    guard.acquire(setup.session_id, root_id, operation='run')
    ExecutionControlRegistry(data_dir=tmp_path).request_cancel(setup.session_id, root_id)
    before = _counts(setup.store)
    api = open_pupu_unchain_generation_api(root_dir=setup.root_dir, owner_chat_id=setup.owner_chat_id)
    with pytest.raises(MemoryV2UnchainGenerationAPIError) as error:
        _rebase(api, setup)
    assert error.value.code == 'context_v2_rebase_in_progress'
    assert _counts(setup.store) == before
    assert guard.snapshot(setup.session_id).attempt_id == root_id


def test_repair_requires_exact_rebase_guard(tmp_path):
    from memory_v2_cold_terminal_repair import repair_cold_graph_terminals, ColdTerminalRepairError
    from test_memory_v2_unchain_generation_api import _recovery_request
    setup = _setup_generation_api(tmp_path / 'memory_v2')
    plan, _, _, _ = _single_step_graph_runtime(setup)
    ExecutionControlRegistry(data_dir=tmp_path).request_cancel(setup.session_id, plan.orchestration_attempt.attempt_id)
    before = _counts(setup.store)
    with pytest.raises(ColdTerminalRepairError):
        repair_cold_graph_terminals(service=setup.service, request=_recovery_request(setup, suffix='no-lock'), data_dir=tmp_path)
    assert _counts(setup.store) == before


def test_crash_after_step_terminal_recovers_without_duplicate(tmp_path, monkeypatch):
    import memory_v2_cold_terminal_repair as repair
    setup = _setup_generation_api(tmp_path / 'memory_v2')
    plan, step, _, _ = _single_step_graph_runtime(setup)
    ExecutionControlRegistry(data_dir=tmp_path).request_cancel(setup.session_id, plan.orchestration_attempt.attempt_id)
    api = open_pupu_unchain_generation_api(root_dir=setup.root_dir, owner_chat_id=setup.owner_chat_id)
    real_append = repair._append_terminal
    def crash_after_step(journal, attempt, **kwargs):
        changed = real_append(journal, attempt, **kwargs)
        if attempt == step.attempt:
            raise OSError('crash after step commit')
        return changed
    with monkeypatch.context() as m:
        m.setattr(repair, '_append_terminal', crash_after_step)
        with pytest.raises(MemoryV2UnchainGenerationAPIError) as error:
            _rebase(api, setup)
        assert error.value.code == 'context_v2_rebase_unavailable'
    # Recovery may first seal the step, then repair the remaining root on retry.
    for _ in range(3):
        try:
            result = _rebase(api, setup)
            break
        except MemoryV2UnchainGenerationAPIError as error:
            assert error.code == 'context_v2_rebase_in_progress'
    else:
        pytest.fail('repair did not converge')
    assert result['session_revision'] == 2
    events = setup.store.bind_execution(setup.execution_id).capture_snapshot().events
    for attempt in (step.attempt, plan.orchestration_attempt):
        assert sum(e.attempt == attempt and e.event_type == 'run_cancelled' for e in events) == 1
