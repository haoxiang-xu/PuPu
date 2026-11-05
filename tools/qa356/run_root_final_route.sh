#!/usr/bin/env bash
set -euo pipefail

: "${QA_CONTROL:?}" "${QA_OUT:?}" "${QA_VENV_PYTHON:?}" "${QA_BASELINE:?}" "${QA_CANDIDATE:?}"
[[ "${QA_BASELINE_SHA:?}" == 93ea8095c5232d7e409d8af2ca3d0278c2815ba7 ]]
[[ "${QA_CANDIDATE_SHA:?}" == fcf6160b0c05bf36d458e5d63c999c1737e5b975 ]]
[[ "${QA_WHEEL_SHA:?}" == a93e989eb8de0fedf2b77a99296bdf81af41ad82f0981d0ba19179f329487146 ]]

mkdir -p "$QA_OUT"
if [[ "${1:-}" != --inside ]]; then
  export QA_UID="$(id -u)" QA_GID="$(id -g)"
  export QA_HOME="${RUNNER_TEMP:?}/356-root-final-home" QA_TMP="${RUNNER_TEMP:?}/356-root-final-tmp"
  mkdir -p "$QA_HOME" "$QA_TMP"
  exec sudo --preserve-env=QA_UID,QA_GID,QA_HOME,QA_TMP,QA_CONTROL,QA_OUT,QA_VENV_PYTHON,QA_BASELINE,QA_CANDIDATE,QA_BASELINE_SHA,QA_CANDIDATE_SHA,QA_WHEEL,QA_WHEEL_SHA,QA_MANIFEST \
    unshare --net /bin/bash "$0" --inside
fi

ip link set lo up
ip -j route show > "$QA_OUT/routes-before.json"
test "$(tr -d '[:space:]' < "$QA_OUT/routes-before.json")" = '[]'
ip -j address show > "$QA_OUT/addresses-before.json"
python3 - "$QA_OUT/addresses-before.json" <<'PY'
import json, sys
items = json.load(open(sys.argv[1]))
assert [item['ifname'] for item in items] == ['lo'], items
PY
printf '{"network_namespace":"%s","routes":[]}' "$(readlink /proc/self/ns/net)" > "$QA_OUT/network-proof-before.json"

export QA_PYTEST_TARGET='tests/test_skeleton_production_routes.py::test_public_child_request_keeps_original_session_and_source'
export QA_ENV_HOME="$QA_HOME" QA_ENV_TMP="$QA_TMP"
status=0
setpriv --reuid="$QA_UID" --regid="$QA_GID" --clear-groups --no-new-privs \
  --bounding-set=-all --inh-caps=-all --ambient-caps=-all \
  env -i PATH="$(dirname "$QA_VENV_PYTHON"):/usr/bin:/bin" HOME="$QA_HOME" TMPDIR="$QA_TMP" \
    LANG=C.UTF-8 PYTHONDONTWRITEBYTECODE=1 PYTHONNOUSERSITE=1 \
    QA_CONTROL="$QA_CONTROL" QA_OUT="$QA_OUT" QA_VENV_PYTHON="$QA_VENV_PYTHON" QA_BASELINE="$QA_BASELINE" QA_CANDIDATE="$QA_CANDIDATE" \
    QA_BASELINE_SHA="$QA_BASELINE_SHA" QA_CANDIDATE_SHA="$QA_CANDIDATE_SHA" QA_WHEEL="$QA_WHEEL" \
    QA_WHEEL_SHA="$QA_WHEEL_SHA" QA_MANIFEST="$QA_MANIFEST" QA_PYTEST_TARGET="$QA_PYTEST_TARGET" \
    QA_EXPECT_UID="$QA_UID" QA_EXPECT_GID="$QA_GID" \
    UNCHAIN_SOURCE_PATH="$("$QA_VENV_PYTHON" -c 'import sysconfig; print(sysconfig.get_path("purelib"))')" \
    "$QA_VENV_PYTHON" "$QA_CONTROL/root_final_route_driver.py" || status=$?

ip -j route show > "$QA_OUT/routes-after.json"
test "$(tr -d '[:space:]' < "$QA_OUT/routes-after.json")" = '[]'
ip -j address show > "$QA_OUT/addresses-after.json"
python3 - "$QA_OUT/addresses-after.json" <<'PY'
import json, sys
items = json.load(open(sys.argv[1]))
assert [item['ifname'] for item in items] == ['lo'], items
PY
printf '{"network_namespace":"%s","routes":[]}' "$(readlink /proc/self/ns/net)" > "$QA_OUT/network-proof-after.json"
exit "$status"
