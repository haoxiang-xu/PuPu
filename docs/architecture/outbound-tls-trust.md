# Outbound TLS Trust

> How the Python sidecar decides which certificate authorities to trust for
> outbound HTTPS, why the order is fixed, and what may never change.
>
> Owner: `pupu-dev-backend`. Security adjudication: `pupu-security-expert`.
> Implementation: `unchain_runtime/server/net_tls.py`.
> Enforcement: `unchain_runtime/server/tests/test_outbound_tls_guard.py`.

---

## The bug this exists to prevent

The sidecar ships as a PyInstaller `--onefile` binary. PyInstaller bundles the
build machine's `libcrypto.3.dylib`, and OpenSSL's default trust location
(`OPENSSLDIR`) is baked into that library **at compile time as an absolute path
on the build machine**. For the python.org macOS framework build that path is:

```
/Library/Frameworks/Python.framework/Versions/3.12/etc/openssl/cert.pem
```

That path exists on the build machine. It does not exist on a user's machine.
So in the shipped app, every stdlib TLS call loaded **zero** trust anchors and
failed with:

```
[SSL: CERTIFICATE_VERIFY_FAILED] unable to get local issuer certificate
```

This class of failure is structurally invisible during development: on any
developer machine the compiled-in path is real, so the code works. It only
breaks after packaging, on someone else's computer.

**Diagnostic tell:** if `httpx` requests succeed but `urllib.request.urlopen`
requests fail on the same machine, that is a missing trust root, not a network
problem. `httpx` passes `certifi` explicitly; the stdlib does not.

---

## The trust resolution order (CONTRACT — do not reorder)

`net_tls.get_outbound_ssl_context()` resolves in this order and returns the
first source that yields a context with real anchors:

| # | Source | Why it sits here |
|---|--------|------------------|
| 1 | **`env`** — `SSL_CERT_FILE` / `SSL_CERT_DIR` | OpenSSL already honours these variables today. If we resolved anything ahead of them, we would silently override a bundle an administrator deliberately pinned — and silently break the documented field workaround. Being first is not a preference, it is preservation of pre-existing behaviour. |
| 2 | **`truststore`** — the OS trust store | The only source that transparently accepts an enterprise MITM proxy root or a locally-trusted self-signed CA, because those are installed in the system keychain (macOS Security.framework / Windows schannel) and appear in no Python bundle. Ranked above `certifi` so corporate networks work without configuration. |
| 3 | **`certifi`** — the Mozilla bundle | Always present: it is collected into the frozen binary as a PyInstaller data file, and `httpx` depends on it anyway. Correct for the public internet, blind to anything an admin installed locally. The fallback that makes the common case work. |
| 4 | **`system`** — `ssl.create_default_context()` | Last resort. On a correctly provisioned non-frozen environment this is fine; in the frozen app it is exactly the broken case described above. Reached only when everything else failed. |

### Why this order is a compatibility contract

Once shipped, the order determines **which certificates are actually trusted on
machines already in the field**. Reordering it does not change a default; it
changes live trust behaviour on existing installs, in ways users cannot see and
did not ask for. Two concrete examples:

- Moving `certifi` above `truststore` would stop honouring a corporate proxy
  root that an administrator installed in the OS keychain. Every user behind a
  TLS-inspecting firewall would regress from working to `CERTIFICATE_VERIFY_FAILED`,
  with no code change on their side.
- Moving `truststore` above `env` would override a bundle an administrator
  deliberately pinned via `SSL_CERT_FILE` — silently discarding an explicit
  instruction from the person responsible for that machine.

**Therefore: changing this order is a breaking change.** It requires the same
treatment as any other compatibility break — an explicit decision, a release
note, and security sign-off. It is not a refactor.

Adding a *new* source is only additive if it is appended **after** `certifi`
and before `system`; inserting one higher in the chain has the same blast radius
as reordering.

---

## Escape hatch: `PUPU_TLS_TRUST_SOURCE`

Forces one strategy instead of the `auto` chain, so a trust-source problem in
the field can be worked around without a rebuild.

| Value | Meaning |
|-------|---------|
| `auto` (default, and any unrecognised value) | Full chain: `env → truststore → certifi → system` |
| `env` | Use `SSL_CERT_FILE` / `SSL_CERT_DIR` only; falls through to `system` if they are missing or empty |
| `truststore` | Use the OS trust store only; falls through to `system` if the platform backend cannot load |
| `certifi` | Use the bundled Mozilla bundle only; falls through to `system` if it is missing |
| `system` | Use `ssl.create_default_context()` only — i.e. deliberately reproduce the pre-fix behaviour, for diagnosis |

Two deliberate properties:

- **An unrecognised value degrades to `auto`, not to an error.** A typo in a
  support instruction must not brick outbound networking.
- **Every forced strategy still falls through to `system` on failure**, and
  `system` still verifies. There is no value that reduces security; the worst a
  wrong value can do is fail loudly.

A path that is missing — or present but empty — is **not** accepted as a trust
source. An empty bundle looks configured while trusting nothing, which fails
every handshake for a reason nobody can find. Resolution falls through past it.

---

## Hard red line

**No configuration, no fallback, and no failure mode may ever produce a context
that skips certificate or hostname verification.**

There is no code path in `net_tls.py` that produces an unverified context, and
there is no environment variable that can request one. If no trust anchors can
be found, outbound calls fail loudly with actionable guidance
(`net_tls.describe_tls_trust_failure()`) rather than silently downgrading.

This extends to documentation and error messages: **guidance must never point a
user at `verify=False`, `CERT_NONE`, `check_hostname = False`, or
`ssl._create_unverified_context()`.** A user who is told to disable verification
once will disable it permanently, and a support instruction outlives the
incident that produced it. Both `test_net_tls.py` and
`test_outbound_tls_guard.py` assert that no message the sidecar can emit
contains those strings.

---

## Enforcement

`unchain_runtime/server/tests/test_outbound_tls_guard.py` parses every non-test
module under `unchain_runtime/server` and fails on any outbound construct that
could reach the network without the shared context. It is a ratchet, not a
snapshot: it covers calls added in the future, not just the ones fixed once.

Summary of what it rejects:

- `urlopen` / `HTTPSHandler` / `HTTPSConnection` without `context=`
- `httpx.<verb>` and `httpx.Client` / `AsyncClient` without `verify=`
- `requests`, `aiohttp`, `urllib3` — none of which can consume our resolved
  context without bespoke wiring that has never been designed
- `build_opener` / `install_opener` / `urlretrieve` — these route through the
  process-global opener, which has no parameter for a context
- `ssl.create_default_context()` / `ssl.SSLContext()` outside `net_tls.py` —
  building your own context re-introduces the original bug
- Anything that disables verification, **including in test modules**

Two exemptions, both narrow and both derived from the code rather than from a
comment:

1. **Proven plain-HTTP loopback.** A URL that is statically provable to be
   `http://` (never `https://`) at `localhost` / `127.x` / `[::1]` performs no
   TLS handshake, so demanding a TLS context would be noise. The proof must come
   from a string literal or an f-string's literal prefix.
2. **`REVIEWED_EXEMPTIONS`** in the test file — a keyed entry with a mandatory
   reason.

There is deliberately **no `# noqa`-style inline opt-out**: the easiest way to
defeat a guard is to make bypassing it a one-token local edit. Everything else
that cannot be statically proven safe must pass the context. Passing a context
to a plain-HTTP request is a no-op, so the conservative branch costs nothing.

---

## Startup observability

The sidecar prints the resolved trust chain once at boot:

```
[unchain] outbound TLS trust: source=truststore chain=env>truststore frozen=yes anchors=os-delegated
```

The fallback chain is silent by design — if `truststore` cannot be imported,
resolution simply moves on to `certifi`. That is the right runtime behaviour and
the wrong diagnostic behaviour. If PyInstaller drops `truststore` (a
`--collect-submodules` regression, or the platform backend failing to load),
trust degrades from "the OS keychain, including the corporate proxy root the
admin installed" to "Mozilla's bundle, which has never heard of that proxy" —
with no symptom until a user behind a MITM proxy reports a handshake failure.

The boot line turns that into a one-line answer in a support log. A degraded
resolution also emits an explicit warning:

```
[unchain] WARNING outbound TLS trust: the OS trust store is not being used (truststore unavailable); ...
```

Paths in this line are reduced to basenames (`bundle=cacert.pem`), because the
full path carries the user's home directory and account name. `anchors=NONE` is
the signature of the original bug recurring.

---

## Known gap: this fix does not cover Node

**The Python trust fix cannot repair Node's certificate trust.** Node ships its
own compiled-in root store and ignores the OpenSSL environment entirely — it
reads neither `SSL_CERT_FILE` nor `SSL_CERT_DIR`. Verified empirically:

```
$ SSL_CERT_FILE=/tmp/empty.pem SSL_CERT_DIR=/nonexistent \
    node -e "console.log(require('tls').rootCertificates.length)"
120
```

An empty OpenSSL bundle leaves Node's 120 roots untouched. Consequences:

- `mcp_managed_runtime` downloads the Node tarball itself over `urllib`, so
  **that** hop is covered by this fix.
- The subsequent `npx <package>` fetch from `registry.npmjs.org` uses Node's own
  TLS and is **not** covered. Behind an enterprise TLS-inspecting proxy it still
  fails. Repairing it requires `NODE_EXTRA_CA_CERTS` (or
  `NODE_OPTIONS=--use-openssl-ca`), which PuPu sets nowhere today.
- Even setting it in the sidecar's own environment would not be enough: the MCP
  Python SDK spawns stdio servers through an environment **allowlist**
  (`mcp.client.stdio.DEFAULT_INHERITED_ENV_VARS`, which on POSIX is
  `HOME, LOGNAME, PATH, SHELL, TERM, USER`), so `NODE_EXTRA_CA_CERTS`,
  `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY` and `SSL_CERT_FILE` are all stripped
  before the child process sees them. The only channel that reaches an MCP child
  is the explicit `env` dict PuPu builds in `mcp_toolkits.py` /
  `mcp_managed_runtime._node_env`, which currently carries only `PATH` and the
  npm cache location.

This is tracked as scope for **managed runtime v2**, deliberately not fixed
alongside the Python trust work.
