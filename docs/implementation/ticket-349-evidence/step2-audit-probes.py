import json, os, threading, time
from unittest import mock
import test_memory_v2_lifecycle_adapter as fixture
import memory_v2_background_worker as bg
from memory_v2_unchain_agent_selection import PupuOfficialMemoryAgentInvokerFactory
import unchain_adapter as ua

results = {}
fixture.setUpModule()
try:
    case = fixture.MemoryV2LifecycleAdapterTests()
    case.setUp()
    try:
        case.test_completed_root_enqueues_one_pending_job_and_partial_or_child_does_not()
        registry = bg._DISPATCHER.registry
        row = registry.page()[0]
        original = case.store.list_consolidation_jobs(owner_chat_id='chat_a')['jobs'][0]
        now = int(time.time() * 1000)
        for index in range(500):
            case.store._clock = lambda i=index: now + i + 1
            case.store.enqueue_consolidation_job(owner_chat_id='chat_a', session_id='session_a',
                attempt_id='attempt_complete', job_type='memory_curator', payload={},
                operation_id=f'audit-future-{index}', next_attempt_at_ms=now+3600000)
        with mock.patch('memory_v2_runtime.get_memory_v2_runtime', return_value=case.runtime), mock.patch.dict(os.environ, {'PUPU_CONTEXT_V2_STORE_OWNER':'pupu_legacy'}):
            result = bg.process_owner(registry, row, threading.Event())
        claimed = case.store.claim_consolidation_job(owner_chat_id='chat_a', worker_id='audit-worker',
            operation_id='audit-direct-claim')['job']
        assert result == 'idle'
        assert claimed['job_id'] == original['job_id']
        results['legacy_page_false_idle'] = {'dispatcher_result':result, 'newer_future_jobs':500,
            'direct_store_claim_found_original_ready_job':True}
    finally:
        case.tearDown()
        case.doCleanups()

    case = fixture.MemoryV2LifecycleAdapterTests()
    case.setUp()
    try:
        original_finalizer = ua._finalize_memory_v2_curator
        custom = {'id':'auditgateway','protocol':'openai-responses','base_url':'https://gateway.invalid/v1',
                  'auth':{'mode':'none'},'models':[{'id':'gpt-test'}]}
        def finalize(admission, options, **kwargs):
            selected = dict(options, custom_provider=custom,
                _memory_v2_memory_agent_config={'displayName':'Memory Agent','additionalInstructions':'',
                                               'provider':'openai','modelId':'gpt-test'})
            return original_finalizer(admission, selected, **kwargs)
        with mock.patch.object(ua, '_finalize_memory_v2_curator', side_effect=finalize):
            case.test_completed_root_enqueues_one_pending_job_and_partial_or_child_does_not()
        registry = bg._DISPATCHER.registry
        row = registry.page()[0]
        initial_config = json.loads(row['config_json'])
        assert initial_config['custom'] is True
        options = registry.options(row)
        options.pop('custom_provider')
        options['api_key'] = 'audit-dummy-builtin-key'
        bg.register_background_host(database_path=registry.database_path, owner_chat_id='chat_a', backend='pupu_legacy',
            invoker_factory=PupuOfficialMemoryAgentInvokerFactory(options=options, provider='openai', model_id='gpt-test'))
        observed = []
        def intercept_constructor(**kwargs):
            observed.append({'provider':kwargs['provider'], 'model':kwargs['model'],
                             'custom_transport': 'model_io_factory' in kwargs})
            raise RuntimeError('audit_stops_before_network')
        with mock.patch('memory_v2_runtime.get_memory_v2_runtime', return_value=case.runtime), mock.patch.dict(os.environ, {'PUPU_CONTEXT_V2_STORE_OWNER':'pupu_legacy'}), mock.patch.object(ua, '_UnchainAgent', side_effect=intercept_constructor):
            result = bg.process_owner(registry, registry.page()[0], threading.Event())
        assert observed and observed[0]['custom_transport'] is False
        results['legacy_custom_to_builtin'] = {'enqueued_with_custom_transport':True,
            'later_registration_custom':json.loads(registry.page()[0]['config_json'])['custom'],
            'old_job_agent_construction':observed, 'outbound_requests':0}
    finally:
        case.tearDown()
        case.doCleanups()
finally:
    fixture.tearDownModule()
print(json.dumps(results, indent=2))
