#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" != --inside ]]; then
  [[ "$RUNNER_OS" == Linux && "$GITHUB_ACTIONS" == true ]]
  export QA_UID="$(id -u)" QA_GID="$(id -g)"
  export QA_OUT="$PWD/test-results/runtime" QA_CONTROL="$PWD/control/qa-212/tools"
  mkdir -p "$QA_OUT/home" "$QA_OUT/tmp" "$QA_OUT/certs"
  openssl req -x509 -newkey rsa:2048 -nodes -days 1 -keyout "$QA_OUT/certs/key.pem" -out "$QA_OUT/certs/cert.pem" -subj /CN=api.openai.com -addext subjectAltName=DNS:api.openai.com > "$QA_OUT/cert-create.log" 2>&1
  printf '127.0.0.1 localhost api.openai.com\n::1 localhost\n' > "$QA_OUT/hosts"
  exec sudo --preserve-env=PATH,QA_UID,QA_GID,QA_OUT,QA_CONTROL,QA_APP,QA_CANDIDATE_ROOT,QA_PYTHON,QA_SITE,QA_MANIFEST,QA_BINARY_SHA,QA_CANDIDATE_TREE \
    unshare --net --mount --pid --fork --mount-proc /bin/bash "$0" --inside
fi
mount --make-rprivate /
mount --bind "$QA_OUT/hosts" /etc/hosts
ip link set lo up
ip -j address show > "$QA_OUT/interfaces.json"
ip -j route show > "$QA_OUT/routes.json"
test "$(ip -j route show | tr -d '[:space:]')" = '[]'
iptables -P OUTPUT DROP; iptables -P INPUT DROP; iptables -P FORWARD DROP
iptables -A INPUT -i lo -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -o lo -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -t nat -A OUTPUT -d 127.0.0.1 -p tcp --dport 443 -j REDIRECT --to-ports 18991
for port in 5879 18990 18991 19220 19221 19222 19223; do
  iptables -A OUTPUT -o lo -d 127.0.0.1 -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT
  iptables -A INPUT -i lo -d 127.0.0.1 -p tcp --dport "$port" -m conntrack --ctstate NEW -j ACCEPT
done
ip6tables -P OUTPUT DROP; ip6tables -P INPUT DROP; ip6tables -P FORWARD DROP
iptables-save > "$QA_OUT/firewall-before.txt"; ip6tables-save > "$QA_OUT/firewall6-before.txt"
tcpdump -i lo -n -s 0 -U -Z root -w "$QA_OUT/sidecar.pcap" 'tcp port 5879' > "$QA_OUT/tcpdump.log" 2>&1 &
capture=$!
finish() {
  kill -TERM "$capture" 2>/dev/null || true; wait "$capture" || true
  iptables-save -c > "$QA_OUT/firewall-after.txt"; ip6tables-save -c > "$QA_OUT/firewall6-after.txt"
  sha256sum "$QA_OUT/sidecar.pcap" > "$QA_OUT/sidecar-pcap.sha256"
  "$QA_PYTHON" -I -B "$QA_CONTROL/pcap_http.py" "$QA_OUT/sidecar.pcap" "$QA_OUT/http-redacted.json" || true
  "$QA_PYTHON" -I -B "$QA_CONTROL/pcap_http_pairs.py" "$QA_OUT/sidecar.pcap" "$QA_OUT/http-pairs.json" || true
  rm -f "$QA_OUT/sidecar.pcap" "$QA_OUT/certs/key.pem"
  chown -R "$QA_UID:$QA_GID" "$QA_OUT"
}
trap finish EXIT
setpriv --reuid="$QA_UID" --regid="$QA_GID" --init-groups env -i \
 PATH="$PATH" HOME="$QA_OUT/home" TMPDIR="$QA_OUT/tmp" LANG=C.UTF-8 PYTHONDONTWRITEBYTECODE=1 \
 QA_OUT="$QA_OUT" QA_CONTROL="$QA_CONTROL" QA_APP="$QA_APP" QA_CANDIDATE_ROOT="$QA_CANDIDATE_ROOT" QA_PYTHON="$QA_PYTHON" \
 QA_MANIFEST="$QA_MANIFEST" QA_BINARY_SHA="$QA_BINARY_SHA" QA_CANDIDATE_TREE="$QA_CANDIDATE_TREE" \
 SSL_CERT_FILE="$QA_OUT/certs/cert.pem" NODE_EXTRA_CA_CERTS="$QA_OUT/certs/cert.pem" \
 GITHUB_ACTIONS=true RUNNER_OS=Linux XDG_CURRENT_DESKTOP=GNOME NODE_OPTIONS=--max-old-space-size=2048 \
 dbus-run-session -- xvfb-run -a /bin/bash "$QA_CONTROL/run_app.sh"
