"""Linux-only HTTPS protocol fixture; never imported by production."""
import copy
import hashlib
import hmac
import json

SENTINEL = "qa357-offline-only-not-a-real-key"
SCHEMA = "qa357.openai-fixture.v1"


class FixtureRefusal(ValueError):
    pass


def validate_scenario(value):
    fields = {"schema", "model", "max_output_tokens", "marker", "response_text"}
    if not isinstance(value, dict) or set(value) != fields:
        raise FixtureRefusal("scenario_shape")
    if value["schema"] != SCHEMA:
        raise FixtureRefusal("scenario_version")
    if (any(not isinstance(value[k], str) or not value[k] for k in ["model", "marker", "response_text"])
            or type(value["max_output_tokens"]) is not int
            or not 1 <= value["max_output_tokens"] <= 32768
            or len(value["model"]) > 256 or len(value["marker"]) > 512
            or len(value["response_text"].encode()) > 65536):
        raise FixtureRefusal("scenario_value")
    return copy.deepcopy(value)


def validate_request(method, path, headers, raw, scenario):
    scenario = validate_scenario(scenario)
    if method != "POST":
        raise FixtureRefusal("method")
    if path != "/v1/responses":
        raise FixtureRefusal("path")
    if not isinstance(headers, dict) or any(not isinstance(key, str) for key in headers):
        raise FixtureRefusal("headers")
    normalized = {}
    for key, value in headers.items():
        name = key.lower()
        if name in normalized:
            raise FixtureRefusal("headers")
        normalized[name] = value
    if normalized.get("host") not in {"api.openai.com", "api.openai.com:443"}:
        raise FixtureRefusal("authority")
    auth = normalized.get("authorization", "")
    if not isinstance(auth, str) or not auth.isascii() or not hmac.compare_digest(auth, "Bearer " + SENTINEL):
        raise FixtureRefusal("credential")
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError("duplicate key")
            result[key] = value
        return result
    def nonfinite(_value):
        raise ValueError("nonfinite")
    try:
        if not isinstance(raw, bytes) or len(raw) > 2 * 1024 * 1024:
            raise ValueError("size")
        body = json.loads(raw.decode("utf-8"), object_pairs_hook=pairs, parse_constant=nonfinite)
        if not isinstance(body, dict):
            raise ValueError("object required")
    except (UnicodeError, ValueError, TypeError):
        raise FixtureRefusal("json") from None
    if body.get("model") != scenario["model"]:
        raise FixtureRefusal("model")
    if type(body.get("max_output_tokens")) is not int or body["max_output_tokens"] != scenario["max_output_tokens"]:
        raise FixtureRefusal("output_budget")
    def has_marker(value):
        if isinstance(value, str):
            return scenario["marker"] in value
        if isinstance(value, list):
            return any(has_marker(item) for item in value)
        if isinstance(value, dict):
            return any(has_marker(item) for item in value.values())
        return False
    if not any(has_marker(body.get(k)) for k in ["input", "instructions"]):
        raise FixtureRefusal("marker")
    if type(body.get("stream", False)) is not bool:
        raise FixtureRefusal("stream")
    return body


def completed_response(scenario, sequence):
    scenario = validate_scenario(scenario)
    if type(sequence) is not int or sequence < 1:
        raise FixtureRefusal("sequence")
    return {
        "id": f"resp_qa357_{sequence}", "object": "response", "created_at": 1,
        "status": "completed", "error": None, "incomplete_details": None,
        "model": scenario["model"], "max_output_tokens": scenario["max_output_tokens"],
        "instructions": None, "previous_response_id": None, "store": False,
        "parallel_tool_calls": False, "tool_choice": "auto", "tools": [],
        "temperature": None, "top_p": None, "truncation": "disabled", "metadata": {},
        "output": [{"id": f"msg_qa357_{sequence}", "type": "message", "status": "completed",
                    "role": "assistant", "content": [{"type": "output_text",
                    "text": scenario["response_text"], "annotations": [], "logprobs": []}]}],
        "usage": {"input_tokens": 1, "output_tokens": 1, "total_tokens": 2,
                  "input_tokens_details": {"cached_tokens": 0},
                  "output_tokens_details": {"reasoning_tokens": 0}},
    }


def response_events(response):
    item = copy.deepcopy(response["output"][0])
    text = item["content"][0]["text"]
    pending = {**copy.deepcopy(response), "status": "in_progress", "output": [], "usage": None}
    identity = {"output_index": 0, "item_id": item["id"], "content_index": 0}
    events = [
        {"type": "response.created", "response": pending},
        {"type": "response.output_item.added", "output_index": 0,
         "item": {**copy.deepcopy(item), "status": "in_progress", "content": []}},
        {"type": "response.content_part.added", **identity,
         "part": {"type": "output_text", "text": "", "annotations": [], "logprobs": []}},
        {"type": "response.output_text.delta", **identity, "delta": text, "logprobs": []},
        {"type": "response.output_text.done", **identity, "text": text, "logprobs": []},
        {"type": "response.content_part.done", **identity, "part": copy.deepcopy(item["content"][0])},
        {"type": "response.output_item.done", "output_index": 0, "item": item},
        {"type": "response.completed", "response": copy.deepcopy(response)},
    ]
    return [{**event, "sequence_number": index} for index, event in enumerate(events)]


def serve():
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
    args = argparse.ArgumentParser()
    for name in ["cert", "key", "scenario", "output", "ready"]:
        args.add_argument("--" + name, required=True)
    args = args.parse_args()
    scenario = validate_scenario(json.loads(Path(args.scenario).read_text()))
    output = Path(args.output).resolve()
    ready = Path(args.ready).resolve()
    out_root = Path(os.environ["QA_OUT"]).resolve()
    for path in [output, ready]:
        path.relative_to(out_root)
        if path.exists():
            raise SystemExit("refuse: output already exists")
    lock = threading.Lock()
    counts = {"accepted": 0, "refused": 0}

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *_args):
            pass

        def do_GET(self):
            self.handle_provider_request()

        def do_POST(self):
            self.handle_provider_request()

        def handle_provider_request(self):
            length = self.headers.get("Content-Length", "0")
            raw = self.rfile.read(int(length)) if length.isdecimal() and int(length) <= 2 * 1024 * 1024 else b""
            reason = None
            try:
                if self.client_address[0] != "127.0.0.1":
                    raise FixtureRefusal("peer")
                if len(self.headers.get_all("Host", [])) != 1 or len(self.headers.get_all("Authorization", [])) != 1:
                    raise FixtureRefusal("headers")
                body = validate_request(self.command, self.path, dict(self.headers.items()), raw, scenario)
            except FixtureRefusal as error:
                reason = str(error)
            with lock:
                counts["refused" if reason else "accepted"] += 1
                response = completed_response(scenario, counts["accepted"]) if not reason else None
                receipt = {"at_ns": time.time_ns(), "method": self.command, "path": self.path,
                           "peer": self.client_address[0], "request_sha256": hashlib.sha256(raw).hexdigest(),
                           "request_base64": base64.b64encode(raw).decode(), "refusal": reason,
                           "response": response, "counts": dict(counts)}
                with output.open("ab") as target:
                    target.write(json.dumps(receipt, sort_keys=True).encode() + b"\n")
                    target.flush()
                    os.fsync(target.fileno())
            if reason:
                data = json.dumps({"error": {"type": "fixture_refused", "code": reason,
                                             "message": "offline fixture refused request"}}).encode()
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
            elif body.get("stream", False):
                data = b"".join(("event: " + event["type"] + "\ndata: " + json.dumps(event) + "\n\n").encode()
                                for event in response_events(response))
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
            else:
                data = json.dumps(response).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(data)
            self.close_connection = True

    server = ThreadingHTTPServer(("127.0.0.1", 443), Handler)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(args.cert, args.key)
    # The real client's verified TLS hostname is part of qualification. Do not
    # abort a wrong-name handshake here before the client can reject the cert.
    server.socket = context.wrap_socket(server.socket, server_side=True)
    server.timeout = 0.25
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
    serve()
