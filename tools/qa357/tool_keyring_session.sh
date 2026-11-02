#!/usr/bin/env bash
set -euo pipefail
test "$(uname -s)" = Linux
test "$QA357_NETNS" = 1
test "$(id -u)" = "$QA_UID"
test -n "$DBUS_SESSION_BUS_ADDRESS"

mkdir -p "$XDG_RUNTIME_DIR/keyring" "$HOME/.local/share/keyrings"
chmod 700 "$XDG_RUNTIME_DIR" "$XDG_RUNTIME_DIR/keyring" "$HOME/.local/share/keyrings"
# Follow the login -> start lifecycle. Starting only the secrets component
# before supplying a login password leaves no default login collection and
# libsecret asks an interactive prompter to create one (run41386625414).
passphrase="$(openssl rand -hex 24)"
printf '%s' "$passphrase" | gnome-keyring-daemon --foreground --login \
  --control-directory="$XDG_RUNTIME_DIR/keyring" > "$QA_OUT/keyring-daemon.log" 2>&1 &
keyring_pid=$!
cleanup() {
  kill "$keyring_pid" 2>/dev/null || true
  wait "$keyring_pid" 2>/dev/null || true
}
trap cleanup EXIT

ready=0
for _ in $(seq 1 100); do
  if [[ -S "$XDG_RUNTIME_DIR/keyring/control" ]]; then ready=1; break; fi
  kill -0 "$keyring_pid"
  sleep 0.1
done
test "$ready" = 1
gnome-keyring-daemon --start --components=secrets \
  --control-directory="$XDG_RUNTIME_DIR/keyring" > "$QA_OUT/keyring-start.log" 2>&1
ready=0
for _ in $(seq 1 100); do
  if gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus \
      --method org.freedesktop.DBus.NameHasOwner org.freedesktop.secrets | grep -q true; then
    ready=1
    break
  fi
  kill -0 "$keyring_pid"
  sleep 0.1
done
test "$ready" = 1
# This password protects only a fresh disposable keyring; it is never saved or
# uploaded. Unlock before asking secret-tool to create a secret, avoiding a GUI
# prompt/locked default collection that the earlier App QA could not service.
printf '%s' "$passphrase" | gnome-keyring-daemon --unlock \
  --control-directory="$XDG_RUNTIME_DIR/keyring" > "$QA_OUT/keyring-unlock.log" 2>&1
unset passphrase
for alias in default login; do
  gdbus call --session --dest org.freedesktop.secrets --object-path /org/freedesktop/secrets \
    --method org.freedesktop.Secret.Service.ReadAlias "$alias" > "$QA_OUT/keyring-alias-$alias.txt"
done
gdbus call --session --dest org.freedesktop.secrets --object-path /org/freedesktop/secrets \
  --method org.freedesktop.DBus.Properties.Get org.freedesktop.Secret.Service Collections \
  > "$QA_OUT/keyring-collections.txt"
sentinel='qa357-offline-only-not-a-real-key'
printf '%s' "$sentinel" | timeout 15s secret-tool store --label=qa357-private-control qa357 qualifier
returned="$(timeout 15s secret-tool lookup qa357 qualifier)"
test "$returned" = "$sentinel"
unset returned sentinel
timeout 15s secret-tool clear qa357 qualifier
printf '{"private_secret_service_round_trip":true,"tracked_pid":%s}\n' "$keyring_pid" > "$QA_OUT/keyring-control.json"

export QA_PROBE_PROFILE="$HOME/profile-positive"
for mode in write read; do
  export QA_PROBE_MODE="$mode"
  "$QA_ELECTRON" --password-store=gnome-libsecret "$QA_TOOLS/credential_probe.cjs" \
    > "$QA_OUT/credential-$mode.log" 2>&1
done
export QA_PROBE_MODE=basic QA_PROBE_PROFILE="$HOME/profile-basic-negative"
"$QA_ELECTRON" --password-store=basic "$QA_TOOLS/credential_probe.cjs" \
  > "$QA_OUT/credential-basic.log" 2>&1

"$QA_PYTHON" -I -B "$QA_TOOLS/tool_sdk_probe.py" > "$QA_OUT/sdk-probe.log" 2>&1
