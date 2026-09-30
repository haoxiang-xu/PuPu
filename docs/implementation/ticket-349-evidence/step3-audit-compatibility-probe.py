from pathlib import Path
import sys,json,tempfile,threading
root=Path.cwd();sys.path[:0]=[str(root/'.local/ticket-349-defer-checkpoint/server'),str(root/'.local/ticket-349-live-timing/installed-wheel'),str(root/'.local/ticket-349-cache-checkpoint/extra312'),str(root/'unchain_runtime/server/tests')]
import pytest
import memory_v2_background_worker as bg
from test_memory_v2_background_worker import _queued,_jobs
from memory_v2_unchain_model_invoker import PupuOfficialMemoryAgentModelInvoker
from memory_v2_unchain_runtime_factory import _PupuUnchainReferenceCodec
from unchain.journal import ResourceRef
out={};model_constructed=[]
def never_model(**kwargs):model_constructed.append(True);raise AssertionError('must not reach provider')
def factory(codec):
 inner=PupuOfficialMemoryAgentModelInvoker(agent_factory=never_model,provider='openai',model_id='gpt-4.1',reference_codec=codec)
 class Capture:
  def run(self,request,*,toolkit,binding):
   out['actual_tool_names']=sorted(toolkit.tools)
   return inner.run(request,toolkit=toolkit,binding=binding)
 return Capture()
with tempfile.TemporaryDirectory() as directory:
 patch=pytest.MonkeyPatch()
 try:
  patch.setattr(bg,'_DISPATCHER',None)
  host,receipt,registry=_queued(Path(directory),patch)
  patch.setattr(bg,'resolve_invoker_factory',lambda config,options:factory)
  out['process_result']=bg.process_owner(registry,registry.page()[0],threading.Event())
  out['job']={k:v for k,v in _jobs(registry)[0].items() if k in ('status','last_error_code','attempt_count')}
 finally:patch.undo()
proof=json.loads((root/'.local/ticket-349-defer-audit/live-durable-proof.json').read_text())
try:_PupuUnchainReferenceCodec('audit-binding').encode(ResourceRef.from_dict(proof['candidate_content_ref']))
except Exception as exc:out['content_ref_projection']={'type':type(exc).__name__,'message':str(exc)}
out['model_constructed']=len(model_constructed)
print(json.dumps(out,indent=2));(root/'.local/ticket-349-defer-audit/compatibility.json').write_text(json.dumps(out,indent=2)+'\n')
