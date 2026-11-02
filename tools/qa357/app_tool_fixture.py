"""App-only adapter; preserve the qualified TLS/native protocol fixture unchanged."""
import importlib.util
import os
from pathlib import Path


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(file))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load("qa357_qualified_tools", "tool_fixture.py")
oracle_module = load("qa357_app_projection", "app_projection_oracle.py")
OriginalSequence = base.ToolSequence


class AppToolSequence(OriginalSequence):
    def __init__(self, scenario):
        super().__init__(scenario)
        self.oracle = oracle_module.AppProjectionOracle(
            scenario, Path(os.environ["QA_OUT"]) / "actual-app-store.json", os.environ["QA_TMP"],
            Path(os.environ["QA_OUT"]) / "tool-projection-oracle.jsonl")

    def accept(self, body):
        previous_owner = self.oracle.owner
        try:
            if self.phase == "initial":
                self.oracle.inspect(body, 0)
            elif self.phase == "awaiting_output":
                self.scenario["function"]["expected_output"] = self.oracle.inspect(body, 1)
            return super().accept(body)
        except oracle_module.ProjectionRefusal as error:
            self.oracle.owner = previous_owner
            raise base.FixtureRefusal(str(error)) from None
        except base.FixtureRefusal:
            self.oracle.owner = previous_owner
            raise


if __name__ == "__main__":
    import http.server
    import json

    # Port 443 is bound by the namespace supervisor. Drop to the same QA uid
    # immediately afterwards, before SQLite reads, so an observer cannot create
    # a root-owned WAL/SHM file in the App's private store. No real user path is
    # available through the oracle's bounded locator.
    OriginalServer = http.server.ThreadingHTTPServer

    class UserOwnedServer(OriginalServer):
        def __init__(self, address, handler):
            if address != ("127.0.0.1", 443):
                raise SystemExit("refuse: wrong App fixture bind")
            uid, gid = int(os.environ["QA_UID"]), int(os.environ["QA_GID"])
            if uid <= 0 or gid <= 0 or os.geteuid() not in {0, uid}:
                raise SystemExit("refuse: invalid QA uid")
            super().__init__(address, handler)
            if os.geteuid() == 0:
                os.setgroups([])
                os.setgid(gid)
                os.setuid(uid)
            if os.geteuid() != uid or os.getegid() != gid:
                raise SystemExit("refuse: fixture privilege drop failed")
            (Path(os.environ["QA_OUT"]) / "projection-server-identity.json").write_text(
                json.dumps({"pid": os.getpid(), "uid": os.geteuid(), "gid": os.getegid(),
                            "bound_address": list(address), "database_mode": "read-only/query-only"}))

    http.server.ThreadingHTTPServer = UserOwnedServer
    base.ToolSequence = AppToolSequence
    base.serve_tools()
