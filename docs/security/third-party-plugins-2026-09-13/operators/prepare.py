import json,pathlib,tarfile,hashlib,subprocess,concurrent.futures,os
s=json.load(open('/tmp/pupu-third-party-state.json'));w=pathlib.Path(s['work']);out=pathlib.Path(s['out']);(w/'scan-skills').mkdir(exist_ok=True);sha=lambda b:hashlib.sha256(b).hexdigest()
for f in (out/'subjects').glob('skillpack.*.json'):
 j=json.loads(f.read_text());d=w/'subjects'/j['toolkitId'];files=[];skip=[]
 with tarfile.open(d/'artifact') as t:
  for m in t.getmembers():
   p=pathlib.PurePosixPath(m.name);assert not p.is_absolute() and '..' not in p.parts
   if m.isfile():
    b=t.extractfile(m).read();dest=d/'unpacked'/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b);files.append({'path':str(p),'sha256':sha(b),'size':len(b)})
   elif not m.isdir():skip.append({'path':m.name,'type':str(m.type),'linkname':m.linkname})
 prefix=files[0]['path'].split('/')[0];checks=[];selected=[]
 for item in j['catalog']['manifest']:
  p=d/'unpacked'/prefix/item['path'];b=p.read_bytes() if p.exists() else b'';checks.append({'path':item['path'],'expected':item['sha256'],'actual':sha(b),'match':p.exists() and sha(b)==item['sha256']})
  dest=w/'scan-skills'/j['toolkitId']/pathlib.Path(item['path']).parent;dest.mkdir(parents=True,exist_ok=True);(dest/'SKILL.md').write_bytes(b);selected.append({'path':item['path'],'bytes':len(b)})
 old=j.pop('error',None);j.update(kind='skill-pack',artifactSha256=sha((d/'artifact').read_bytes()),files=files,manifestChecks=checks,archiveRoot=prefix,skippedArchiveLinks=skip,initialAcquisitionError=old,selected=selected);f.write_text(json.dumps(j,indent=2));print(j['toolkitId'],'hash matches',all(c['match'] for c in checks),'links skipped',len(skip),flush=True)
# Resolve only npm packages with lifecycle scripts disabled; each has its own frozen result lock.
def npm(f):
 j=json.loads(f.read_text())
 if j.get('ecosystem')!='npm':return
 d=w/'runtimes'/j['toolkitId'];d.mkdir(parents=True,exist_ok=True);cmd=['npm','install','--prefix',str(d),'--ignore-scripts','--no-fund','--no-audit','--before=2026-07-28T00:00:00Z',str(w/'subjects'/j['toolkitId']/'artifact')]
 # npm needs archive suffix for explicit tarball installation.
 artifact=w/'subjects'/j['toolkitId']/'package.tgz';artifact.write_bytes((artifact.parent/'artifact').read_bytes());cmd[-1]=str(artifact)
 r=subprocess.run(cmd,capture_output=True,text=True,timeout=180,env={'PATH':os.environ['PATH'],'HOME':str(w/'npm-home'),'npm_config_cache':str(w/'npm-cache')});(out/(j['toolkitId']+'-install.log')).write_text(r.stdout+r.stderr)
 if (d/'package-lock.json').exists():
  b=(d/'package-lock.json').read_bytes();(out/(j['toolkitId']+'-package-lock.json')).write_bytes(b);j['resolvedLockSha256']=sha(b)
 j['dependencyAcquisition']={'exitCode':r.returncode,'lifecycleScripts':False,'cutoff':'2026-07-28T00:00:00Z'};f.write_text(json.dumps(j,indent=2));print(j['toolkitId'],'npm',r.returncode,flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(npm,(out/'subjects').glob('*.json')))
