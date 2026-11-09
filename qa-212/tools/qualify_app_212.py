"""Run precise tamper controls only on private copies of a completed App trace."""
import copy, hashlib, json, os, shutil, subprocess, sys
from pathlib import Path
baseline,candidate,out=map(Path,sys.argv[1:]);out.mkdir(parents=True,exist_ok=False)
verifier=Path(sys.argv[4]) if len(sys.argv)>4 else Path(__file__).parent/'verify_app_212.py'
if not verifier.is_file():verifier=Path(__file__).parent/'qa-control/qa-212/tools/verify_app_212.py'
shutil.copyfile(verifier,out/'verify_app_212.py')
env=os.environ.copy();env.update(QA_CANDIDATE_ROOT=str(candidate),QA_BINARY_SHA='c91baa27f483ee861da1161b51cdd857282112589d31b6286342a2f86233f683')
def read(root,name):return json.loads((root/'runtime'/name).read_text())
def write(root,name,value):(root/'runtime'/name).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def change(root,name,action):
 v=read(root,name);action(v);write(root,name,v)
def clips(root):
 v=read(root,'cells.json');v[0]['clipping']=[{'text':'CUT','scrollWidth':40,'clientWidth':15}]
 write(root,'cells.json',v);write(root,Path(v[0]['screenshot']).stem+'-clipping.json',v[0]['clipping'])
def alter_save(root,action):
 v=read(root,'http-pairs.json');p=[x for x in v if x['method']=='POST' and x['path']=='/skeleton_resources/v2'][1]
 action(p);write(root,'http-pairs.json',v)
def save_token(root):
 def mutate(p):
  body=json.loads(p['request_body']);body['expected_edit_token']='forged-token';p['request_body']=json.dumps(body)
 alter_save(root,mutate)
def seed_text(root):
 v=read(root,'http-pairs.json');p=next(x for x in v if x['method']=='POST' and x['path']=='/skeleton_resources/v2');body=json.loads(p['request_body']);body['managed_sources'][0]['text']+='x';p['request_body']=json.dumps(body);write(root,'http-pairs.json',v)
def duplicate(root):
 v=read(root,'cells.json');v[0]=copy.deepcopy(v[1]);write(root,'cells.json',v)
def order_positive(root):
 # JSON object field order is not semantic data and must not cause rejection.
 p=root/'runtime/cold-resource.json';v=json.loads(p.read_text());p.write_text(json.dumps(dict(reversed(list(v.items()))),ensure_ascii=False)+'\n')
def unexpected_post(root):
 change(root,'http-pairs.json',lambda a:a.append({'method':'POST','path':'/skeleton_resources/forged','at':0,'request_body':'{}','response':None}))
def before_save(root):
 ledger=read(root,'ledger.json');start=next(x for x in ledger if x['kind']=='save-start');last=max(x['wall_ms'] for x in ledger if x['kind']=='locale-end');assert last<start['wall_ms']
 alter_save(root,lambda p:p.update(at=(last+start['wall_ms'])/2000))
def stale_cold_body(root):
 ledger=read(root,'ledger.json');start=next(x for x in ledger if x['kind']=='cold-start');end=next(x for x in ledger if x['kind']=='cold-read');seed=read(root,'seeded-resource.json');saved=read(root,'saved-resource.json')
 rows=read(root,'http-pairs.json');count=0
 for p in rows:
  if p['method']=='GET' and p['path']=='/skeleton_resources/v2/'+saved['resource']['id'] and start['wall_ms']/1000<=float(p['at'])<(end['wall_ms']+1)/1000:
   p['response']['body']=json.dumps(seed);count+=1
 assert count>0;write(root,'http-pairs.json',rows)
def declared_tree(root):
 p=root/'candidate-identity.txt';s=p.read_text();pairs=dict(line.split('=',1) for line in s.splitlines());pairs['tree']='0'*40;p.write_text(''.join(k+'='+v+'\n' for k,v in pairs.items()));change(root,'direct-result.json',lambda v:v.update(tree='0'*40))
def wrong_label_identity(root):
 rows=read(root,'cells.json');c=rows[0];value=json.loads((candidate/'src/locales'/(c['locale']+'.json')).read_text())['boot']['click_to_start'];c['label_probe']={'key':'boot.click_to_start','actual':value,'expected':value};write(root,'cells.json',rows)
controls=[
 ('baseline',None,None),
 ('benign-json-key-order',order_positive,None),
 ('matrix-missing',lambda r:change(r,'cells.json',lambda v:v.pop()),'matrix cells missing or repeated'),
 ('matrix-duplicate',duplicate,'matrix cells missing or repeated'),
 ('consistent-clipping',clips,'translated controls clip horizontally'),
 ('wrong-width',lambda r:change(r,'cells.json',lambda v:v[0]['shell'].update(width=v[0]['shell']['width']+20)),'panel width does not match actual dragged bound'),
 ('wrong-locale',lambda r:change(r,'cells.json',lambda v:v[0]['label_probe'].update(actual='WRONG')),'cell localized text does not match the selected catalog'),
 ('coordinated-label-identity',wrong_label_identity,'cell label identity differs from required panel'),
 ('provider-attempt',lambda r:write(r,'provider-wires.json',[{'url':'/forbidden-offline-test'}]),'offline unexpected provider request'),
 ('unexpected-resource-post',unexpected_post,'unexpected resource mutation route'),
 ('save-before-click',before_save,'resource write is not the explicit GUI Save'),
 ('wrong-save-token',save_token,'GUI Save did not use loaded token'),
 ('seed-text-drift',seed_text,'seed request differs from actual producer input'),
 ('cold-home-drift',lambda r:change(r,'process-generations.json',lambda v:v[1].update(home=v[1]['home']+'-other')),'cold read changed HOME or profile'),
 ('locale-interval-missing',lambda r:change(r,'ledger.json',lambda v:v.remove(next(x for x in v if x['kind']=='locale-start'))),'locale intervals missing or unpaired'),
 ('cold-http-stale',stale_cold_body,'cold HTTP body differs from saved authoritative resource'),
 ('missing-canary',lambda r:write(r,'blocked-service-canaries.json',[]),'forbidden loopback request or missing canary'),
 ('coordinated-tree-claim',declared_tree,'candidate identity does not bind actual source checkout'),
]
results=[]
for name,mutate,expected in controls:
 dst=out/name;shutil.copytree(baseline,dst)
 (dst/'validator-result.json').unlink(missing_ok=True)
 if mutate:mutate(dst)
 p=subprocess.run([sys.executable,'-I','-B',str(out/'verify_app_212.py'),str(dst)],env=env,capture_output=True,text=True)
 (out/(name+'.stdout')).write_text(p.stdout);(out/(name+'.stderr')).write_text(p.stderr)
 actual=p.stderr.strip().splitlines()[-1] if p.stderr.strip() else ''
 good=(p.returncode==0 and p.stdout.strip()=='APP212_EVIDENCE_VALIDATED') if expected is None else (p.returncode!=0 and actual=='AssertionError: '+expected)
 results.append({'case':name,'expected_refusal':expected,'returncode':p.returncode,'last_stderr':actual,'met':good})
 # Keep only changed evidence and logs in the control copy for rejected cases? No: copies remain reproducible.
(out/'result.json').write_text(json.dumps({'verifier_sha256':hashlib.sha256(verifier.read_bytes()).hexdigest(),'baseline':str(baseline),'candidate':str(candidate),'cases':results,'all_met':all(x['met'] for x in results)},indent=2)+'\n')
print(json.dumps({'cases':len(results),'all_met':all(x['met'] for x in results)},indent=2))
if not all(x['met'] for x in results):sys.exit(1)
