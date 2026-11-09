"""Offline evidence validator. Absence or partial evidence fails closed; no count-only PASS."""
import hashlib,itertools,json,sqlite3,sys,os,subprocess,math,shutil,tempfile
from pathlib import Path
root=Path(sys.argv[1]);r=root/'runtime'
def load(name):return json.loads((r/name).read_text())
def need(value,reason):
 if not value:raise AssertionError(reason)
need(not (r/'failure.txt').exists(),'driver failed')
direct=load('direct-result.json');identity=dict(line.split('=',1) for line in (root/'candidate-identity.txt').read_text().splitlines())
need(direct['tree']==identity['tree'],'candidate tree mismatch')
candidate=Path(os.environ['QA_CANDIDATE_ROOT'])
need(subprocess.check_output(['git','-C',str(candidate),'rev-parse','HEAD'],text=True).strip()==identity['candidate'] and subprocess.check_output(['git','-C',str(candidate),'rev-parse','HEAD^{tree}'],text=True).strip()==identity['tree'],'candidate identity does not bind actual source checkout')
need(load('provider-wires.json')==[],'offline unexpected provider request')
need(load('errors.json')==[],'renderer error')
canaries=load('blocked-service-canaries.json')
need(len(canaries)==2 and {c['port'] for c in canaries}=={11434,18992} and all(not c['hits'] for c in canaries),'forbidden loopback request or missing canary')
iso=load('isolation-probe.json');need(iso['positive_nonce'] and len(iso['controls'])==4 and all(c['refused'] for c in iso['controls']),'isolation negative control failed')
need(not list(r.rglob('*.pcap')) and not list(r.rglob('key.pem')),'raw pcap or TLS key not removed')
need((r/'sidecar-pcap.sha256').is_file(),'capture digest absent')
need('root 4755' in (root/'chromium-sandbox.txt').read_text(),'Chromium sandbox missing')
need(direct['product_renderer_sandbox'] is False,'baseline renderer sandbox disclosure missing')
seed=load('seeded-resource.json');before=load('locale-only-resource.json');saved=load('saved-resource.json');cold=load('cold-resource.json')
need(seed==before,'locale operation silently saved resource')
need(saved==cold,'cold read is not saved resource')
need(saved['resource']['edit_token']!=seed['resource']['edit_token'],'explicit save did not advance token')
hot=load('hot-identity.json');seed_edit=load('seed-edit.json')
need(hot['dirty_text']==seed_edit['managed_sources'][0]['text']+'\n# QA212 explicit GUI edit résumé 中文 Deutsch\n','dirty source differs from explicit GUI edit')
need(hot['same_node_connected'] is True,'dirty control was remounted')
need(any(c['text']==hot['dirty_text'] and hashlib.sha256(c['text'].encode()).hexdigest()==c['sha256'] for c in saved['contents']),'raw source changed')
need(saved['resource']['document']['nodes'][1]['config']['code']['source']=={'kind':'file','path':'__pupu_code__/sha256/'+hashlib.sha256(hot['dirty_text'].encode()).hexdigest()+'.py'},'managed source path digest mismatch')
expected=json.loads(json.dumps(seed['resource']['document']));expected['nodes'][1]['config']['code']['source']=saved['resource']['document']['nodes'][1]['config']['code']['source']
need(expected==saved['resource']['document'],'raw author prompt/code/id changed')
g=load('process-generations.json');need(len(g)==2 and all(x['all_owned_dead'] and x['sidecar_owned'] for x in g),'cold process ownership not established')
need(g[0]['main']['pid']!=g[1]['main']['pid'] or g[0]['main']['start_ticks']!=g[1]['main']['start_ticks'],'cold restart reused main')
need(int(g[0]['stopped_ns'])<int(g[1]['started_ns']),'cold start preceded old process death')
need(g[0]['home']==g[1]['home'] and g[0]['profile']==g[1]['profile'],'cold read changed HOME or profile')
need(all(x['sidecars'] and all(s['sha256']==os.environ['QA_BINARY_SHA'] for s in x['sidecars']) and x['sidecar'] in x['sidecars'] for x in g),'running binary differs from fixed pair')
need(g[0]['sidecar']['pid']!=g[1]['sidecar']['pid'] or g[0]['sidecar']['start_ticks']!=g[1]['sidecar']['start_ticks'],'cold restart reused sidecar')
ledger=load('ledger.json');pairs=load('http-pairs.json')
resource_requests=[p for p in pairs if p['method'] in ('POST','PUT','DELETE') and p['path'].startswith('/skeleton_resources')]
# resolve is an established read-only alias lookup despite its POST method. It must never count as a Save.
need(all(p['method']=='POST' and p['path'] in ('/skeleton_resources/v2','/skeleton_resources/resolve') for p in resource_requests),'unexpected resource mutation route')
posts=[p for p in resource_requests if p['path']=='/skeleton_resources/v2']
need(len(posts)==2,'unexpected resource writes: only seed plus explicit Save permitted')
need(json.loads(posts[0]['request_body'])==seed_edit,'seed request differs from actual producer input')
for p,wanted in zip(posts,[seed,saved]):
 need(p['path']=='/skeleton_resources/v2' and p['method']=='POST','unexpected resource mutation route')
 need(p['response'] and p['response']['status']==200,'resource save HTTP failed')
 body=json.loads(p['response']['body']);need(body==wanted or body.get('data')==wanted,'HTTP save response does not bind authoritative resource')
starts=[x for x in ledger if x['kind']=='locale-start'];ends=[x for x in ledger if x['kind']=='locale-end']
need(len(starts)==len(ends)==17,'locale intervals missing or unpaired')
for start,end in zip(starts,ends):
 need(start['wall_ms']<=end['wall_ms'] and int(start['at_ns'])<int(end['at_ns']),'locale interval order invalid')
 need(end['before']==end['after'],'locale operation silently saved resource')
 need(not any(start['wall_ms']/1000<=float(p['at'])<=end['wall_ms']/1000 for p in posts),'locale interval includes resource write')
save_starts=[x for x in ledger if x['kind']=='save-start'];save_ends=[x for x in ledger if x['kind']=='save-end']
need(len(save_starts)==len(save_ends)==1,'explicit Save interval missing or repeated')
a,b=save_starts[0],save_ends[0]
need(int(a['at_ns'])<int(b['at_ns']) and a['wall_ms']<=b['wall_ms'],'explicit Save interval order invalid')
need(a['wall_ms']/1000<=float(posts[1]['at'])<=float(posts[1]['response']['at'])<(b['wall_ms']+1)/1000,'resource write is not the explicit GUI Save')
save_request=json.loads(posts[1]['request_body'])
need(set(save_request)==set(seed_edit) and save_request['schema']==seed_edit['schema'],'GUI Save request shape changed')
need(save_request['expected_edit_token']==seed['resource']['edit_token'],'GUI Save did not use loaded token')
need(save_request['managed_sources']==[{**seed_edit['managed_sources'][0],'text':hot['dirty_text']}],'GUI Save body did not carry exact authored source')
cold_starts=[x for x in ledger if x['kind']=='cold-start'];cold_reads=[x for x in ledger if x['kind']=='cold-read']
need(len(cold_starts)==len(cold_reads)==1 and int(cold_starts[0]['at_ns'])<int(cold_reads[0]['at_ns']),'cold read interval missing or invalid')
cold_gets=[p for p in pairs if p['method']=='GET' and p['path']=='/skeleton_resources/v2/'+saved['resource']['id'] and cold_starts[0]['wall_ms']/1000<=float(p['at'])<(cold_reads[0]['wall_ms']+1)/1000]
need(bool(cold_gets),'cold authoritative HTTP read missing')
for p in cold_gets:
 need(p['response'] and p['response']['status']==200 and json.loads(p['response']['body'])==cold,'cold HTTP body differs from saved authoritative resource')
need(not any(p['method']=='POST' and any(s in p['path'] for s in ['/chat','/responses','/completions','/run']) for p in pairs),'offline unexpected model execution')
cells=load('cells.json');wanted=set(itertools.product(['code-section','workflow-call-section','hooks-pool-section'],['en','zh-CN','de'],['light','dark'],['min','max']))
wanted.update(('hooks-pool-section',locale,'light','min') for locale in ['zh-TW','ja','ko','es','fr','it','pt-BR','ru'])
need(len(cells)==len(wanted) and {(x['panel'],x['locale'],x['theme'],x['bound']) for x in cells}==wanted,'matrix cells missing or repeated')
for c in cells:
 clipping=json.loads((r/(Path(c['screenshot']).stem+'-clipping.json')).read_text())
 need(c['clipping']==clipping==[],'translated controls clip horizontally')
 shell=c['shell'];expected=300 if c['bound']=='min' else max(300,math.floor(shell['frame']['width']*0.5+0.5))
 need(shell['expected_css_width']==expected and abs(shell['width']-(expected+2))<2,'panel width does not match actual dragged bound')
 need((r/c['screenshot']).stat().st_size>1000 and (r/c['aria']).stat().st_size>10,'cell screenshot/aria missing')
 need(c['geometry']['clientWidth']>0 and any(v['visible'] for v in c['geometry']['controls']),'cell controls not visible')
 need(c['label_probe']['key']=={'code-section':'agents.execution.code.runtime','workflow-call-section':'agents.workflow.no_workflows','hooks-pool-section':'agents.hooks.add_hook'}[c['panel']],'cell label identity differs from required panel')
 value=json.loads((Path(os.environ['QA_CANDIDATE_ROOT'])/'src/locales'/(c['locale']+'.json')).read_text())
 for segment in c['label_probe']['key'].split('.'):value=value[segment]
 need(c['label_probe']['actual']==c['label_probe']['expected']==value,'cell localized text does not match the selected catalog')
# Bind the actual authoritative resource store table and identity, never arbitrary JSON.
matched=[]
for item in load('database-copies.json'):
 db=r/item['copy'];need(db.is_file(),'DB copy missing')
 if not item['source'].endswith('/resources.sqlite3'):continue
 # SQLite may update WAL/SHM bookkeeping even for read-only connections. Never open the retained evidence in place.
 with tempfile.TemporaryDirectory(prefix='qa212-db-read-') as temp_root:
  private=Path(temp_root)/db.name
  shutil.copyfile(db,private)
  for suffix in ('-wal','-shm'):
   if Path(str(db)+suffix).exists():shutil.copyfile(Path(str(db)+suffix),Path(str(private)+suffix))
  connection=sqlite3.connect(private)
  try:
   need(connection.execute('PRAGMA integrity_check').fetchall()==[('ok',)],'resource DB integrity failed')
   rows=connection.execute('SELECT resource_id,draft_json,draft_digest,edit_revision,edit_token FROM resources WHERE resource_id=?',(saved['resource']['id'],)).fetchall()
   need(len(rows)==1,'resource DB identity is missing or nonunique')
   resource_id,draft,digest,revision,token=rows[0]
   need(hashlib.sha256(draft.encode()).hexdigest()==digest,'DB canonical draft digest mismatch')
   need(json.loads(draft)==saved['resource']['document'],'DB draft differs from saved document')
   need(token==saved['resource']['edit_token'] and digest==saved['resource']['draft_digest'] and isinstance(revision,int) and revision>0,'DB token/digest/revision differs from saved resource')
   matched.append({'db':item['copy'],'resource_id':resource_id,'edit_token':token,'draft_digest':digest,'edit_revision':revision})
  finally:connection.close()
need(len(matched)==1,'exactly one authoritative resource DB expected')
exempt=set(json.loads((Path(__file__).parent/'unbundled-owned-components.json').read_text())['paths'])
changed=subprocess.check_output(['git','-C',str(candidate),'diff','--name-only','d5d75094a5788a17b432d284dbffbb5b10ccab24','HEAD'],text=True).splitlines()
required={p for p in changed if p.startswith('src/COMPONENTs/agents/') and p.endswith('.js') and '.test.' not in p and p not in exempt}
required.update(['src/COMPONENTs/agents/pages/skeleton_resource_page.js','src/COMPONENTs/agents/pages/recipes_page/detail_panel/code_section.js','src/COMPONENTs/agents/pages/recipes_page/detail_panel/hooks_pool_section.js','src/COMPONENTs/agents/pages/recipes_page/detail_panel/workflow_call_section.js','src/COMPONENTs/agents/pages/recipes_page/agents_i18n.js'])
source=json.loads((root/'source-identity.json').read_text());need(set(source['required'])==required,'required source set differs from actual candidate diff')
need(source['matched'] and source['source_count']==len(source['sources']) and source['source_count']>0,'App source hash mismatch')
candidate=Path(os.environ['QA_CANDIDATE_ROOT'])
for item in source['sources']:
 path=candidate/item['source']
 need(path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest()==item['sha256'],'App source hash mismatch')
need(set(source['required'])<=set(item['source'] for item in source['sources']),'required App source absent')
catalog=json.loads((root/'catalog-bundle-identity.json').read_text())
need(catalog['complete_catalogs']==11 and len(catalog['expected'])==11 and set(catalog['expected'])==set(catalog['matches']) and all(catalog['matches'].values()),'complete catalog binding absent')
for name,digest in catalog['expected'].items():
 value=json.loads((candidate/'src/locales'/name).read_text())
 canonical=json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))
 need(hashlib.sha256(canonical.encode()).hexdigest()==digest,'compiled locale differs from candidate')
 need(all(item['catalog_canonical_sha256']==digest for item in catalog['matches'][name]),'compiled catalog hash mismatch')
need(json.loads((root/'app-after.json').read_text())['matched']==len(json.loads((root/'app-files.json').read_text()))>0,'sealed App file count mismatch')
(root/'validator-result.json').write_text(json.dumps({'verdict':'PASS','candidate':identity,'db_matches':matched,'cells':len(cells)},indent=2)+'\n')
print('APP212_EVIDENCE_VALIDATED')
