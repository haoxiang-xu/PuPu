"""External CLI refusals: every child stops before host imports or root setup."""
from pathlib import Path
import argparse,hashlib,json,subprocess
ROOT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--out',type=Path,required=True)
parser.add_argument('--host',type=Path,required=True)
parser.add_argument('--pair',type=Path,required=True)
parser.add_argument('--guard-module',type=Path,default=ROOT/'runtime_safety_guard.py')
parser.add_argument('--tool',type=Path,default=ROOT/'active_context_host.py')
args=parser.parse_args()
assert all(path.is_absolute() for path in (args.out,args.host,args.pair,args.guard_module,args.tool)), 'all paths must be explicit and absolute'
TOOL=args.tool
FIXED=args.pair
PYTHON=FIXED/'install-venv/bin/python'
HOST=args.host
GUARD=args.guard_module
OUT=args.out
assert not OUT.resolve().is_relative_to(HOST.resolve()) and not OUT.resolve().is_relative_to(FIXED.resolve()), '--out must be external'
OUT.mkdir(exist_ok=False)
EXISTING=OUT/'already-owned';EXISTING.mkdir();(EXISTING/'witness.txt').write_text('immutable\n')
base={'host':str(HOST),'pair':str(FIXED),'guard-module':str(GUARD),'sandbox':str(OUT/'unused')}
cases=[('unknown_argument',{},['--unsupported-mode'],PYTHON),
 ('wrong_interpreter',{},[],Path('/usr/bin/python3')),
 ('existing_root',{'sandbox':str(EXISTING)},[],PYTHON),
 ('relative_host',{'host':'pupu-356'},[],PYTHON),
 ('relative_pair',{'pair':'fixed-pair'},[],PYTHON),
 ('relative_sandbox',{'sandbox':'relative-sandbox'},[],PYTHON),
 ('relative_guard',{'guard-module':'runtime_safety_guard.py'},[],PYTHON),
 ('inside_host',{'sandbox':str(HOST/'must-not-create-active-probe')},[],PYTHON),
 ('inside_pair',{'sandbox':str(FIXED/'must-not-create-active-probe')},[],PYTHON),
 ('missing_host',{'host':str(OUT/'missing-source')},[],PYTHON),
 ('missing_pair',{'pair':str(OUT/'missing-pair')},[],PYTHON),
 ('missing_guard',{'guard-module':str(OUT/'missing-guard.py')},[],PYTHON)]
rows=[]
for name,changes,extra,interpreter in cases:
 params={**base,**changes}
 argv=[str(interpreter),'-I','-B',str(TOOL),'--preflight']
 for key,value in params.items():argv.extend(['--'+key,value])
 result=subprocess.run(argv+extra,cwd=ROOT,text=True,capture_output=True)
 assert result.returncode==2,(name,result.returncode,result.stdout,result.stderr)
 assert not result.stdout,(name,result.stdout)
 assert 'error:' in result.stderr,(name,result.stderr)
 if name!='existing_root':
  assert not Path(params['sandbox']).exists(),name
 rows.append({'name':name,'returncode':result.returncode,'stdout':result.stdout,'stderr':result.stderr})
assert (EXISTING/'witness.txt').read_text()=='immutable\n'
assert list(EXISTING.iterdir())==[EXISTING/'witness.txt']
record={'scope':'CLI-only; no host imports, HTTP, SDK or reusable evidence root', 'passed':len(rows),'failed':0,'tool_sha256':hashlib.sha256(TOOL.read_bytes()).hexdigest(),'cases':rows}
(OUT/'results.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'passed':len(rows),'failed':0,'receipt':str(OUT/'results.json')}))
