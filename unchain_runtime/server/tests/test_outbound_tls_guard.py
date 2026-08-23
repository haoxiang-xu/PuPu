"""Repo-wide AST guard: no outbound call may bypass PuPu's TLS trust context.

Why this exists
---------------
The shipped bug was not "one call site forgot a keyword argument". It was that
the frozen PyInstaller sidecar has *no usable OpenSSL trust root at all*, so
every outbound call that relies on the interpreter default silently loads zero
anchors and dies with ``CERTIFICATE_VERIFY_FAILED`` on the user's machine while
working perfectly on every developer machine. ``net_tls.get_outbound_ssl_context``
is the single place that repairs this. A call that does not go through it is
broken in the frozen build and no test on a developer machine will notice.

``tests/test_net_tls.py`` asserts that each *known* call site is wired up. That
is a snapshot. This file is the ratchet: it parses every non-test module under
``unchain_runtime/server`` and fails on any outbound construct that could reach
the network without the shared context, including ones added tomorrow.

Design constraints this file deliberately accepts
-------------------------------------------------
1. **No comment-based escape hatch.** There is no ``# noqa``-style opt-out on
   purpose: the easiest way to defeat a guard is to make bypassing it a
   one-token local edit. The only way out is :data:`REVIEWED_EXEMPTIONS` below,
   which is a keyed entry with a mandatory reason, lives in this file, and
   therefore shows up in the diff of whoever tries to use it.
2. **Unresolvable target URL means "must pass the context".** The guard never
   guesses. If it cannot prove statically that a URL is plain-HTTP loopback, it
   requires the context. Passing a context to a plain-``http://`` request is a
   no-op, so the conservative branch costs nothing at runtime; the opposite
   default would let ``f"{base_url}/x"`` (where ``base_url`` comes from
   ``OLLAMA_HOST`` and can be a remote ``https`` endpoint) slip through.
3. **Precision over reach.** Rules only cover constructs whose TLS wiring is
   unambiguous. Third-party SDK clients (``openai``, ``anthropic``,
   ``qdrant_client``) build their own transports and are NOT checked here --
   see "Known gaps" at the bottom of this docstring.

Rules
-----
``urlopen``           must pass ``context=``            (unless proven loopback http)
``HTTPSHandler``      must pass ``context=``
``HTTPSConnection``   must pass ``context=``
``httpx.<verb>``      must pass ``verify=``             (unless proven loopback http)
``httpx.Client``/``AsyncClient``
                      must pass ``verify=``             (unless proven loopback http base_url)
``build_opener`` / ``install_opener`` / ``urlretrieve`` / ``URLopener``
                      rejected outright -- these route through the *global*
                      opener, which has no place to accept our context
``requests`` / ``aiohttp`` / ``urllib3``
                      rejected outright -- see :data:`_BANNED_MODULE_REASON`
``ssl.create_default_context`` / ``ssl.SSLContext`` outside ``net_tls``
                      rejected -- building your own context is precisely the
                      bug (it inherits the broken compiled-in trust path)
``verify=False`` / ``ssl=False`` / ``_create_unverified_context`` /
``check_hostname = False`` / ``verify_mode = ssl.CERT_NONE``
                      rejected anywhere, including tests -- the hard red line

Known gaps (stated rather than papered over)
--------------------------------------------
* Provider SDKs (``openai``, ``anthropic``, ``google-genai``, ``qdrant_client``)
  construct transports internally. They happen to be safe today because they all
  sit on ``httpx``, which defaults to ``certifi`` rather than to OpenSSL's
  compiled-in path. That is their behaviour, not our invariant, and a static
  check on our source cannot assert it.
* An ``httpx.Client`` built in one module and passed into another is checked at
  its construction site only -- which is the correct enforcement point, but it
  means a client handed to us by a third party is out of reach.
* Anything reached through ``eval``/``importlib``/``getattr`` indirection is
  invisible to an AST scan. That is inherent to the technique.
"""

import ast
import re
import sys
import unittest
from pathlib import Path
from typing import Dict, List, NamedTuple, Optional, Set

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

# Directory names never scanned. ``tests`` is excluded from the *outbound* rules
# because test doubles legitimately fake network calls; the "never disable
# verification" rules below are applied to tests as well, via a second pass.
_SKIP_DIRS = {"__pycache__", ".venv", "venv", "build", "dist", "node_modules"}

# ``net_tls`` is the module that legitimately constructs SSL contexts.
_SSL_CONSTRUCTION_OWNERS = {"net_tls.py"}

_TRUST_HELPER = "net_tls.get_outbound_ssl_context()"


class Violation(NamedTuple):
    path: str
    line: int
    rule: str
    symbol: str
    hint: str

    def render(self) -> str:
        return (
            f"  {self.path}:{self.line}  [{self.rule}]  {self.symbol}\n"
            f"      -> {self.hint}"
        )


# ---------------------------------------------------------------------------
# Reviewed exemptions
# ---------------------------------------------------------------------------
# The ONLY way to silence this guard. Keyed by (module path relative to
# ``server/``, rule id, symbol). A reason is mandatory. Adding an entry is a
# code change in a test file, so it lands in review rather than hiding as a
# trailing comment on the offending line.
REVIEWED_EXEMPTIONS: Dict[tuple, str] = {}


# ---------------------------------------------------------------------------
# Static URL reasoning
# ---------------------------------------------------------------------------
# Matches a URL prefix that is provably plain-HTTP loopback. ``https://`` never
# matches (the scheme is anchored), so anything that actually performs a TLS
# handshake still has to supply the context. The trailing lookahead stops
# ``http://localhost.evil.example`` from being read as loopback.
_LOOPBACK_HTTP = re.compile(
    r"^http://"
    r"(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[::1\]|::1)"
    r"(:\d*)?"
    r"(?=[/?#]|$)",
    re.IGNORECASE,
)


def _static_prefix(node: Optional[ast.AST]) -> Optional[str]:
    """Longest statically-known leading substring of a string expression.

    Returns ``None`` when nothing at all is known. An f-string contributes the
    literal text up to its first interpolation, which is enough to decide
    ``f"http://127.0.0.1:{port}/api/tags"`` while still refusing to guess about
    ``f"{base_url}/api/tags"``.
    """
    if node is None:
        return None
    if isinstance(node, ast.Constant):
        return node.value if isinstance(node.value, str) else None
    if isinstance(node, ast.JoinedStr):
        parts: List[str] = []
        for piece in node.values:
            if isinstance(piece, ast.Constant) and isinstance(piece.value, str):
                parts.append(piece.value)
            else:
                break
        return "".join(parts) if parts else None
    if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        return _static_prefix(node.left)
    return None


def _is_proven_loopback_http(node: Optional[ast.AST]) -> bool:
    prefix = _static_prefix(node)
    return bool(prefix) and bool(_LOOPBACK_HTTP.match(prefix))


# ---------------------------------------------------------------------------
# Import / name resolution
# ---------------------------------------------------------------------------

_BANNED_MODULE_REASON = {
    "requests": (
        "requests cannot consume an ssl.SSLContext -- its verify= takes a bool "
        "or a path, so there is no way to hand it PuPu's resolved trust without "
        "a custom TransportAdapter. It is also not in server/requirements.txt. "
        f"Use httpx with verify={_TRUST_HELPER}."
    ),
    "aiohttp": (
        "aiohttp is not a declared dependency and its TLS wiring (ssl= per "
        "request vs. a TCPConnector) has never been designed for PuPu. "
        f"Use httpx.AsyncClient(verify={_TRUST_HELPER}), which is already a "
        "dependency and shares the resolved trust."
    ),
    "urllib3": (
        "urllib3 builds its own PoolManager trust independently of PuPu's. "
        f"Use urllib.request.urlopen(..., context={_TRUST_HELPER}) or httpx."
    ),
}

_DYNAMIC_HINT = (
    "This call forwards **kwargs, so the guard cannot prove {kwarg}= is set. "
    "Pass {kwarg}=" + _TRUST_HELPER + " explicitly at this call site rather "
    "than relying on a caller to supply it -- an unproven trust source is the "
    "exact failure mode this guard exists to stop."
)

_HTTPX_REQUEST_FUNCS = {
    "get", "post", "put", "patch", "delete", "head", "options", "request", "stream",
}
_HTTPX_CLIENT_CLASSES = {"Client", "AsyncClient"}

_URLLIB_BANNED = {
    "build_opener": (
        "build_opener/install_opener route through the global opener, which has "
        "no parameter for our context. Call urlopen(..., context=...) directly, "
        "or build an HTTPSHandler(context=...) explicitly and exempt it below."
    ),
    "install_opener": (
        "install_opener mutates process-global urllib state and silently changes "
        "the trust of unrelated call sites. Pass context= at each urlopen instead."
    ),
    "urlretrieve": (
        "urlretrieve uses the global opener and accepts no SSL context at all. "
        f"Use urlopen(..., context={_TRUST_HELPER}) and stream to disk "
        "(see mcp_managed_runtime._download_file)."
    ),
    "URLopener": "URLopener is removed in modern Python and carries no context.",
    "FancyURLopener": "FancyURLopener is removed in modern Python and carries no context.",
}


class _ModuleNames:
    """Which local names in one module reach which network libraries."""

    def __init__(self, tree: ast.AST) -> None:
        # Local names bound to a module object, e.g. {"httpx", "_httpx"}.
        self.httpx_modules: Set[str] = set()
        self.urllib_request_modules: Set[str] = set()
        self.ssl_modules: Set[str] = set()
        self.banned_modules: Dict[str, str] = {}
        # Local name -> attribute it was imported as, e.g. {"urlopen": "urlopen"}.
        self.httpx_direct: Dict[str, str] = {}
        self.urllib_direct: Dict[str, str] = {}
        self.ssl_direct: Dict[str, str] = {}
        self.banned_direct: Dict[str, str] = {}
        # Imports are collected from the whole module regardless of scope: many
        # of these call sites import lazily inside a function, and treating an
        # alias as module-wide over-approximates towards *more* checking.
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                self._absorb_import(node)
            elif isinstance(node, ast.ImportFrom):
                self._absorb_import_from(node)

    def _absorb_import(self, node: ast.Import) -> None:
        for alias in node.names:
            full = alias.name
            bound = alias.asname or full.split(".")[0]
            if full == "httpx" or full.startswith("httpx."):
                self.httpx_modules.add(alias.asname or "httpx")
            elif full == "urllib.request":
                # ``import urllib.request`` binds ``urllib``, and the call site
                # spells the full dotted path, so record that path itself.
                self.urllib_request_modules.add(alias.asname or "urllib.request")
            elif full == "urllib":
                self.urllib_request_modules.add(
                    (alias.asname + ".request") if alias.asname else "urllib.request"
                )
            elif full == "ssl":
                self.ssl_modules.add(bound)
            else:
                root = full.split(".")[0]
                if root in _BANNED_MODULE_REASON:
                    self.banned_modules[alias.asname or full] = root

    def _absorb_import_from(self, node: ast.ImportFrom) -> None:
        module = node.module or ""
        if node.level:  # relative import -- never a third-party network lib
            return
        for alias in node.names:
            local = alias.asname or alias.name
            if module == "httpx":
                self.httpx_direct[local] = alias.name
            elif module == "urllib.request":
                self.urllib_direct[local] = alias.name
            elif module == "urllib" and alias.name == "request":
                self.urllib_request_modules.add(local)
            elif module == "ssl":
                self.ssl_direct[local] = alias.name
            elif module.split(".")[0] in _BANNED_MODULE_REASON:
                self.banned_direct[local] = module.split(".")[0]


def _dotted_name(node: ast.AST) -> Optional[str]:
    parts: List[str] = []
    current = node
    while isinstance(current, ast.Attribute):
        parts.append(current.attr)
        current = current.value
    if isinstance(current, ast.Name):
        parts.append(current.id)
        return ".".join(reversed(parts))
    return None


def _attr_of(dotted: Optional[str], modules: Set[str]) -> Optional[str]:
    """``("urllib.request.urlopen", {"urllib.request"})`` -> ``"urlopen"``."""
    if not dotted:
        return None
    for module in modules:
        prefix = module + "."
        if dotted.startswith(prefix):
            tail = dotted[len(prefix):]
            if "." not in tail:
                return tail
    return None


_PRESENT, _ABSENT, _DYNAMIC = "present", "absent", "dynamic"


def _kwarg_state(call: ast.Call, name: str) -> str:
    """Whether ``name=`` is explicitly passed, absent, or unknowable.

    ``_DYNAMIC`` means the call forwards ``**kwargs``, so the guard cannot prove
    either way. Consistent with the "never guess" rule, that is reported rather
    than waved through -- otherwise ``urlopen(req, **{})`` is a one-line bypass.
    """
    for keyword in call.keywords:
        if keyword.arg == name:
            return _PRESENT
    for keyword in call.keywords:
        if keyword.arg is None:
            return _DYNAMIC
    return _ABSENT


def _kwarg(call: ast.Call, name: str) -> Optional[ast.AST]:
    for keyword in call.keywords:
        if keyword.arg == name:
            return keyword.value
    return None


def _positional(call: ast.Call, index: int) -> Optional[ast.AST]:
    if len(call.args) > index and not isinstance(call.args[index], ast.Starred):
        return call.args[index]
    return None


def _is_false_literal(node: Optional[ast.AST]) -> bool:
    return isinstance(node, ast.Constant) and node.value in (False, 0)


def _is_cert_none(node: Optional[ast.AST]) -> bool:
    return _dotted_name(node) in ("ssl.CERT_NONE", "CERT_NONE") if node else False


# ---------------------------------------------------------------------------
# The scanner
# ---------------------------------------------------------------------------

def scan_source(source: str, rel_path: str, *, outbound_rules: bool = True) -> List[Violation]:
    """Return every guard violation in ``source``.

    ``outbound_rules=False`` runs only the "verification is never disabled"
    rules, which is what test modules are held to.
    """
    tree = ast.parse(source, filename=rel_path)
    names = _ModuleNames(tree)
    found: List[Violation] = []
    owns_ssl_construction = Path(rel_path).name in _SSL_CONSTRUCTION_OWNERS

    def report(node: ast.AST, rule: str, symbol: str, hint: str) -> None:
        key = (rel_path, rule, symbol)
        if key in REVIEWED_EXEMPTIONS:
            return
        found.append(Violation(rel_path, getattr(node, "lineno", 0), rule, symbol, hint))

    for node in ast.walk(tree):
        # -- red line: verification must never be turned off -----------------
        if isinstance(node, ast.Call):
            for keyword in node.keywords:
                if keyword.arg in ("verify", "ssl", "check_hostname") and _is_false_literal(
                    keyword.value
                ):
                    report(
                        node,
                        "no-disabled-verification",
                        f"{keyword.arg}=False",
                        "Certificate verification must never be disabled. If the "
                        "handshake fails, the trust source is wrong -- fix it via "
                        f"{_TRUST_HELPER} or SSL_CERT_FILE, never by turning "
                        "verification off.",
                    )
                if keyword.arg == "verify_mode" and _is_cert_none(keyword.value):
                    report(
                        node,
                        "no-disabled-verification",
                        "verify_mode=CERT_NONE",
                        "CERT_NONE disables certificate verification. Never ship it.",
                    )
            dotted = _dotted_name(node.func) or ""
            if dotted.endswith("_create_unverified_context"):
                report(
                    node,
                    "no-disabled-verification",
                    dotted,
                    "ssl._create_unverified_context() produces a context that "
                    f"accepts any certificate. Use {_TRUST_HELPER}.",
                )

        if isinstance(node, ast.Assign):
            for target in node.targets:
                attr = target.attr if isinstance(target, ast.Attribute) else None
                if attr == "check_hostname" and _is_false_literal(node.value):
                    report(
                        node,
                        "no-disabled-verification",
                        "check_hostname = False",
                        "Hostname verification must never be disabled.",
                    )
                if attr == "verify_mode" and _is_cert_none(node.value):
                    report(
                        node,
                        "no-disabled-verification",
                        "verify_mode = ssl.CERT_NONE",
                        "CERT_NONE disables certificate verification. Never ship it.",
                    )
                if _dotted_name(target) and str(_dotted_name(target)).endswith(
                    "_create_default_https_context"
                ):
                    report(
                        node,
                        "no-disabled-verification",
                        "ssl._create_default_https_context = ...",
                        "Rebinding the process-global HTTPS context changes trust "
                        "for unrelated call sites. Pass a context explicitly.",
                    )

        if not outbound_rules or not isinstance(node, ast.Call):
            continue

        dotted = _dotted_name(node.func)
        bare = node.func.id if isinstance(node.func, ast.Name) else None

        # -- banned modules --------------------------------------------------
        banned = None
        if bare and bare in names.banned_direct:
            banned = names.banned_direct[bare]
        elif dotted:
            for local, root in names.banned_modules.items():
                if dotted == local or dotted.startswith(local + "."):
                    banned = root
                    break
        if banned:
            report(node, "banned-http-library", dotted or bare or banned,
                   _BANNED_MODULE_REASON[banned])
            continue

        # -- urllib ----------------------------------------------------------
        urllib_attr = _attr_of(dotted, names.urllib_request_modules)
        if urllib_attr is None and bare in names.urllib_direct:
            urllib_attr = names.urllib_direct[bare]

        if urllib_attr in _URLLIB_BANNED:
            report(node, "banned-urllib-construct", urllib_attr,
                   _URLLIB_BANNED[urllib_attr])
            continue

        if urllib_attr == "urlopen":
            url_arg = _positional(node, 0) or _kwarg(node, "url")
            if _is_proven_loopback_http(url_arg):
                continue
            state = _kwarg_state(node, "context")
            if state == _ABSENT:
                report(
                    node, "urlopen-missing-context", "urllib.request.urlopen",
                    "Add context=get_outbound_ssl_context() (from net_tls). Without "
                    "it the frozen sidecar resolves trust through the build "
                    "machine's compiled-in OPENSSLDIR, which does not exist on a "
                    "user's machine, and every request fails with "
                    "CERTIFICATE_VERIFY_FAILED. Only a URL that is provably a "
                    "plain http:// loopback literal is exempt.",
                )
            elif state == _DYNAMIC:
                report(node, "dynamic-kwargs-unverifiable", "urllib.request.urlopen",
                       _DYNAMIC_HINT.format(kwarg="context"))
            continue

        if urllib_attr == "HTTPSHandler":
            state = _kwarg_state(node, "context")
            if state == _ABSENT:
                report(node, "handler-missing-context", "urllib.request.HTTPSHandler",
                       f"HTTPSHandler must be given context={_TRUST_HELPER}.")
            elif state == _DYNAMIC:
                report(node, "dynamic-kwargs-unverifiable",
                       "urllib.request.HTTPSHandler",
                       _DYNAMIC_HINT.format(kwarg="context"))
            continue

        if dotted and dotted.endswith("HTTPSConnection"):
            state = _kwarg_state(node, "context")
            if state == _ABSENT:
                report(node, "connection-missing-context", dotted,
                       f"http.client.HTTPSConnection must be given "
                       f"context={_TRUST_HELPER}.")
            elif state == _DYNAMIC:
                report(node, "dynamic-kwargs-unverifiable", dotted,
                       _DYNAMIC_HINT.format(kwarg="context"))
            continue

        # -- httpx -----------------------------------------------------------
        httpx_attr = _attr_of(dotted, names.httpx_modules)
        if httpx_attr is None and bare in names.httpx_direct:
            httpx_attr = names.httpx_direct[bare]

        if httpx_attr in _HTTPX_REQUEST_FUNCS:
            url_arg = _positional(node, 0) or _kwarg(node, "url")
            if httpx_attr in ("request", "stream"):
                # signature is (method, url, ...)
                url_arg = _positional(node, 1) or _kwarg(node, "url")
            if _is_proven_loopback_http(url_arg):
                continue
            state = _kwarg_state(node, "verify")
            if state == _ABSENT:
                report(
                    node, "httpx-missing-verify", f"httpx.{httpx_attr}",
                    f"Add verify={_TRUST_HELPER}. httpx defaults to the certifi "
                    "bundle, which silently disagrees with the trust PuPu resolved "
                    "(OS trust store first, so corporate MITM roots work). Only a "
                    "provably plain http:// loopback literal is exempt.",
                )
            elif state == _DYNAMIC:
                report(node, "dynamic-kwargs-unverifiable", f"httpx.{httpx_attr}",
                       _DYNAMIC_HINT.format(kwarg="verify"))
            continue

        if httpx_attr in _HTTPX_CLIENT_CLASSES:
            if _is_proven_loopback_http(_kwarg(node, "base_url")):
                continue
            state = _kwarg_state(node, "verify")
            if state == _ABSENT:
                report(
                    node, "httpx-client-missing-verify", f"httpx.{httpx_attr}",
                    f"Add verify={_TRUST_HELPER} to the client constructor -- that "
                    "is the enforcement point; per-request calls on the client "
                    "inherit it.",
                )
            elif state == _DYNAMIC:
                report(node, "dynamic-kwargs-unverifiable", f"httpx.{httpx_attr}",
                       _DYNAMIC_HINT.format(kwarg="verify"))
            continue

        # -- home-made SSL contexts -------------------------------------------
        if owns_ssl_construction:
            continue
        ssl_attr = _attr_of(dotted, names.ssl_modules)
        if ssl_attr is None and bare in names.ssl_direct:
            ssl_attr = names.ssl_direct[bare]
        if ssl_attr in ("create_default_context", "SSLContext"):
            report(
                node, "ad-hoc-ssl-context", f"ssl.{ssl_attr}",
                f"Building a context here re-introduces the original bug: it "
                "inherits OpenSSL's compiled-in trust path, which is empty in the "
                f"frozen sidecar. Use {_TRUST_HELPER}, which is the single place "
                "allowed to construct one.",
            )

    return found


def iter_source_files() -> List[Path]:
    files: List[Path] = []
    for path in sorted(SERVER_ROOT.rglob("*.py")):
        if any(part in _SKIP_DIRS for part in path.relative_to(SERVER_ROOT).parts):
            continue
        files.append(path)
    return files


def _rel(path: Path) -> str:
    return str(path.relative_to(SERVER_ROOT))


def _format(violations: List[Violation]) -> str:
    body = "\n".join(v.render() for v in violations)
    return (
        f"\n\n{len(violations)} outbound-TLS guard violation(s):\n\n{body}\n\n"
        "How to fix\n"
        "----------\n"
        "  from net_tls import get_outbound_ssl_context\n"
        "  urllib.request.urlopen(req, context=get_outbound_ssl_context())\n"
        "  httpx.get(url, verify=get_outbound_ssl_context())\n"
        "  httpx.Client(verify=get_outbound_ssl_context())\n\n"
        "See docs/architecture/outbound-tls-trust.md for why the frozen sidecar\n"
        "cannot use the interpreter default, and unchain_runtime/server/net_tls.py\n"
        "for the resolution order. If a call genuinely cannot take the context,\n"
        "add a keyed entry to REVIEWED_EXEMPTIONS in this file with a reason --\n"
        "there is deliberately no inline comment-based opt-out.\n"
    )


class OutboundTlsGuardTests(unittest.TestCase):
    """The ratchet itself."""

    def test_no_outbound_call_bypasses_the_shared_trust_context(self):
        violations: List[Violation] = []
        for path in iter_source_files():
            rel = _rel(path)
            is_test = rel.startswith("tests" + "/") or rel == "tests"
            violations.extend(
                scan_source(
                    path.read_text(encoding="utf-8"),
                    rel,
                    outbound_rules=not is_test,
                )
            )
        self.assertEqual(violations, [], _format(violations))

    def test_scan_actually_covers_the_tree(self):
        """A guard that silently scans nothing is worse than no guard."""
        files = {_rel(p) for p in iter_source_files()}
        self.assertGreater(
            len(files), 50, "scan root looks wrong -- almost nothing was parsed"
        )
        # Every module known to make outbound calls today must be in the scan
        # set. If one is renamed, this fails loudly instead of going quiet.
        for expected in (
            "net_tls.py",
            "mcp_managed_runtime.py",
            "mcp_external_registries.py",
            "mcp_store_metadata.py",
            "mcp_oauth.py",
            "memory_factory.py",
            "memory_embeddings.py",
            "unchain_adapter.py",
            "custom_provider.py",
            "computer_use_probe.py",
        ):
            self.assertIn(expected, files, f"{expected} dropped out of the scan")

    def test_guard_fires_when_the_real_call_sites_are_mutated(self):
        """The strongest anti-vacuity check available.

        Strip ``context=``/``verify=`` from every call in each real module that
        makes outbound requests, then re-scan. If the guard is live, every one
        of those modules must light up. If someone rewires a call site into a
        shape the guard no longer recognises, this fails while the tree is still
        clean -- rather than the guard quietly passing forever.
        """
        targets = [
            "mcp_oauth.py",
            "mcp_external_registries.py",
            "mcp_store_metadata.py",
            "mcp_managed_runtime.py",
            "memory_factory.py",
            "memory_embeddings.py",
            "unchain_adapter.py",
            "custom_provider.py",
            "computer_use_probe.py",
        ]
        for name in targets:
            with self.subTest(module=name):
                path = SERVER_ROOT / name
                tree = ast.parse(path.read_text(encoding="utf-8"), filename=name)
                for node in ast.walk(tree):
                    if isinstance(node, ast.Call):
                        node.keywords = [
                            k for k in node.keywords if k.arg not in ("context", "verify")
                        ]
                mutated = scan_source(ast.unparse(tree), name)
                self.assertTrue(
                    mutated,
                    f"{name} makes outbound calls, but stripping the TLS keyword "
                    "produced no violation -- the guard no longer recognises its "
                    "call shape and is passing vacuously",
                )

    def test_every_known_outbound_module_is_actually_parsed_and_checked(self):
        """Proves the rules ran against real code, not just that files existed."""
        checked = 0
        for path in iter_source_files():
            rel = _rel(path)
            if rel.startswith("tests/"):
                continue
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=rel)
            names = _ModuleNames(tree)
            if names.httpx_modules or names.urllib_request_modules or names.urllib_direct:
                checked += 1
        self.assertGreaterEqual(
            checked,
            8,
            "expected the guard to recognise the known network-using modules; "
            "if this dropped, import-alias resolution is broken and the guard "
            "is passing vacuously",
        )


class GuardDetectsViolationsTests(unittest.TestCase):
    """Meta-tests: the guard must actually fire. Each case is a real regression
    shape that would ship a broken frozen binary."""

    def _rules(self, source: str, path: str = "fake_module.py") -> Set[str]:
        return {v.rule for v in scan_source(source, path)}

    def test_bare_urlopen_is_rejected(self):
        self.assertIn(
            "urlopen-missing-context",
            self._rules("import urllib.request\nurllib.request.urlopen('https://a.test')\n"),
        )

    def test_urlopen_with_context_is_accepted(self):
        self.assertEqual(
            self._rules(
                "import urllib.request\n"
                "from net_tls import get_outbound_ssl_context\n"
                "urllib.request.urlopen(r, context=get_outbound_ssl_context())\n"
            ),
            set(),
        )

    def test_urlopen_imported_directly_is_still_checked(self):
        self.assertIn(
            "urlopen-missing-context",
            self._rules("from urllib.request import urlopen\nurlopen(req)\n"),
        )

    def test_urlopen_alias_is_still_checked(self):
        self.assertIn(
            "urlopen-missing-context",
            self._rules("from urllib.request import urlopen as fetch\nfetch(req)\n"),
        )

    def test_from_urllib_import_request_is_still_checked(self):
        self.assertIn(
            "urlopen-missing-context",
            self._rules("from urllib import request\nrequest.urlopen(req)\n"),
        )

    def test_bare_httpx_call_is_rejected(self):
        self.assertIn(
            "httpx-missing-verify",
            self._rules("import httpx\nhttpx.get('https://a.test')\n"),
        )

    def test_httpx_module_alias_is_rejected(self):
        self.assertIn(
            "httpx-missing-verify",
            self._rules("import httpx as _h\n_h.post('https://a.test', json={})\n"),
        )

    def test_httpx_client_without_verify_is_rejected(self):
        self.assertIn(
            "httpx-client-missing-verify",
            self._rules("import httpx\nwith httpx.Client(timeout=3) as c:\n    c.get('https://a.test')\n"),
        )

    def test_httpx_client_from_import_is_rejected(self):
        self.assertIn(
            "httpx-client-missing-verify",
            self._rules("from httpx import AsyncClient\nAsyncClient()\n"),
        )

    def test_methods_on_a_configured_client_are_not_flagged(self):
        """verify lives on the Client; flagging every c.get() would be noise."""
        self.assertEqual(
            self._rules(
                "import httpx\n"
                "from net_tls import get_outbound_ssl_context\n"
                "c = httpx.Client(verify=get_outbound_ssl_context())\n"
                "c.get('https://a.test')\n"
                "c.post('https://a.test')\n"
            ),
            set(),
        )

    def test_kwargs_forwarding_is_reported_not_waved_through(self):
        """``urlopen(req, **opts)`` must not become a one-line bypass."""
        self.assertIn(
            "dynamic-kwargs-unverifiable",
            self._rules("import urllib.request\nurllib.request.urlopen(req, **opts)\n"),
        )
        self.assertIn(
            "dynamic-kwargs-unverifiable",
            self._rules("import httpx\nhttpx.get(url, **opts)\n"),
        )

    def test_explicit_kwarg_beats_kwargs_forwarding(self):
        self.assertEqual(
            self._rules(
                "import urllib.request\n"
                "urllib.request.urlopen(req, context=ctx, **opts)\n"
            ),
            set(),
        )

    def test_requests_is_rejected(self):
        self.assertIn(
            "banned-http-library",
            self._rules("import requests\nrequests.get('https://a.test')\n"),
        )

    def test_requests_from_import_is_rejected(self):
        self.assertIn(
            "banned-http-library",
            self._rules("from requests import get\nget('https://a.test')\n"),
        )

    def test_aiohttp_is_rejected(self):
        self.assertIn(
            "banned-http-library",
            self._rules("import aiohttp\naiohttp.ClientSession()\n"),
        )

    def test_urllib3_is_rejected(self):
        self.assertIn(
            "banned-http-library",
            self._rules("import urllib3\nurllib3.PoolManager()\n"),
        )

    def test_global_opener_mutation_is_rejected(self):
        self.assertIn(
            "banned-urllib-construct",
            self._rules("import urllib.request\nurllib.request.install_opener(o)\n"),
        )

    def test_urlretrieve_is_rejected(self):
        self.assertIn(
            "banned-urllib-construct",
            self._rules("from urllib.request import urlretrieve\nurlretrieve(u, p)\n"),
        )

    def test_ad_hoc_ssl_context_outside_net_tls_is_rejected(self):
        self.assertIn(
            "ad-hoc-ssl-context",
            self._rules("import ssl\nctx = ssl.create_default_context()\n"),
        )

    def test_net_tls_may_build_contexts(self):
        self.assertEqual(
            self._rules("import ssl\nctx = ssl.create_default_context()\n", "net_tls.py"),
            set(),
        )

    def test_verify_false_is_rejected(self):
        self.assertIn(
            "no-disabled-verification",
            self._rules("import httpx\nhttpx.get('https://a.test', verify=False)\n"),
        )

    def test_unverified_context_is_rejected(self):
        self.assertIn(
            "no-disabled-verification",
            self._rules("import ssl\nctx = ssl._create_unverified_context()\n"),
        )

    def test_check_hostname_disable_is_rejected(self):
        self.assertIn(
            "no-disabled-verification",
            self._rules("ctx.check_hostname = False\n"),
        )

    def test_cert_none_is_rejected(self):
        self.assertIn(
            "no-disabled-verification",
            self._rules("import ssl\nctx.verify_mode = ssl.CERT_NONE\n"),
        )

    def test_red_line_rules_also_apply_to_test_modules(self):
        rules = {
            v.rule
            for v in scan_source(
                "import httpx\nhttpx.get('https://a.test', verify=False)\n",
                "tests/test_x.py",
                outbound_rules=False,
            )
        }
        self.assertEqual(rules, {"no-disabled-verification"})

    def test_outbound_rules_are_relaxed_for_test_modules(self):
        rules = {
            v.rule
            for v in scan_source(
                "import httpx\nhttpx.get('https://a.test')\n",
                "tests/test_x.py",
                outbound_rules=False,
            )
        }
        self.assertEqual(rules, set())


class LoopbackExemptionTests(unittest.TestCase):
    """The exemption exists so a local health check is not forced to carry a
    meaningless TLS context. It must be narrow enough not to become a loophole."""

    def _rules(self, source: str) -> Set[str]:
        return {v.rule for v in scan_source(source, "fake_module.py")}

    def test_plain_http_localhost_literal_is_exempt(self):
        self.assertEqual(
            self._rules("import httpx\nhttpx.get('http://localhost:5879/health')\n"),
            set(),
        )

    def test_loopback_ip_fstring_prefix_is_exempt(self):
        self.assertEqual(
            self._rules(
                'import httpx\np = 6333\nhttpx.get(f"http://127.0.0.1:{p}/collections")\n'
            ),
            set(),
        )

    def test_ipv6_loopback_is_exempt(self):
        self.assertEqual(
            self._rules("import httpx\nhttpx.get('http://[::1]:5879/health')\n"),
            set(),
        )

    def test_urlopen_to_plain_http_localhost_is_exempt(self):
        self.assertEqual(
            self._rules(
                "import urllib.request\n"
                "urllib.request.urlopen('http://127.0.0.1:11434/api/tags')\n"
            ),
            set(),
        )

    def test_https_localhost_is_NOT_exempt(self):
        """TLS is actually performed, so the trust question is live."""
        self.assertIn(
            "httpx-missing-verify",
            self._rules("import httpx\nhttpx.get('https://localhost:5879/health')\n"),
        )

    def test_lookalike_host_is_NOT_exempt(self):
        self.assertIn(
            "httpx-missing-verify",
            self._rules("import httpx\nhttpx.get('http://localhost.evil.example/x')\n"),
        )

    def test_unresolvable_url_is_NOT_exempt(self):
        """This is the OLLAMA_HOST shape: it looks local but can be remote https."""
        self.assertIn(
            "httpx-missing-verify",
            self._rules('import httpx\nhttpx.get(f"{base_url}/api/tags")\n'),
        )

    def test_variable_url_is_NOT_exempt(self):
        self.assertIn(
            "httpx-missing-verify",
            self._rules("import httpx\nhttpx.get(url)\n"),
        )


class GuardMessageQualityTests(unittest.TestCase):
    def test_failure_message_names_the_fix(self):
        violations = scan_source(
            "import urllib.request\nurllib.request.urlopen('https://a.test')\n",
            "fake_module.py",
        )
        message = _format(violations)
        self.assertIn("get_outbound_ssl_context", message)
        self.assertIn("fake_module.py:2", message)
        self.assertIn("REVIEWED_EXEMPTIONS", message)
        self.assertIn("docs/architecture/outbound-tls-trust.md", message)

    def test_guidance_never_points_at_disabling_verification(self):
        """A guard whose own error text hints at verify=False defeats itself."""
        sources = [
            "import urllib.request\nurllib.request.urlopen('https://a.test')\n",
            "import httpx\nhttpx.get('https://a.test')\n",
            "import httpx\nhttpx.Client()\n",
            "import requests\nrequests.get('https://a.test')\n",
            "import aiohttp\naiohttp.ClientSession()\n",
            "import ssl\nctx = ssl.create_default_context()\n",
            "import urllib.request\nurllib.request.install_opener(o)\n",
        ]
        for source in sources:
            with self.subTest(source=source.splitlines()[-1]):
                message = _format(scan_source(source, "fake_module.py")).lower()
                self.assertTrue(message.strip())
                for forbidden in (
                    "verify=false", "cert_none", "unverified", "insecure",
                    "check_hostname = false", "skip verification",
                ):
                    self.assertNotIn(
                        forbidden,
                        message,
                        f"guard guidance must never mention {forbidden!r}",
                    )


if __name__ == "__main__":
    unittest.main()
