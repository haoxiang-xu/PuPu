import pathlib,json,hashlib,urllib.request,zipfile,io
s=json.load(open('/tmp/pupu-third-party-state.json'));w=pathlib.Path(s['work']);out=pathlib.Path(s['out']);id='mcp.devops.grafana';j=json.load(open(out/'subjects'/(id+'.json')));meta=json.load(open(w/'subjects'/id/'registry-metadata.json'));u=next(u for u in meta['urls'] if u['filename'].endswith('macosx_11_0_arm64.whl'));b=urllib.request.urlopen(u['url']).read();sha=lambda b:hashlib.sha256(b).hexdigest();assert sha(b)==u['digests']['sha256'];(w/'subjects'/id/'runtime-arm64.whl').write_bytes(b);venv=w/'runtimes'/id/'venv/lib/python3.12/site-packages';checks=[]
with zipfile.ZipFile(io.BytesIO(b)) as z:
 for n in z.namelist():
  p=venv/n
  if n.startswith('mcp_grafana/') and not n.endswith('/'):checks.append({'path':n,'match':p.exists() and sha(z.read(n))==sha(p.read_bytes()),'sha256':sha(z.read(n))})
assert all(c['match'] for c in checks)
j['runtimeArtifact']={'download':u['url'],'sha256':sha(b),'platform':'macOS arm64','fileChecks':checks,'note':'Initial acquired artifact was x86_64; actual uv-installed and probed runtime is arm64. Both identities are retained.'};(out/'subjects'/(id+'.json')).write_text(json.dumps(j,indent=2));probe=out/(id+'-mcp-probe.json');r=json.load(open(probe));r['acquisitionArtifactSha256']=r.pop('artifactSha256');r['artifactSha256']=sha(b);r['identityCorrection']='Bound actual arm64 wheel by matching installed package files; initial acquired x86_64 wheel was not the executed binary.';probe.write_text(json.dumps(r,indent=2))
# Decode embedded Go inline build-info strings as data; do not execute the binary.
b=(venv/'mcp_grafana/bin/mcp-grafana').read_bytes();i=b.find(b'\xff Go buildinf:');assert i>=0 and b[i+15]&2;pos=i+32
def string():
 global pos
 n=0;shift=0
 while True:
  c=b[pos];pos+=1;n|=(c&127)<<shift
  if c<128:break
  shift+=7
 result=b[pos:pos+n];pos+=n;return result.decode(errors='replace')
version=string();mods=string();(out/'grafana-embedded-build-info.txt').write_text(version+'\n'+mods);print(version);print(mods[:2500]);
