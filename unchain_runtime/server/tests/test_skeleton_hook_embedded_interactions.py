"""Production pending lineage consumes an owned body, including a nested pin."""
from copy import deepcopy
import pytest
from test_skeleton_production_interactions import isolated_host_clock_and_guard, _api, _install_actual_launch, output
from test_skeleton_agent_runtime import (_bridge, _agent_document, _document_with_hook_pool,
    _before_hook_execution_workflow, _host_execution, _StrictOpenAIClient, _approval_tool_response, _final_response)
from unchain.execution import ExecutionRuntime
from unchain.memory import JsonFileSessionStore, KernelMemoryRuntime
from unchain.skeleton.agent_preparation import prepare_agent_graph
from unchain.skeleton.tool_runtime import SkeletonToolRuntime
from unchain.skeleton.workflow_runtime import PublishedWorkflow
from unchain.tools import Toolkit, Tool


@pytest.mark.parametrize("nested", [False, True])
@pytest.mark.parametrize("finish", ["resume", "cancel"])
def test_owned_hook_child_pending_receipt_and_terminal_are_exact(tmp_path, monkeypatch, nested, finish):
    api = _api(); bridge = _bridge(tmp_path, monkeypatch, execution_id="owned-child-approval")
    body = _before_hook_execution_workflow("owned-policy")
    leaf = deepcopy(body); leaf["id"] = "nested-policy" if nested else "owned-policy"
    leaf["nodes"][1].update(type="tool_call", config={"execution": {
        "inputs": [{"name":"value", "value":{"kind":"ref", "node_id":"start", "path":["arguments","value"]}, "missing":"error"}],
        "outputs": [output(name,"result",["result",name]) for name in ["decision","require_approval","arguments"]]},
        "tool":{"name":"hook_decision","on_error":"stop","approval_timeout_ms":30000}})
    if nested:
        body["nodes"][1].update(type="workflow_call",config={"workflow":{"workflow_id":"nested-policy","revision_id":"nested-revision"},
            "execution":deepcopy(body["nodes"][1]["config"]["execution"])})
    else: body = leaf
    doc = _document_with_hook_pool(_agent_document())
    next(node for node in doc["nodes"] if node["type"]=="hooks_pool")["config"]["hooks"][0]["workflow"]={"kind":"embedded","document":body}
    plan = prepare_agent_graph(doc); resolved=[]
    def resolve(workflow_id, revision_id):
        assert nested and (workflow_id,revision_id)==("nested-policy","nested-revision")
        resolved.append((workflow_id,revision_id))
        return PublishedWorkflow(workflow_id,revision_id,deepcopy(leaf))
    calls=[];toolkit=Toolkit()
    @toolkit.tool(name="hook_decision",requires_confirmation=True)
    def hook_decision(value:str):
        calls.append(("child",value))
        return {"decision":"continue","require_approval":False,"arguments":{"value":value}}
    parent_tool=Tool.from_callable(lambda value: calls.append(("parent",value)) or value,name="dangerous_tool",requires_confirmation=False)
    memory_store=JsonFileSessionStore(tmp_path/"sessions")
    client=_StrictOpenAIClient([_approval_tool_response(),_final_response("safe")])
    def host(guard):
        return _host_execution(plan,bridge,client=client,guard=guard,memory=KernelMemoryRuntime.from_config(store=memory_store),
            tools_for_node=lambda _context:(parent_tool,),child_handlers_factory=lambda _store,child_plan:{"tool_call":SkeletonToolRuntime(child_plan,toolkit,bridge.execution_id,lambda:100)},
            hook_workflow_resolver=resolve)
    with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
        execution=host(guard);execution.create({});result,_=execution.run(original_task="approve owned Hook")
    assert result.status=="waiting",result.error
    launch=_install_actual_launch(api,monkeypatch,execution,bridge,resolver=resolve)
    pending=api.resolve_pending_skeleton_interaction(bridge.execution_id)
    assert len(pending.chain)==(3 if nested else 2)
    raw=pending.request.subject["hook_child_wait"]
    assert raw["workflow_id"]=="owned-policy"
    assert raw["revision_id"]=="embedded-sha256-"+raw["definition_digest"]
    accepted=api.record_skeleton_interaction_receipt(session_id=bridge.execution_id,interaction_id=pending.request.interaction_id,approved=True)
    assert accepted["interaction_id"]==pending.request.interaction_id and calls==[]
    assert api.get_pending_skeleton_interaction(bridge.execution_id)["status"]=="receipt_recorded"
    if finish=="cancel":
        from unchain.interaction.runtime import DurableInteractionRuntime
        monkeypatch.setattr(api,"_interaction_runtime",lambda:DurableInteractionRuntime(KernelMemoryRuntime.from_config(store=memory_store)))
        cancelled=api.cancel_skeleton_execution(session_id=bridge.execution_id,attempt_id=launch.descriptor["root_run_id"],expected_interaction_id=pending.request.interaction_id)
        assert cancelled["context_interaction_reconciled"] is True
        assert all(anchor.store.load().state["status"]=="cancelled" for anchor in pending.chain)
        assert calls==[]
    else:
        active=deepcopy(execution.store.load().state["active"])
        with ExecutionRuntime(memory_store).scope(bridge.execution_id) as guard:
            resumed=host(guard)
            result,_=resumed.resume_interaction(pending.request.interaction_id,True,node_invocation_id=active["node_invocation_id"],original_task="approve owned Hook")
        assert result.status=="completed",result.error
        assert [kind for kind,_ in calls]==["child","parent"]
    assert all(name=="nested-policy" for name,_ in resolved)
