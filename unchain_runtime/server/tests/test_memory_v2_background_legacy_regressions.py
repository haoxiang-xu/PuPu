"""Acceptance regressions for #349's legacy background queue/provider boundary."""
from __future__ import annotations

import copy
import json
import os
import threading
import time
from unittest import mock

import pytest

import memory_v2_background_worker as bg
import unchain_adapter as ua
from memory_v2_unchain_agent_selection import PupuOfficialMemoryAgentInvokerFactory
import test_memory_v2_lifecycle_adapter as lifecycle_fixture


@pytest.fixture
def legacy():
    case = lifecycle_fixture.MemoryV2LifecycleAdapterTests()
    case.setUp()
    try:
        with mock.patch('memory_v2_context.resolve_context_memory_v2_capability', return_value=
            lifecycle_fixture.ContextMemoryV2CapabilityVerdict(ready=True, reason='unchain_context_memory_ready',
                verification='exact_sha', immutable=True, unchain_revision='a' * 40)), \
            mock.patch('memory_v2_runtime.get_memory_v2_runtime', return_value=case.runtime), \
            mock.patch.dict(os.environ, {'PUPU_CONTEXT_V2_STORE_OWNER': 'pupu_legacy'}):
            yield case
    finally:
        case.tearDown()
        case.doCleanups()


def _custom(slug='gateway-a', url='https://gateway-a.invalid/v1'):
    return {'id': slug, 'protocol': 'openai-responses', 'base_url': url,
            'auth': {'mode': 'none'}, 'models': [{'id': 'gpt-test'}]}


def _seed(case, custom=None):
    finalize = ua._finalize_memory_v2_curator
    def with_options(admission, options, **kwargs):
        if kwargs.get('run_id') == 'attempt_complete':
            case.background_test_admission = admission
        selected = dict(options, api_key='test-provider-key',
            _memory_v2_memory_agent_config={'displayName': 'Memory Agent', 'additionalInstructions': '',
                                           'provider': 'openai', 'modelId': 'gpt-test'})
        if custom is not None:
            selected['custom_provider'] = custom
        return finalize(admission, selected, **kwargs)
    with mock.patch.object(ua, '_finalize_memory_v2_curator', side_effect=with_options):
        case.test_completed_root_enqueues_one_pending_job_and_partial_or_child_does_not()
    registry = bg._DISPATCHER.registry
    job = case.store.list_consolidation_jobs(owner_chat_id='chat_a')['jobs'][0]
    return registry, job


def _register(registry, options):
    bg.register_background_host(database_path=registry.database_path, owner_chat_id='chat_a',
        backend='pupu_legacy', invoker_factory=PupuOfficialMemoryAgentInvokerFactory(
            options=options, provider='openai', model_id='gpt-test'))


def _process(registry):
    return bg.process_owner(registry, registry.page()[0], threading.Event())


@pytest.mark.parametrize('replacement', ['builtin', 'custom-b', 'changed-endpoint'])
def test_delayed_custom_job_does_not_change_transport(legacy, replacement):
    registry, job = _seed(legacy, _custom())
    options = registry.options(registry.page()[0])
    if replacement == 'builtin':
        options.pop('custom_provider')
    elif replacement == 'custom-b':
        options['custom_provider'] = _custom('gateway-b', 'https://gateway-b.invalid/v1')
    else:
        options['custom_provider'] = _custom(url='https://changed.invalid/v1')
    _register(registry, options)
    with mock.patch.object(ua, '_UnchainAgent', side_effect=AssertionError('wrong destination')) as agent:
        assert _process(registry) == 'retry'
    agent.assert_not_called()
    durable = legacy.store.list_consolidation_jobs(owner_chat_id='chat_a')['jobs'][0]
    assert durable['job_id'] == job['job_id']
    assert durable['status'] == 'pending'
    assert durable['last_error_code'] == 'memory_background_provider_configuration_changed'


@pytest.mark.parametrize('state', ['pending', 'leased'])
def test_ready_legacy_job_is_found_beyond_deferred_page(legacy, state):
    registry, job = _seed(legacy)
    now = int(time.time() * 1000)
    if state == 'leased':
        legacy.store._clock = lambda: now - 2000
        legacy.store.claim_consolidation_job(owner_chat_id='chat_a', worker_id='old-worker',
            operation_id='old-claim', lease_ms=1000)
    for index in range(500):
        legacy.store._clock = lambda i=index: now + i + 1
        legacy.store.enqueue_consolidation_job(owner_chat_id='chat_a', session_id='session_a',
            attempt_id='attempt_complete', job_type='memory_curator', payload={},
            operation_id=f'future-{index}', next_attempt_at_ms=now + 3600000)
        if state == 'leased':
            # Persisted leases with a future expiry, ahead of the old expired claim.
            with legacy.store._write() as connection:
                connection.execute("UPDATE consolidation_jobs SET status='leased', lease_expires_at_ms=? "
                    "WHERE job_id != ? AND status='pending'", (now + 3600000, job['job_id']))
    legacy.store._clock = lambda: int(time.time() * 1000)
    called = []
    class Agent:
        def __init__(self, toolkit):
            self.toolkit = toolkit
        def run(self, request):
            called.append(request)
            candidate = request['candidates'][0]
            self.toolkit._pupu_memory_v2_callables['memory_candidate_apply_new'](
                candidate_ref=candidate['candidate_ref'], expected_binding_revision=candidate['binding_revision'],
                expected_space_revision=1)
            return {'status': 'completed'}
    with mock.patch.object(ua, '_memory_v2_curator_agent_factory',
            return_value=lambda **kwargs: Agent(kwargs['toolkit'])):
        assert _process(registry) == 'processed'
    assert len(called) == 1
    with legacy.store._read() as connection:
        assert connection.execute('SELECT status FROM consolidation_jobs WHERE job_id=?',
                                  (job['job_id'],)).fetchone()['status'] == 'completed'


def _replace_payload(case, job, payload):
    import hashlib
    encoded = json.dumps(payload, sort_keys=True, separators=(',', ':'))
    with case.store._write() as connection:
        connection.execute('UPDATE consolidation_jobs SET payload_json=?, payload_hash=? WHERE job_id=?',
            (encoded, hashlib.sha256(encoded.encode()).hexdigest(), job['job_id']))


def _due_now(case, job):
    with case.store._write() as connection:
        connection.execute('UPDATE consolidation_jobs SET next_attempt_at_ms=0 WHERE job_id=?', (job['job_id'],))


def _apply_factory(calls, expected_options):
    def build(options):
        assert options.get('custom_provider') == expected_options.get('custom_provider')
        assert options.get('api_key') == expected_options.get('api_key')
        class Agent:
            def __init__(self, toolkit):
                self.toolkit = toolkit
            def run(self, request):
                calls.append(request)
                candidate = request['candidates'][0]
                self.toolkit._pupu_memory_v2_callables['memory_candidate_apply_new'](
                    candidate_ref=candidate['candidate_ref'], expected_binding_revision=candidate['binding_revision'],
                    expected_space_revision=1)
                return {'status': 'completed'}
        return lambda **kwargs: Agent(kwargs['toolkit'])
    return build


def test_restoring_original_transport_retries_and_applies_once(legacy):
    registry, job = _seed(legacy, _custom())
    original = registry.options(registry.page()[0])
    changed = dict(original, custom_provider=_custom('gateway-b', 'https://gateway-b.invalid/v1'))
    _register(registry, changed)
    with mock.patch.object(ua, '_memory_v2_curator_agent_factory') as factory:
        assert _process(registry) == 'retry'
        assert _process(registry) == 'idle'
    factory.assert_not_called()
    _register(registry, original)
    _due_now(legacy, job)
    calls = []
    with mock.patch.object(ua, '_memory_v2_curator_agent_factory', side_effect=_apply_factory(calls, original)):
        assert _process(registry) == 'processed'
        assert _process(registry) == 'idle'
    durable = legacy.store.list_consolidation_jobs(owner_chat_id='chat_a')['jobs'][0]
    assert durable['status'] == 'completed'
    assert durable['attempt_count'] == 2
    assert durable['payload']['background_provider_binding'] == job['payload']['background_provider_binding']
    assert len(calls) == 1


def test_exact_completed_finalizer_replay_preserves_one_job_and_audit_event(legacy):
    registry, job = _seed(legacy, _custom())
    options = registry.options(registry.page()[0])
    with legacy.store._read() as connection:
        before = connection.execute('SELECT COUNT(*) FROM events').fetchone()[0]
    result = ua._finalize_memory_v2_curator(legacy.background_test_admission, options,
        run_id='attempt_complete', lifecycle='resume')
    assert result['job_id'] == job['job_id']
    assert len(legacy.store.list_consolidation_jobs(owner_chat_id='chat_a')['jobs']) == 1
    with legacy.store._read() as connection:
        assert connection.execute('SELECT COUNT(*) FROM events').fetchone()[0] == before


def test_cold_custom_job_waits_for_matching_configuration_then_resumes(legacy):
    registry, job = _seed(legacy, _custom())
    original = registry.options(registry.page()[0])
    cold = bg.MemoryBackgroundRegistry(registry.database_path)
    with mock.patch.object(ua, '_memory_v2_curator_agent_factory') as factory:
        assert _process(cold) == 'retry'
    factory.assert_not_called()
    pending = legacy.store.list_consolidation_jobs(owner_chat_id='chat_a')['jobs'][0]
    assert pending['last_error_code'] == 'memory_background_provider_configuration_unavailable'
    selected = bg.configuration_from_factory(PupuOfficialMemoryAgentInvokerFactory(
        options=original, provider='openai', model_id='gpt-test'))
    cold.register('chat_a', 'pupu_legacy', *selected)
    _due_now(legacy, job)
    calls = []
    with mock.patch.object(ua, '_memory_v2_curator_agent_factory', side_effect=_apply_factory(calls, original)):
        assert _process(cold) == 'processed'
    assert len(calls) == 1


@pytest.mark.parametrize('custom', [False, True])
def test_rotating_key_preserves_binding_and_never_persists_key(legacy, custom):
    registry, job = _seed(legacy, _custom() if custom else None)
    binding = job['payload']['background_provider_binding']
    assert set(binding) == {'schema', 'provider', 'model_id', 'custom', 'transport_digest'}
    assert binding['schema'] == 'pupu.memory-background-provider.v1'
    assert binding['provider'] == 'openai' and binding['model_id'] == 'gpt-test'
    assert binding['custom'] is custom
    assert len(binding['transport_digest']) == (64 if custom else 0)
    options = registry.options(registry.page()[0])
    options['api_key'] = 'rotated-provider-secret-marker'
    options['custom_provider_api_key'] = 'rotated-custom-secret-marker'
    _register(registry, options)
    calls = []
    with mock.patch.object(ua, '_memory_v2_curator_agent_factory', side_effect=_apply_factory(calls, options)):
        assert _process(registry) == 'processed'
    assert len(calls) == 1
    raw = registry.database_path.read_bytes()
    for marker in (b'rotated-provider-secret-marker', b'rotated-custom-secret-marker', b'gateway-a.invalid'):
        assert marker not in raw


@pytest.mark.parametrize('corruption', ['missing', 'unknown-field', 'version', 'type', 'model', 'digest', 'custom-list'])
def test_job_binding_corruption_retries_before_model_construction(legacy, corruption):
    registry, job = _seed(legacy, _custom())
    payload = copy.deepcopy(job['payload'])
    binding = payload['background_provider_binding']
    if corruption == 'missing':
        payload.pop('background_provider_binding')
    elif corruption == 'unknown-field':
        binding['extension'] = True
    elif corruption == 'version':
        binding['schema'] = 'pupu.memory-background-provider.v999'
    elif corruption == 'type':
        binding['custom'] = 1
    elif corruption == 'model':
        binding['model_id'] = 'different-model'
    elif corruption == 'custom-list':
        binding['custom'] = []
    else:
        binding['transport_digest'] = 'invalid'
    _replace_payload(legacy, job, payload)
    with mock.patch.object(ua, '_memory_v2_curator_agent_factory') as factory:
        assert _process(registry) == 'retry'
    factory.assert_not_called()
    durable = legacy.store.list_consolidation_jobs(owner_chat_id='chat_a')['jobs'][0]
    assert durable['status'] == 'pending'
    assert durable['last_error_code'] == ('memory_background_provider_identity_unavailable'
        if corruption == 'missing' else 'memory_background_provider_binding_invalid')
    assert durable['next_attempt_at_ms'] > int(time.time() * 1000)


def test_replayed_enqueue_cannot_replace_original_job_binding(legacy):
    from memory_v2_curator import MemoryV2Curator
    registry, job = _seed(legacy, _custom())
    options = registry.options(registry.page()[0])
    options['custom_provider'] = _custom('gateway-b', 'https://gateway-b.invalid/v1')
    _register(registry, options)
    replacement = bg.background_provider_binding_from_factory(PupuOfficialMemoryAgentInvokerFactory(
        options=options, provider='openai', model_id='gpt-test'))
    summary = MemoryV2Curator(legacy.runtime).enqueue_for_completed_root_run(
        owner_chat_id='chat_a', session_id='session_a', attempt_id='attempt_complete',
        run_id='attempt_complete', run_status='complete', memory_agent_config=options['_memory_v2_memory_agent_config'],
        chat_provider='openai', chat_model_id='gpt-test', background_provider_binding=replacement)
    assert summary['job']['job_id'] == job['job_id'] and summary['replayed'] is True
    durable = legacy.store.list_consolidation_jobs(owner_chat_id='chat_a')['jobs'][0]
    assert durable['payload']['background_provider_binding'] == job['payload']['background_provider_binding']
    with mock.patch.object(ua, '_memory_v2_curator_agent_factory') as factory:
        assert _process(registry) == 'retry'
    factory.assert_not_called()
