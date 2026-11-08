#!/usr/bin/env bash
set -euo pipefail
[[ "$RUNNER_OS" == Linux && "$GITHUB_ACTIONS" == true ]]
printf '' | gnome-keyring-daemon --unlock --components=secrets > "$QA_OUT/keyring.log"
# QA_APP_DRIVER / QA_APP_VERIFY select the control (default: the #210 acceptance pair); "none" skips the verifier.
driver="${QA_APP_DRIVER:-app_control_210.cjs}"; verify="${QA_APP_VERIFY:-verify_app_210.py}"
timeout --signal=TERM --kill-after=60 40m xvfb-run -a node "$QA_CONTROL/$driver"
[[ "$verify" == none ]] || "$QA_PYTHON" -B "$QA_CONTROL/$verify"
