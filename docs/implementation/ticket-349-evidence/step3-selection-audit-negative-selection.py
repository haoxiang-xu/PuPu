import json, sqlite3, tempfile, threading
from pathlib import Path
import pytest
from unchain.memory.curator.host import MemoryAgentHostAdapter
import memory_v2_background_worker as bg
from memory_v2_unchain_agent_selection import PupuOfficialMemoryAgentInvokerFactory
from test_memory_v2_background_worker import _queued, _jobs
from test_memory_v2_unchain_graph_root_completion import _ApplyMemoryAgent

results=[]
for mode in ('deferred_after_claim','registered_after_claim','missing_row','unknown_field','wrong_version','sqlite_unavailable'):
 with tempfile.TemporaryDirectory() as folder, pytest.MonkeyPatch.context() as patch:
  patch.setattr(bg,'_DISPATCHER',None)
  _,_,registry=_queued(Path(folder),patch)
  old=registry.page()[0]; selections=[]
  selected=bg.configuration_from_factory(PupuOfficialMemoryAgentInvokerFactory(options={'api_key':'synthetic-new-key'},provider='ollama',model_id='fresh-model'))
  original=MemoryAgentHostAdapter._build_runner
  def after_claim(host,job):
   assert job.status.value=='leased'
   if mode=='deferred_after_claim':registry.defer('chat-background','unchain',*selected)
   elif mode=='registered_after_claim':registry.register('chat-background','unchain',*selected)
   elif mode=='sqlite_unavailable':
    def unavailable(*args,**kwargs):raise sqlite3.OperationalError('synthetic outage')
    patch.setattr(registry,'_connect',unavailable)
   else:
    with registry._connect() as c:
     if mode=='missing_row':c.execute('DELETE FROM pupu_memory_background_hosts')
     else:
      config=json.loads(old['config_json'])
      if mode=='unknown_field':config['unexpected']=True
      else:config['schema']='pupu.memory-background-host.v999'
      c.execute('UPDATE pupu_memory_background_hosts SET config_json=?',(json.dumps(config),))
   return original(host,job)
  def resolve(config,options):
   selections.append({'model':config['model_id'],'paired_options':options=={'api_key':'synthetic-new-key'}})
   return _ApplyMemoryAgent
  patch.setattr(MemoryAgentHostAdapter,'_build_runner',after_claim)
  patch.setattr(bg,'resolve_invoker_factory',resolve)
  outcome=bg.process_owner(registry,old,threading.Event());job=_jobs(registry)[0]
  success=mode=='registered_after_claim'
  assert outcome==('processed' if success else 'retry'),(mode,outcome)
  assert selections==([{'model':'fresh-model','paired_options':True}] if success else []),(mode,selections)
  assert job['status']==('completed' if success else 'pending'),(mode,job)
  results.append({'scenario':mode,'result':outcome,'model_calls':selections,'job_status':job['status'],'error':job.get('last_error_code','')})
Path(__file__).with_suffix('.json').write_text(json.dumps(results,indent=2)+'\n')
print(json.dumps({'scenarios':len(results),'passed':True}))
