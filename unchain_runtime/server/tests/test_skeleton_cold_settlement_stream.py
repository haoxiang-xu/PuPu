"""Actual cold delegate settlement reaches the V4 projection, not a root guess."""
from copy import deepcopy
import json
import os
from pathlib import Path

import test_skeleton_agent_runtime as base
from unchain.events.bridge import RuntimeEventBridge
from unchain.execution import ExecutionRuntime
from unchain.journal import EventCursor
from unchain.journal.models import _thaw_json
from unchain.memory import JsonFileSessionStore, KernelMemoryRuntime
from unchain.skeleton import WorkflowNodeCompleted
from unchain.tools import Tool


def test_cold_delegate_settlement_is_streamed_from_its_own_durable_receipt(tmp_path,monkeypatch):
    execution_id='cold-settlement-stream'
    plan,manifests=base._parent_with_pool()
    next(n for n in manifests[0]['document']['nodes'] if n['type']=='agent')['config']['kernel']['max_iterations']=4
    first_events=[];cold_events=[];effects=[]
    tool=Tool.from_callable(lambda value:effects.append(value) or {'value':value},
        name='dangerous_tool',requires_confirmation=True)
    memory_path=tmp_path/'sessions'
    def host(bridge,client,guard,memory,events):
        return base._host_execution(plan,bridge,client=client,guard=guard,memory=memory,
            callback=events.append,tools_for_node=lambda _context:(tool,),
            subagent_manifests=manifests,child_handlers_factory=lambda _store,_plan:{
                'code':lambda _context,_inputs:WorkflowNodeCompleted({
                    'message':'{"answer":"child ready"}','evidence':'actual child End'})})
    session=JsonFileSessionStore(memory_path)
    first_client=base._StrictOpenAIClient([
        base._subagent_tool_response('delegate_to_subagent','{"target":"Reviewer","task":"review"}','cold-delegate'),
        base._approval_tool_response()])
    with ExecutionRuntime(session).scope(execution_id) as guard:
        first=host(base._bridge(tmp_path,monkeypatch,execution_id=execution_id),first_client,guard,
            KernelMemoryRuntime.from_config(store=session),first_events)
        first.create({});waiting,receipt=first.run(original_task='review this')
    assert waiting.status=='waiting' and receipt is None and effects==[]
    assert not any(e.get('type')=='subagent_tool_settled' for e in first_events)
    call_id='subagent-call-cold-delegate'
    before=[e for e in first.store.journal.capture_snapshot().events if e.event_type=='tool_result' and e.payload.get('call_id')==call_id]
    assert len(before)==1
    cold_session=JsonFileSessionStore(memory_path)
    cold_client=base._StrictOpenAIClient([base._final_response('child'),base._final_response('parent')])
    with ExecutionRuntime(cold_session).scope(execution_id) as guard:
        cold=host(base._bridge(tmp_path,monkeypatch,execution_id=execution_id),cold_client,guard,
            KernelMemoryRuntime.from_config(store=cold_session),cold_events)
        result,receipt=base._resume_child_wait(cold,original_task='review this')
    assert result.status=='completed' and receipt is not None
    assert effects==['approved child value'] and len(cold_client.requests)==2
    journal=cold.store.journal.capture_snapshot().events
    settled=[e for e in journal if e.event_type=='skeleton.subagent_tool_settlement' and e.payload.get('call_id')==call_id]
    assert len(settled)==1
    raw=[e for e in cold_events if e.get('type')=='subagent_tool_settled']
    capture=os.environ.get('SETTLEMENT_CAPTURE_PATH')
    if capture:
        Path(capture).write_text(json.dumps({'execution_id':execution_id,'root_run_id':cold.binding.root_run_id,
            'raw_callbacks':cold_events,'settlement_event':{'event_id':settled[0].event_id,'store_seq':settled[0].store_seq,'payload':_thaw_json(settled[0].payload)}},ensure_ascii=False,indent=2)+'\n')
    assert len(raw)==1
    projection=raw[0]['settlement']
    authoritative=_thaw_json(settled[0].payload)
    assert projection['cursor']==EventCursor(settled[0].store_seq,settled[0].event_id).to_dict()
    for key in ['consumer_attempt','source_attempt','call_id','tool_name','status']:
        assert projection[key]==authoritative[key]
    assert projection['result']['content_sha256']==authoritative['result_sha256']
    after=[e for e in journal if e.event_type=='tool_result' and e.payload.get('call_id')==call_id]
    assert len(after)==1 and after[0]==before[0]
    bridge=RuntimeEventBridge(session_id=execution_id,root_run_id=cold.binding.root_run_id)
    events=bridge.normalize(deepcopy(raw[0]))
    assert len(events)==1
    event=events[0]
    assert event.type=='run.completed' and event.payload['status']=='completed'
    assert event.run_id==authoritative['source_attempt']['attempt_id']
    assert event.links.parent_run_id==authoritative['consumer_attempt']['attempt_id']
    assert event.links.tool_call_id==call_id
    assert event.payload['settlement']==projection


def test_real_hook_workflow_end_cannot_hide_the_denied_parent_tool(tmp_path,monkeypatch):
    from unchain.skeleton.agent_preparation import prepare_agent_graph
    from unchain.skeleton.workflow_runtime import PublishedWorkflow
    document=base._document_with_hook_pool(base._agent_document())
    next(n for n in document['nodes'] if n['type']=='hooks_pool')['config']['hooks'][0]['event']='after_tool_call'
    next(n for n in document['nodes'] if n['type']=='agent')['config']['kernel']['max_iterations']=3
    plan=prepare_agent_graph(document)
    effects=[];hook_inputs=[]
    tool=Tool.from_callable(lambda value:effects.append(value) or {'private':value},
        name='dangerous_tool',requires_confirmation=True)
    def resolver(workflow_id,revision_id):
        assert (workflow_id,revision_id)==('policy-workflow','rev-1')
        return PublishedWorkflow(workflow_id,revision_id,base._after_hook_execution_workflow(workflow_id))
    def code(context,inputs):
        if context.document_id=='policy-workflow':
            hook_inputs.append(deepcopy(inputs))
            return WorkflowNodeCompleted({'decision':'replace','result':{'visible':'safe'}})
        return WorkflowNodeCompleted({'message':'postprocessed End reply','evidence':'safe'})
    execution_id='actual-hook-denial'
    session=JsonFileSessionStore(tmp_path/'sessions')
    def host(guard,client):
        return base._host_execution(plan,base._bridge(tmp_path,monkeypatch,execution_id=execution_id),
            client=client,guard=guard,memory=KernelMemoryRuntime.from_config(store=session),
            tools_for_node=lambda _context:(tool,),hook_workflow_resolver=resolver,
            other_handlers={'code':code})
    with ExecutionRuntime(session).scope(execution_id) as guard:
        first=host(guard,base._StrictOpenAIClient([base._approval_tool_response()]))
        first.create({});waiting,_=first.run(original_task='do not run the tool')
    assert waiting.status=='waiting' and effects==[] and hook_inputs==[]
    active=first.store.load().state['active']
    client=base._StrictOpenAIClient([base._final_response('acknowledged')])
    with ExecutionRuntime(session).scope(execution_id) as guard:
        cold=host(guard,client)
        result,receipt=cold.resume_interaction(active['wait']['id'],False,
            node_invocation_id=active['node_invocation_id'],original_task='do not run the tool')
    assert result.status=='completed' and receipt is not None and effects==[]
    assert len(hook_inputs)==1 and hook_inputs[0]['raw_result']['denied'] is True
    events=cold.store.journal.capture_snapshot().events
    completed=[e for e in events if e.event_type=='tool_result' and e.payload.get('call_id')=='child-approval-call']
    assert len(completed)==1
    assert dict(completed[0].payload['result'])=={'visible':'safe','denied':True}
    assert completed[0].payload['execution_subject']['approval_state']=='denied'
    assert len([e for e in events if e.event_type=='skeleton.hook_phase.receipt' and e.payload.get('phase')=='after_tool_call'])==1
    assert len(client.requests)==1
