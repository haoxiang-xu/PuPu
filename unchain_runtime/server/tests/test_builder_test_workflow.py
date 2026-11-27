"""A real Workflow root, no Agent/Kernel or provider round trip."""
import pytest
from test_skeleton_production_chat import production  # noqa: F401
from test_skeleton_workflow_parameters import workflow
from skeleton_code_admission import prepare_test_execution_material
from skeleton_production_state import load_launch
from unchain.skeleton.errors import SkeletonValidationError


def test_workflow_adapter_rejects_duck_typed_ownership_before_binding_a_context():
    from skeleton_workflow_test_runtime import PupuSkeletonWorkflowExecution
    from types import SimpleNamespace
    touched=[]
    plan=SimpleNamespace(snapshot=lambda:{'kind':'workflow'})
    guard=SimpleNamespace(assert_active=lambda:touched.append(True))
    with pytest.raises(TypeError):
        PupuSkeletonWorkflowExecution(plan,object(),graph_id='wrong',execution_guard=guard,
            durability_runtime=object(),root_handlers_factory=lambda *args:{})
    assert touched==[]


def test_standalone_workflow_uses_declared_defaults_and_commits_real_end(production):
    from skeleton_production_chat import stream_skeleton_test_events
    store, options, calls = production
    options = dict(options, skeleton_credentials={})
    saved = store.save_draft(workflow())
    selection, dependencies = prepare_test_execution_material(saved['id'], saved['edit_token'], 'workflow', store=store)
    events = list(stream_skeleton_test_events(selection=selection, workflows=dependencies,
        inputs={'city':'Vancouver'}, options=options, session_id='workflow-session', attempt_id='workflow-root'))
    launch = load_launch('workflow-session','workflow-root',expected_owner_chat_id='production-chat')
    state = launch.store.load().state
    assert launch.plan.snapshot()['kind'] == 'workflow'
    assert state['status'] == 'completed' and state['root_committed'] is True
    assert launch.descriptor['inputs'] == {'city':'Vancouver','days':1}
    assert launch.store.read_json(state['completed'][-1]['output_ref']) == {'args':{'city':'Vancouver','days':1}}
    assert [event['status'] for event in events if event.get('type')=='run_completed'] == ['completed']
    assert not any(event.get('type')=='final_message' for event in events), 'A function result is not an Agent chat message'
    assert calls == []


def test_invalid_workflow_arguments_refuse_before_execution_or_provider(production):
    from skeleton_production_chat import stream_skeleton_test_events
    store, options, calls = production
    options = dict(options, skeleton_credentials={})
    saved = store.save_draft(workflow())
    selection, dependencies = prepare_test_execution_material(saved['id'], saved['edit_token'], 'workflow', store=store)
    with pytest.raises(SkeletonValidationError):
        list(stream_skeleton_test_events(selection=selection, workflows=dependencies,
            inputs={'city':7},options=options,session_id='invalid-workflow',attempt_id='invalid-root'))
    assert calls == []


def _workflow_write(production, tmp_path):
    store, options, calls = production
    options = dict(options, skeleton_credentials={}, toolkits=['CoreToolkit'])
    doc = workflow()
    doc['nodes'].insert(1, {'id':'write', 'type':'tool_call', 'config':{
        'tool':{'name':'write','on_error':'stop','approval_timeout_ms':60000},
        'execution':{'inputs':[
            {'name':'path','value':{'kind':'literal','value':str(tmp_path/'workflow-once.txt')},'missing':'error'},
            {'name':'content','value':{'kind':'literal','value':'approved workflow'},'missing':'error'}], 'outputs':[]}}})
    doc['edges'][0]['target_node_id']='write'
    doc['edges'].append({'id':'write-end','kind':'flow','source_node_id':'write','source_port_id':'out','target_node_id':'end','target_port_id':'in'})
    saved=store.save_draft(doc)
    selected,deps=prepare_test_execution_material(saved['id'],saved['edit_token'],'workflow',store=store)
    return options,calls,selected,deps


def test_workflow_approval_uses_canonical_receipt_then_resumes_once(production,tmp_path):
    from skeleton_production_chat import stream_skeleton_test_events, resume_skeleton_chat_events
    import durable_interaction_host as interactions
    options,calls,selected,deps=_workflow_write(production,tmp_path)
    list(stream_skeleton_test_events(selection=selected,workflows=deps,inputs={'city':'A'},options=options,
        session_id='wf-wait',attempt_id='wf-wait-root'))
    pending=interactions.get_pending_interaction('wf-wait')
    assert pending['status']=='awaiting_response'
    assert not (tmp_path/'workflow-once.txt').exists()
    interactions.record_interaction_receipt(session_id='wf-wait',interaction_id=pending['interaction_id'],approved=True)
    list(resume_skeleton_chat_events(session_id='wf-wait',interaction_id=pending['interaction_id'],
        options=options,attempt_id='wf-resume',source_attempt_id='wf-wait-root'))
    launch=load_launch('wf-wait','wf-wait-root')
    assert launch.store.load().state['status']=='completed'
    assert (tmp_path/'workflow-once.txt').read_text()=='approved workflow'
    assert calls==[]


def test_workflow_cancel_does_not_dispatch_waiting_write(production,tmp_path):
    from skeleton_production_chat import stream_skeleton_test_events
    from skeleton_production_interactions import cancel_skeleton_execution
    import durable_interaction_host as interactions
    options,calls,selected,deps=_workflow_write(production,tmp_path)
    list(stream_skeleton_test_events(selection=selected,workflows=deps,inputs={'city':'A'},options=options,
        session_id='wf-cancel',attempt_id='wf-cancel-root'))
    pending=interactions.get_pending_interaction('wf-cancel')
    result=cancel_skeleton_execution(session_id='wf-cancel',attempt_id='wf-cancel-root',source_attempt_id='wf-cancel-root',
        owner_chat_id='production-chat',expected_interaction_id=pending['interaction_id'],reason='user_stop')
    assert result['status']=='ok' and result['durable_interaction_cancelled'] is True
    assert load_launch('wf-cancel','wf-cancel-root').store.load().state['status']=='cancelled'
    assert not (tmp_path/'workflow-once.txt').exists() and calls==[]
