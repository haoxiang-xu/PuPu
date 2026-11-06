#!/usr/bin/env bash
set -euo pipefail
phase=SESSION_ENTER
printf 'QA356_APP_PHASE=%s\n' "$phase"
trap 'status=$?; printf "QA356_APP_EXIT phase=%s status=%d\n" "$phase" "$status"; exit "$status"' EXIT
[[ "$RUNNER_OS" == Linux && "$GITHUB_ACTIONS" == true ]]
phase=KEYRING_BEGIN; printf 'QA356_APP_PHASE=%s\n' "$phase"
printf '' | gnome-keyring-daemon --unlock --components=secrets > "$QA_OUT/keyring.log"
phase=KEYRING_COMPLETE; printf 'QA356_APP_PHASE=%s\n' "$phase"
phase=DRIVER_BEGIN; printf 'QA356_APP_PHASE=%s\n' "$phase"
xvfb-run -a node "$QA_CONTROL/app_control.cjs"
phase=DRIVER_COMPLETE; printf 'QA356_APP_PHASE=%s\n' "$phase"
phase=VERIFIER_BEGIN; printf 'QA356_APP_PHASE=%s\n' "$phase"
"$QA_PYTHON" -B "$QA_CONTROL/verify_app.py"
phase=VERIFIER_COMPLETE; printf 'QA356_APP_PHASE=%s\n' "$phase"
