"""QA-only finite tool exchange; no production consumer or real credentials."""
import copy
import json

from execution_fixture import (
    FixtureRefusal, SCHEMA, completed_response, response_events,
    validate_request, validate_scenario,
)


def base_scenario(value):
    return {"schema": SCHEMA, **{key: value[key] for key in
            ["model", "max_output_tokens", "marker", "response_text"]}}


def validate_tool_scenario(value):
    fields = {"schema", "model", "max_output_tokens", "marker", "response_text", "function"}
    if not isinstance(value, dict) or set(value) != fields:
        raise FixtureRefusal("tool_scenario_shape")
    if value["schema"] != "qa357.tool-fixture.v1":
        raise FixtureRefusal("tool_scenario_version")
    validate_scenario(base_scenario(value))
    function = value["function"]
    if not isinstance(function, dict) or set(function) != {"name", "call_id", "arguments", "expected_output"}:
        raise FixtureRefusal("tool_function_shape")
    if any(not isinstance(function[key], str) or not function[key] or len(function[key]) > 65536
           for key in ["name", "call_id", "expected_output"]):
        raise FixtureRefusal("tool_function_value")
    def pairs(items):
        result = {}
        for key, item in items:
            if key in result:
                raise ValueError("duplicate")
            result[key] = item
        return result
    def nonfinite(_item):
        raise ValueError("nonfinite")
    try:
        if not isinstance(function["arguments"], str) or len(function["arguments"].encode()) > 65536:
            raise ValueError("size")
        arguments = json.loads(function["arguments"], object_pairs_hook=pairs, parse_constant=nonfinite)
        if not isinstance(arguments, dict):
            raise ValueError("object required")
    except (ValueError, TypeError):
        raise FixtureRefusal("tool_function_arguments") from None
    return copy.deepcopy(value)


class ToolSequence:
    def __init__(self, scenario):
        self.scenario = validate_tool_scenario(scenario)
        self.phase = "initial"

    def accept(self, body):
        if self.phase == "completed":
            raise FixtureRefusal("tool_exchange_completed")
        function = self.scenario["function"]
        inputs = body.get("input", [])
        inputs = inputs if isinstance(inputs, list) else []
        outputs = [item for item in inputs if isinstance(item, dict) and item.get("type") == "function_call_output"]
        if self.phase == "initial" and outputs:
            raise FixtureRefusal("tool_output_before_call")
        tools = body.get("tools", [])
        offers = [tool for tool in tools if isinstance(tool, dict) and tool.get("type") == "function"
                  and tool.get("name") == function["name"]] if isinstance(tools, list) else []
        if len(offers) != 1:
            raise FixtureRefusal("tool_offer")
        if self.phase == "initial":
            response = completed_response(base_scenario(self.scenario), 1)
            response["tools"] = copy.deepcopy(tools)
            response["output"] = [{"id": "fc_qa357_read_1", "type": "function_call", "status": "completed",
                                   **{key: function[key] for key in ["name", "call_id", "arguments"]}}]
            self.phase = "awaiting_output"
            return response
        if not outputs:
            raise FixtureRefusal("tool_output_required")
        if len(outputs) != 1:
            raise FixtureRefusal("tool_output_ambiguous")
        if outputs[0].get("call_id") != function["call_id"]:
            raise FixtureRefusal("tool_call_identity")
        if outputs[0].get("output") != function["expected_output"]:
            raise FixtureRefusal("tool_output_value")
        echoes = [item for item in inputs if isinstance(item, dict) and item.get("type") == "function_call"]
        if len(echoes) > 1 or any(any(item.get(key) != function[key] for key in ["name", "call_id", "arguments"])
                                  for item in echoes):
            raise FixtureRefusal("tool_call_echo")
        response = completed_response(base_scenario(self.scenario), 2)
        response["tools"] = copy.deepcopy(tools)
        self.phase = "completed"
        return response


def tool_events(response):
    if response["output"][0]["type"] != "function_call":
        return response_events(response)
    item = copy.deepcopy(response["output"][0])
    pending = {**copy.deepcopy(response), "status": "in_progress", "output": [], "usage": None}
    identity = {"output_index": 0, "item_id": item["id"]}
    events = [
        {"type": "response.created", "response": pending},
        {"type": "response.output_item.added", "output_index": 0,
         "item": {**copy.deepcopy(item), "status": "in_progress", "arguments": ""}},
        {"type": "response.function_call_arguments.delta", **identity, "delta": item["arguments"]},
        {"type": "response.function_call_arguments.done", **identity, "arguments": item["arguments"]},
        {"type": "response.output_item.done", "output_index": 0, "item": item},
        {"type": "response.completed", "response": copy.deepcopy(response)},
    ]
    return [{**event, "sequence_number": index} for index, event in enumerate(events)]


def serve_tools():
    import argparse
    import base64
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
    import os
    from pathlib import Path
    import signal
    import socket
    import ssl
    import sys
    import threading
    import time

    if sys.platform != "linux" or os.environ.get("QA357_NETNS") != "1":
        raise SystemExit("refuse: disposable Linux network namespace required")
    if {name for _, name in socket.if_nameindex()} != {"lo"}:
        raise SystemExit("refuse: only lo may exist")
    parser = argparse.ArgumentParser()
    for name in ["cert", "key", "scenario", "output", "ready"]:
        parser.add_argument("--" + name, required=True)
    args = parser.parse_args()
    scenario = validate_tool_scenario(json.loads(Path(args.scenario).read_text()))
    sequence = ToolSequence(scenario)
    output, ready = Path(args.output).resolve(), Path(args.ready).resolve()
    for target in [output, ready]:
        target.relative_to(Path(os.environ["QA_OUT"]).resolve())
        if target.exists():
            raise SystemExit("refuse: existing output")
    lock = threading.Lock()
    counts = {"accepted": 0, "refused": 0}

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *_args):
            pass

        def do_GET(self):
            self.handle_wire()

        def do_POST(self):
            self.handle_wire()

        def handle_wire(self):
            length = self.headers.get("Content-Length", "0")
            raw = self.rfile.read(int(length)) if length.isdecimal() and int(length) <= 2 * 1024 * 1024 else b""
            with lock:
                reason, response = None, None
                before = sequence.phase
                try:
                    if self.client_address[0] != "127.0.0.1":
                        raise FixtureRefusal("peer")
                    if len(self.headers.get_all("Host", [])) != 1 or len(self.headers.get_all("Authorization", [])) != 1:
                        raise FixtureRefusal("headers")
                    body = validate_request(self.command, self.path, dict(self.headers.items()), raw, base_scenario(scenario))
                    response = sequence.accept(body)
                except FixtureRefusal as error:
                    reason = str(error)
                counts["refused" if reason else "accepted"] += 1
                status = 400 if reason else 200
                if reason:
                    data = json.dumps({"error": {"type": "fixture_refused", "code": reason,
                                                 "message": "offline tool fixture refused request"}}).encode()
                    content_type = "application/json"
                elif body.get("stream", False):
                    data = b"".join(("event: " + event["type"] + "\ndata: " + json.dumps(event) + "\n\n").encode()
                                    for event in tool_events(response))
                    content_type = "text/event-stream"
                else:
                    data = json.dumps(response).encode()
                    content_type = "application/json"
                receipt = {"at_ns": time.time_ns(), "method": self.command, "path": self.path,
                           "peer": self.client_address[0], "request_sha256": hashlib.sha256(raw).hexdigest(),
                           "request_base64": base64.b64encode(raw).decode(), "refusal": reason,
                           "phase_before": before, "phase_after": sequence.phase, "counts": dict(counts),
                           "status": status, "content_type": content_type,
                           "response_sha256": hashlib.sha256(data).hexdigest(),
                           "response_base64": base64.b64encode(data).decode(), "response": response}
                with output.open("ab") as target:
                    target.write(json.dumps(receipt, sort_keys=True).encode() + b"\n")
                    target.flush()
                    os.fsync(target.fileno())
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(data)
            self.close_connection = True

    import hashlib
    server = ThreadingHTTPServer(("127.0.0.1", 443), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(args.cert, args.key)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    server.timeout = .25
    stopping = threading.Event()
    for sig in [signal.SIGTERM, signal.SIGINT]:
        signal.signal(sig, lambda *_: stopping.set())
    ready.write_text(json.dumps({"pid": os.getpid(), "address": ["127.0.0.1", 443],
                                "scenario_sha256": hashlib.sha256(Path(args.scenario).read_bytes()).hexdigest()}))
    try:
        while not stopping.is_set():
            server.handle_request()
    finally:
        server.server_close()


if __name__ == "__main__":
    serve_tools()
