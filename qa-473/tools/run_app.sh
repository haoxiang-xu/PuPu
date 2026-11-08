#!/usr/bin/env bash
set -euo pipefail
# Private, disposable login keyring; a nonempty QA password creates/unlocks it without a UI prompt.
printf 'qa473-disposable-keyring-password' | gnome-keyring-daemon --unlock --components=secrets > "$QA_OUT/keyring.log"
printf 'QA473_KEYRING_POSITIVE' | secret-tool store --label=QA473 qa473 control
actual="$(secret-tool lookup qa473 control)"
test "$actual" = QA473_KEYRING_POSITIVE
secret-tool clear qa473 control
printf 'SYSTEM_KEYRING_POSITIVE_ACCEPTED\n' > "$QA_OUT/keyring-positive.txt"
exec timeout --signal=TERM --kill-after=30 25m node "$QA_CONTROL/app_control_473.cjs"
