"""QA-only unchanged-test A/B timing; never an acceptance substitute."""
import hashlib,json,os,platform,resource,signal,socket,subprocess,sys,time
import xml.etree.ElementTree as ET
from pathlib import Path
base,candidate,out=map(Path,sys.argv[1:]);out.mkdir(parents=True,exist_ok=True)
assert sys.version_info[:3]==(3,12,16),sys.version
interfaces=sorted(name for _index,name in socket.if_nameindex())
assert interfaces==['lo'],interfaces
paths=['unchain_runtime/server/tests/test_vault_sink_worker.py','unchain_runtime/server/vault_sink_worker.py','unchain_runtime/server/secret_redaction.py','unchain_runtime/server/tests/conftest.py','unchain_runtime/server/requirements.txt','scripts/release-qa/run-python-tests.py']
identities={}
for label,repo in [('A-base',base),('B-candidate',candidate)]:
    identities[label]={'head':subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip(),'tree':subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD^{tree}'],text=True).strip(),'sources':{p:hashlib.sha256((repo/p).read_bytes()).hexdigest() for p in paths}}
assert identities['A-base']['head']=='d5d75094a5788a17b432d284dbffbb5b10ccab24'
assert identities['B-candidate']['head']=='6eb327c4641dfe176235c6c6d950f607ec426179'
assert identities['B-candidate']['tree']=='7793971f381a80031fe7a84b4d9b9afd522e416d'
assert identities['A-base']['sources']==identities['B-candidate']['sources']
cpu=[line.partition(':')[2].strip() for line in Path('/proc/cpuinfo').read_text().splitlines() if line.startswith('model name')]
metadata={'python':sys.version,'platform':platform.platform(),'cpu_model':cpu[0] if cpu else None,'cpu_count':os.cpu_count(),'interfaces':interfaces,'uid':os.getuid(),'identities':identities,'assertions_changed':False,'test_target':'tests/test_vault_sink_worker.py::test_shell_timeout_starts_while_large_stdin_writer_is_blocked','order':'A B A B A B','full_suite_state_reproduced':False}
(out/'metadata.json').write_text(json.dumps(metadata,indent=2)+'\n')
rows=[]
for repeat in range(1,4):
    for label,repo in [('A-base',base),('B-candidate',candidate)]:
        stem=label+'-'+str(repeat);junit_path=out/(stem+'.xml')
        command=[sys.executable,'-B',str(repo/'scripts/release-qa/run-python-tests.py'),metadata['test_target'],'-vv','--tb=short','--durations=1','-o','faulthandler_timeout=60','--junitxml',str(junit_path)]
        before=resource.getrusage(resource.RUSAGE_CHILDREN);start=time.monotonic();cpu_start=time.process_time()
        log_path=out/(stem+'.log');timed_out=False;runner_cleanup_returned=True
        process=subprocess.Popen(command,cwd=repo/'unchain_runtime/server',stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        try:
            stdout,stderr=process.communicate(timeout=120)
        except subprocess.TimeoutExpired as exc:
            timed_out=True
            stdout=exc.stdout or '';stderr=exc.stderr or ''
            if isinstance(stdout,bytes):stdout=stdout.decode(errors='replace')
            if isinstance(stderr,bytes):stderr=stderr.decode(errors='replace')
            log_path.write_text(stdout+'\nSTDERR (before runner SIGTERM):\n'+stderr)
            try:process.send_signal(signal.SIGTERM)
            except ProcessLookupError:pass
            try:
                stdout,stderr=process.communicate(timeout=30)
            except subprocess.TimeoutExpired as final:
                # Do not proceed to another test if the existing runner cannot
                # complete its own SIGTERM/process-group cleanup. Abort this VM
                # job after preserving partial output; no cleanup PASS claim.
                runner_cleanup_returned=False
                stdout=final.stdout or stdout;stderr=final.stderr or stderr
                if isinstance(stdout,bytes):stdout=stdout.decode(errors='replace')
                if isinstance(stderr,bytes):stderr=stderr.decode(errors='replace')
                log_path.write_text(stdout+'\nSTDERR (runner cleanup unconfirmed):\n'+stderr)
                try:process.kill()
                except ProcessLookupError:pass
                try:stdout,stderr=process.communicate(timeout=10)
                except subprocess.TimeoutExpired:pass
        wall=time.monotonic()-start;parent_cpu=time.process_time()-cpu_start;after=resource.getrusage(resource.RUSAGE_CHILDREN)
        log_path.write_text(stdout+'\nSTDERR:\n'+stderr)
        row={'label':label,'repeat':repeat,'returncode':124 if timed_out else process.returncode,'wrapper_returncode':process.returncode,'diagnostic_timeout':timed_out,'runner_cleanup_returned':runner_cleanup_returned,'wall_seconds':wall,'child_cpu_seconds':after.ru_utime+after.ru_stime-before.ru_utime-before.ru_stime,'parent_cpu_seconds':parent_cpu,'log':stem+'.log','command':command}
        try:
            cases=list(ET.parse(junit_path).getroot().iter('testcase'))
            row['junit_cases']=[{'name':c.get('name'),'time':c.get('time'),'skipped':c.find('skipped') is not None,'failed':c.find('failure') is not None or c.find('error') is not None} for c in cases]
            row['exact_case_executed']=len(cases)==1 and cases[0].get('name')==metadata['test_target'].split('::')[1] and cases[0].find('skipped') is None
            if not row['exact_case_executed'] or any(c['failed'] for c in row['junit_cases']):row['returncode']=row['returncode'] or 1
        except (OSError,ET.ParseError):
            row['exact_case_executed']=False;row['junit_unavailable_or_invalid']=True;row['returncode']=row['returncode'] or 1
        rows.append(row);print(json.dumps(row),flush=True)
        (out/'result.json').write_text(json.dumps({'classification':'BOUNDED_DIAGNOSTIC_NOT_ACCEPTANCE','rows':rows,'complete':len(rows)==6,'all_passed':len(rows)==6 and all(x['returncode']==0 for x in rows),'no_threshold_change':True,'full_suite_state_reproduced':False},indent=2)+'\n')
        if timed_out:break
    if rows and rows[-1]['diagnostic_timeout']:break
for label,repo in [('A-base',base),('B-candidate',candidate)]:
    assert identities[label]['sources']=={p:hashlib.sha256((repo/p).read_bytes()).hexdigest() for p in paths}
if any(x['diagnostic_timeout'] for x in rows):sys.exit(1)
assert len(rows)==6
sys.exit(0 if all(x['returncode']==0 for x in rows) else 1)
