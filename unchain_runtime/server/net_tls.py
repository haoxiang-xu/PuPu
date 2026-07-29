"""Single source of truth for outbound TLS trust in the PuPu sidecar.

Why this module exists
----------------------
The sidecar ships as a PyInstaller ``--onefile`` binary. PyInstaller bundles the
build machine's ``libcrypto.3.dylib``, and OpenSSL's default trust location
(``OPENSSLDIR``) is baked into that library at *compile* time as an absolute
path on the build machine (for the python.org macOS framework build:
``/Library/Frameworks/Python.framework/Versions/3.12/etc/openssl/cert.pem``).

That path exists on the build machine and does not exist on a user's machine.
So every stdlib ``urllib.request.urlopen`` call in the frozen app loads *zero*
trust anchors and fails with::

    [SSL: CERTIFICATE_VERIFY_FAILED] unable to get local issuer certificate

Requests made through ``httpx`` were never affected because httpx explicitly
does ``ssl.create_default_context(cafile=certifi.where())``. This module gives
the stdlib call sites the same guarantee, from one place.

Hard rule
---------
This module NEVER disables certificate or hostname verification. There is no
code path here that produces an unverified context. If no trust anchors can be
found, outbound calls are expected to fail loudly with an actionable message
(see :func:`describe_tls_trust_failure`) rather than silently downgrade.

Resolution order (``auto``)
---------------------------
1. ``SSL_CERT_FILE`` / ``SSL_CERT_DIR`` when the referenced path exists.
   OpenSSL already honours these today, so respecting them first preserves the
   existing administrator escape hatch (and the documented workaround) instead
   of silently overriding a deliberately pinned bundle.
2. ``truststore`` -- delegates verification to the OS trust store. This is the
   only option that transparently accepts an enterprise MITM proxy root or a
   locally-trusted self-signed CA, because those are installed in the system
   keychain rather than in any Python bundle.
3. ``certifi.where()`` -- the Mozilla bundle that is already collected into the
   frozen binary as a PyInstaller data file.
4. ``ssl.create_default_context()`` -- last resort; on a correctly provisioned
   non-frozen environment this is fine, in the frozen app it is the broken case
   described above.

``PUPU_TLS_TRUST_SOURCE`` may be set to ``auto`` (default), ``env``,
``truststore``, ``certifi`` or ``system`` to force one strategy. This exists so
a trust-source problem in the field can be worked around without a rebuild.
"""

from __future__ import annotations

import os
import ssl
import sys
import threading
from typing import Any, Callable, Dict, Optional, Tuple

__all__ = [
    "get_outbound_ssl_context",
    "outbound_tls_trust_info",
    "reset_outbound_tls_cache",
    "is_tls_trust_error",
    "describe_tls_trust_failure",
    "annotate_tls_error",
    "describe_trust_source_for_log",
    "outbound_tls_warning",
]

TRUST_SOURCE_ENV_VAR = "PUPU_TLS_TRUST_SOURCE"

_VALID_STRATEGIES = ("auto", "env", "truststore", "certifi", "system")

_LOCK = threading.Lock()
_CACHED_CONTEXT: Optional[ssl.SSLContext] = None
_CACHED_INFO: Dict[str, Any] = {}


def _requested_strategy() -> str:
    raw = str(os.environ.get(TRUST_SOURCE_ENV_VAR, "") or "").strip().lower()
    return raw if raw in _VALID_STRATEGIES else "auto"


def _nonempty_file(path: str) -> bool:
    try:
        return bool(path) and os.path.isfile(path) and os.path.getsize(path) > 0
    except OSError:
        return False


def _nonempty_dir(path: str) -> bool:
    try:
        return bool(path) and os.path.isdir(path) and bool(os.listdir(path))
    except OSError:
        return False


def _build_from_env() -> Tuple[Optional[ssl.SSLContext], Dict[str, Any]]:
    cafile = str(os.environ.get("SSL_CERT_FILE", "") or "").strip()
    capath = str(os.environ.get("SSL_CERT_DIR", "") or "").strip()
    # A path that is missing -- or present but empty -- is not a trust source.
    # Accepting one would produce a context with zero anchors, which fails every
    # handshake while looking configured. Fall through to a real source instead.
    usable_cafile = cafile if _nonempty_file(cafile) else ""
    usable_capath = capath if _nonempty_dir(capath) else ""
    if not usable_cafile and not usable_capath:
        return None, {}
    try:
        context = ssl.create_default_context(
            cafile=usable_cafile or None,
            capath=usable_capath or None,
        )
    except Exception:
        return None, {}
    if not usable_capath:
        # With an explicit cafile the anchors are loaded eagerly, so an empty
        # set here means the file parsed to nothing usable.
        try:
            if not context.get_ca_certs():
                return None, {}
        except Exception:
            return None, {}
    return context, {
        "source": "env",
        "cafile": usable_cafile,
        "capath": usable_capath,
    }


def _build_from_truststore() -> Tuple[Optional[ssl.SSLContext], Dict[str, Any]]:
    try:
        # Importing truststore initialises its platform backend (Security.framework
        # on macOS, schannel on Windows). A backend that cannot load raises here,
        # which is exactly why this is guarded rather than assumed.
        import truststore  # type: ignore[import-not-found]

        context = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except Exception:
        return None, {}
    if not isinstance(context, ssl.SSLContext):
        return None, {}
    return context, {"source": "truststore"}


def _build_from_certifi() -> Tuple[Optional[ssl.SSLContext], Dict[str, Any]]:
    try:
        import certifi

        cafile = certifi.where()
    except Exception:
        return None, {}
    if not cafile or not os.path.isfile(cafile):
        return None, {}
    try:
        context = ssl.create_default_context(cafile=cafile)
    except Exception:
        return None, {}
    return context, {"source": "certifi", "cafile": cafile}


def _system_trust_looks_empty(context: ssl.SSLContext) -> bool:
    """True when the system default context carries no usable trust anchors.

    ``get_ca_certs()`` only reports anchors already loaded into memory. A
    hash-directory (``capath``) is consulted lazily, so an empty list alone is
    not proof of an empty store -- the capath has to be missing too. This is
    diagnostic metadata only; it never changes whether verification happens.
    """
    try:
        if context.get_ca_certs():
            return False
    except Exception:
        return False
    try:
        paths = ssl.get_default_verify_paths()
    except Exception:
        return False
    if _nonempty_dir(str(paths.capath or paths.openssl_capath or "")):
        return False
    return True


def _build_from_system() -> Tuple[ssl.SSLContext, Dict[str, Any]]:
    context = ssl.create_default_context()
    info: Dict[str, Any] = {"source": "system"}
    try:
        paths = ssl.get_default_verify_paths()
        info["cafile"] = paths.cafile or ""
        info["capath"] = paths.capath or ""
        info["openssl_cafile"] = paths.openssl_cafile or ""
    except Exception:
        pass
    info["trust_store_empty"] = _system_trust_looks_empty(context)
    return context, info


# Builders are resolved by name at call time rather than captured as function
# objects, so ``mock.patch.object(net_tls, "_build_from_x", ...)`` takes effect
# and, more importantly, reverts cleanly when the patch exits.
_BUILDER_NAMES: Dict[str, str] = {
    "env": "_build_from_env",
    "truststore": "_build_from_truststore",
    "certifi": "_build_from_certifi",
}

# COMPATIBILITY CONTRACT -- see docs/architecture/outbound-tls-trust.md.
#
# This order is not a default; once shipped it determines which certificates are
# actually trusted on machines already in the field. Reordering it silently
# changes live trust behaviour on existing installs:
#   * certifi above truststore stops honouring a corporate proxy root installed
#     in the OS keychain -- every user behind a TLS-inspecting firewall regresses
#     to CERTIFICATE_VERIFY_FAILED with no change on their side.
#   * truststore above env overrides a bundle an administrator deliberately
#     pinned via SSL_CERT_FILE.
# Changing it is a breaking change requiring an explicit decision, a release
# note, and security sign-off. Appending a new source after `certifi` is
# additive; inserting one higher has the same blast radius as reordering.
# `tests/test_net_tls.py::TrustOrderContractTests` pins this tuple.
_AUTO_ORDER = ("env", "truststore", "certifi")


def _builder(
    name: str,
) -> Callable[[], Tuple[Optional[ssl.SSLContext], Dict[str, Any]]]:
    return globals()[_BUILDER_NAMES[name]]


def _resolve() -> Tuple[ssl.SSLContext, Dict[str, Any]]:
    requested = _requested_strategy()
    attempted = []

    if requested == "auto":
        candidates = _AUTO_ORDER
    elif requested == "system":
        candidates = ()
    else:
        candidates = (requested,)

    for name in candidates:
        attempted.append(name)
        context, info = _builder(name)()
        if context is not None:
            info = dict(info)
            info["requested"] = requested
            info["attempted"] = list(attempted)
            return context, info

    attempted.append("system")
    context, info = _build_from_system()
    info = dict(info)
    info["requested"] = requested
    info["attempted"] = list(attempted)
    return context, info


def get_outbound_ssl_context() -> ssl.SSLContext:
    """Return the shared, always-verifying SSL context for outbound requests.

    The context is built once and reused. ``ssl.SSLContext`` is safe to share
    across threads and connections.
    """
    global _CACHED_CONTEXT, _CACHED_INFO
    context = _CACHED_CONTEXT
    if context is not None:
        return context
    with _LOCK:
        if _CACHED_CONTEXT is None:
            _CACHED_CONTEXT, _CACHED_INFO = _resolve()
        return _CACHED_CONTEXT


def outbound_tls_trust_info() -> Dict[str, Any]:
    """Diagnostic metadata about which trust source is in effect."""
    get_outbound_ssl_context()
    return dict(_CACHED_INFO)


def reset_outbound_tls_cache() -> None:
    """Drop the cached context. Intended for tests and diagnostics."""
    global _CACHED_CONTEXT, _CACHED_INFO
    with _LOCK:
        _CACHED_CONTEXT = None
        _CACHED_INFO = {}


# ── startup observability ────────────────────────────────────────────────────
# The fallback chain is silent by design: if ``truststore`` cannot be imported,
# resolution simply moves on to ``certifi``. That is the right runtime
# behaviour and the wrong diagnostic behaviour -- PyInstaller dropping
# ``truststore`` (a ``--collect-submodules`` regression, or the platform backend
# failing to load) degrades trust from "the OS store, including the corporate
# proxy root the admin installed" to "Mozilla's bundle, which has never heard of
# that proxy" with no visible symptom until a user behind a MITM proxy reports a
# handshake failure. Printing the resolved chain at boot turns that into
# something a support log can answer in one line.


def _redact_path(path: str) -> str:
    """Reduce a trust path to its basename.

    The full path embeds the user's home directory and account name. The
    basename is the part that actually identifies the trust source
    (``cacert.pem`` is certifi's, ``cert.pem`` is OpenSSL's default), so the
    diagnostic value is kept and the personally-identifying part is not logged.
    """
    if not path:
        return ""
    try:
        return os.path.basename(path.rstrip(os.sep)) or ""
    except Exception:
        return ""


def describe_trust_source_for_log() -> str:
    """One-line, path-redacted summary of the trust source actually in effect."""
    info = outbound_tls_trust_info()
    source = str(info.get("source") or "unknown")
    fields = [f"source={source}"]

    requested = str(info.get("requested") or "auto")
    if requested != "auto":
        fields.append(f"requested={requested}")

    attempted = info.get("attempted")
    if isinstance(attempted, (list, tuple)) and attempted:
        fields.append("chain=" + ">".join(str(step) for step in attempted))

    bundle = _redact_path(str(info.get("cafile") or ""))
    if bundle:
        fields.append(f"bundle={bundle}")
    capath = _redact_path(str(info.get("capath") or ""))
    if capath:
        fields.append(f"capath={capath}")

    fields.append("frozen=" + ("yes" if getattr(sys, "frozen", False) else "no"))

    if info.get("trust_store_empty"):
        fields.append("anchors=NONE")
    elif source == "truststore":
        # truststore verifies against the OS store lazily; there is no in-memory
        # anchor list to count, and an empty list here is not a problem.
        fields.append("anchors=os-delegated")
    else:
        try:
            fields.append(f"anchors={len(get_outbound_ssl_context().get_ca_certs())}")
        except Exception:
            pass

    return " ".join(fields)


def outbound_tls_warning() -> Optional[str]:
    """A warning when the resolved trust is weaker than intended, else ``None``.

    Two conditions are worth a support engineer's attention:

    * ``truststore`` was tried and did not produce a context. In a frozen build
      that almost always means the module was not bundled, so enterprise proxy
      roots installed in the OS keychain will not be honoured.
    * No trust anchors are loadable at all. That is the original shipped bug;
      every outbound request will fail.
    """
    info = outbound_tls_trust_info()
    source = str(info.get("source") or "")
    attempted = info.get("attempted")
    attempted = list(attempted) if isinstance(attempted, (list, tuple)) else []

    if info.get("trust_store_empty"):
        return (
            "no TLS trust anchors are loadable; every outbound request will fail "
            "certificate verification. " + describe_tls_trust_failure()
        )
    if "truststore" in attempted and source != "truststore":
        return (
            "the OS trust store is not being used (truststore unavailable); "
            f"falling back to {source or 'system'}. Certificates installed only "
            "in the OS keychain -- such as a corporate proxy root -- will not be "
            "trusted. In a packaged build this usually means truststore was not "
            "bundled."
        )
    return None


def _iter_causes(error: BaseException):
    seen = set()
    current: Optional[BaseException] = error
    depth = 0
    while current is not None and depth < 12:
        if id(current) in seen:
            break
        seen.add(id(current))
        yield current
        depth += 1
        nested = getattr(current, "reason", None)
        if isinstance(nested, BaseException):
            current = nested
            continue
        current = current.__cause__ or current.__context__


def is_tls_trust_error(error: BaseException) -> bool:
    """True when ``error`` (or anything it wraps) is a TLS trust failure.

    ``urllib`` wraps the real ``ssl.SSLCertVerificationError`` inside
    ``URLError.reason``, so a plain ``isinstance`` check on the outermost
    exception misses it.
    """
    for candidate in _iter_causes(error):
        if isinstance(candidate, ssl.SSLCertVerificationError):
            return True
        if isinstance(candidate, ssl.SSLError):
            text = " ".join(str(part) for part in candidate.args if part is not None)
            if "CERTIFICATE_VERIFY_FAILED" in text or "certificate verify failed" in text:
                return True
    return False


def describe_tls_trust_failure() -> str:
    """Actionable operator guidance for a certificate verification failure.

    Deliberately never suggests disabling verification.
    """
    info = outbound_tls_trust_info()
    source = str(info.get("source") or "unknown")
    detail = f"trust source: {source}"
    cafile = str(info.get("cafile") or "")
    if cafile:
        detail += f", CA bundle: {cafile}"
    if info.get("trust_store_empty"):
        detail += ", no trust anchors were loadable"
    return (
        "TLS certificate verification failed (" + detail + "). "
        "This usually means the machine is behind a corporate network proxy or "
        "an intercepting firewall whose root certificate PuPu does not trust, "
        "or that the system certificate store is unavailable. "
        "Ask your administrator to install the proxy's root certificate into the "
        "operating system trust store, or point the SSL_CERT_FILE environment "
        "variable at a PEM bundle that includes it, then restart PuPu."
    )


def annotate_tls_error(message: str, error: BaseException) -> str:
    """Append operator guidance to ``message`` when ``error`` is a trust failure."""
    if not is_tls_trust_error(error):
        return message
    return f"{message} -- {describe_tls_trust_failure()}"
