from pathlib import Path
import json,subprocess,shutil
s=json.loads(Path('/tmp/pupu-official-verify-state.json').read_text());w=Path(s['work']);out=Path(s['out']);e=json.loads((w/'environment.json').read_text());e['PATH']='/Users/red/Desktop/GITRepo/unchain/.venv/bin:/usr/bin:/bin:/usr/sbin:/sbin'
files=[w/'unchain/tests'/n for n in ['test_core_toolkit.py','test_plan_toolkit.py','test_core_write_edit_code_diff.py','test_web_fetch_failures.py','test_web_fetch_retry_limit.py']]+[w/'pupu/unchain_runtime/server/tests'/n for n in ['test_computer_toolkit_confirmation.py','test_computer_toolkit.py','test_computer_control_protocol.py'] if (w/'pupu/unchain_runtime/server/tests'/n).exists()]
cmd=['/usr/bin/sandbox-exec','-f',str(w/'sandbox.sb'),'/Users/red/Desktop/GITRepo/unchain/.venv/bin/python','-m','pytest','-q','-p','no:cacheprovider','--basetemp',str(w/'sandbox/pytest-tmp'),*map(str,files)]
r=subprocess.run(cmd,env=e,cwd=w/'sandbox',capture_output=True,text=True,timeout=90)
(out/'isolated-tests.txt').write_text(r.stdout+r.stderr);(out/'isolated-test-run.json').write_text(json.dumps({'command':cmd,'exitCode':r.returncode,'hardware':'mocked','model':'scripted or mocked; not live model','network':'denied by sandbox'},indent=2));print(r.returncode,(r.stdout+r.stderr)[-5500:])
