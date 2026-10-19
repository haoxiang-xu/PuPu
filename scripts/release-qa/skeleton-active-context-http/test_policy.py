"""Independent finite guard repair controls. No app/SDK/server import."""
from pathlib import Path
import argparse
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from unittest.mock import patch

SOURCE_DIR = Path(__file__).resolve().parent
GUARD = SOURCE_DIR / "runtime_safety_guard.py"
parser = argparse.ArgumentParser()
parser.add_argument("--python", type=Path, default=Path(sys.executable), help="Absolute interpreter for the isolated fresh-child import")
parser.add_argument("--out", type=Path, help="Explicit absolute artifact output; default uses a disposable temporary directory and stdout summary only")
args = parser.parse_args()
if not args.python.is_absolute():
    parser.error("--python must be an absolute path")
if args.out is not None and not args.out.is_absolute():
    parser.error("--out must be an absolute path")
_temporary_output = tempfile.TemporaryDirectory(prefix="pupu-guard-policy-output-") if args.out is None else None
HERE = Path(_temporary_output.name) if _temporary_output is not None else args.out
HERE.mkdir(parents=True, exist_ok=True)
for name in ("fresh-child.json", "fresh-child.log", "home-spy.json", "summary.json"):
    if (HERE / name).exists():
        parser.error("--out already contains policy evidence; use a fresh directory")

# The fresh child intentionally imports no ctypes until guard is active.
CHILD = r'''
import importlib.util, json, sys, tempfile
from pathlib import Path
path=Path(sys.argv[1]); output=Path(sys.argv[2])
spec=importlib.util.spec_from_file_location("runtime_safety_guard",path)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
assert "ctypes" not in sys.modules, "positive must be a fresh ctypes import"
checks=[]
with tempfile.TemporaryDirectory(prefix="pupu-ctypes-bootstrap-") as temp:
    with module.RuntimeSafetyGuard(sandbox_root=Path(temp)/"sandbox",read_roots=[path.parent],real_home=Path(temp)/"pretend-home") as safety:
        import ctypes
        assert safety._ctypes_bootstrap_count==1
        checks.append({"case":"fresh_real_stdlib_ctypes_import","pass":True,"bootstrap_count":1})
        bottom=[]
        def inert_dlopen(name,*args):
            sys.audit("ctypes.dlopen",name)
            bottom.append("dlopen")
            raise AssertionError("inert_dlopen_bottom_reached")
        original=ctypes._dlopen;ctypes._dlopen=inert_dlopen
        try:
            for value in (None,"/tmp/sentinel-must-not-load.dylib","fixture.invalid"):
                try:ctypes.CDLL(value)
                except module.GuardViolation:checks.append({"case":"non_import_dlopen_none" if value is None else "pathname_load_refused","pass":True})
                else:raise AssertionError("unexpected load allowed")
        finally:ctypes._dlopen=original
        original_pointer=ctypes.pythonapi._FuncPtr
        def inert_pointer(pair):
            sys.audit("ctypes.dlsym",pair[1],pair[0])
            bottom.append("dlsym")
            raise AssertionError("inert_dlsym_bottom_reached")
        ctypes.pythonapi._FuncPtr=inert_pointer
        try:
            try:ctypes.pythonapi["getpid"]
            except module.GuardViolation:checks.append({"case":"process_symbol_lookup_refused","pass":True})
            else:raise AssertionError("unexpected symbol lookup allowed")
        finally:ctypes.pythonapi._FuncPtr=original_pointer
        for event,args in [("ctypes.dlsym/handle",(0,"getpid")),("ctypes.dlopen",(None,))]:
            try:sys.audit(event,*args)
            except module.GuardViolation:checks.append({"case":"audit_no_syscall_refused","pass":True})
            else:raise AssertionError("unexpected direct audit admitted")
        assert bottom==[]
        receipt=safety.receipt()
output.write_text(json.dumps({"checks":checks,"inert_bottom_calls":len(bottom),"guard":receipt,"isolated":sys.flags.isolated},indent=2)+"\n")
'''
command=[str(args.python),"-I","-B","-c",CHILD,str(GUARD),str(HERE/"fresh-child.json")]
result=subprocess.run(command,capture_output=True,text=True)
(HERE/"fresh-child.log").write_text(result.stdout+result.stderr)
assert result.returncode==0, "fresh child failed; inspect content-free raw trace"

spec=importlib.util.spec_from_file_location("runtime_safety_guard",GUARD)
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class TrackedEnvironment(dict):
    def __init__(self,values):super().__init__(values);self.calls=[]
    def __setitem__(self,key,value):self.calls.append(("set",key));super().__setitem__(key,value)
    def __delitem__(self,key):self.calls.append(("delete",key));super().__delitem__(key)
checks=[]
with tempfile.TemporaryDirectory(prefix="pupu-home-guard-spy-") as temp:
    root=Path(temp)
    environment=TrackedEnvironment(dict(os.environ))
    with patch.object(os,"environ",environment):
        original=dict(environment)
        with module.RuntimeSafetyGuard(sandbox_root=root/"first",read_roots=[GUARD.parent],real_home=root/"pretend-home") as safety:
            assert safety.receipt()["home_env_unchanged"] is True
        assert dict(environment)==original
        homecalls=[c for c in environment.calls if c[1]=="HOME"]
        assert homecalls==[]
        checks.append({"case":"normal_guard_entry_exit_zero_HOME_sets_or_deletes","pass":True,"HOME_calls":0})
    environment=TrackedEnvironment(dict(os.environ))
    with patch.object(os,"environ",environment):
        with module.RuntimeSafetyGuard(sandbox_root=root/"second",read_roots=[GUARD.parent],real_home=root/"pretend-home") as safety:
            # Inert mapping only; never replace or delete the actual OS HOME.
            environment["HOME"]="sentinel-host-changed-home"
            assert safety.receipt()["home_env_unchanged"] is False
            calls_before=len([c for c in environment.calls if c[1]=="HOME"])
        assert environment["HOME"]=="sentinel-host-changed-home"
        assert len([c for c in environment.calls if c[1]=="HOME"])==calls_before==1
        checks.append({"case":"host_HOME_change_visible_and_never_repaired_by_guard","pass":True,"guard_HOME_calls":0})
(HERE/"home-spy.json").write_text(json.dumps({"checks":checks},indent=2)+"\n")
child=json.loads((HERE/"fresh-child.json").read_text())
summary={"checks":len(child["checks"])+len(checks),"all_pass":all(c["pass"]for c in child["checks"]+checks),"inert_native_bottom_calls":child["inert_bottom_calls"],"HOME_guard_mutations":0,"guard_sha256":hashlib.sha256(GUARD.read_bytes()).hexdigest(),"python":str(args.python)}
(HERE/"summary.json").write_text(json.dumps(summary,indent=2)+"\n");print(json.dumps(summary))
if _temporary_output is not None:
    _temporary_output.cleanup()
