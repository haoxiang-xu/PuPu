#!/usr/bin/env bash
set -euo pipefail
# --unlock is the login phase; --start must attach to that exact control directory
# to publish the same daemon on this task's D-Bus session (not auto-start a second one).
gnome-keyring-daemon --version > "$QA_OUT/keyring-version.txt"
gnome-keyring-daemon --help > "$QA_OUT/keyring-help.txt"
dbus-update-activation-environment DISPLAY XAUTHORITY
printf 'qa473-disposable-keyring-password' | gnome-keyring-daemon --unlock --components=secrets > "$QA_OUT/keyring.log"
GNOME_KEYRING_CONTROL="$(sed -n 's/^GNOME_KEYRING_CONTROL=//p' "$QA_OUT/keyring.log")"
test -n "$GNOME_KEYRING_CONTROL"
export GNOME_KEYRING_CONTROL
gnome-keyring-daemon --start --components=secrets --control-directory="$GNOME_KEYRING_CONTROL" > "$QA_OUT/keyring-start.log"
printf 'QA473_KEYRING_POSITIVE' | timeout 20 secret-tool store --label=QA473 qa473 control
actual="$(timeout 10 secret-tool lookup qa473 control)"
test "$actual" = QA473_KEYRING_POSITIVE
secret-tool clear qa473 control
printf 'SYSTEM_KEYRING_POSITIVE_ACCEPTED\n' > "$QA_OUT/keyring-positive.txt"
exec timeout --signal=TERM --kill-after=30 25m node "$QA_CONTROL/app_control_473.cjs"
