"""Bind a packaged App's direct source and renderer source maps to Git input."""
from pathlib import Path
import hashlib,json,subprocess
candidate=Path.cwd();app=candidate/'dist/linux-unpacked/resources/app';results=[]
if not app.exists():app=candidate.parent/'package-inspection'
base='3cdc274ad0273dee3f69cfc0681e318a5df0417c'
files=subprocess.check_output(['git','diff','--diff-filter=ACMR','--name-only',base,'HEAD'],text=True).splitlines()
deleted=subprocess.check_output(['git','diff','--diff-filter=D','--name-only',base,'HEAD'],text=True).splitlines()
indexed={}
for p in app.rglob('*.js.map'):
    m=json.loads(p.read_text());
    for name,text in zip(m.get('sources') or [],m.get('sourcesContent') or []):
        if text is not None:indexed.setdefault(name,[]).append(text)
for name in deleted:
    if not name.endswith(('.js','.cjs')) or '.test.' in name:continue
    assert not (app/name).exists(),('deleted_direct_source_present',name)
    assert not any(key.endswith('/'+name) or key==name or key==name.removeprefix('src/') for key in indexed),('deleted_map_source_present',name)
Path('../test-results/package-deleted-sources.json').write_text(json.dumps(deleted,indent=2)+'\n')
for name in files:
    if not name.endswith(('.js','.cjs')) or '.test.' in name:continue
    raw=(candidate/name).read_bytes()
    if name.startswith(('electron/','public/')):
        packed=app/name;assert packed.is_file(),('direct_source_missing',name);assert raw==packed.read_bytes(),('direct_source_mismatch',name);kind='direct'
    elif name.startswith('src/'):
        matches=[text for key,texts in indexed.items() if key.endswith('/'+name) or key==name or key==name.removeprefix('src/') for text in texts]
        assert matches,('map_source_missing',name);assert all(text.encode()==raw for text in matches),('map_source_mismatch',name);kind='sourcemap'
    else:continue
    results.append({'file':name,'sha256':hashlib.sha256(raw).hexdigest(),'kind':kind})
assert len(results)>=10
Path('../test-results/package-source-binding.json').write_text(json.dumps(results,indent=2)+'\n')
