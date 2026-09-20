from pathlib import Path
import os,json,importlib.metadata
from unchain.toolkits.builtin.core import CoreToolkit
from unchain.toolkits.builtin.plan import PlanToolkit
from unchain.tools.confirmation import execute_confirmable_tool_call
from unchain.kernel.types import ToolCall
w=Path(os.environ['VERIFY_WORK']);base=w/'sandbox/recheck';base.mkdir();ws=base/'workspace';ws.mkdir();outside=base/'outside';outside.mkdir();tk=CoreToolkit(workspace_root=ws);pt=PlanToolkit(workspace_root=ws)
seen=[]
def deny(r):seen.append('requested');return {'approved':False}
def invoke(t,n,a):
 before=len(seen);r=execute_confirmable_tool_call(toolkit=t,tool_call=ToolCall(call_id='check-'+n,name=n,arguments=a),on_tool_confirm=deny,loop=None,callback=None,run_id='recheck',iteration=0)
 return {'result':r.tool_result,'denied':r.denied,'confirmationRequests':len(seen)-before}
normal=invoke(tk,'shell',{'action':'run','command':'/bin/pwd'});marker=ws/'effect.txt';normaldeny=invoke(tk,'shell',{'action':'run','command':"printf x > "+str(marker)})
assert normal['confirmationRequests']==0 and normaldeny['confirmationRequests']==1 and not marker.exists()
fake=ws/'cat';fake.write_text('#!/bin/sh\nprintf synthetic > '+str(marker)+'\n');fake.chmod(0o755);shell=invoke(tk,'shell',{'action':'run','command':str(fake)});shell['markerWritten']=marker.exists()
secret=outside/'source.txt';secret.write_text('CANARY_BOUNDARY_RECHECK');(ws/'linked.txt').symlink_to(secret);grep=invoke(tk,'grep',{'pattern':'CANARY_BOUNDARY_RECHECK'});grep['outsideDataReturned']='CANARY_BOUNDARY_RECHECK' in json.dumps(grep)
pt.plan_start(title='normal',goal='normal');external=outside/'plan_88.json';external.write_text(json.dumps({'plan_id':'plan_88','title':'CANARY_BOUNDARY_RECHECK','goal':'outside'}));(ws/'plans/plan_88.json').symlink_to(external);plan=invoke(pt,'plan_list',{});plan['outsideTitleReturned']='CANARY_BOUNDARY_RECHECK' in json.dumps(plan)
print(json.dumps({'shellPositiveControl':normal,'shellDenialControl':normaldeny,'shellBypass':shell,'grepBoundary':grep,'planBoundary':plan,'schemas':{'core':tk.to_json(),'plan':pt.to_json()},'runtimePackages':[{'name':d.metadata['Name'],'version':d.version} for d in importlib.metadata.distributions() if d.metadata.get('Name')],'classification':'same-reviewer skeptical recheck; real confirmation dispatcher, no real model'},indent=2))
tk.shutdown()
