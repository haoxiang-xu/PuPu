"""Run the real native-package smoke inside the qualified Windows WFP job."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

from windows_wfp_probe import canonical, validate_receipt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--guard", required=True)
    parser.add_argument("--results", default="test-results/windows-wfp")
    args = parser.parse_args()
    if sys.platform != "win32":
        raise SystemExit("NOT_RUN: Windows-only native smoke")

    out = Path("test-results/platform").resolve()
    results = Path(args.results).resolve()
    package = json.loads((out / "package.json").read_text(encoding="utf-8"))
    system_python = canonical(sys.executable)
    packaged_python = canonical(package["python"])
    sidecar = canonical(package["binary"])
    images = [system_python, packaged_python, sidecar]
    if len({path.casefold() for path in images}) != 3:
        raise RuntimeError("qualified WFP image paths must be three distinct executables")
    if hashlib.sha256(Path(packaged_python).read_bytes()).hexdigest() != package["python_sha256"]:
        raise RuntimeError("packaged interpreter changed after package verification")
    if hashlib.sha256(Path(sidecar).read_bytes()).hexdigest() != package["binary_sha256"]:
        raise RuntimeError("packaged sidecar changed after package verification")

    run_dir = results / ("product-" + os.urandom(12).hex())
    run_dir.mkdir(parents=True, exist_ok=False)
    receipt = run_dir / "receipt.json"
    script = Path(__file__).resolve().with_name("platform_smoke.r1.py")
    command = [sys.executable, "-I", "-B", str(script)]
    env_allow = {"PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "COMSPEC", "PATHEXT", "SYSTEMDRIVE",
        "QA_OUT", "QA_WHEEL_SHA", "QA_MANIFEST", "QA_WHEEL", "QA_SITE"}
    env = {key: value for key, value in os.environ.items() if key in env_allow}
    home = run_dir / "home"
    temp = run_dir / "tmp"
    home.mkdir(); temp.mkdir()
    env.update(HOME=str(home), USERPROFILE=str(home), TMPDIR=str(temp), TEMP=str(temp), TMP=str(temp),
        QA_WINDOWS_WFP_GUARD_ACTIVE="1", QA_WINDOWS_WFP_GUARD_PATH=canonical(args.guard),
        QA_WINDOWS_WFP_GUARD_SHA256=hashlib.sha256(Path(canonical(args.guard)).read_bytes()).hexdigest(),
        PYTHONDONTWRITEBYTECODE="1")
    child = subprocess.run([canonical(args.guard), str(receipt), "3", *images,
        system_python, subprocess.list2cmdline(command)], cwd=Path.cwd(), env=env,
        capture_output=True, text=True, timeout=None)
    (run_dir / "stdout.log").write_text(child.stdout, encoding="utf-8")
    (run_dir / "stderr.log").write_text(child.stderr, encoding="utf-8")
    if not receipt.is_file():
        raise RuntimeError("WFP guard did not produce the product-family receipt")
    guard_receipt = validate_receipt(receipt, images, system_python)
    (out / "windows-wfp-product-receipt.json").write_text(
        json.dumps(guard_receipt, indent=2) + "\n", encoding="utf-8")
    product_result = json.loads((out / "result.json").read_text(encoding="utf-8"))
    if child.returncode != 0 or not product_result.get("runtime_resources_unchanged"):
        raise RuntimeError(f"guarded native product smoke failed: exit={child.returncode}")
    product_result["verdict"] = "NATIVE_PACKAGE_WFP_GUARDED_ACCEPTED"
    product_result["windows_wfp_receipt"] = str(out / "windows-wfp-product-receipt.json")
    product_result["all_descendants_drained_before_guard_close"] = guard_receipt["family_drained"]
    (out / "result.json").write_text(json.dumps(product_result, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
