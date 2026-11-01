"""Real Flask/Store producer, authenticated and closed before writes."""
import json
from copy import deepcopy

import pytest
import app
from tests.test_skeleton_code_admission import code_agent, request, SOURCE
@pytest.fixture
def authenticated_client(monkeypatch, tmp_path):
    monkeypatch.setenv('HOME', str(tmp_path))
    monkeypatch.setenv('UNCHAIN_AUTH_TOKEN', 'skeleton-route-auth')
    return app.create_app().test_client(), {'x-unchain-auth': 'skeleton-route-auth'}


def test_managed_routes_roundtrip_conflict_preflight_and_legacy_refusal(authenticated_client):
    client, headers = authenticated_client
    assert client.get('/skeleton_resources/v2/capabilities').status_code == 401
    caps = client.get('/skeleton_resources/v2/capabilities', headers=headers)
    assert caps.status_code == 200
    assert caps.json['schema'] == 'pupu.skeleton-code-capabilities.v1'
    body = request(code_agent(), [{'node_path': ['nodes', 3], 'text': SOURCE}])
    saved = client.post('/skeleton_resources/v2', headers=headers, json=body)
    assert saved.status_code == 200, saved.json
    fetched = client.get('/skeleton_resources/v2/source-agent', headers=headers)
    assert fetched.json == saved.json
    assert client.get('/skeleton_resources/source-agent', headers=headers).json['error']['code'] == 'source_api_required'
    stale = client.post('/skeleton_resources/v2', headers=headers, json=body)
    assert stale.status_code == 409
    assert stale.json['error']['code'] == 'edit_conflict'
    checked = client.post('/skeleton_resources/v2/source-agent/preflight', headers=headers, json={})
    assert checked.status_code == 200, checked.json
    assert set(checked.json) == {'schema', 'preflight'}
    assert checked.json['preflight']['ok'] is True
    import os
    from pathlib import Path
    if os.environ.get('G1_CAPTURE_FILE'):
        Path(os.environ['G1_CAPTURE_FILE']).write_text(json.dumps({
            'capabilities': caps.json, 'resource': saved.json, 'preflight': checked.json,
            'edit': body}, ensure_ascii=True, indent=2) + '\n')


@pytest.mark.parametrize('change', [lambda b: b.update(extra=True),
    lambda b: b.update(schema='pupu.skeleton-edit.v99'),
    lambda b: b['managed_sources'][0].update(extra=True),
    lambda b: b['managed_sources'][0].update(node_path=['nodes', True]),
    lambda b: b['managed_sources'][0].update(text='\ud800')])
def test_managed_route_rejects_before_creating_resource(authenticated_client, change):
    client, headers = authenticated_client
    body = request(code_agent(), [{'node_path': ['nodes', 3], 'text': SOURCE}]); change(body)
    response = client.post('/skeleton_resources/v2', headers=headers,
        data=json.dumps(body, ensure_ascii=True), content_type='application/json')
    assert response.status_code in (400, 409), response.json
    assert client.get('/skeleton_resources/v2/source-agent', headers=headers).status_code == 404


def test_raw_body_limit_precedes_json_parse(authenticated_client):
    client, headers = authenticated_client
    response = client.post('/skeleton_resources/v2', headers=headers, data=b'x' * (40 * 1024 * 1024 + 1))
    assert response.status_code == 413
    assert response.json['error']['code'] == 'limit_bytes'
