import json,pathlib,subprocess,concurrent.futures,datetime
s=json.load(open('/tmp/pupu-third-party-state.json'));w=pathlib.Path(s['work']);out=pathlib.Path(s['out']);scanner='/private/tmp/pupu-official-verify-mj1zxup1/osv-scanner';files=list(out.glob('*-package-lock.json'))+list(out.glob('*-requirements.txt'))
def run(p):
 label=p.name.replace('-package-lock.json','').replace('-requirements.txt','');target=out/(label+'-osv.json');cmd=[scanner,'scan','source','--lockfile',('package-lock.json:'+str(p) if p.suffix=='.json' else 'requirements.txt:'+str(p)),'--no-resolve','--format','json','--all-packages','--output-file',str(target)];r=subprocess.run(cmd,capture_output=True,text=True,timeout=60);(out/(label+'-osv.log')).write_text(r.stdout+r.stderr);print(label,r.returncode,flush=True);return {'id':label,'exitCode':r.returncode,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':cmd}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:r=list(pool.map(run,files))
(out/'osv-runs.json').write_text(json.dumps(r,indent=2))
