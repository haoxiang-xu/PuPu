import pathlib,json,subprocess,concurrent.futures,os
s=json.load(open('/tmp/pupu-third-party-state.json'));w=pathlib.Path(s['work']);out=pathlib.Path(s['out'])
def run(f):
 j=json.loads(f.read_text())
 if j.get('ecosystem')!='pypi':return
 d=w/'runtimes'/j['toolkitId'];d.mkdir(parents=True,exist_ok=True);a=j['catalog']['mcp']['args'];spec=a[a.index('--from')+1];requirements=[spec]+[a[i+1] for i,x in enumerate(a) if x=='--with'];req=d/'requirements.in';req.write_text('\n'.join(requirements)+'\n');env={'PATH':os.environ['PATH'],'HOME':str(w/'uv-home'),'UV_CACHE_DIR':str(w/'uv-cache')}
 cmd=['uv','pip','compile',str(req),'--exclude-newer','2026-07-28T00:00:00Z','--generate-hashes','--no-build','--python','/Users/red/Desktop/GITRepo/unchain/.venv/bin/python','-o',str(d/'requirements.txt')];r=subprocess.run(cmd,capture_output=True,text=True,env=env,timeout=120);(out/(j['toolkitId']+'-resolve.log')).write_text(r.stderr);print(j['toolkitId'],'resolve',r.returncode,flush=True)
 if r.returncode: return
 (out/(j['toolkitId']+'-requirements.txt')).write_bytes((d/'requirements.txt').read_bytes());subprocess.run(['uv','venv',str(d/'venv'),'--python','/Users/red/Desktop/GITRepo/unchain/.venv/bin/python'],env=env,check=True,capture_output=True)
 cmd=['uv','pip','sync','--python',str(d/'venv/bin/python'),'--only-binary',':all:','--require-hashes',str(d/'requirements.txt')];r=subprocess.run(cmd,capture_output=True,text=True,env=env,timeout=180);(out/(j['toolkitId']+'-install.log')).write_text(r.stderr);print(j['toolkitId'],'install',r.returncode,flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(run,(out/'subjects').glob('*.json')))
