from pathlib import Path
import sys,json,tempfile,sqlite3,threading
from contextlib import ExitStack
from unittest import mock
root=Path.cwd();sys.path[:0]=[str(root/'.local/ticket-349-defer-checkpoint/server'),str(root/'.local/ticket-349-live-timing/installed-wheel'),str(root/'.local/ticket-349-cache-checkpoint/extra312'),str(root/'unchain_runtime/server/tests')]
import pytest
import memory_v2_background_worker as bg
from test_memory_v2_unchain_graph_root_completion_entry import _entry_stack,_recipe,_root_options,_runtime_context,_journal,adapter
from test_memory_v2_unchain_runtime_factory import test_active_host_builds_agent_with_only_official_normal_memory_tools
from test_memory_v2_unchain_graph_root_completion import _active_bridge,_run,_descriptors,_finish_graph,_propose_from_step,_NeverRunMemoryAgent
from memory_v2_unchain_graph_checkpoint import prepare_pupu_unchain_graph_checkpoint_host
from memory_v2_unchain_graph_root_completion import complete_pupu_unchain_graph_root
from memory_v2_unchain_curator_query import open_pupu_unchain_curator_query_api
rows={}
def failure(**kwargs):raise sqlite3.OperationalError('audit simulated host registration write failure')
with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
 p=Path(directory);execution='audit-execution';run='audit-root'
 _entry_stack(stack,tmp_path=p,mode='active',execution_id=execution)
 stack.enter_context(mock.patch.object(bg,'register_background_host',side_effect=failure))
 events=[];error=None
 try:
  for event in adapter._stream_recipe_graph_events(recipe=_recipe(),message='produce the canonical report',history=[],attachments=[],options=_root_options(owner_chat_id='audit-chat',execution_id=execution,run_id=run),session_id=execution,run_id_override=run,runtime_context=_runtime_context(execution_id=execution,run_id=run)):
   events.append(event)
 except Exception as exc:error={'type':type(exc).__name__,'message':str(exc)}
 journal=_journal(p,execution)
 rows['graph_stream']={'error':error,'final_message_count':sum(e.get('type')=='final_message' for e in events),'stream_summary_count':sum(e.get('type')=='stream_summary' for e in events),'durable_root_terminal':[e.event_type for e in journal.events if e.attempt.attempt_id==run and e.event_type in ('run_completed','final_message')], 'failed_bundle_status':next((e.get('bundle',{}).get('lifecycle',{}).get('status') for e in events if e.get('type')=='stream_summary'),None)}
with tempfile.TemporaryDirectory() as directory, mock.patch.object(bg,'register_background_host',side_effect=failure):
 try:
  test_active_host_builds_agent_with_only_official_normal_memory_tools(Path(directory))
  rows['normal_official_hook']={'exception':None}
 except Exception as exc:rows['normal_official_hook']={'exception':type(exc).__name__,'message':str(exc)}
with tempfile.TemporaryDirectory() as directory:
 p=Path(directory);patch=pytest.MonkeyPatch()
 try:
  patch.setattr(bg,'_DISPATCHER',None)
  bridge=_active_bridge(p,patch,run=_run(execution_id='audit-recovery',attempt_id='audit-recovery-root',content='save decision'),owner_chat_id='audit-recovery-chat',invoker_factory=lambda codec:_NeverRunMemoryAgent())
  host=prepare_pupu_unchain_graph_checkpoint_host(active_bridge=bridge,steps=_descriptors());_finish_graph(host);_propose_from_step(host)
  with mock.patch.object(bg,'register_background_host',side_effect=failure):
   try:complete_pupu_unchain_graph_root(host,agent_name='Audit root')
   except Exception:pass
  cold=bg.MemoryBackgroundRegistry(p/'memory_v2/context_v2.sqlite3');cold.recover_registrations(threading.Event())
  query=open_pupu_unchain_curator_query_api(root_dir=p/'memory_v2',owner_chat_id='audit-recovery-chat')
  statuses=[bg.process_owner(cold,row,threading.Event()) for row in cold.page()]
  rows['cold_recovery']={'owner_processing':statuses,'jobs':len(query.list_consolidation_jobs(owner_chat_id='audit-recovery-chat')['jobs']),'candidates':[{k:v for k,v in c.items() if k in ('status','source_agent_run_id')} for c in query.list_candidates(owner_chat_id='audit-recovery-chat')['candidates']]}
 finally:patch.undo()
print(json.dumps(rows,indent=2))
(root/'.local/ticket-349-defer-audit/reproduction.json').write_text(json.dumps(rows,indent=2)+'\n')
