"""Read-only expected-output oracle for this one disposable App qualification."""
import hashlib
import json
import re
import sqlite3
from pathlib import Path


class ProjectionRefusal(ValueError):
    pass


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(value).hexdigest()


def require(condition, reason):
    if not condition:
        raise ProjectionRefusal(reason)


def strict_json(value):
    def pairs(items):
        result = {}
        for key, item in items:
            require(key not in result, "app_projection_duplicate_key")
            result[key] = item
        return result

    def nonfinite(_value):
        raise ProjectionRefusal("app_projection_nonfinite")

    return json.loads(value, object_pairs_hook=pairs, parse_constant=nonfinite)


class AppProjectionOracle:
    def __init__(self, scenario, locator, allowed_root, receipt_path=None):
        self.function = dict(scenario["function"])
        self.locator = Path(locator)
        self.allowed_root = Path(allowed_root).resolve(strict=True)
        self.receipt_path = Path(receipt_path) if receipt_path else None
        self.owner = None

    def _open(self):
        location = strict_json(self.locator.read_bytes())
        require(set(location) == {"schema", "user_data", "execution_id"} and
                location["schema"] == "qa357.app-store-locator.v1", "app_store_locator")
        root = Path(location["user_data"])
        require(root.is_absolute() and not root.is_symlink() and root.name.startswith("pupu-357-user-data-"), "app_store_path")
        root = root.resolve(strict=True)
        require(root.is_relative_to(self.allowed_root), "app_store_path")
        execution = location["execution_id"]
        require(isinstance(execution, str) and re.fullmatch(r"chat-[A-Za-z0-9-]+", execution), "app_store_execution")
        directory = root / "memory_v2"
        database = directory / "context_v2.sqlite3"
        require(not directory.is_symlink() and database.is_file() and not database.is_symlink(), "app_store_database")
        connection = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True, timeout=2)
        connection.row_factory = sqlite3.Row
        connection.execute("pragma query_only=ON")
        connection.execute("begin")
        return connection, directory / "objects", execution

    @staticmethod
    def _events(connection, execution):
        result = []
        for row in connection.execute("select * from events where execution_id=? order by store_seq", (execution,)):
            raw = row["event_json"]
            require(digest(raw.encode() if isinstance(raw, str) else raw) == row["event_sha256"], "app_event_digest")
            event = strict_json(raw)
            require(event["event_id"] == row["event_id"] and event["store_seq"] == row["store_seq"] and
                    event["attempt"]["generation"]["execution_id"] == execution, "app_event_identity")
            result.append(event)
        return result

    @staticmethod
    def _artifact(connection, objects, execution, ref, expected_sha, expected_size):
        require(isinstance(ref, dict) and set(ref) == {"schema", "kind", "id", "revision", "fragment"} and
                ref["schema"] == "unchain.resource_ref.v1" and ref["kind"] == "artifact" and ref["fragment"] == "" and
                isinstance(ref["id"], str) and re.fullmatch(r"artifact-[a-f0-9]{64}", ref["id"]) and
                type(ref["revision"]) is int and ref["revision"] > 0, "app_artifact_reference")
        rows = list(connection.execute("select * from artifacts where execution_id=? and artifact_id=? and revision=?",
                                       (execution, ref["id"], ref["revision"])))
        require(len(rows) == 1, "app_artifact_owner")
        row = rows[0]
        raw_record = row["artifact_json"]
        require(digest(raw_record.encode() if isinstance(raw_record, str) else raw_record) == row["artifact_record_sha256"], "app_artifact_record_digest")
        record = strict_json(raw_record)
        require(record["ref"] == ref and record["sha256"] == row["object_sha256"] == expected_sha and
                record["byte_length"] == row["byte_length"] == expected_size and row["media_type"] == "application/json", "app_artifact_binding")
        require(re.fullmatch(r"[a-f0-9]{64}", expected_sha) and type(expected_size) is int and 0 <= expected_size <= 2 * 1024 * 1024, "app_artifact_size")
        target = objects / expected_sha
        require(not objects.is_symlink() and target.is_file() and not target.is_symlink(), "app_artifact_path")
        data = target.read_bytes()
        require(len(data) == expected_size and digest(data) == expected_sha, "app_artifact_bytes")
        return data

    def inspect(self, body, iteration):
        connection = None
        try:
            connection, objects, execution = self._open()
            events = self._events(connection, execution)
            wires = [e for e in events if e["event_type"] == "provider.wire_snapshot" and
                     e["payload"]["iteration"] == iteration and (self.owner is None or e["attempt"] == self.owner)]
            require(len(wires) == 1, "app_wire_owner")
            event = wires[0]
            require(iteration == 0 or event["attempt"] == self.owner, "app_wire_attempt")
            ref = event["payload"]["wire_artifact"]
            wire = strict_json(self._artifact(connection, objects, execution, ref["ref"], ref["sha256"], ref["byte_length"]))
            routes = [route for route in wire["routes"] if route["name"] == "primary"]
            require(len(routes) == 1 and routes[0]["request_sha256"] == digest(canonical(routes[0]["request"])), "app_wire_digest")
            require(canonical(routes[0]["request"]) == canonical(body), "app_wire_request_mismatch")
            if iteration == 0:
                require(self.owner is None, "app_wire_already_bound")
                self.owner = event["attempt"]
                return None
            results = [e for e in events if e["event_type"] == "tool_result" and e["attempt"] == self.owner and
                       e["payload"].get("call_id") == self.function["call_id"] and e["payload"].get("tool_name") == self.function["name"]]
            require(len(results) == 1, "app_tool_result_owner")
            result_event = results[0]
            payload = result_event["payload"]
            require(result_event["store_seq"] < event["store_seq"] and payload["run_id"] == self.owner["attempt_id"] and
                    payload["execution_subject"]["approval_state"] == "approved", "app_tool_result_identity")
            cursor = payload["execution_subject"]["intent_cursor"]
            intents = [e for e in events if e["event_id"] == cursor["event_id"] and e["store_seq"] == cursor["store_seq"]]
            require(len(intents) == 1 and intents[0]["event_type"] == "tool_call" and intents[0]["attempt"] == self.owner and
                    intents[0]["payload"]["call_id"] == self.function["call_id"] and
                    intents[0]["payload"]["tool_name"] == self.function["name"] and
                    strict_json(intents[0]["payload"]["arguments"]) == strict_json(self.function["arguments"]), "app_tool_intent_identity")
            raw = self._artifact(connection, objects, execution, payload["full_output_ref"], payload["result_sha256"], payload["result_bytes"])
            expected_raw = canonical(strict_json(self.function["expected_output"]))
            require(raw == expected_raw, "app_tool_source_value")
            projection = payload["model_projection"]["result"]
            expected_projection = {"content_bytes": len(raw), "content_sha256": digest(raw), "full_output_ref": payload["full_output_ref"],
                                   "inline": True, "preview": raw.decode("utf-8"), "projection": "head_tail"}
            require(canonical(projection) == canonical(expected_projection), "app_tool_projection_value")
            metadata = payload["model_projection"]["metadata"]
            require(metadata["source_ref_sha256"] == digest(canonical(payload["full_output_ref"])) and
                    metadata["projection_bytes"] == len(canonical(projection)) and metadata["projection_policy"] == "head_tail" and
                    metadata["projection_version"] == "v1" and metadata["inline"] is True, "app_tool_projection_metadata")
            outputs = [item for item in routes[0]["request"]["input"] if item.get("type") == "function_call_output"]
            require(len(outputs) == 1 and outputs[0]["call_id"] == self.function["call_id"] and
                    canonical(strict_json(outputs[0]["output"])) == canonical(projection), "app_tool_wire_value")
            expected = outputs[0]["output"]
            if self.receipt_path:
                receipt = {"owner": self.owner, "source_event": result_event["event_id"], "source_seq": result_event["store_seq"],
                           "wire_event": event["event_id"], "wire_seq": event["store_seq"], "source_sha256": digest(raw),
                           "source_ref": payload["full_output_ref"], "expected_output_sha256": digest(expected.encode())}
                with self.receipt_path.open("a") as target:
                    target.write(json.dumps(receipt, sort_keys=True) + "\n")
            return expected
        except ProjectionRefusal:
            raise
        except (KeyError, TypeError, ValueError, OSError, sqlite3.Error):
            raise ProjectionRefusal("app_projection_source_unavailable") from None
        finally:
            if connection:
                connection.close()
