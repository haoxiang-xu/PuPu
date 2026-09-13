import pathlib,json,subprocess,hashlib,shutil,concurrent.futures
s=json.load(open('/tmp/pupu-third-party-state.json'));w=pathlib.Path(s['work']);out=pathlib.Path(s['out']);scratch=w/'sandbox';scratch.mkdir(exist_ok=True);(scratch/'home').mkdir(exist_ok=True);(scratch/'tmp').mkdir(exist_ok=True)
# Existing runtime is a trusted dependency; no personal home is passed through.
base='/Users/red/.local/share/uv/python/cpython-3.12.11-macos-aarch64-none';node='/Users/red/.nvm/versions/node/v24.18.0'
profile='(version 1)\n(allow default)\n(deny network*)\n(deny file-read-data (require-all (subpath "/Users") (require-not (require-any (subpath '+json.dumps(base)+') (subpath '+json.dumps(node)+')))))\n(deny file-write* (require-not (require-any (subpath '+json.dumps(str(scratch))+') (subpath "/dev"))))\n'
(w/'sandbox.sb').write_text(profile);(out/'sandbox-profile.sb').write_text(profile);env={'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','HOME':str(scratch/'home'),'TMPDIR':str(scratch/'tmp'),'PYTHONDONTWRITEBYTECODE':'1','PYTHONNOUSERSITE':'1','LITELLM_LOCAL_MODEL_COST_MAP':'True','HF_HUB_OFFLINE':'1','DO_NOT_TRACK':'1'};(w/'environment.json').write_text(json.dumps(env));(out/'environment.json').write_text(json.dumps(env))
jobs=[]
for f in (out/'subjects').glob('skillpack.*.json'):
 j=json.loads(f.read_text());repo=w/'subjects'/j['toolkitId']/'unpacked'/j['archiveRoot']
 for m in j['catalog']['manifest']:
  rel=pathlib.Path(m['path']).parent;target=w/'scan-skills'/j['toolkitId']/rel;src=repo/rel
  # Markdown references are part of the instruction-only view. Code resources remain in acquired artifact, outside this scan view.
  for p in src.rglob('*.md'):
   dest=target/p.relative_to(src);dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(p.read_bytes())
  jobs.append((j['toolkitId'],rel,target))
def scan(job):
 id,rel,target=job;label=id+'-'+(rel.name or 'root');cmd=['/usr/bin/sandbox-exec','-f',str(w/'sandbox.sb'),str(w/'scanner-venv/bin/skill-scanner'),'scan',str(target),'--format','json','--use-behavioral','--policy','balanced','--cel-mode','shadow'];r=subprocess.run(cmd,env=env,cwd=scratch,capture_output=True,text=True,timeout=90);(out/(label+'-scanner.json')).write_text(r.stdout or '{}');(out/(label+'-scanner.log')).write_text(r.stderr);print(label,'exit',r.returncode,flush=True);return {'id':id,'path':str(rel),'exitCode':r.returncode,'report':label+'-scanner.json','log':label+'-scanner.log'}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(scan,jobs))
(out/'skill-scan-runs.json').write_text(json.dumps(results,indent=2))
rules=w/'scanner-venv/lib/python3.12/site-packages/skill_scanner';manifest=[{'path':str(p.relative_to(rules)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(rules.rglob('*')) if p.is_file() and p.suffix!='.pyc'];(out/'skill-scanner-rules-manifest.json').write_text(json.dumps(manifest,indent=2))
