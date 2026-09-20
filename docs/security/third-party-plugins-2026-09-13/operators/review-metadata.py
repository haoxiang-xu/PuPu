import pathlib,json,hashlib,re,datetime,urllib.request,concurrent.futures
s=json.load(open('/tmp/pupu-third-party-state.json'));w=pathlib.Path(s['work']);out=pathlib.Path(s['out']);now=datetime.datetime.now(datetime.timezone.utc).isoformat();sha=lambda b:hashlib.sha256(b).hexdigest()
# Bind installed top-level files to acquired tarballs/wheels. Generated entrypoint/RECORD files are separate.
correspondence=[]
for f in (out/'subjects').glob('*.json'):
 j=json.loads(f.read_text());id=j['toolkitId'];checks=[]
 if j.get('ecosystem')=='npm':
  root=w/'runtimes'/id/'node_modules'/j['package']
  for row in j['files']:
   rel=pathlib.Path(row['path']);rel=pathlib.Path(*rel.parts[1:]);p=root/rel;checks.append({'path':str(rel),'match':p.is_file() and sha(p.read_bytes())==row['sha256']})
 elif j.get('ecosystem')=='pypi' and id!='mcp.devops.grafana':
  root=w/'runtimes'/id/'venv/lib/python3.12/site-packages'
  for row in j['files']:
   if row['path'].endswith('.py'):
    p=root/row['path'];checks.append({'path':row['path'],'match':p.is_file() and sha(p.read_bytes())==row['sha256']})
 elif j.get('runtimeArtifact'):checks=j['runtimeArtifact']['fileChecks']
 if checks:correspondence.append({'id':id,'allMatched':all(c['match'] for c in checks),'checks':checks})
(out/'runtime-artifact-correspondence.json').write_text(json.dumps(correspondence,indent=2));print('Runtime correspondence',[(r['id'],r['allMatched']) for r in correspondence])
# Preserve each advisory, its aliases and an explicit initial applicability assessment.
rows=[];counts=[]
reason={
 'hono':'HTTP middleware/router advisories: configured candidates use stdio. This does not prove every transitive use is unreachable; no HTTP serving was enabled.',
 'qs':'Query/form parser advisories: HTTP request parsing and option prerequisites need callsite review; no exploit demonstrated by this run.',
 'fast-uri':'URI/JSON-schema parser can participate in MCP schema validation. Do not dismiss solely because transport is stdio; adversarial parsing applicability remains unresolved.',
 'axios':'Outbound HTTP client is used by provider calls; inspect advisory-specific redirects, response and configuration prerequisites. Network-denied smoke does not resolve authenticated exposure.',
 'mcp':'Python SDK matches vary by task/HTTP/WebSocket paths and version. Stdio smoke alone is not a complete not-affected argument.',
 'cryptography':'Native crypto dependency: determine affected API use in the deployed client and protocol; no exploit demonstrated.',
 'pillow':'Image-decoding exposure depends on actual formats and source inputs; real browser/media flows not exercised.',
 'pypdf':'Document parsing can accept hostile files; exact advisory cases were not exercised.',
 'aiohttp':'Async HTTP client/server advisories need exact client/server routing and input checks; browser workflows not qualified.',
 'brace-expansion':'Glob parser matches require input and resource-limit analysis; hostile pattern tests remain outstanding.'}
for f in sorted(out.glob('*-osv.json')):
 j=json.loads(f.read_text());packages=[p for r in j.get('results',[]) for p in r.get('packages',[])];bad=[p for p in packages if p.get('vulnerabilities')];counts.append({'report':f.name,'packages':len(packages),'packagesWithMatches':len(bad),'advisoryRecordsIncludingAliases':sum(len(p['vulnerabilities']) for p in bad)})
 for p in bad:
  for v in p['vulnerabilities']:rows.append({'report':f.name,'package':p['package'],'id':v['id'],'aliases':v.get('aliases',[]),'summary':v.get('summary'),'severity':v.get('severity',[]),'modified':v.get('modified'),'status':'UNRESOLVED','applicability':reason.get(p['package']['name'],'Specific input/API reachability in the packaged runtime has not been established; retain for triage.'),'disposition':'No full dependency PASS and no claim that an advisory match is an exploited vulnerability.'})
(out/'dependency-assessment.json').write_text(json.dumps({'checkedAt':now,'database':'Online OSV; raw results preserved, no immutable database-wide snapshot ID','counts':counts,'findings':rows,'bundlingLimit':'Chrome DevTools embeds third-party JavaScript; lockfile-only zero matches does not cover those bundled components. Grafana Go modules were extracted from actual arm64 binary and scanned separately.'},indent=2))
# Collect licenses and the exact instruction files sent to the local scanner.
skills=[]
for f in (out/'subjects').glob('skillpack.*.json'):
 j=json.loads(f.read_text());root=w/'subjects'/j['toolkitId']/'unpacked'/j['archiveRoot'];licenses=[{'path':str(p.relative_to(root)),'sha256':sha(p.read_bytes()),'firstLine':p.read_text(errors='replace').splitlines()[0] if p.stat().st_size else ''} for p in root.iterdir() if p.is_file() and p.name.lower().startswith(('license','copying'))];scanned=[{'path':str(p.relative_to(w/'scan-skills'/j['toolkitId'])),'sha256':sha(p.read_bytes())} for p in (w/'scan-skills'/j['toolkitId']).rglob('*.md')];skills.append({'id':j['toolkitId'],'catalogLicense':j['catalog']['source'].get('license'),'rootLicenseFiles':licenses,'scannedInstructionManifest':scanned,'missingLicenseFrontmatterDisposition':'Informational manifest completeness hint; repository/store license metadata exists. Not evidence of malicious code or prompt.','modelPath':'NOT_RUN: no isolated PuPu model harness was available for this audit.'})
(out/'skill-content-review.json').write_text(json.dumps({'checkedAt':now,'reviewer':'Codex; targeted contextual review alongside full local deterministic scans','results':skills,'notes':{'prompt-master':'Prompt engineering scope and output-format instructions are legitimate selected behavior; examples mentioning reasoning, roles or hidden analysis are not automatically prompt injection. References included in the scanned markdown view.','superpowers':'Planning, verification and review instructions are legitimate. References to unbundled companion skills and supporting code require host compatibility checks; no authority over this auditing session is granted.','frontend-design':'Selected design methodology; no confirmed hidden upload or credential request in inspected instruction content.','trailofbits':'Audit preparation includes testing and code changes; optional analyzers and package installations require their own dependency scope. It is not security certification.','vercel':'Observed remote guidelines are UI review rules; the skill still fetches mutable main. Saved a dated, hashed observation rather than treating future fetched instructions as verified.'}},indent=2))
print('Dependency reports',len(counts),'records with aliases',len(rows),'skill packs',len(skills))
