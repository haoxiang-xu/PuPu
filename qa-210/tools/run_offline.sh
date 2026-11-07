#!/usr/bin/env bash
set -euo pipefail

if [[ "$1" != --inside ]]; then
  mode="$1"
  [[ "$mode" == core || "$mode" == source || "$mode" == binary || "$mode" == chat || "$mode" == app ]]
  export QA_UID="$(id -u)" QA_GID="$(id -g)"
  export QA_HOME="$RUNNER_TEMP/356-$mode-home" QA_TMP="$RUNNER_TEMP/356-$mode-tmp"
  export QA_SERVER="$PWD/candidate/unchain_runtime/server" QA_CONTROL="$PWD/control/tools/qa356"
  export QA_CORE_TESTS="$PWD/runtime-source"
  export QA_OUT="$PWD/test-results/$mode" QA_BINARY="$PWD/candidate/unchain_runtime/dist/linux/unchain-server"
  mkdir -p "$QA_HOME" "$QA_TMP" "$QA_OUT"
  exec sudo --preserve-env=PATH,QA_UID,QA_GID,QA_HOME,QA_TMP,QA_SERVER,QA_CONTROL,QA_CORE_TESTS,QA_OUT,QA_BINARY,QA_BINARY_SHA,QA_OLD_BINARY,QA_PYTHON,QA_SITE,QA_WHEEL,QA_WHEEL_SHA,QA_MANIFEST,QA_CANDIDATE,QA_APP,QA_CANDIDATE_ROOT \
    unshare --net /bin/bash "$0" --inside "$mode"
fi

mode="$2"
[[ "$mode" == core || "$mode" == source || "$mode" == binary || "$mode" == chat || "$mode" == app ]]
ip link set lo up
test "$(ip -j route show | tr -d '[:space:]')" = '[]'
ip -j address show > "$QA_OUT/offline-interfaces.json"
QA_PYTHONPATH="$QA_CONTROL:$QA_SERVER:$QA_SITE"
if [[ "$mode" == core || "$mode" == source ]]; then
  if [[ "$mode" == core ]]; then
    cd "$QA_CORE_TESTS"
    QA_PYTHONPATH="$QA_CONTROL:$QA_CORE_TESTS:$QA_SITE"
    minimum=40
  else
    cd "$QA_SERVER"
    minimum=50
  fi
  mapfile -t test_files < <(find tests -maxdepth 1 -name 'test_skeleton_*.py' -type f | sort)
  test "${#test_files[@]}" -ge "$minimum"
  printf '%s\n' "${test_files[@]}" > "$QA_OUT/test-files.txt"
  command=("$QA_PYTHON" -B -m pytest -vv --durations=40 -p no:cacheprovider -p qa356_runtime_probe
    -o faulthandler_timeout=90 --basetemp="$QA_OUT/pytest-data"
    --junitxml="$QA_OUT/acceptance.xml" "${test_files[@]}")
elif [[ "$mode" == binary ]]; then
  command=("$QA_PYTHON" -B "$QA_CONTROL/binary_control.py")
elif [[ "$mode" == chat ]]; then
  command=("$QA_PYTHON" -B "$QA_CONTROL/binary_chat_control.py")
else
  command=(dbus-run-session -- /bin/bash "$QA_CONTROL/run_app.sh")
fi
run=(setpriv --reuid="$QA_UID" --regid="$QA_GID" --init-groups env -i \
  PATH="$PATH" HOME="$QA_HOME" TMPDIR="$QA_TMP" LANG=C.UTF-8 PYTHONDONTWRITEBYTECODE=1 \
  PYTHONPATH="$QA_PYTHONPATH" UNCHAIN_SOURCE_PATH="$QA_SITE" \
  QA_OUT="$QA_OUT" QA_SITE="$QA_SITE" QA_WHEEL="$QA_WHEEL" QA_WHEEL_SHA="$QA_WHEEL_SHA" \
  QA_MANIFEST="$QA_MANIFEST" QA_BINARY="$QA_BINARY" QA_BINARY_SHA="${QA_BINARY_SHA:-}" QA_CANDIDATE="$QA_CANDIDATE" \
  QA_OLD_BINARY="${QA_OLD_BINARY:-}" \
  QA_APP="${QA_APP:-}" QA_CANDIDATE_ROOT="${QA_CANDIDATE_ROOT:-}" QA_CONTROL="$QA_CONTROL" QA_PYTHON="$QA_PYTHON" \
  GITHUB_ACTIONS=true RUNNER_OS=Linux XDG_CURRENT_DESKTOP=GNOME NODE_OPTIONS=--max-old-space-size=2048 "${command[@]}")
[[ "$mode" == app ]] || exec "${run[@]}"
# Passive copy of loopback traffic for the Main -> sidecar payloads. It only
# reads the interface; the CDP ports are left out as they carry no payload.
tcpdump -i lo -n -s 0 -U -Z root -w "$QA_OUT/loopback.pcap" 'tcp and not portrange 19220-19229' 2> "$QA_OUT/tcpdump.log" &
capture=$!
sleep 1
kill -0 "$capture"
status=0
"${run[@]}" || status=$?
kill -TERM "$capture"
wait "$capture" || true
chown "$QA_UID:$QA_GID" "$QA_OUT/loopback.pcap" "$QA_OUT/tcpdump.log"
exit "$status"
