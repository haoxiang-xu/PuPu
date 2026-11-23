"""Test Run owns locators, not a second model loop or an ordinary chat."""
import pytest
from copy import deepcopy
import json
import os
from pathlib import Path
import subprocess
import sys
from test_skeleton_production_chat import production  # noqa: F401
from test_skeleton_workflow_parameters import workflow
from skeleton_resource_store import SkeletonResourceError


def sessions():
    from skeleton_builder_tests import BuilderTestSessions
    return BuilderTestSessions(background=False)


def test_open_detaches_and_reopens_without_execution(production):
    store, _options, calls = production
    tests = sessions()
    a = tests.open('production-agent', 'agent')
    assert a['runs'] == []
    assert tests.open('production-agent', 'agent') == a
    assert calls == []
    with pytest.raises(SkeletonResourceError):
        tests.read(a['session']['id'], 'another-agent')


def test_two_agent_turns_use_dedicated_server_history_and_idempotent_start(production):
    store, options, calls = production
    tests = sessions()
    session = tests.open('production-agent','agent')['session']['id']
    token = store.get_resource('production-agent')['edit_token']
    first = tests.prepare(session, 'production-agent', token, {'message':'first'}, 'request-1',context=options)
    tests.execute(session,'production-agent',first['run_id'],options)
    tests.execute(session,'production-agent',first['run_id'],options)
    assert len(calls) == 1
    view = tests.read(session,'production-agent')
    assert view['runs'][0]['status'] == 'completed'
    assert view['runs'][0]['output']['message'] == 'End production reply'
    second = tests.prepare(session,'production-agent',token,{'message':'second'},'request-2',context=options)
    tests.execute(session,'production-agent',second['run_id'],options)
    assert len(calls)==2
    assert 'End production reply' in str(calls[-1]['wire'])
    assert all(event['schema_version']=='v4' and event['session_id']==session for run in view['runs'] for event in run['events'])
    assert 'production-test-secret' not in json.dumps(view)
    assert sessions().read(session,'production-agent')['runs'] == tests.read(session,'production-agent')['runs']
    assert session != options['_memory_v2_owner_chat_id']
    new = tests.open('production-agent','agent',new=True)
    assert new['session']['id'] != session and new['runs'] == []


def test_prepared_workflow_uses_a_after_save_b_and_never_calls_model(production):
    store, options, calls = production
    saved = store.save_draft(workflow())
    tests = sessions()
    session = tests.open(saved['id'],'workflow')['session']['id']
    prepared = tests.prepare(session,saved['id'],saved['edit_token'],{'city':'A'},'request-A',context=options)
    assert prepared['requirements'] is None
    doc = saved['document']; doc['name']='Saved B'
    store.save_draft(doc,expected_edit_token=saved['edit_token'])
    view=tests.execute(session,saved['id'],prepared['run_id'],dict(options,skeleton_credentials={}))
    assert view['runs'][0]['output']=={'args':{'city':'A','days':1}}
    assert view['runs'][0]['edit_token']==saved['edit_token']
    assert view['runs'][0]['status']=='completed' and calls==[]
    with pytest.raises(SkeletonResourceError):
        tests.prepare(session,saved['id'],saved['edit_token'],{'city':'B'},'request-B',context=options)


def test_request_identity_also_freezes_authorized_tool_and_workspace_context(production,tmp_path):
    store,options,calls=production
    saved=store.save_draft(workflow());tests=sessions()
    session=tests.open(saved['id'],'workflow')['session']['id']
    run=tests.prepare(session,saved['id'],saved['edit_token'],{'city':'A'},'fixed-context',context=options)
    changed=dict(options,workspace_root=str(tmp_path/'another'))
    with pytest.raises(SkeletonResourceError):
        tests.prepare(session,saved['id'],saved['edit_token'],{'city':'A'},'fixed-context',context=changed)
    with pytest.raises(SkeletonResourceError):
        tests.execute(session,saved['id'],run['run_id'],changed)
    assert calls==[]


def test_workflow_wait_survives_manager_recreation_and_cancel_is_real(production,tmp_path):
    from test_builder_test_workflow import _workflow_write
    options,calls,selection,_deps = _workflow_write(production,tmp_path)
    tests=sessions()
    session=tests.open(selection.resource_id,'workflow')['session']['id']
    run=tests.prepare(session,selection.resource_id,selection.edit_token,{'city':'A'},'request-wait',context=options)
    waiting=tests.execute(session,selection.resource_id,run['run_id'],options)
    assert waiting['runs'][0]['status']=='waiting'
    assert waiting['runs'][0]['pending']['kind']=='tool_approval'
    with pytest.raises(SkeletonResourceError):
        tests.open(selection.resource_id,'workflow',new=True)
    cold=sessions()
    cold_pending=cold.read(session,selection.resource_id)['runs'][0]['pending']
    original=waiting['runs'][0]['pending']
    assert {key:value for key,value in cold_pending.items() if key!='presentation'}=={key:value for key,value in original.items() if key!='presentation'}
    assert cold_pending['presentation']['tool_call']==original['presentation']['tool_call']
    stopped=cold.cancel(session,selection.resource_id,run['run_id'])
    assert stopped['runs'][0]['status']=='cancelled'
    assert stopped['runs'][0]['pending'] is None
    assert not (tmp_path/'workflow-once.txt').exists() and calls==[]


def test_response_loss_lookup_and_duplicate_approve_do_not_repeat_effects(production,tmp_path):
    from test_builder_test_workflow import _workflow_write
    options,calls,selection,_deps=_workflow_write(production,tmp_path)
    tests=sessions(); resource=selection.resource_id
    session=tests.open(resource,'workflow')['session']['id']
    first=tests.prepare(session,resource,selection.edit_token,{'city':'one'},'same-request',context=options)
    assert tests.prepare(session,resource,selection.edit_token,{'city':'one'},'same-request',context=options)==first
    with pytest.raises(SkeletonResourceError):
        tests.prepare(session,resource,selection.edit_token,{'city':'changed'},'same-request',context=options)
    view=tests.execute(session,resource,first['run_id'],options)
    pending=view['runs'][0]['pending']['interaction_id']
    tests.execute(session,resource,first['run_id'],options)
    assert not (tmp_path/'workflow-once.txt').exists()
    ended=tests.respond(session,resource,first['run_id'],pending,True,options)
    assert ended['runs'][0]['status']=='completed'
    contents=(tmp_path/'workflow-once.txt').read_bytes()
    with pytest.raises(SkeletonResourceError):
        tests.respond(session,resource,first['run_id'],pending,True,options)
    assert (tmp_path/'workflow-once.txt').read_bytes()==contents and calls==[]


def test_failed_resume_setup_can_be_explicitly_retried_without_a_stale_error(production,tmp_path,monkeypatch):
    from test_builder_test_workflow import _workflow_write
    import skeleton_production_chat as chat
    from durable_interaction_host import DurableInteractionHostError
    options,calls,selection,_deps=_workflow_write(production,tmp_path)
    tests=sessions();resource=selection.resource_id;session=tests.open(resource,'workflow')['session']['id']
    run=tests.prepare(session,resource,selection.edit_token,{'city':'retry'},'retry-setup',context=options)['run_id']
    waiting=tests.execute(session,resource,run,options);interaction=waiting['runs'][-1]['pending']['interaction_id']
    original=chat.resume_skeleton_chat_events
    def unavailable(**kwargs):raise DurableInteractionHostError('test_setup_unavailable','Setup unavailable',status_code=503)
    monkeypatch.setattr(chat,'resume_skeleton_chat_events',unavailable)
    refused=tests.respond(session,resource,run,interaction,True,options)
    assert refused['runs'][-1]['pending']['status']=='receipt_recorded'
    assert refused['runs'][-1]['error']['code']=='test_setup_unavailable'
    assert not (tmp_path/'workflow-once.txt').exists()
    monkeypatch.setattr(chat,'resume_skeleton_chat_events',original)
    done=tests.respond(session,resource,run,interaction,None,options)
    assert done['runs'][-1]['status']=='completed'
    assert done['runs'][-1]['error'] is None
    assert calls==[]


def test_trace_limit_counts_utf8_bytes_not_unicode_characters(production):
    tests=sessions()
    for index in range(8):
        tests._record_event({'id':'unicode-run'},{'event_id':str(index),'payload':{'text':'😀'*70000}})
    with tests._db() as db:
        assert db.execute('SELECT 1 FROM trace_limits WHERE run_id=?',('unicode-run',)).fetchone() is not None
        assert db.execute('SELECT sum(length(CAST(body AS BLOB))) FROM events WHERE run_id=?',('unicode-run',)).fetchone()[0]<=2*1024*1024


def test_managed_workflow_cold_process_resumes_a_then_new_run_executes_b(production,tmp_path):
    from test_builder_test_workflow import _workflow_write
    from test_skeleton_code_admission import code_agent, request
    options,calls,selection,_deps=_workflow_write(production,tmp_path)
    store=production[0]
    store.save_python_profile('test-python',sys.executable)
    current=store.get_resource(selection.resource_id)
    doc=deepcopy(current['document'])
    code=deepcopy(code_agent()['nodes'][3])
    code['config']['code']['environment_profile_id']='test-python'
    code['config']['execution']['inputs']=[{'name':'args','value':{'kind':'ref','node_id':'start','path':['args']},'missing':'error'}]
    code['config']['execution']['outputs']=[{'name':'value','source':{'kind':'result','path':[]}}]
    code['config']['code']['result_schema']={'type':'object','properties':{'tag':{'type':'string'},'args':{'type':'object'}},'required':['tag','args'],'additionalProperties':False}
    doc['nodes'].insert(2,code)
    doc['edges'][-1]['target_node_id']='code'
    doc['edges'].append({'id':'code-end','kind':'flow','source_node_id':'code','source_port_id':'out','target_node_id':'end','target_port_id':'in'})
    doc['nodes'][-1]['config']['execution']['inputs'][0]['value']={'kind':'ref','node_id':'code','path':['value']}
    source='def main(input, context):\n    return {"tag":"A","args":input["args"]}\n'
    saved=store.save_managed_draft(request(doc,[{'node_path':['nodes',2],'text':source}],current['edit_token']))['resource']
    tests=sessions(); resource=saved['id']; session=tests.open(resource,'workflow')['session']['id']
    run=tests.prepare(session,resource,saved['edit_token'],{'city':'old'},'source-A',context=options)['run_id']
    waiting=tests.execute(session,resource,run,options)
    assert waiting['runs'][-1]['status']=='waiting'
    doc_b=deepcopy(saved['document'])
    # The real write tool protects an existing file from an unread overwrite.
    # Give the deliberate second run its own authorized output file.
    doc_b['nodes'][1]['config']['execution']['inputs'][0]['value']['value']=str(tmp_path/'workflow-new.txt')
    newer=store.save_managed_draft(request(doc_b,[{'node_path':['nodes',2],'text':source.replace('"A"','"B"')}],saved['edit_token']))['resource']
    script='''import sys,json,socket,os
sys.path.insert(0,sys.argv[1])
sys.path.insert(0,os.environ['UNCHAIN_SOURCE_PATH'])
def deny(*a,**k): raise AssertionError('network forbidden')
socket.socket.connect=socket.socket.connect_ex=socket.create_connection=socket.getaddrinfo=deny
from skeleton_builder_tests import BuilderTestSessions
host=BuilderTestSessions(background=False)
before=host.read(sys.argv[2],sys.argv[3]); pending=before['runs'][-1]['pending']
value=host.respond(sys.argv[2],sys.argv[3],sys.argv[4],pending['interaction_id'],True,{})
print(json.dumps({'pid':os.getpid(),'value':value}))
'''
    completed=subprocess.run([sys.executable,'-I','-B','-c',script,str(Path(__file__).resolve().parents[1]),session,resource,run],
        env=os.environ|{'HOME':str(tmp_path)},capture_output=True,text=True,timeout=30)
    assert completed.returncode==0,completed.stderr
    cold=json.loads(completed.stdout.strip().splitlines()[-1])
    assert cold['pid']!=os.getpid()
    old=cold['value']['runs'][-1]
    assert old['status']=='completed',old['error']
    assert old['output']=={'args':{'tag':'A','args':{'city':'old','days':1}}}
    assert old['edit_token']==saved['edit_token']
    new=tests.prepare(session,resource,newer['edit_token'],{'city':'new'},'source-B',context=options)['run_id']
    again=tests.execute(session,resource,new,options)
    pending=again['runs'][-1]['pending']['interaction_id']
    final=tests.respond(session,resource,new,pending,True,options)
    assert final['runs'][-1]['output']=={'args':{'tag':'B','args':{'city':'new','days':1}}},(final['runs'][-1]['status'],final['runs'][-1]['error'])
    assert calls==[]


def test_completed_graph_keeps_polling_until_the_root_result_is_committed(production,monkeypatch):
    from dataclasses import replace
    from types import SimpleNamespace
    import skeleton_builder_tests as module
    store,options,calls=production
    tests=sessions();resource='production-agent';session=tests.open(resource,'agent')['session']['id']
    run=tests.prepare(session,resource,store.get_resource(resource)['edit_token'],{'message':'commit fence'},'commit-fence',context=options)['run_id']
    tests.execute(session,resource,run,options)
    # Model a first read that comes before the root result is committed: a
    # projection kept from an earlier settled read would answer for it.
    monkeypatch.setattr(module,'_SETTLED',{})
    original=module.load_launch
    class BeforeRootCommit:
        def __init__(self,real):self.real=real
        def __getattr__(self,key):return getattr(self.real,key)
        def load(self):
            state=deepcopy(self.real.load().state);state['root_committed']=False
            return SimpleNamespace(state=state)
    def not_yet_committed(*args,**kwargs):
        launch=original(*args,**kwargs)
        return replace(launch,store=BeforeRootCommit(launch.store))
    monkeypatch.setattr(module,'load_launch',not_yet_committed)
    key=(str(tests.path),run)
    monkeypatch.setitem(module._WORKERS,key,object())
    pending=tests.read(session,resource)['runs'][-1]
    assert pending['status']=='running'
    assert pending['output'] is None
    monkeypatch.delitem(module._WORKERS,key)
    assert tests.read(session,resource)['runs'][-1]['status']=='outcome_unknown'
    monkeypatch.setattr(module,'load_launch',original)
    done=tests.read(session,resource)['runs'][-1]
    assert done['status']=='completed' and done['output']['message']=='End production reply'


def test_root_workflow_call_waits_in_its_pinned_child_and_returns_the_child_result(production,tmp_path):
    from test_builder_test_workflow import _workflow_write
    options,calls,selected,_deps=_workflow_write(production,tmp_path)
    store=production[0]
    child=deepcopy(selected.to_dict()['document']);child['id']='pinned-test-child'
    saved=store.save_draft(child)
    version=store.publish_workflow(saved['id'],expected_edit_token=saved['edit_token'])
    parent=workflow();parent['id']='nested-test-root'
    parent['nodes'].insert(1,{'id':'child','type':'workflow_call','config':{
        'workflow':{'workflow_id':saved['id'],'revision_id':version['revision_id']},
        'execution':{'inputs':[{'name':name,'value':{'kind':'ref','node_id':'start','path':['args',name]},'missing':'error'} for name in ('city','days')],
            'outputs':[{'name':'args','source':{'kind':'result','path':['args']}}]}}})
    parent['nodes'][-1]['config']['execution']['inputs'][0]['value']={'kind':'ref','node_id':'child','path':['args']}
    parent['edges'][0]['target_node_id']='child'
    parent['edges'].append({'id':'child-end','kind':'flow','source_node_id':'child','source_port_id':'out','target_node_id':'end','target_port_id':'in'})
    saved=store.save_draft(parent);tests=sessions();session=tests.open(saved['id'],'workflow')['session']['id']
    run=tests.prepare(session,saved['id'],saved['edit_token'],{'city':'nested'},'nested-call',context=options)['run_id']
    waiting=tests.execute(session,saved['id'],run,options)['runs'][-1]
    assert waiting['status']=='waiting' and len(waiting['graphs'])==2
    assert not (tmp_path/'workflow-once.txt').exists()
    done=tests.respond(session,saved['id'],run,waiting['pending']['interaction_id'],True,options)['runs'][-1]
    assert done['status']=='completed',done['error']
    assert done['output']=={'args':{'city':'nested','days':1}}
    assert all(graph['status']=='completed' for graph in done['graphs'])
    assert (tmp_path/'workflow-once.txt').read_text()=='approved workflow'
    assert calls==[]


def test_read_rechecks_a_wait_that_completed_during_pending_resolution(production,tmp_path,monkeypatch):
    import skeleton_builder_tests as module
    import durable_interaction_host as interactions
    from test_builder_test_workflow import _workflow_write
    from dataclasses import replace
    from types import SimpleNamespace
    options,calls,selected,_deps=_workflow_write(production,tmp_path)
    tests=sessions();resource=selected.resource_id;session=tests.open(resource,'workflow')['session']['id']
    run=tests.prepare(session,resource,selected.edit_token,{'city':'read race'},'read-race',context=options)['run_id']
    waiting=tests.execute(session,resource,run,options)['runs'][-1]
    original=module.load_launch
    before=original(session,run,expected_owner_chat_id=session)
    old_state=before.store.load().state
    old_pending=interactions.get_pending_interaction(session)
    done=tests.respond(session,resource,run,waiting['pending']['interaction_id'],True,options)
    assert done['runs'][-1]['status']=='completed'
    class StaleRead:
        def __getattr__(self,key):return getattr(before.store,key)
        def load(self):return SimpleNamespace(state=old_state)
    reads=[]
    def first_read_is_old(*args,**kwargs):
        reads.append(1)
        return replace(before,store=StaleRead()) if len(reads)==1 else original(*args,**kwargs)
    monkeypatch.setattr(module,'load_launch',first_read_is_old)
    monkeypatch.setattr(interactions,'get_pending_interaction',lambda _session:old_pending)
    value=tests.read(session,resource)['runs'][-1]
    assert value['status']=='completed' and value['pending'] is None
    assert value['output']=={'args':{'city':'read race','days':1}}
    assert (tmp_path/'workflow-once.txt').read_text()=='approved workflow'


def test_second_interaction_on_one_run_is_separate_and_cancel_preserves_first_write(production,tmp_path):
    from test_builder_test_workflow import _workflow_write
    options,calls,selected,_deps=_workflow_write(production,tmp_path)
    store=production[0];doc=deepcopy(selected.to_dict()['document'])
    second=deepcopy(doc['nodes'][1]);second['id']='write-again'
    second['config']['execution']['inputs'][0]['value']['value']=str(tmp_path/'never-written.txt')
    doc['nodes'].insert(2,second)
    doc['edges'][-1]['target_node_id']='write-again'
    doc['edges'].append({'id':'second-end','kind':'flow','source_node_id':'write-again','source_port_id':'out','target_node_id':'end','target_port_id':'in'})
    saved=store.save_draft(doc,expected_edit_token=selected.edit_token)
    tests=sessions();resource=saved['id'];session=tests.open(resource,'workflow')['session']['id']
    run=tests.prepare(session,resource,saved['edit_token'],{'city':'two waits'},'two-waits',context=options)['run_id']
    first=tests.execute(session,resource,run,options)['runs'][-1]['pending']['interaction_id']
    waiting=tests.respond(session,resource,run,first,True,options)['runs'][-1]
    second=waiting['pending']['interaction_id']
    assert waiting['status']=='waiting' and first!=second
    assert (tmp_path/'workflow-once.txt').read_text()=='approved workflow'
    assert not (tmp_path/'never-written.txt').exists()
    with pytest.raises(SkeletonResourceError):tests.respond(session,resource,run,first,True,options)
    cancelled=tests.cancel(session,resource,run)['runs'][-1]
    assert cancelled['status']=='cancelled' and cancelled['pending'] is None
    assert tests.cancel(session,resource,run)['runs'][-1]['status']=='cancelled'
    assert (tmp_path/'workflow-once.txt').read_text()=='approved workflow'
    assert not (tmp_path/'never-written.txt').exists() and calls==[]


def test_agent_approval_uses_fresh_graph_credentials_and_dedicated_history(production,tmp_path):
    from test_builder_test_workflow import _workflow_write
    store,options,calls=production
    tool_options,_calls,tool_workflow,_deps=_workflow_write(production,tmp_path)
    saved=store.get_resource('production-agent');doc=deepcopy(saved['document'])
    node=deepcopy(tool_workflow.to_dict()['document']['nodes'][1]);doc['nodes'].insert(2,node)
    doc['edges'][-1]['target_node_id']='write'
    doc['edges'].append({'id':'write-end','kind':'flow','source_node_id':'write','source_port_id':'out','target_node_id':'end','target_port_id':'in'})
    saved=store.save_draft(doc,expected_edit_token=saved['edit_token'])
    context=dict(options,toolkits=tool_options['toolkits'])
    tests=sessions();session=tests.open(saved['id'],'agent')['session']['id']
    prepared=tests.prepare(session,saved['id'],saved['edit_token'],{'message':'agent approval'},'agent-approval',context=context)
    transient={'skeleton_credentials':options['skeleton_credentials'],'skeleton_credential_scope':prepared['requirements']['scope']}
    waiting=tests.execute(session,saved['id'],prepared['run_id'],transient)['runs'][-1]
    assert waiting['status']=='waiting' and len(calls)==1
    assert not (tmp_path/'workflow-once.txt').exists()
    interaction=waiting['pending']['interaction_id']
    resume=tests.resume_requirements(session,saved['id'],prepared['run_id'],interaction)
    assert resume['requirements']['scope']!=prepared['requirements']['scope']
    transient['skeleton_credential_scope']=resume['requirements']['scope']
    done=tests.respond(session,saved['id'],prepared['run_id'],interaction,True,transient)['runs'][-1]
    assert done['status']=='completed',done['error']
    assert done['output']=={'message':'End production reply'}
    assert (tmp_path/'workflow-once.txt').read_text()=='approved workflow'
    assert len(calls)==1
