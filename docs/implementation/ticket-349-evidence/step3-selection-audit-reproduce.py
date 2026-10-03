from pathlib import Path
import json,tempfile,threading
from dataclasses import replace
from unittest import mock
import pytest
import memory_v2_background_worker as bg
from memory_v2_unchain_agent_selection import PupuOfficialMemoryAgentInvokerFactory
from memory_v2_unchain_deletion_adapter import delete_pupu_unchain_chat
from memory_v2_unchain_graph_root_completion import complete_pupu_unchain_graph_root
from test_memory_v2_background_worker import _queued,_jobs
from test_memory_v2_unchain_graph_root_completion import _ApplyMemoryAgent,_propose_from_step,_active_bridge,_run,_descriptors,_finish_graph
from memory_v2_unchain_graph_checkpoint import prepare_pupu_unchain_graph_checkpoint_host
from unchain.persistence.sqlite_promotion_v2 import SQLitePromotionV2Store
from unchain.persistence import sqlite_chat_deletion_v2 as deletion

out={}
with tempfile.TemporaryDirectory() as directory:
 patch=pytest.MonkeyPatch()
 try:
  patch.setattr(bg,'_DISPATCHER',None)
  _,_,registry=_queued(Path(directory),patch)
  SQLitePromotionV2Store(database_path=registry.database_path,object_directory=registry.database_path.parent/'objects')
  registry.defer('chat-background','unchain',*bg.configuration_from_factory(PupuOfficialMemoryAgentInvokerFactory(options={},provider='ollama',model_id='new-model')))
  original=deletion.is_chat_deleted
  fired=[]
  def interleaved_delete(**kwargs):
   was_deleted=original(**kwargs)
   if not fired:
    fired.append(True)
    delete_pupu_unchain_chat(database_path=registry.database_path,owner_chat_id='chat-background',operation_id='audit-delete-during-recovery')
    assert registry.page()==()
   return was_deleted
  with mock.patch.object(deletion,'is_chat_deleted',side_effect=interleaved_delete):
   registry.recover_deferred(threading.Event())
  rows=registry.page()
  out['deletion_race']={'deleted':original(database_path=registry.database_path,owner_chat_id='chat-background'),'registry_rows_after_recovery':len(rows),'retry_exists':registry._retry_path('chat-background','unchain').exists(),'worker_status':bg.process_owner(registry,rows[0],threading.Event()) if rows else None}
 finally:patch.undo()

with tempfile.TemporaryDirectory() as directory:
 patch=pytest.MonkeyPatch()
 try:
  patch.setattr(bg,'_DISPATCHER',None)
  host,_,registry=_queued(Path(directory),patch,candidate=False)
  old_row=registry.page()[0]
  assert _jobs(registry)==[]
  retry=registry._retry_path('chat-background','unchain')
  selected=bg.configuration_from_factory(PupuOfficialMemoryAgentInvokerFactory(options={},provider='ollama',model_id='new-model'))
  original=Path.exists;fired=[];selections=[]
  def interleaved_completion(path):
   exists=original(path)
   if path==retry and not fired:
    fired.append(True)
    bridge=_active_bridge(Path(directory),patch,run=_run(execution_id='execution-background',attempt_id='new-model-root',content='Remember a new decision'),owner_chat_id='chat-background',invoker_factory=PupuOfficialMemoryAgentInvokerFactory(options={},provider='ollama',model_id='new-model'))
    new_host=prepare_pupu_unchain_graph_checkpoint_host(active_bridge=bridge,steps=tuple(replace(step,attempt_id=step.attempt_id+'-new') for step in _descriptors()))
    _finish_graph(new_host)
    _propose_from_step(new_host)
    with mock.patch.object(registry,'_connect',side_effect=__import__('sqlite3').OperationalError('injected registration outage')):
     complete_pupu_unchain_graph_root(new_host,agent_name='New root')
   return exists
  def resolve(config,options):
   selections.append({'model':config['model_id'],'retry_exists_at_model_resolution':original(retry)})
   return _ApplyMemoryAgent
  patch.setattr(bg,'resolve_invoker_factory',resolve)
  with mock.patch.object(Path,'exists',interleaved_completion):
   result=bg.process_owner(registry,old_row,threading.Event())
  out['selection_race']={'process_result':result,'requested_model':'new-model','actual_model_selections':selections,'job_status':_jobs(registry)[0]['status'],'job_run_id':_jobs(registry)[0]['run_id'],'retry_still_exists':retry.exists()}
 finally:patch.undo()
print(json.dumps(out,indent=2))
Path('.local/ticket-349-selection-audit/reproduction.json').write_text(json.dumps(out,indent=2)+'\n')
