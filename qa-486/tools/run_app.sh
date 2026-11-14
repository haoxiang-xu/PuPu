#!/usr/bin/env bash
set -euo pipefail
[[ "$RUNNER_OS" == Linux && "$GITHUB_ACTIONS" == true ]]
printf '' | gnome-keyring-daemon --unlock --components=secrets > "$QA_OUT/keyring.log"
# QA_APP_DRIVER / QA_APP_VERIFY select the control (default: the #210 acceptance pair); "none" skips the verifier.
driver="${QA_APP_DRIVER:-app_control_486.cjs}"; verify="${QA_APP_VERIFY:-verify_app_486.py}"
mkdir -p "$QA_OUT/workspace"
"$QA_PYTHON" -I -B "$QA_CONTROL/watch_effects.py" "$QA_OUT/workspace" "$QA_OUT/effects.json" &
watcher=$!
trap '"$QA_PYTHON" -I -B "$QA_CONTROL/retain_data.py"; kill -TERM "$watcher" 2>/dev/null || true; wait "$watcher" || true' EXIT
for n in $(seq 1 50); do test -f "$QA_OUT/effects.ready" && break; sleep .1; done
test -f "$QA_OUT/effects.ready"
timeout --signal=TERM --kill-after=60 40m xvfb-run -a node "$QA_CONTROL/$driver"
kill -TERM "$watcher"; wait "$watcher"
trap - EXIT
"$QA_PYTHON" -I -B "$QA_CONTROL/retain_data.py"
[[ "$verify" == none ]] || "$QA_PYTHON" -B "$QA_CONTROL/$verify"
