"""Retained v1.4 writer -> current native binary cold resume, over real HTTP.

The historical binary is an immutable existing artifact, never rebuilt. Only
the provider's loopback Ollama transport is substituted. No Main or UI claim.
"""
from copy import deepcopy
from hashlib import sha256
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import http.client
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import threading
import time

from binary_control import workflow_tool_agent


def run_retained_binary_chat():
    out = Path(os.environ['QA_OUT']).resolve()
    out.mkdir(parents=True, exist_ok=True)
    home = out / 'home'; home.mkdir()
    workspace = out / 'workspace'; workspace.mkdir()
    data = home / 'data'
    binaries = {'old': Path(os.environ['QA_OLD_BINARY']), 'new': Path(os.environ['QA_BINARY'])}
    hashes = {'old': 'e0162fc116e3f2970c67bc6c5458d1a305e6404dbb11b6e22db25897cad77ff6',
              'new': os.environ['QA_BINARY_SHA']}
    manifests = {'old': 'sha256:827adc5644e00dbb8e67fe5ecf6f7e88d9f542b1c4aff37744e0311c0acc2fe3',
                 'new': os.environ['QA_MANIFEST']}
    for name, binary in binaries.items(): assert sha256(binary.read_bytes()).hexdigest() == hashes[name]
    requests, wires, processes = [], [], []
    errors = []
    port, provider_port = 15879, 18993
    token = 'sentinel-qa356-retained-http'
    session, owner, original = 'qa356-retained-session', 'qa356-retained-owner', 'qa356-retained-root'
    current = None
    phase = None
    source = lambda tag: "def main(input,context):\n print('source-executed-" + tag + "')\n return {'message':'Source " + tag + "'}\n"

    class Provider(BaseHTTPRequestHandler):
        def log_message(self, *_args): pass
        def do_POST(self):
            raw = self.rfile.read(int(self.headers['Content-Length']))
            body = json.loads(raw)
            record = {'at_ns': time.time_ns(), 'path': self.path, 'body': body, 'request_sha256': sha256(raw).hexdigest()}
            wires.append(record)
            try:
                index = len(wires) - 1
                assert index < 3 and self.path == '/api/chat'
                assert body['model'] == 'qa356-retained' and not self.headers.get('Authorization')
                assert body['options']['num_ctx'] == 8192 and body['options']['num_predict'] == 64
                if index == 0:
                    message = {'role': 'assistant', 'content': '', 'tool_calls': [{'id': 'retained-write', 'type': 'function',
                        'function': {'name': 'write', 'arguments': {'path': str(workspace / 'once.txt'), 'content': 'committed-once'}}}]}
                else:
                    assert (index != 2) or 'Source A' in json.dumps(body), 'new_root_lost_server_history'
                    message = {'role': 'assistant', 'content': 'Kernel finished'}
                frame = {'model': body['model'], 'message': message, 'done': True, 'done_reason': 'stop',
                    'prompt_eval_count': 20, 'eval_count': 5}
                record['response'] = frame
                self.send_response(200); self.send_header('Content-Type', 'application/x-ndjson'); self.end_headers()
                self.wfile.write((json.dumps(frame) + '\n').encode())
            except BaseException as error:
                errors.append(repr(error)); self.send_response(500); self.end_headers()
            finally:
                (out / 'provider-wires.json').write_text(json.dumps(wires, indent=2) + '\n')

    provider = ThreadingHTTPServer(('127.0.0.1', provider_port), Provider)
    provider_thread = threading.Thread(target=provider.serve_forever, daemon=True); provider_thread.start()

    def request(method, path, body=None, authenticated=True):
        payload = None if body is None else json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode()
        headers = {'Content-Type': 'application/json'}
        if authenticated: headers['x-unchain-auth'] = token
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=90)
        started = time.time_ns()
        try:
            connection.request(method, path, payload, headers)
            response = connection.getresponse(); raw = response.read()
            if path == '/chat/stream/v4':
                frames = []
                for block in raw.decode().replace('\r\n', '\n').split('\n\n'):
                    kind = next((line[6:].strip() for line in block.splitlines() if line.startswith('event:')), None)
                    text = '\n'.join(line[5:].lstrip() for line in block.splitlines() if line.startswith('data:'))
                    if kind and text: frames.append({'event': kind, 'data': json.loads(text)})
                value = frames
            else: value = json.loads(raw)
            requests.append({'phase': phase, 'method': method, 'path': path, 'body': body,
                'status': response.status, 'reply': value, 'response_text': raw.decode(),
                'request_sha256': sha256(payload or b'').hexdigest(), 'response_sha256': sha256(raw).hexdigest(),
                'started_ns': started, 'finished_ns': time.time_ns(), 'authenticated': authenticated})
            (out / 'http.json').write_text(json.dumps(requests, indent=2) + '\n')
            return response.status, value
        finally: connection.close()

    def stop():
        nonlocal current
        if current is None: return
        try: os.killpg(current.pid, signal.SIGTERM)
        except ProcessLookupError: pass
        try: current.wait(timeout=8)
        except subprocess.TimeoutExpired: os.killpg(current.pid, signal.SIGKILL); current.wait(timeout=5)
        try: os.killpg(current.pid, signal.SIGKILL)
        except ProcessLookupError: pass
        processes[-1].update(stopped_ns=time.time_ns(), exit=current.returncode)
        current = None
        (out / 'processes.json').write_text(json.dumps(processes, indent=2) + '\n')

    def launch(which):
        nonlocal current, phase
        phase = which
        with socket.socket() as probe: assert probe.connect_ex(('127.0.0.1', port)) != 0, 'listener_not_released'
        env = {'PATH': os.environ['PATH'], 'HOME': str(home), 'TMPDIR': os.environ['TMPDIR'],
            'PYTHONDONTWRITEBYTECODE': '1', 'UNCHAIN_DATA_DIR': str(data), 'UNCHAIN_HOST': '127.0.0.1',
            'UNCHAIN_PORT': str(port), 'UNCHAIN_AUTH_TOKEN': token, 'PUPU_CONTEXT_V2_STORE_OWNER': 'unchain',
            'PUPU_FEATURE_MEMORY_V2': 'all', 'PUPU_MEMORY_V2_MODE': 'all', 'PUPU_MEMORY_V2_CANARY_PERCENT': '100',
            'UNCHAIN_MODEL': 'ollama:environment-decoy', 'OLLAMA_HOST': 'http://127.0.0.1:18994'}
        with (out / (which + '-sidecar.log')).open('wb') as log:
            current = subprocess.Popen([str(binaries[which])], cwd=out, env=env,
                stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        processes.append({'phase': which, 'pid': current.pid, 'started_ns': time.time_ns(), 'sha256': hashes[which]})
        deadline = time.monotonic() + 60
        while True:
            assert current.poll() is None, (which, current.returncode)
            try:
                status, health = request('GET', '/health')
                if status == 200 and health['session_guard_migration']['status'] == 'ready': break
            except OSError: pass
            assert time.monotonic() < deadline, 'readiness_timeout'
            time.sleep(.2)
        assert health['context_memory_v2']['runtime_protocol_manifest']['manifest_digest'] == manifests[which]

    selection = {'schema': 'pupu.skeleton_chat_selection.v1', 'kind': 'resource', 'resource_id': 'pair-workflow-tool-agent'}
    def query(mode, interaction='', source_attempt=''):
        return {'schema': 'pupu.skeleton_credential_query.v1', 'mode': mode, 'session_id': session,
            'owner_chat_id': owner, 'interaction_id': interaction, 'source_attempt_id': source_attempt,
            'selection': selection if mode == 'start' else None, 'recipe_name': '', 'memory_agent_config': None}
    def stream(attempt, *, resume=None):
        options = {'durable_interactions_required': True, 'workspace_root': str(workspace), 'skeleton_credentials': {}}
        q = query('resume' if resume else 'start', resume or '', original if resume else '')
        status, requirements = request('POST', '/skeleton_credentials/requirements', q)
        assert status == 200, requirements
        options['skeleton_credential_scope'] = requirements['scope']
        if not resume: options['skeleton_selection'] = selection
        body = {'threadId': session, 'attempt_id': attempt, 'owner_chat_id': owner,
            'message': 'old run' if attempt == original else 'new run', 'history': [],
            'memory_v2_requested': True, 'trace_level': 'full', 'options': options}
        if resume: body.update(mode='resume_interaction', interaction_id=resume, source_attempt_id=original)
        status, frames = request('POST', '/chat/stream/v4', body)
        assert status == 200 and frames and frames[-1]['event'] == 'done', frames
        assert not frames[-1]['data'].get('error'), frames
        assert not [f for f in frames if f['event'] == 'error' or f['data'].get('type') == 'run.failed'], frames
        return frames

    try:
        launch('old')
        assert request('GET', '/health', authenticated=False)[0] == 401
        assert request('POST', '/skeleton_python_profiles', {'profile_id': 'origin-python',
            'executable': sys.executable, 'expected_edit_token': None})[0] == 200
        document = workflow_tool_agent('unused', 'unused')
        kernel = document['nodes'][1]['config']['kernel']
        kernel['profile'].pop('auth_mode'); kernel['profile'].update(model='qa356-retained', endpoint=f'http://127.0.0.1:{provider_port}')
        kernel['output_tokens'] = 64
        tools = document['nodes'][-1]['config']; tools.pop('workflow_tools')
        tools['toolkits'] = [{'id': 'CoreToolkit', 'enabled_tools': ['write']}]
        code = {'id': 'code', 'type': 'code', 'config': {'execution': {'inputs': [],
            'outputs': [{'name': 'message', 'source': {'kind': 'result', 'path': ['message']}}]},
            'code': {'source': {'kind': 'file', 'path': 'main.py'}, 'environment_profile_id': 'origin-python',
                'timeout_ms': 5000, 'max_result_bytes': 10000, 'max_log_bytes': 10000,
                'result_schema': {'type': 'object', 'properties': {'message': {'type': 'string'}},
                    'required': ['message'], 'additionalProperties': False}}}}
        document['nodes'].insert(2, code)
        document['nodes'][3]['config']['execution']['inputs'][0]['value']['node_id'] = 'code'
        document['edges'] = [e for e in document['edges'] if e['id'] != 'b'] + [
            {'id': 'b1', 'kind': 'flow', 'source_node_id': 'kernel', 'source_port_id': 'out', 'target_node_id': 'code', 'target_port_id': 'in'},
            {'id': 'b2', 'kind': 'flow', 'source_node_id': 'code', 'source_port_id': 'out', 'target_node_id': 'end', 'target_port_id': 'in'}]
        body = {'schema': 'pupu.skeleton-edit.v2', 'document': document, 'expected_edit_token': None,
            'managed_sources': [{'node_path': ['nodes', 2], 'text': source('A')}]}
        status, a = request('POST', '/skeleton_resources/v2', body); assert status == 200, a
        stream(original)
        status, pending = request('GET', '/chat/interactions/pending?session_id=' + session)
        assert status == 200 and pending['status'] == 'awaiting_response' and pending['source_run_id'] == original
        assert not (workspace / 'once.txt').exists() and len(wires) == 1
        changed = {**body, 'document': a['resource']['document'], 'expected_edit_token': a['resource']['edit_token'],
            'managed_sources': [{'node_path': ['nodes', 2], 'text': source('B')}]}
        status, b = request('POST', '/skeleton_resources/v2', changed); assert status == 200, b
        stop(); launch('new')
        status, cold = request('GET', '/chat/interactions/pending?session_id=' + session)
        assert status == 200 and cold['interaction_id'] == pending['interaction_id']
        bad = query('resume', pending['interaction_id'], 'foreign-source')
        assert request('POST', '/skeleton_credentials/requirements', bad)[0] == 409
        status, receipt = request('POST', '/chat/tool/confirmation', {'session_id': session,
            'confirmation_id': pending['interaction_id'], 'approved': True})
        assert status == 200 and receipt['durable'] is True, receipt
        stream('qa356-retained-resume', resume=pending['interaction_id'])
        assert (workspace / 'once.txt').read_text() == 'committed-once' and len(wires) == 2
        assert request('GET', '/chat/interactions/pending?session_id=' + session)[1]['status'] == 'none'
        stream('qa356-new-root')
        assert len(wires) == 3 and not errors
        stop()
        # Inspect only after server shutdown, with the real current readers.
        os.environ['UNCHAIN_DATA_DIR'] = str(data)
        # Same store owner the sidecars ran with (launch env above); the
        # current cold readers refuse the pupu_legacy default.
        os.environ['PUPU_CONTEXT_V2_STORE_OWNER'] = 'unchain'
        from skeleton_production_state import load_launch
        roots = []
        for attempt, tag in ((original, 'A'), ('qa356-new-root', 'B')):
            launch_record = load_launch(session, attempt, expected_owner_chat_id=owner, allow_terminal_stale=True)
            state = launch_record.store.load().state
            assert state['status'] == 'completed' and state['root_committed'] is True
            end = next(row for row in state['completed'] if row['node_id'] == 'end')
            assert launch_record.store.read_json(end['output_ref']) == {'message': 'Source ' + tag}
            actual_manifest = launch_record.descriptor['runtime_manifest']['manifest_digest']
            assert actual_manifest == manifests['old' if tag == 'A' else 'new']
            assert any(row['text'] == source(tag) for row in launch_record.descriptor['code_sources']['closure']['contents'])
            roots.append({'attempt': attempt, 'tag': tag, 'descriptor': launch_record.descriptor, 'state': state})
        (out / 'result.json').write_text(json.dumps({'verdict': 'RETAINED_BINARY_CHAT_ACCEPTED', 'roots': roots,
            'old_binary_sha256': hashes['old'], 'new_binary_sha256': hashes['new'], 'provider_requests': len(wires),
            'real_provider_requests': 0, 'supervisor_cleanup': True, 'processes': processes}, indent=2) + '\n')
    finally:
        stop(); provider.shutdown(); provider.server_close(); provider_thread.join(timeout=5)
        (out / 'fixture-errors.json').write_text(json.dumps(errors, indent=2) + '\n')


if __name__ == '__main__':
    run_retained_binary_chat()
