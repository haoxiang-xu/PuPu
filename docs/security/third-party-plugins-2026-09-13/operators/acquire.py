import pathlib,json,tempfile,urllib.request,urllib.parse,hashlib,base64,tarfile,zipfile,io,concurrent.futures,datetime,re
root=pathlib.Path('/Users/red/Desktop/GITRepo/PuPu');out=root/'docs/security/third-party-plugins-2026-09-13';w=pathlib.Path(tempfile.mkdtemp(prefix='pupu-third-party-')).resolve();(w/'subjects').mkdir();(out/'subjects').mkdir(exist_ok=True)
state={'work':str(w),'out':str(out)};pathlib.Path('/tmp/pupu-third-party-state.json').write_text(json.dumps(state));reg=json.loads((root/'src/SERVICEs/mcp_toolkit_registry.json').read_text());packs=json.loads((root/'src/SERVICEs/plugin_store_curation.json').read_text())['skillPacks']
(out/'catalog-snapshot.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'mcp':reg,'skillPacks':packs},indent=2))
sha=lambda b:hashlib.sha256(b).hexdigest()
def fetch(url):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'PuPu-scoped-security-review','Accept':'application/json'}),timeout=40) as r:
  b=r.read(100*1024*1024+1);assert len(b)<=100*1024*1024;return b
def unpack(b,d,zip=False):
 files=[]
 def put(name,data):
  p=pathlib.PurePosixPath(name)
  if p.is_absolute() or '..' in p.parts:raise ValueError('unsafe archive path')
  dest=d/p;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data);files.append({'path':str(p),'sha256':sha(data),'size':len(data)})
 if zip:
  with zipfile.ZipFile(io.BytesIO(b)) as z:
   assert sum(i.file_size for i in z.infolist())<200*1024*1024
   for i in z.infolist():
    if not i.is_dir():put(i.filename,z.read(i))
 else:
  with tarfile.open(fileobj=io.BytesIO(b)) as t:
   assert sum(i.size for i in t.getmembers())<200*1024*1024
   for i in t.getmembers():
    if i.isfile():put(i.name,t.extractfile(i).read())
    elif not i.isdir():raise ValueError('archive contains link/device; manual acquisition required')
 return files
def acquire(e):
 id=e.get('toolkitId',e.get('id'));d=w/'subjects'/id;d.mkdir();record={'toolkitId':id,'catalog':e,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'acquisition':'No lifecycle scripts or candidate execution'}
 try:
  if 'mcp' in e:
   m=e['mcp']
   if m['transport']=='http':record.update(kind='hosted-mcp',endpoint=m['url']);return record
   args=m['args'];ecosystem='npm' if m['command']=='npx' else 'pypi'
   spec=next(a for a in args if (not a.startswith('-') and ('@' in a if ecosystem=='npm' else '==' in a)))
   name,version=spec.rsplit('@',1) if ecosystem=='npm' else spec.split('==');name=re.sub(r'\[.*\]','',name)
   metaurl='https://registry.npmjs.org/'+urllib.parse.quote(name,safe='')+'/'+version if ecosystem=='npm' else 'https://pypi.org/pypi/'+name+'/'+version+'/json'
   metadata=json.loads(fetch(metaurl));(d/'registry-metadata.json').write_text(json.dumps(metadata,indent=2))
   if ecosystem=='npm':url=metadata['dist']['tarball'];integrity=metadata['dist'].get('integrity');iszip=False
   else:
    choices=metadata['urls'];item=next((a for a in choices if a['filename'].endswith('py3-none-any.whl')),next((a for a in choices if a['packagetype']=='sdist'),choices[0]));url=item['url'];integrity='sha256-'+base64.b64encode(bytes.fromhex(item['digests']['sha256'])).decode();iszip=url.endswith('.whl')
   b=fetch(url)
   if integrity:
    alg,digest=integrity.split('-',1);assert base64.b64encode(hashlib.new(alg,b).digest()).decode()==digest,'integrity mismatch'
   (d/'artifact').write_bytes(b);files=unpack(b,d/'unpacked',iszip)
   record.update(kind='local-mcp',ecosystem=ecosystem,package=name,version=version,download=url,artifactSha256=sha(b),registryIntegrity=integrity,integrityVerified=bool(integrity),files=files,repository=metadata.get('repository') or metadata.get('info',{}).get('project_urls'),gitHead=metadata.get('gitHead'))
  else:
   s=e['source'];url='https://codeload.github.com/'+s['repo']+'/tar.gz/'+s['sha'];b=fetch(url);(d/'artifact').write_bytes(b);files=unpack(b,d/'unpacked');prefix=files[0]['path'].split('/')[0];checks=[]
   for f in e['manifest']:
    p=d/'unpacked'/prefix/f['path'];actual=sha(p.read_bytes()) if p.exists() else None;checks.append({'path':f['path'],'expected':f['sha256'],'actual':actual,'match':actual==f['sha256']})
   record.update(kind='skill-pack',download=url,commit=s['sha'],artifactSha256=sha(b),files=files,manifestChecks=checks,archiveRoot=prefix)
 except Exception as ex:record['error']=str(ex)
 finally:
  (out/'subjects'/(id+'.json')).write_text(json.dumps(record,indent=2));print(id,record.get('error','ACQUIRED'),flush=True)
 return record
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:records=list(pool.map(acquire,reg['entries']+packs))
(out/'acquisition-summary.json').write_text(json.dumps([{k:v for k,v in r.items() if k not in ['files','catalog']} for r in records],indent=2));print('WORK',w,flush=True)
