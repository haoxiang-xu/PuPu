#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" != --inside ]]; then
  test "${GITHUB_ACTIONS:-}" = true
  test "${RUNNER_ENVIRONMENT:-}" = github-hosted
  test "${RUNNER_OS:-}" = Linux
  test "$(id -u)" != 0
  export QA_UID="$(id -u)" QA_GID="$(id -g)"
  export QA_TOOLS="$(cd "$(dirname "$0")" && pwd)"
  export QA_PRIVATE="$(mktemp -d "$RUNNER_TEMP/qa357-execution-XXXXXXXX")"
  export QA_HOME="$QA_PRIVATE/home" QA_TMP="$QA_PRIVATE/tmp"
  export QA_SCENARIO="$QA_PRIVATE/scenario.json"
  export QA_CA="$QA_PRIVATE/ca.pem"
  mkdir -p "$QA_HOME" "$QA_TMP" "$QA_PRIVATE/runtime" "$QA_OUT"
  chmod 700 "$QA_HOME" "$QA_TMP" "$QA_PRIVATE/runtime"
  cat > "$QA_SCENARIO" <<'JSON'
{"schema":"qa357.tool-fixture.v1","model":"gpt-6-luna","max_output_tokens":32,"marker":"QA357-TOOL-QUALIFIER","response_text":"{\"message\":\"tool-qualified\"}","function":{"name":"qa357_read","call_id":"call_qa357_read_1","arguments":"{\"path\":\"fixture.txt\"}","expected_output":"QA357-READ-RESULT"}}
JSON
  cp "$QA_SCENARIO" "$QA_OUT/scenario.json"
  openssl req -x509 -newkey rsa:2048 -nodes -keyout "$QA_PRIVATE/ca-key.pem" \
    -out "$QA_CA" -days 1 -subj /CN=qa357-private-fixture-CA \
    -addext basicConstraints=critical,CA:TRUE > "$QA_OUT/certificate-build.log" 2>&1
  openssl req -newkey rsa:2048 -nodes -keyout "$QA_PRIVATE/leaf-key.pem" \
    -out "$QA_PRIVATE/leaf.csr" -subj /CN=api.openai.com >> "$QA_OUT/certificate-build.log" 2>&1
  printf 'subjectAltName=DNS:api.openai.com\nbasicConstraints=critical,CA:FALSE\nextendedKeyUsage=serverAuth\n' > "$QA_PRIVATE/leaf.ext"
  openssl x509 -req -in "$QA_PRIVATE/leaf.csr" -CA "$QA_CA" -CAkey "$QA_PRIVATE/ca-key.pem" \
    -CAcreateserial -out "$QA_PRIVATE/leaf.pem" -days 1 -extfile "$QA_PRIVATE/leaf.ext" \
    >> "$QA_OUT/certificate-build.log" 2>&1
  chmod 600 "$QA_PRIVATE"/*key.pem
  printf '127.0.0.1 localhost api.openai.com\n::1 localhost\n' > "$QA_PRIVATE/hosts"
  printf '# No DNS in this QA namespace.\n' > "$QA_PRIVATE/resolv.conf"
  exec sudo --preserve-env=PATH,LD_LIBRARY_PATH,QA_UID,QA_GID,QA_TOOLS,QA_PRIVATE,QA_HOME,QA_TMP,QA_SCENARIO,QA_CA,QA_OUT,QA_CANDIDATE_ROOT,QA_PYTHON,QA_ELECTRON \
    unshare --net --mount --fork /bin/bash "$0" --inside
fi

mount --make-rprivate /
mount --bind "$QA_PRIVATE/hosts" /etc/hosts
mount --bind "$QA_PRIVATE/resolv.conf" /etc/resolv.conf
ip link set lo up
test "$(ip -j route show | tr -d '[:space:]')" = '[]'
ip -j address show > "$QA_OUT/offline-interfaces.json"
ip -j route show > "$QA_OUT/offline-routes.json"
export QA357_NETNS=1
"$QA_PYTHON" -I -B "$QA_TOOLS/tool_fixture.py" \
  --cert "$QA_PRIVATE/leaf.pem" --key "$QA_PRIVATE/leaf-key.pem" \
  --scenario "$QA_SCENARIO" --output "$QA_OUT/provider-requests.jsonl" \
  --ready "$QA_OUT/provider-ready.json" > "$QA_OUT/provider-server.log" 2>&1 &
fixture_pid=$!
cleanup() {
  kill "$fixture_pid" 2>/dev/null || true
  wait "$fixture_pid" 2>/dev/null || true
}
trap cleanup EXIT
for _ in $(seq 1 100); do
  if [[ -f "$QA_OUT/provider-ready.json" ]]; then break; fi
  kill -0 "$fixture_pid"
  sleep 0.1
done
test -f "$QA_OUT/provider-ready.json"

timeout --kill-after=5s 120s setpriv --reuid="$QA_UID" --regid="$QA_GID" --init-groups env -i \
  PATH="$PATH" LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}" \
  HOME="$QA_HOME" TMPDIR="$QA_TMP" LANG=C.UTF-8 PYTHONDONTWRITEBYTECODE=1 \
  XDG_RUNTIME_DIR="$QA_PRIVATE/runtime" XDG_CONFIG_HOME="$QA_HOME/.config" \
  XDG_DATA_HOME="$QA_HOME/.local/share" XDG_CACHE_HOME="$QA_HOME/.cache" \
  XDG_CURRENT_DESKTOP=GNOME DESKTOP_SESSION=gnome \
  QA357_NETNS=1 QA_UID="$QA_UID" QA_TOOLS="$QA_TOOLS" QA_OUT="$QA_OUT" \
  QA_CANDIDATE_ROOT="$QA_CANDIDATE_ROOT" QA_PYTHON="$QA_PYTHON" QA_ELECTRON="$QA_ELECTRON" \
  QA_SCENARIO="$QA_SCENARIO" SSL_CERT_FILE="$QA_CA" REQUESTS_CA_BUNDLE="$QA_CA" \
  OPENAI_BASE_URL=http://127.0.0.1:9/environment-decoy \
  xvfb-run -a --server-args='-screen 0 1280x820x24 -nolisten tcp' \
  dbus-run-session -- /bin/bash "$QA_TOOLS/tool_keyring_session.sh" \
  > "$QA_OUT/session.log" 2>&1
echo 'Tool protocol qualified; App/Agent execution remains NOT_RUN.'
