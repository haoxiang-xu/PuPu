import json,os,socket,subprocess,sys
from pathlib import Path
from unchain.toolkits.builtin.core import CoreToolkit
from unchain.toolkits.builtin.plan import PlanToolkit
from unchain.toolkits.builtin.core.shell_runtime import ShellRuntime
w=Path(os.environ['VERIFY_WORK']);root=w/'sandbox';ws=root/'workspace';ws.mkdir(exist_ok=True);outside=root/'outside';outside.mkdir(exist_ok=True)
canary='PUPU_SYNTHETIC_CANARY_20260913';secret=outside/'canary.txt';secret.write_text(canary)
checks=[]
def check(name,passed,observation):checks.append({'id':name,'status':'PASS' if passed else 'FAIL','observation':observation})
probe=root/'positive.txt';probe.write_text('positive');check('ENV-FS-POSITIVE',probe.read_text()=='positive','Synthetic allowed file was written and read')
for id,path,mode in [('ENV-HOME-DENY',Path(os.environ['VERIFY_DENIED_FILE']),'read'),('ENV-WRITE-DENY',w/'forbidden-write.txt','write')]:
 try:
  if mode=='read':path.read_text()
  else:path.write_text('forbidden')
  check(id,False,'Unexpected access')
 except PermissionError as e:check(id,True,{'error':type(e).__name__,'errno':e.errno})
for name,family,dest in [('ENV-TCP-DENY',socket.AF_INET,('127.0.0.1',int(os.environ['VERIFY_PORT']))),('ENV-SOCKET-DENY',socket.AF_UNIX,os.environ['VERIFY_SOCKET'])]:
 sock=socket.socket(family,socket.SOCK_STREAM);sock.settimeout(1)
 try:sock.connect(dest);check(name,False,'Unexpected connection')
 except PermissionError as e:check(name,True,{'errno':e.errno})
 except OSError as e:check(name,False,{'errno':e.errno,'error':'not evidence of sandbox denial'})
 finally:sock.close()
assert all(c['status']=='PASS' for c in checks),'Isolation controls failed; no target probe should run'
tk=CoreToolkit(workspace_root=ws)
f=ws/'normal.txt';f.write_text('normal data\n');a=tk.read(str(f));check('CORE-READ-POSITIVE','normal data' in json.dumps(a),a)
a=tk.read(str(secret));check('CORE-READ-OUTSIDE','error' in a and canary not in json.dumps(a),a)
link=ws/'linked.txt';link.symlink_to(secret)
a=tk.read(str(link));check('CORE-READ-SYMLINK','error' in a and canary not in json.dumps(a),a)
a=tk.grep('PUPU_SYNTHETIC_CANARY');check('CORE-GREP-SYMLINK',canary not in json.dumps(a),a)
a=tk.glob('../outside/*');check('CORE-GLOB-PARENT',str(secret) not in json.dumps(a),a)
a=tk.write(str(outside/'not-owned.txt'),'forbidden');check('CORE-WRITE-OUTSIDE','error' in a and not (outside/'not-owned.txt').exists(),a)
a=tk.write(str(ws/'new.txt'),'new synthetic data');check('CORE-WRITE-POSITIVE',(ws/'new.txt').read_text()=='new synthetic data',a)
for url in ['file:///etc/passwd','http://127.0.0.1:9/','http://169.254.169.254/latest/meta-data/','https://user:secret@example.com/']:
 a=tk.web_fetch(url=url);check('CORE-FETCH-REJECT-'+str(len(checks)),not a.get('ok',False),a)
# Confirm a disguised executable is not trusted merely for having a read-only basename.
evil=root/'fake-bin';evil.mkdir();fake=evil/'cat';fake.write_text('#!/bin/sh\necho mutated > '+str(ws/'classifier-marker.txt')+'\n');fake.chmod(0o755)
a=ShellRuntime.is_low_risk_command(str(fake),'posix');check('CORE-SHELL-EXECUTABLE-IDENTITY',not a,{'command':str(fake),'classifiedLowRisk':a})
# This direct call is a bounded effect probe, not an end-to-end confirmation claim.
if a:
 from unchain.tools.confirmation import execute_confirmable_tool_call
 from unchain.kernel.types import ToolCall
 seen=[]
 def deny(request):
  seen.append('confirmation_requested');return {'approved':False,'reason':'synthetic denial'}
 result=execute_confirmable_tool_call(toolkit=tk,tool_call=ToolCall(call_id='verify-shell',name='shell',arguments={'action':'run','command':str(fake)}),on_tool_confirm=deny,loop=None,callback=None,run_id='verify',iteration=0)
 check('CORE-SHELL-DISGUISED-EFFECT',not (ws/'classifier-marker.txt').exists(),{'toolResult':result.tool_result,'confirmationRequests':len(seen),'denied':result.denied,'markerWritten':(ws/'classifier-marker.txt').exists()})
pws=root/'plan-workspace';pws.mkdir();pt=PlanToolkit(workspace_root=pws);a=pt.plan_start(title='Synthetic plan',goal='Test lifecycle');pid=a['plan_id'];pt.plan_update(pid,summary='Synthetic update');b=PlanToolkit(workspace_root=pws).plan_list();check('PLAN-RESTART-POSITIVE',any(p['plan_id']==pid for p in b['plans']),b)
a=pt.plan_read('../../outside/plan_99');check('PLAN-ID-TRAVERSAL',a.get('ok') is False,a)
external=outside/'plan_99.json';external.write_text(json.dumps({'plan_id':'plan_99','title':canary,'goal':'outside workspace'}))
(pws/'plans/plan_99.json').symlink_to(external)
a=pt.plan_list();check('PLAN-FILE-SYMLINK-READ',canary not in json.dumps(a),a)
ps=root/'plan-dir-symlink';ps.mkdir();(ps/'plans').symlink_to(outside,target_is_directory=True)
a=PlanToolkit(workspace_root=ps).plan_list();check('PLAN-DIR-SYMLINK-READ',canary not in json.dumps(a),a)
original=external.read_bytes();a=PlanToolkit(workspace_root=ps).plan_update('plan_99',summary='blocked write');check('PLAN-DIR-SYMLINK-WRITE',external.read_bytes()==original,{'result':a,'outsideUnchanged':external.read_bytes()==original})
check('METADATA-CORE-CONFIRMATION',tk.get('write').requires_confirmation and tk.get('edit').requires_confirmation and tk.get('shell').requires_confirmation,{'write':tk.get('write').requires_confirmation,'edit':tk.get('edit').requires_confirmation,'shell':tk.get('shell').requires_confirmation,'grep':tk.get('grep').requires_confirmation})
check('METADATA-PLAN-CONFIRMATION',pt.get('plan_finalize').requires_confirmation,{'finalize':pt.get('plan_finalize').requires_confirmation,'list':pt.get('plan_list').requires_confirmation})
tk.shutdown();print(json.dumps({'checks':checks,'note':'Real toolkit methods in isolated synthetic workspace; no real model or desktop was used.'},indent=2))
