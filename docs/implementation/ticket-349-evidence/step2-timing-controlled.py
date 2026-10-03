from pathlib import Path
import sys,os,json,time,tempfile,threading,importlib.util,statistics,hashlib
root=Path.cwd(); base=root/'.local/ticket-349-background-checkpoint-r7'; out=root/'.local/ticket-349-live-timing'
identity=json.loads((base/'identity.json').read_text()); wheel=Path(identity['wheel_path'])
assert hashlib.sha256(wheel.read_bytes()).hexdigest()==identity['wheel_sha256']
os.environ['UNCHAIN_SOURCE_PATH']=str(wheel)
sys.path[:0]=list(map(str,[base/'server',base/'server/tests',wheel,root/'.local/ticket-349-cache-checkpoint/extra312']))
import pytest
import memory_v2_background_worker as bg
from memory_v2_unchain_agent_selection import PupuOfficialMemoryAgentInvokerFactory
from memory_v2_unchain_graph_root_completion import complete_pupu_unchain_graph_root as current
from memory_v2_unchain_graph_checkpoint import prepare_pupu_unchain_graph_checkpoint_host
from test_memory_v2_unchain_graph_root_completion import _run,_active_bridge,_descriptors,_finish_graph,_propose_from_step,_ApplyMemoryAgent
from unchain.runtime.runtime_protocol import runtime_protocol_manifest
spec=importlib.util.spec_from_file_location('timing_original_completion',out/'original_completion.py'); old=importlib.util.module_from_spec(spec);sys.modules[spec.name]=old;spec.loader.exec_module(old)
samples=[]
for delay in [0,1000]:
 for repetition in range(6):
  for mode in (['sync','background'] if repetition%2==0 else ['background','sync']):
   with tempfile.TemporaryDirectory(prefix='pupu349-timing-') as directory:
    patch=pytest.MonkeyPatch(); done=threading.Event(); marks={}; worker=None
    class Delayed(_ApplyMemoryAgent):
     def run(self,request,**kwargs):
      marks['model_start']=time.perf_counter();time.sleep(delay/1000)
      result=super().run(request,**kwargs);marks['model_done']=time.perf_counter();done.set();return result
    try:
     patch.setattr(bg,'_DISPATCHER',None)
     bridge=_active_bridge(Path(directory),patch,run=_run(execution_id='timing-execution',attempt_id='timing-root',content='synthetic benchmark decision'),owner_chat_id='timing-chat',invoker_factory=lambda codec:Delayed(codec))
     host=prepare_pupu_unchain_graph_checkpoint_host(active_bridge=bridge,steps=_descriptors());_finish_graph(host);_propose_from_step(host)
     bg.register_background_host(database_path=Path(directory)/'memory_v2/context_v2.sqlite3',owner_chat_id='timing-chat',invoker_factory=PupuOfficialMemoryAgentInvokerFactory(options={},provider='ollama',model_id='test-model'))
     if mode=='background':
      patch.setattr(bg,'resolve_invoker_factory',lambda config,options:Delayed);worker=bg._DISPATCHER;worker.start()
     started=time.perf_counter()
     receipt=(old.complete_pupu_unchain_graph_root if mode=='sync' else current)(host,agent_name='Timing agent')
     foreground=time.perf_counter()
     assert done.wait(10),'worker did not apply memory'
     from memory_v2_unchain_curator_query import open_pupu_unchain_curator_query_api
     query=open_pupu_unchain_curator_query_api(root_dir=Path(directory)/'memory_v2',owner_chat_id='timing-chat')
     deadline=time.perf_counter()+5
     while True:
      jobs=query.list_consolidation_jobs(owner_chat_id='timing-chat')['jobs']
      if jobs and jobs[0]['status']=='completed': break
      assert time.perf_counter()<deadline, 'job not durably completed'
      time.sleep(0.001)
     durable_done=time.perf_counter()
     if mode=='sync': assert not receipt.memory.worker_failure_code,receipt.memory.worker_failure_code
     samples.append(dict(mode=mode,delay_ms=delay,warmup=repetition==0,repetition=repetition,foreground_ms=(foreground-started)*1000,memory_done_ms=(durable_done-started)*1000,memory_applied_ms=(marks['model_done']-started)*1000,model_and_apply_ms=(marks['model_done']-marks['model_start'])*1000,candidates=receipt.memory.candidate_count))
    finally:
     if worker:worker.stop()
     patch.undo()
summary=[]
for delay in [0,1000]:
 for mode in ['sync','background']:
  rows=[r for r in samples if r['delay_ms']==delay and r['mode']==mode and not r['warmup']]
  summary.append(dict(mode=mode,delay_ms=delay,samples=len(rows),**{k:round(statistics.median(r[k] for r in rows),3) for k in ['foreground_ms','memory_done_ms','model_and_apply_ms']}))
report=dict(kind='controlled real SQLite and worker; injected model delay; no network',candidate=identity,original_completion_sha256=hashlib.sha256((out/'original_completion.py').read_bytes()).hexdigest(),runtime_manifest=runtime_protocol_manifest()['manifest_digest'],summary=summary,samples=samples)
(out/'controlled-results.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(summary,indent=2))
