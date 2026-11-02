"""Real sidecar HTTP source/profile/pin/import round trip, in a loopback-only job.

The graph is a hand-built fixture, not a React capture. This does not run Chat,
Kernel or Code; execution and retained-source effects have a separate pytest cell.
"""
from copy import deepcopy
from hashlib import sha256
import http.client
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time


def workflow():
    return {'schema_version': 1, 'kind': 'workflow', 'id': 'pair-source-workflow', 'name': 'Pair Source Workflow',
        'nodes': [
            {'id': 'start', 'type': 'start', 'config': {'execution': {'outputs': [
                {'name': 'message', 'source': {'kind': 'result', 'path': ['message']}}]}}},
            {'id': 'code', 'type': 'code', 'config': {'execution': {
                'inputs': [{'name': 'value', 'value': {'kind': 'ref', 'node_id': 'start', 'path': ['message']}, 'missing': 'error'}],
                'outputs': [{'name': 'rows', 'source': {'kind': 'result', 'path': ['rows']}}]},
                'code': {'source': {'kind': 'file', 'path': 'fixture.py'}, 'environment_profile_id': 'origin-python',
                    'timeout_ms': 5000, 'max_result_bytes': 10000, 'max_log_bytes': 10000,
                    'result_schema': {'type': 'object', 'properties': {'rows': {'type': 'integer'}},
                        'required': ['rows'], 'additionalProperties': False}}}},
            {'id': 'end', 'type': 'end', 'config': {'execution': {
                'inputs': [{'name': 'rows', 'value': {'kind': 'ref', 'node_id': 'code', 'path': ['rows']}, 'missing': 'error'}],
                'outputs': [{'name': 'rows', 'source': {'kind': 'input', 'path': ['rows']}}]}}}],
        'edges': [
            {'id': 'a', 'kind': 'flow', 'source_node_id': 'start', 'source_port_id': 'out', 'target_node_id': 'code', 'target_port_id': 'in'},
            {'id': 'b', 'kind': 'flow', 'source_node_id': 'code', 'source_port_id': 'out', 'target_node_id': 'end', 'target_port_id': 'in'}]}


def health_ready(health):
    contract = health['contract']
    assert contract['schema'] == 'pupu.runtime-capabilities' and type(contract['version']) is int and contract['version'] == 1, 'binary_contract_shape_mismatch'
    context = health['context_memory_v2']
    assert context['runtime_protocol_manifest']['manifest_digest'] == os.environ['QA_MANIFEST'], 'binary_manifest_mismatch'
    return (health['status'] == 'ok' and context['runtime_protocol_ready'] is True
        and health['session_guard_migration']['status'] == 'ready'
        and contract['capabilities']['runtime_events_v4'] is True
        and contract['capabilities']['durable_jobs']['available'] is True)


def main():
    binary = Path(os.environ['QA_BINARY']).resolve()
    assert sha256(binary.read_bytes()).hexdigest() == os.environ['QA_BINARY_SHA'], 'binary_sha_mismatch'
    out = Path(os.environ['QA_OUT']).resolve()
    out.mkdir(parents=True, exist_ok=True)
    port, token = 15879, 'qa357-ephemeral-http-sentinel'
    records, processes = [], []
    child = None
    source_a = '# café\r\ndef main(input, context):\r\n    return {"rows": 1}\r\n'
    source_b = source_a.replace('"rows": 1', '"rows": 2')

    def request(method, path, body=None, *, authenticated=True):
        payload = None if body is None else json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode()
        headers = {'Content-Type': 'application/json'}
        if authenticated:
            headers['x-unchain-auth'] = token
        connection = http.client.HTTPConnection('127.0.0.1', port, timeout=8)
        started = time.time_ns()
        try:
            connection.request(method, path, payload, headers)
            response = connection.getresponse()
            raw = response.read()
            reply = json.loads(raw)
            records.append({'method': method, 'path': path, 'body': body, 'authenticated': authenticated,
                'status': response.status, 'reply': reply, 'request_sha256': sha256(payload or b'').hexdigest(),
                'response_sha256': sha256(raw).hexdigest(), 'started_ns': started, 'finished_ns': time.time_ns()})
            (out / 'binary-http.json').write_text(json.dumps(records, indent=2) + '\n')
            return response.status, reply
        finally:
            connection.close()

    def launch(label, home):
        nonlocal child
        with socket.socket() as probe:
            probe.settimeout(1)
            assert probe.connect_ex(('127.0.0.1', port)) != 0, 'Port occupied; no launch'
        home.mkdir(parents=True, exist_ok=True)
        temp = out / (label + '-tmp')
        temp.mkdir()
        env = {'PATH': os.environ['PATH'], 'HOME': str(home), 'TMPDIR': str(temp),
            'LANG': 'C.UTF-8', 'PYTHONDONTWRITEBYTECODE': '1', 'UNCHAIN_HOST': '127.0.0.1',
            'UNCHAIN_PORT': str(port), 'UNCHAIN_AUTH_TOKEN': token, 'UNCHAIN_DATA_DIR': str(home / 'data')}
        log = (out / (label + '.log')).open('wb')
        child = subprocess.Popen([str(binary)], cwd=out, env=env, stdout=log,
            stderr=subprocess.STDOUT, start_new_session=True)
        log.close()
        record = {'label': label, 'pid': child.pid, 'started_ns': time.time_ns(), 'home': str(home)}
        processes.append(record)
        (out / 'binary-processes.json').write_text(json.dumps(processes, indent=2) + '\n')
        deadline = time.monotonic() + 60
        while True:
            assert child.poll() is None, ('Sidecar exited', child.returncode)
            try:
                status, health = request('GET', '/health')
                if status == 200 and health_ready(health):
                    break
            except (OSError, http.client.HTTPException):
                pass
            if time.monotonic() >= deadline:
                raise AssertionError('Sidecar readiness timeout')
            time.sleep(.2)
        record['process_table'] = subprocess.check_output(['ps', '-eo', 'pid,ppid,lstart,args'], text=True)

    def stop():
        nonlocal child
        if child is None:
            return
        # PyInstaller's bootloader and server share this task-owned process group.
        # Supervision cleanup is not product-side quit acceptance.
        try:
            os.killpg(child.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            child.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait(timeout=5)
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        deadline = time.monotonic() + 5
        while True:
            with socket.socket() as probe:
                probe.settimeout(.2)
                if probe.connect_ex(('127.0.0.1', port)) != 0:
                    break
            if time.monotonic() > deadline:
                raise AssertionError('Listener survived owned process-group cleanup')
            time.sleep(.1)
        processes[-1].update(exit=child.returncode, stopped_ns=time.time_ns(), supervisor_cleanup=True)
        (out / 'binary-processes.json').write_text(json.dumps(processes, indent=2) + '\n')
        child = None

    try:
        origin_home, destination_home = out / 'origin-home', out / 'destination-home'
        launch('origin-warm', origin_home)
        assert request('GET', '/skeleton_resources/v2/capabilities', authenticated=False)[0] == 401
        assert request('GET', '/skeleton_resources/v2/capabilities')[1]['edit_schema'] == 'pupu.skeleton-edit.v2'
        assert request('GET', '/skeleton_resources/v2/transfer/capabilities')[0] == 200
        status, profile = request('POST', '/skeleton_python_profiles', {
            'profile_id': 'origin-python', 'executable': sys.executable, 'expected_edit_token': None})
        assert status == 200 and profile['available'] is True
        assert request('POST', '/skeleton_python_profiles/origin-python/probe', {})[0] == 200
        body_a = {'schema': 'pupu.skeleton-edit.v2', 'document': workflow(), 'expected_edit_token': None,
            'managed_sources': [{'node_path': ['nodes', 1], 'text': source_a}]}
        status, saved_a = request('POST', '/skeleton_resources/v2', body_a)
        assert status == 200
        identity = saved_a['resource']['id']
        path = '/skeleton_resources/v2/' + identity
        assert request('GET', path) == (200, saved_a)
        assert request('POST', path + '/preflight', {})[1]['preflight']['ok'] is True
        status, version_a = request('POST', path + '/publish', {'schema': 'pupu.skeleton-publish.v2',
            'expected_edit_token': saved_a['resource']['edit_token']})
        assert status == 200 and version_a['contents'][0]['text'] == source_a
        body_b = {'schema': 'pupu.skeleton-edit.v2', 'document': saved_a['resource']['document'],
            'expected_edit_token': saved_a['resource']['edit_token'], 'managed_sources': [{'node_path': ['nodes', 1], 'text': source_b}]}
        status, saved_b = request('POST', '/skeleton_resources/v2', body_b)
        assert status == 200 and saved_b['contents'][0]['text'] == source_b
        status, version_b = request('POST', path + '/publish', {'schema': 'pupu.skeleton-publish.v2',
            'expected_edit_token': saved_b['resource']['edit_token']})
        assert status == 200
        assert version_a['version']['revision_id'] != version_b['version']['revision_id']
        assert request('GET', path + '/versions/' + version_a['version']['revision_id']) == (200, version_a)
        status, stale = request('POST', '/skeleton_resources/v2', body_b)
        assert status == 409 and stale['error']['code'] == 'edit_conflict'
        assert stale['error']['path'] == ['expected_edit_token']
        assert request('GET', path) == (200, saved_b)
        status, exported = request('GET', path + '/export')
        assert status == 200 and sha256(exported['source_json'].encode()).hexdigest() == exported['sha256']
        assert request('GET', '/skeleton_resources/' + identity)[1]['error']['code'] == 'source_api_required'
        stop()

        launch('origin-cold', origin_home)
        assert request('GET', path) == (200, saved_b)
        assert request('GET', path + '/versions/' + version_a['version']['revision_id']) == (200, version_a)
        assert request('GET', path + '/versions/' + version_b['version']['revision_id']) == (200, version_b)
        assert any(row['id'] == 'origin-python' and row['available'] for row in request('GET', '/skeleton_python_profiles')[1]['profiles'])
        stop()

        launch('destination-warm', destination_home)
        assert request('GET', path)[0] == 404
        source = json.loads(exported['source_json'])
        missing = {'schema': 'pupu.skeleton-import.v2', 'source_json': exported['source_json'], 'runtime_bindings': []}
        status, refused = request('POST', '/skeleton_resources/v2/import', missing)
        assert status == 400 and refused['error']['code'] == 'runtime_binding_required'
        assert request('GET', path)[0] == 404
        assert request('POST', '/skeleton_python_profiles', {'profile_id': 'destination-python',
            'executable': sys.executable, 'expected_edit_token': None})[0] == 200
        imported_body = {**missing, 'runtime_bindings': [{'node_path': row['node_path'],
            'environment_profile_id': 'destination-python'} for row in source['sources_manifest']['entries']]}
        status, imported = request('POST', '/skeleton_resources/v2/import', imported_body)
        assert status == 200
        expected = deepcopy(saved_b['resource']['document'])
        expected['nodes'][1]['config']['code']['environment_profile_id'] = 'destination-python'
        assert imported['resource']['document'] == expected
        assert imported['contents'] == saved_b['contents']
        assert imported['sources_manifest'] == saved_b['sources_manifest']
        assert request('POST', '/skeleton_resources/v2/import', imported_body) == (200, imported)
        assert request('POST', path + '/preflight', {})[1]['preflight']['ok'] is True
        stop()

        launch('destination-cold', destination_home)
        assert request('GET', path) == (200, imported)
        assert len({row['pid'] for row in processes}) == 4
        stop()
        (out / 'binary-result.json').write_text(json.dumps({'verdict': 'PASS_BOUNDED',
            'binary': str(binary), 'binary_sha256': sha256(binary.read_bytes()).hexdigest(),
            'manifest': os.environ['QA_MANIFEST'], 'http_requests': len(records),
            'candidate_sha': os.environ['QA_CANDIDATE'], 'processes': processes,
            'fixture_provenance': 'hand-built document; real authenticated HTTP Store producer',
            'not_run': ['App', 'Chat HTTP execution', 'Code execution in binary', 'provider', 'product quit']}, indent=2) + '\n')
    finally:
        stop()


if __name__ == '__main__':
    main()
