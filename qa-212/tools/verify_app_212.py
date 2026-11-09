"""Offline evidence validator. Absence or partial evidence fails closed; no count-only PASS."""
import hashlib,itertools,json,sqlite3,sys
from pathlib import Path
root=Path(sys.argv[1]);r=root/'runtime'
def load(name):return json.loads((r/name).read_text())
def need(value,reason):
 if not value:raise AssertionError(reason)
need(not (r/'failure.txt').exists(),'driver failed')
direct=load('direct-result.json');identity=dict(line.split('=',1) for line in (root/'candidate-identity.txt').read_text().splitlines())
need(direct['tree']==identity['tree'],'candidate tree mismatch')
need(load('provider-wires.json')==[],'offline unexpected provider request')
need(load('errors.json')==[],'renderer error')
need(all(not c['hits'] for c in load('blocked-service-canaries.json')),'forbidden loopback request')
iso=load('isolation-probe.json');need(iso['positive_nonce'] and len(iso['controls'])==4 and all(c['refused'] for c in iso['controls']),'isolation negative control failed')
need(not list(r.rglob('*.pcap')) and not list(r.rglob('key.pem')),'raw pcap or TLS key not removed')
need((r/'sidecar-pcap.sha256').is_file(),'capture digest absent')
need('root 4755' in (root/'chromium-sandbox.txt').read_text(),'Chromium sandbox missing')
need(direct['product_renderer_sandbox'] is False,'baseline renderer sandbox disclosure missing')
seed=load('seeded-resource.json');before=load('locale-only-resource.json');saved=load('saved-resource.json');cold=load('cold-resource.json')
need(seed==before,'locale operation silently saved resource')
need(saved==cold,'cold read is not saved resource')
need(saved['resource']['edit_token']!=seed['resource']['edit_token'],'explicit save did not advance token')
hot=load('hot-identity.json');need(hot['same_node_connected'] is True,'dirty control was remounted')
need(any(c['text']==hot['dirty_text'] and hashlib.sha256(c['text'].encode()).hexdigest()==c['sha256'] for c in saved['contents']),'raw source changed')
expected=json.loads(json.dumps(seed['resource']['document']));expected['nodes'][1]['config']['code']['source']=saved['resource']['document']['nodes'][1]['config']['code']['source']
need(expected==saved['resource']['document'],'raw author prompt/code/id changed')
g=load('process-generations.json');need(len(g)==2 and all(x['all_owned_dead'] and x['sidecar_owned'] for x in g),'cold process ownership not established')
need(g[0]['main']['pid']!=g[1]['main']['pid'] or g[0]['main']['start_ticks']!=g[1]['main']['start_ticks'],'cold restart reused main')
ledger=load('ledger.json');pairs=load('http-pairs.json')
posts=[p for p in pairs if p['method'] in ('POST','PUT','DELETE') and p['path'].startswith('/skeleton_resources')]
need(len(posts)==2,'unexpected resource writes: only seed plus explicit Save permitted')
for p,wanted in zip(posts,[seed,saved]):
 need(p['path']=='/skeleton_resources/v2' and p['method']=='POST','unexpected resource mutation route')
 need(p['response'] and p['response']['status']==200,'resource save HTTP failed')
 body=json.loads(p['response']['body']);need(body==wanted or body.get('data')==wanted,'HTTP save response does not bind authoritative resource')
for start,end in zip([x for x in ledger if x['kind']=='locale-start'],[x for x in ledger if x['kind']=='locale-end']):
 need(end['before']==end['after'],'locale operation silently saved resource')
 need(not any(start['wall_ms']/1000<=float(p['at'])<=end['wall_ms']/1000 for p in posts),'locale interval includes resource write')
need(len([x for x in ledger if x['kind']=='save-start'])==1,'more than one explicit Save')
need(not any(p['method']=='POST' and any(s in p['path'] for s in ['/chat','/responses','/completions','/run']) for p in pairs),'offline unexpected model execution')
cells=load('cells.json');wanted=set(itertools.product(['code-section','workflow-call-section','hooks-pool-section'],['en','zh-CN','de'],['light','dark'],['min','max']))
need({(x['panel'],x['locale'],x['theme'],x['bound']) for x in cells}==wanted,'matrix cells missing')
for c in cells:
 need((r/c['screenshot']).stat().st_size>1000 and (r/c['aria']).stat().st_size>10,'cell screenshot/aria missing')
 need(c['geometry']['clientWidth']>0 and any(v['visible'] for v in c['geometry']['controls']),'cell controls not visible')
# Bind the actual authoritative resource store table and identity, never arbitrary JSON.
matched=[]
for item in load('database-copies.json'):
 db=r/item['copy'];need(db.is_file(),'DB copy missing')
 if not item['source'].endswith('/resources.sqlite3'):continue
 connection=sqlite3.connect(f'file:{db}?mode=ro',uri=True)
 need(connection.execute('PRAGMA integrity_check').fetchall()==[('ok',)],'resource DB integrity failed')
 rows=connection.execute('SELECT resource_id,draft_json,draft_digest,edit_revision,edit_token FROM resources WHERE resource_id=?',(saved['resource']['id'],)).fetchall()
 need(len(rows)==1,'resource DB identity is missing or nonunique')
 resource_id,draft,digest,revision,token=rows[0]
 need(json.loads(draft)==saved['resource']['document'],'DB draft differs from saved document')
 need(token==saved['resource']['edit_token'] and digest==saved['resource']['draft_digest'] and isinstance(revision,int) and revision>0,'DB token/digest/revision differs from saved resource')
 matched.append({'db':item['copy'],'resource_id':resource_id,'edit_token':token,'draft_digest':digest,'edit_revision':revision});connection.close()
need(len(matched)==1,'exactly one authoritative resource DB expected')
source=json.loads((root/'source-identity.json').read_text());need(source['matched'] and source['source_count']>0,'App source hash mismatch')
need(json.loads((root/'app-after.json').read_text())['matched']>0,'sealed App changed')
(root/'validator-result.json').write_text(json.dumps({'verdict':'PASS','candidate':identity,'db_matches':matched,'cells':len(cells)},indent=2)+'\n')
print('APP212_EVIDENCE_VALIDATED')
