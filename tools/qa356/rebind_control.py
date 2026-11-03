"""#356 checkpoint 9: the new fixed pair and old-launch rebind, over real HTTP.

Only the provider's loopback Ollama transport is substituted. QA_PREV_BINARY is
the immutable retained sidecar; QA_BINARY is the one sidecar built from the fix.
Cells run serially, each with its own data directory. No Main or UI claim.
"""
import ctypes
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import http.client
import json
import os
from pathlib import Path
import signal
import socket
import struct
import subprocess
import sys
import threading
import time

from binary_control import workflow_tool_agent

PORT, PROVIDER_PORT = 15881, 18995
TOKEN = 'sentinel-qa356-rebind-http'
OUT = Path(os.environ['QA_OUT']).resolve()
BINARIES = {'previous': Path(os.environ['QA_PREV_BINARY']), 'new': Path(os.environ['QA_BINARY'])}
HASHES = {'previous': os.environ.get('QA_PREV_BINARY_SHA', ''), 'new': os.environ.get('QA_BINARY_SHA', '')}
SELECTED = ['core']  # the default global selection; the App payload itself is not captured here
REPLY = 'Kernel finished'


def owner(session):
    # Chat admission is sticky to one session per owner.
    return session + '-owner'


def selection(resource):
    return {'schema': 'pupu.skeleton_chat_selection.v1', 'kind': 'resource', 'resource_id': resource}


class FileWrites:
    """Physical write events for one workspace, observed outside the sidecar."""

    def __init__(self, root):
        self.events, self.fd, self.thread = [], None, None
        if sys.platform != 'linux':
            return
        self.libc = ctypes.CDLL('libc.so.6', use_errno=True)
        self.fd = self.libc.inotify_init1(os.O_NONBLOCK)
        # IN_CLOSE_WRITE | IN_MOVED_TO | IN_CREATE
        assert self.libc.inotify_add_watch(self.fd, str(root).encode(), 0x8 | 0x80 | 0x100) >= 0
        self.stopped = threading.Event()
        self.thread = threading.Thread(target=self._read, daemon=True); self.thread.start()

    def _read(self):
        while not self.stopped.is_set():
            try: raw = os.read(self.fd, 65536)
            except BlockingIOError:
                time.sleep(.02); continue
            at = 0
            while at < len(raw):
                _wd, mask, _cookie, size = struct.unpack_from('iIII', raw, at)
                name = raw[at + 16:at + 16 + size].rstrip(b'\0').decode()
                self.events.append({'at_ns': time.time_ns(), 'mask': mask, 'name': name}); at += 16 + size

    def close(self):
        if self.fd is not None:
            time.sleep(.3); self.stopped.set(); self.thread.join(timeout=2); os.close(self.fd)
        return self.events


class Cell:
    def __init__(self, name, responder):
        self.dir = OUT / name; self.dir.mkdir(parents=True)
        self.home = self.dir / 'home'; self.home.mkdir()
        self.data = self.home / 'data'
        self.workspace = self.dir / 'workspace'; self.workspace.mkdir()
        self.requests, self.wires, self.processes, self.errors = [], [], [], []
        self.current, self.phase = None, None
        cell = self

        class Provider(BaseHTTPRequestHandler):
            def log_message(self, *_args): pass
            def do_POST(self):
                raw = self.rfile.read(int(self.headers['Content-Length']))
                body = json.loads(raw)
                record = {'at_ns': time.time_ns(), 'path': self.path, 'body': body, 'request_sha256': sha256(raw).hexdigest()}
                cell.wires.append(record)
                try:
                    assert self.path == '/api/chat' and not self.headers.get('Authorization')
                    frame = {'model': body['model'], 'message': responder(len(cell.wires) - 1, body), 'done': True,
                        'done_reason': 'stop', 'prompt_eval_count': 20, 'eval_count': 5}
                    record['response'] = frame
                    self.send_response(200); self.send_header('Content-Type', 'application/x-ndjson'); self.end_headers()
                    self.wfile.write((json.dumps(frame) + '\n').encode())
                except BaseException as error:
                    cell.errors.append(repr(error)); self.send_response(500); self.end_headers()
                finally:
                    (cell.dir / 'provider-wires.json').write_text(json.dumps(cell.wires, indent=2) + '\n')

        self.provider = ThreadingHTTPServer(('127.0.0.1', PROVIDER_PORT), Provider)
        self.provider_thread = threading.Thread(target=self.provider.serve_forever, daemon=True)
        self.provider_thread.start()

    def request(self, method, path, body=None):
        payload = None if body is None else json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode()
        connection = http.client.HTTPConnection('127.0.0.1', PORT, timeout=120)
        started = time.time_ns()
        try:
            connection.request(method, path, payload, {'Content-Type': 'application/json', 'x-unchain-auth': TOKEN})
            response = connection.getresponse(); raw = response.read()
            if path == '/chat/stream/v4' and response.status == 200:
                value = []
                for block in raw.decode().replace('\r\n', '\n').split('\n\n'):
                    kind = next((line[6:].strip() for line in block.splitlines() if line.startswith('event:')), None)
                    text = '\n'.join(line[5:].lstrip() for line in block.splitlines() if line.startswith('data:'))
                    if kind and text: value.append({'event': kind, 'data': json.loads(text)})
            else:
                value = json.loads(raw)
            self.requests.append({'phase': self.phase, 'method': method, 'path': path, 'body': body, 'status': response.status,
                'reply': value, 'response_sha256': sha256(raw).hexdigest(), 'started_ns': started, 'finished_ns': time.time_ns()})
            (self.dir / 'http.json').write_text(json.dumps(self.requests, indent=2) + '\n')
            return response.status, value
        finally:
            connection.close()

    def launch(self, which):
        self.phase = which
        with socket.socket() as probe: assert probe.connect_ex(('127.0.0.1', PORT)) != 0, 'listener_not_released'
        digest = sha256(BINARIES[which].read_bytes()).hexdigest()
        if HASHES[which]: assert digest == HASHES[which], (which, digest)
        env = {'PATH': os.environ['PATH'], 'HOME': str(self.home), 'TMPDIR': os.environ['TMPDIR'],
            'PYTHONDONTWRITEBYTECODE': '1', 'UNCHAIN_DATA_DIR': str(self.data), 'UNCHAIN_HOST': '127.0.0.1',
            'UNCHAIN_PORT': str(PORT), 'UNCHAIN_AUTH_TOKEN': TOKEN, 'PUPU_CONTEXT_V2_STORE_OWNER': 'unchain',
            'PUPU_FEATURE_MEMORY_V2': 'all', 'PUPU_MEMORY_V2_MODE': 'all', 'PUPU_MEMORY_V2_CANARY_PERCENT': '100',
            'UNCHAIN_MODEL': 'ollama:environment-decoy', 'OLLAMA_HOST': 'http://127.0.0.1:18996'}
        with (self.dir / (which + '-sidecar.log')).open('ab') as log:
            self.current = subprocess.Popen([str(BINARIES[which])], cwd=self.dir, env=env,
                stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        self.processes.append({'phase': which, 'pid': self.current.pid, 'started_ns': time.time_ns(), 'sha256': digest})
        deadline = time.monotonic() + 90
        while True:
            assert self.current.poll() is None, (which, self.current.returncode)
            try:
                status, health = self.request('GET', '/health')
                if status == 200 and health['session_guard_migration']['status'] == 'ready': break
            except OSError: pass
            assert time.monotonic() < deadline, 'readiness_timeout'
            time.sleep(.2)
        assert health['context_memory_v2']['runtime_protocol_manifest']['manifest_digest'] == os.environ['QA_MANIFEST']

    def stop(self):
        if self.current is None: return
        try: os.killpg(self.current.pid, signal.SIGTERM)
        except ProcessLookupError: pass
        try: self.current.wait(timeout=8)
        except subprocess.TimeoutExpired:
            os.killpg(self.current.pid, signal.SIGKILL); self.current.wait(timeout=5)
        try: os.killpg(self.current.pid, signal.SIGKILL)
        except ProcessLookupError: pass
        self.processes[-1].update(stopped_ns=time.time_ns(), exit=self.current.returncode)
        self.current = None
        (self.dir / 'processes.json').write_text(json.dumps(self.processes, indent=2) + '\n')

    def close(self):
        self.stop(); self.provider.shutdown(); self.provider.server_close(); self.provider_thread.join(timeout=5)
        (self.dir / 'fixture-errors.json').write_text(json.dumps(self.errors, indent=2) + '\n')

    def stream(self, session, attempt, resource, *, workspace, resume=None, source=None):
        """One chat request. Returns (status, reply); the caller decides what is expected."""
        query = {'schema': 'pupu.skeleton_credential_query.v1', 'mode': 'resume' if resume else 'start',
            'session_id': session, 'owner_chat_id': owner(session), 'interaction_id': resume or '',
            'source_attempt_id': source or '', 'selection': None if resume else selection(resource),
            'recipe_name': '', 'memory_agent_config': None}
        status, required = self.request('POST', '/skeleton_credentials/requirements', query)
        assert status == 200, required
        options = {'durable_interactions_required': True, 'skeleton_credentials': {}, 'toolkits': SELECTED}
        if 'scope' in required:  # absent once the interaction has settled
            options['skeleton_credential_scope'] = required['scope']
        if workspace: options['workspace_root'] = str(self.workspace)
        if not resume: options['skeleton_selection'] = selection(resource)
        body = {'threadId': session, 'attempt_id': attempt, 'owner_chat_id': owner(session), 'message': 'rebind run',
            'history': [], 'memory_v2_requested': True, 'trace_level': 'full', 'options': options}
        if resume: body.update(mode='resume_interaction', interaction_id=resume, source_attempt_id=source)
        return self.request('POST', '/chat/stream/v4', body)

    def save(self, document, sources=()):
        status, saved = self.request('POST', '/skeleton_resources/v2', {'schema': 'pupu.skeleton-edit.v2', 'document': document,
            'expected_edit_token': None, 'managed_sources': list(sources)})
        assert status == 200, saved
        return saved['resource']

    def publish(self, document, sources=()):
        resource = self.save(document, sources)
        status, version = self.request('POST', '/skeleton_resources/v2/' + resource['id'] + '/publish',
            {'schema': 'pupu.skeleton-publish.v2', 'expected_edit_token': resource['edit_token']})
        assert status == 200, version
        return {'workflow_id': resource['id'], 'revision_id': version['version']['revision_id']}


def ok(frames):
    return (type(frames) is list and frames and frames[-1]['event'] == 'done' and not frames[-1]['data'].get('error')
        and not [f for f in frames if f['event'] == 'error' or f['data'].get('type') == 'run.failed'])


def refusal_text(reply):
    return json.dumps(reply, ensure_ascii=False)


def kernel_agent(resource, *, tools=True):
    document = workflow_tool_agent('unused', 'unused')
    document['id'], document['name'] = resource, resource
    profile = document['nodes'][1]['config']['kernel']['profile']
    profile.pop('auth_mode'); profile.update(model='qa356-rebind', endpoint=f'http://127.0.0.1:{PROVIDER_PORT}')
    document['nodes'][-1]['config'].pop('workflow_tools')
    return document


def tool_workflow(resource, path, content):
    export = lambda name, kind, where: {'name': name, 'source': {'kind': kind, 'path': where}}
    literal = lambda name, value: {'name': name, 'value': {'kind': 'literal', 'value': value}, 'missing': 'error'}
    return {'schema_version': 1, 'kind': 'workflow', 'id': resource, 'name': resource, 'nodes': [
        {'id': 'start', 'type': 'start', 'config': {'execution': {'outputs': [export('value', 'result', ['value'])]}}},
        {'id': 'tool', 'type': 'tool_call', 'config': {'execution': {
            'inputs': [literal('path', path), literal('content', content)],
            'outputs': [export('ok', 'result', ['ok'])]},
            'tool': {'name': 'write', 'on_error': 'stop', 'approval_timeout_ms': 600000}}},
        {'id': 'end', 'type': 'end', 'config': {'execution': {
            'inputs': [{'name': 'ok', 'value': {'kind': 'ref', 'node_id': 'tool', 'path': ['ok']}, 'missing': 'error'}],
            'outputs': [export('ok', 'input', ['ok'])]}}}],
        'edges': [
            {'id': 'a', 'kind': 'flow', 'source_node_id': 'start', 'source_port_id': 'out', 'target_node_id': 'tool', 'target_port_id': 'in'},
            {'id': 'b', 'kind': 'flow', 'source_node_id': 'tool', 'source_port_id': 'out', 'target_node_id': 'end', 'target_port_id': 'in'}]}


def call_step(document, ref):
    document['nodes'].insert(1, {'id': 'invoke', 'type': 'workflow_call', 'config': {'workflow': ref, 'execution': {
        'inputs': [{'name': 'value', 'value': {'kind': 'literal', 'value': 'fixed'}, 'missing': 'error'}],
        'outputs': [{'name': 'ok', 'source': {'kind': 'result', 'path': ['ok']}}]}}})
    document['edges'][0]['target_node_id'] = 'invoke'
    document['edges'].append({'id': 'call-kernel', 'kind': 'flow', 'source_node_id': 'invoke', 'source_port_id': 'out',
        'target_node_id': 'kernel', 'target_port_id': 'in'})
    return document


def code_workflow_tool(cell):
    assert cell.request('POST', '/skeleton_python_profiles', {'profile_id': 'origin-python', 'executable': sys.executable,
        'expected_edit_token': None})[0] == 200
    export = lambda name, kind, where: {'name': name, 'source': {'kind': kind, 'path': where}}
    document = {'schema_version': 1, 'kind': 'workflow', 'id': 'unused-core-code', 'name': 'Code', 'nodes': [
        {'id': 'start', 'type': 'start', 'config': {'execution': {'outputs': [export('value', 'result', ['value'])]}}},
        {'id': 'code', 'type': 'code', 'config': {'execution': {'inputs': [],
            'outputs': [export('receipt', 'result', ['receipt'])]},
            'code': {'source': {'kind': 'file', 'path': 'main.py'}, 'environment_profile_id': 'origin-python',
                'timeout_ms': 5000, 'max_result_bytes': 10000, 'max_log_bytes': 10000,
                'result_schema': {'type': 'object', 'properties': {'receipt': {'type': 'string'}},
                    'required': ['receipt'], 'additionalProperties': False}}}},
        {'id': 'end', 'type': 'end', 'config': {'execution': {
            'inputs': [{'name': 'receipt', 'value': {'kind': 'ref', 'node_id': 'code', 'path': ['receipt']}, 'missing': 'error'}],
            'outputs': [export('receipt', 'input', ['receipt'])]}}}],
        'edges': [
            {'id': 'a', 'kind': 'flow', 'source_node_id': 'start', 'source_port_id': 'out', 'target_node_id': 'code', 'target_port_id': 'in'},
            {'id': 'b', 'kind': 'flow', 'source_node_id': 'code', 'source_port_id': 'out', 'target_node_id': 'end', 'target_port_id': 'in'}]}
    text = "def main(input, context):\n    return {'receipt': 'unused'}\n"
    return cell.publish(document, [{'node_path': ['nodes', 1], 'text': text}])


def saved_unused_core_graphs(cell):
    """Graphs that never read the selected catalog, one of them shaped like the B4 Agent."""
    plain = kernel_agent('unused-core-plain')
    cell.save(plain)
    shaped = kernel_agent('unused-core-workflow-tool')
    shaped['nodes'][-1]['config']['workflow_tools'] = [{'id': 'run_code', 'workflow': code_workflow_tool(cell)}]
    cell.save(shaped)
    return [plain['id'], shaped['id']]


def text_reply(index, body):
    return {'role': 'assistant', 'content': REPLY}


def cell_previous_refuses_unused_core():
    """Control: the retained sidecar shows the defect the fix removes."""
    cell = Cell('a0-previous-refuses', text_reply)
    rows = []
    try:
        cell.launch('previous')
        for resource in saved_unused_core_graphs(cell):
            status, reply = cell.stream('a0-' + resource, 'a0-root-' + resource, resource, workspace=False)
            assert 'workspace_unavailable' in refusal_text(reply) or 'explicitly authorized workspace' in refusal_text(reply), reply
            rows.append({'resource': resource, 'status': status, 'refused': True})
        assert not cell.wires
    finally: cell.close()
    return {'cases': rows, 'provider_requests': len(cell.wires)}


def cell_new_accepts_unused_core():
    cell = Cell('a1-new-accepts', text_reply)
    rows = []
    try:
        cell.launch('new')
        for resource in saved_unused_core_graphs(cell):
            before = len(cell.wires)
            status, reply = cell.stream('a1-' + resource, 'a1-root-' + resource, resource, workspace=False)
            assert status == 200 and ok(reply), reply
            assert len(cell.wires) == before + 1 and REPLY in refusal_text(reply), reply
            rows.append({'resource': resource, 'status': status, 'provider_requests': len(cell.wires) - before})
        assert not cell.errors
    finally: cell.close()
    return {'cases': rows, 'provider_requests': len(cell.wires)}


def cell_new_still_refuses_needed_core():
    """Negative: a closure that really needs Core stays refused before any model call."""
    cell = Cell('a2-new-refuses-needed', text_reply)
    try:
        cell.launch('new')
        ref = cell.publish(tool_workflow('needs-core', str(cell.workspace / 'never.txt'), 'never'))
        cell.save(call_step(kernel_agent('needs-core-agent'), ref))
        status, reply = cell.stream('a2-session', 'a2-root', 'needs-core-agent', workspace=False)
        assert 'workspace_unavailable' in refusal_text(reply) or 'explicitly authorized workspace' in refusal_text(reply), reply
        assert not cell.wires and not (cell.workspace / 'never.txt').exists()
    finally: cell.close()
    return {'status': status, 'provider_requests': len(cell.wires), 'file_created': False}


def cell_previous_launch_rebinds():
    """Positive control: 712039ef parks at a global-Core Tool Call; the new binary resumes it."""
    cell = Cell('b-previous-launch-rebind', text_reply)
    session, root, resource = 'b-rebind-session', 'b-rebind-root', 'rebind-agent'
    target = cell.workspace / 'once.txt'
    writes = FileWrites(cell.workspace)
    try:
        cell.launch('previous')
        ref = cell.publish(tool_workflow('rebind-tool', str(target), 'committed-once'))
        document = call_step(kernel_agent(resource), ref)
        assert document['nodes'][-1]['config']['toolkits'] == []  # only the global selection can supply `write`
        cell.save(document)
        status, reply = cell.stream(session, root, resource, workspace=True)
        assert status == 200 and ok(reply), reply
        status, pending = cell.request('GET', '/chat/interactions/pending?session_id=' + session)
        assert status == 200 and pending['status'] == 'awaiting_response' and pending['source_run_id'] == root, pending
        assert 'write' in json.dumps(pending) and not target.exists() and not cell.wires
        cell.stop()
        launch_files = sorted(str(p.relative_to(cell.data)) for p in cell.data.rglob('*') if p.is_file() and 'launch' in p.name)
        (cell.dir / 'launch-files.json').write_text(json.dumps(launch_files, indent=2) + '\n')

        cell.launch('new')
        status, cold = cell.request('GET', '/chat/interactions/pending?session_id=' + session)
        assert status == 200 and cold['interaction_id'] == pending['interaction_id'], cold
        assert not target.exists()
        foreign = {'schema': 'pupu.skeleton_credential_query.v1', 'mode': 'resume', 'session_id': session, 'owner_chat_id': owner(session),
            'interaction_id': pending['interaction_id'], 'source_attempt_id': 'foreign-source', 'selection': None,
            'recipe_name': '', 'memory_agent_config': None}
        assert cell.request('POST', '/skeleton_credentials/requirements', foreign)[0] == 409
        status, receipt = cell.request('POST', '/chat/tool/confirmation', {'session_id': session,
            'confirmation_id': pending['interaction_id'], 'approved': True})
        assert status == 200 and receipt['durable'] is True, receipt
        status, reply = cell.stream(session, 'b-rebind-resume', resource, workspace=True,
                                    resume=pending['interaction_id'], source=root)
        assert status == 200 and ok(reply), reply
        assert target.read_text() == 'committed-once' and len(cell.wires) == 1
        assert cell.request('GET', '/chat/interactions/pending?session_id=' + session)[1]['status'] == 'none'
        # Repeat the same approval and resume: neither may run the tool again.
        target.write_text('tampered-after-commit')
        repeat_confirmation = cell.request('POST', '/chat/tool/confirmation', {'session_id': session,
            'confirmation_id': pending['interaction_id'], 'approved': True})
        repeat_resume = cell.stream(session, 'b-rebind-repeat', resource, workspace=True,
                                    resume=pending['interaction_id'], source=root)
        assert target.read_text() == 'tampered-after-commit' and len(cell.wires) == 1, repeat_resume
        cell.stop()
        os.environ['UNCHAIN_DATA_DIR'] = str(cell.data)
        os.environ['PUPU_CONTEXT_V2_STORE_OWNER'] = 'unchain'
        from skeleton_production_state import load_launch
        launch = load_launch(session, root, expected_owner_chat_id=owner(session), allow_terminal_stale=True)
        state = launch.store.load().state
        assert state['status'] == 'completed' and state['root_committed'] is True, state
        assert launch.descriptor['capabilities']['toolkits'] == ['core'], launch.descriptor['capabilities']
        assert launch.descriptor['runtime_manifest']['manifest_digest'] == os.environ['QA_MANIFEST']
        assert sum(row['node_id'] == 'invoke' for row in state['completed']) == 1
        events = writes.close()
        if sys.platform == 'linux':
            writes_once = [row for row in events if row['name'] == 'once.txt' and row['mask'] & 0x88]
            (cell.dir / 'file-events.json').write_text(json.dumps(events, indent=2) + '\n')
            # One product commit, plus the harness's own tamper write above.
            assert len(writes_once) == 2, events
        assert not cell.errors
    finally: cell.close()
    return {'interaction_id': pending['interaction_id'], 'provider_requests': len(cell.wires),
        'repeat_confirmation_status': repeat_confirmation[0], 'repeat_resume_status': repeat_resume[0],
        'capabilities': launch.descriptor['capabilities'], 'state_status': state['status']}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    result = {}
    for name, cell in (('a0_previous_refuses_unused_core', cell_previous_refuses_unused_core),
                       ('a1_new_accepts_unused_core', cell_new_accepts_unused_core),
                       ('a2_new_refuses_needed_core', cell_new_still_refuses_needed_core),
                       ('b_previous_launch_rebinds', cell_previous_launch_rebinds)):
        result[name] = cell()
        (OUT / 'result.json').write_text(json.dumps({'verdict': 'INCOMPLETE', 'cells': result}, indent=2) + '\n')
    (OUT / 'result.json').write_text(json.dumps({'verdict': 'REBIND_ACCEPTED', 'cells': result, 'real_provider_requests': 0,
        'previous_binary_sha256': HASHES['previous'], 'new_binary_sha256': HASHES['new']}, indent=2) + '\n')


if __name__ == '__main__':
    main()
