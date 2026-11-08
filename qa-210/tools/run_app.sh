#!/usr/bin/env bash
set -euo pipefail
[[ "$RUNNER_OS" == Linux && "$GITHUB_ACTIONS" == true ]]
printf '' | gnome-keyring-daemon --unlock --components=secrets > "$QA_OUT/keyring.log"
timeout --signal=TERM --kill-after=60 40m xvfb-run -a node "$QA_CONTROL/app_control_210.cjs"
"$QA_PYTHON" -B "$QA_CONTROL/verify_app_210.py"
