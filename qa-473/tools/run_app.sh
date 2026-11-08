#!/usr/bin/env bash
set -euo pipefail
printf '' | gnome-keyring-daemon --unlock --components=secrets > "$QA_OUT/keyring.log"
exec timeout --signal=TERM --kill-after=30 25m xvfb-run -a node "$QA_CONTROL/app_control_473.cjs"
