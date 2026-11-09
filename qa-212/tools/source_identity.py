"""Bind source-map sourcesContent and direct Electron code to candidate source."""
import hashlib,json,sys,subprocess
from pathlib import Path
repo,out=map(Path,sys.argv[1:]);matched=[]
for mapping in (repo/'build').rglob('*.map'):
 m=json.loads(mapping.read_text())
 for name,content in zip(m.get('sources',[]),m.get('sourcesContent',[])):
  if content is None:continue
  # CRA maps include module paths both with src/ and relative to src/.
  clean=name.split('webpack://')[-1].lstrip('./')
  if '/./' in clean:clean=clean.split('/./',1)[1]
  if '/src/' in clean:clean='src/'+clean.split('/src/',1)[1]
  options=[repo/clean,repo/'src'/clean]
  target=next((p for p in options if p.is_file() and 'node_modules' not in p.parts),None)
  if target is None:continue
  assert target.read_text()==content,str(target)
  matched.append({'source':str(target.relative_to(repo)),'sha256':hashlib.sha256(content.encode()).hexdigest(),'map':str(mapping.relative_to(repo))})
required=set()
exempt=json.loads((Path(__file__).parent/'unbundled-owned-components.json').read_text())['paths']
required.update(['src/COMPONENTs/agents/pages/skeleton_resource_page.js','src/COMPONENTs/agents/pages/recipes_page/detail_panel/code_section.js','src/COMPONENTs/agents/pages/recipes_page/detail_panel/hooks_pool_section.js','src/COMPONENTs/agents/pages/recipes_page/detail_panel/workflow_call_section.js','src/COMPONENTs/agents/pages/recipes_page/agents_i18n.js'])
changed=subprocess.check_output(['git','-C',str(repo),'diff','--name-only','d5d75094a5788a17b432d284dbffbb5b10ccab24','HEAD'],text=True).splitlines()
required.update(p for p in changed if p.startswith('src/COMPONENTs/agents/') and p.endswith('.js') and '.test.' not in p and p not in exempt)
seen={x['source'] for x in matched}
assert required<=seen, 'missing exact source-map identity: '+repr(sorted(required-seen))
# electron-builder asar archive identity is sealed by app-files, and extraction proves direct source.
import subprocess
unpacked=out/'asar-source'
subprocess.run(['node',str(repo/'node_modules/@electron/asar/bin/asar.js'),'extract',str(repo/'dist/linux-unpacked/resources/app.asar'),str(unpacked)],check=True)
# Bind the App's actual frontend files, not only adjacent build output.
for source in (repo/'build').rglob('*'):
 if not source.is_file():continue
 target=unpacked/'build'/source.relative_to(repo/'build')
 assert target.is_file() and source.read_bytes()==target.read_bytes(), 'packaged build mismatch '+str(source)
# Every main/preload source is required; a missing file cannot pass via if-exists.
for area in ['electron']:
 for source in (repo/area).rglob('*'):
  if not source.is_file() or 'tests' in source.parts:continue
  target=unpacked/source.relative_to(repo)
  assert target.is_file() and source.read_bytes()==target.read_bytes(), 'packaged direct-source mismatch '+str(source)
  matched.append({'source':str(source.relative_to(repo)),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'direct':True})
for name in ['public/electron.js','public/preload.js','src/SERVICEs/custom_provider_presets.json']:
 source=repo/name;target=unpacked/name
 assert target.is_file() and source.read_bytes()==target.read_bytes(), 'packaged entry source mismatch '+name
 matched.append({'source':name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'direct':True})
assert any(x.get('direct') for x in matched)
subprocess.run(['node',str(Path(__file__).parent/'bind_catalogs.cjs'),str(repo),str(out/'catalog-bundle-identity.json')],check=True)
(out/'source-identity.json').write_text(json.dumps({'matched':True,'source_count':len(matched),'sources':matched,'required':sorted(required),'not_required_unbundled_components':exempt,'catalog_identity':'catalog-bundle-identity.json'},indent=2)+'\n')
# Extracted source is not needed in evidence; avoid uploading full node_modules.
import shutil
shutil.rmtree(unpacked)
