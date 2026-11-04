#!/usr/bin/env bash
set -euo pipefail
[[ "$RUNNER_OS" == Linux && "$GITHUB_ACTIONS" == true ]]
base="$QA_OUT"
printf '' | gnome-keyring-daemon --unlock --components=secrets > "$base/keyring.log"
status=0
for control in original wait2s; do
  mkdir -p "$base/$control"
  QA_OUT="$base/$control" QA_ENTER_CONTROL="$control" xvfb-run -a node "$QA_CONTROL/app_control.cjs" || status=1
done
exit "$status"
