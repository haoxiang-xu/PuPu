#!/usr/bin/env bash
set -euo pipefail

if [[ "$1" != --inside ]]; then
  mode="$1"
  [[ "$mode" == source || "$mode" == binary ]]
  export QA_UID="$(id -u)" QA_GID="$(id -g)"
  export QA_HOME="$RUNNER_TEMP/357-$mode-home" QA_TMP="$RUNNER_TEMP/357-$mode-tmp"
  export QA_SERVER="$PWD/candidate/unchain_runtime/server" QA_CONTROL="$PWD/control/tools/qa357"
  export QA_OUT="$PWD/test-results/$mode" QA_BINARY="$PWD/candidate/unchain_runtime/dist/linux/unchain-server"
  mkdir -p "$QA_HOME" "$QA_TMP" "$QA_OUT"
  exec sudo --preserve-env=PATH,QA_UID,QA_GID,QA_HOME,QA_TMP,QA_SERVER,QA_CONTROL,QA_OUT,QA_BINARY,QA_PYTHON,QA_SITE,QA_WHEEL,QA_WHEEL_SHA,QA_MANIFEST,QA_CANDIDATE \
    unshare --net /bin/bash "$0" --inside "$mode"
fi

mode="$2"
[[ "$mode" == source || "$mode" == binary ]]
ip link set lo up
test "$(ip -j route show | tr -d '[:space:]')" = '[]'
ip -j address show > "$QA_OUT/offline-interfaces.json"
if [[ "$mode" == source ]]; then
  cd "$QA_SERVER"
  command=("$QA_PYTHON" -B -m pytest -xq -p no:cacheprovider -p qa357_runtime_probe
    -o faulthandler_timeout=90 --junitxml="$QA_OUT/acceptance.xml"
    tests/test_skeleton_code_launch.py tests/test_skeleton_code_publish.py
    tests/test_skeleton_managed_transfer.py tests/test_skeleton_hook_embedded_interactions.py
    tests/test_skeleton_hook_denial_upgrade_host.py tests/test_skeleton_hook_tool_sets.py
    tests/test_skeleton_code_sources.py tests/test_skeleton_code_admission.py
    tests/test_skeleton_python_probe_bytecode.py)
else
  command=("$QA_PYTHON" -B "$QA_CONTROL/binary_control.py")
fi
exec setpriv --reuid="$QA_UID" --regid="$QA_GID" --init-groups env -i \
  PATH="$PATH" HOME="$QA_HOME" TMPDIR="$QA_TMP" LANG=C.UTF-8 PYTHONDONTWRITEBYTECODE=1 \
  PYTHONPATH="$QA_CONTROL:$QA_SERVER:$QA_SITE" UNCHAIN_SOURCE_PATH="$QA_SITE" \
  QA_OUT="$QA_OUT" QA_SITE="$QA_SITE" QA_WHEEL="$QA_WHEEL" QA_WHEEL_SHA="$QA_WHEEL_SHA" \
  QA_MANIFEST="$QA_MANIFEST" QA_BINARY="$QA_BINARY" QA_CANDIDATE="$QA_CANDIDATE" "${command[@]}"
