"""Explicit-upgrade chat cutover on a real private Store and preserved source."""
from copy import deepcopy
import importlib
import json
from pathlib import Path

import pytest

from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from test_skeleton_legacy_upgrade_save import migrate, recipe, apply, tables


def api():
    return importlib.import_module('skeleton_legacy_chat')


@pytest.fixture
def legacy(tmp_path, monkeypatch):
    monkeypatch.setattr(Path, 'home', lambda: tmp_path)
    store = SkeletonResourceStore()
    original = recipe(name='Old')
    root = tmp_path / '.pupu' / 'agent_recipes'; root.mkdir(parents=True)
    path = root / 'Old.recipe'; path.write_text(json.dumps(original), encoding='utf-8')
    resource, choices = migrate(store, original, identity=str(path))
    return store, resource, choices, path


def test_before_upgrade_keeps_legacy_and_read_only_catalog(legacy):
    store, resource, _, _ = legacy
    before = tables(store)
    options = {'recipe_name': 'Old', 'other': {'a': 1}}
    assert api().resolve_legacy_chat_options(options, store=store) == options
    catalog = api().legacy_chat_catalog(store)
    assert catalog['schema'] == 'pupu.legacy-chat-catalog.v1'
    assert catalog['resources'] == [{'resource_id': resource['id'], 'upgraded': False}]
    assert catalog['aliases'] == [{'source_scope': 'user:agent_recipes', 'legacy_name': 'Old', 'resource_ids': [resource['id']]}]
    assert tables(store) == before


def test_cutover_is_exact_scoped_and_survives_rename_restart(legacy):
    store, resource, choices, source = legacy
    raw = source.read_bytes()
    saved, _ = apply(store, resource, choices)
    before = tables(store)
    options = {'recipe_name': 'Old', 'opaque': ['keep']}
    expected = {'skeleton_selection': {'schema': 'pupu.skeleton_chat_selection.v1', 'kind': 'resource', 'resource_id': resource['id']}, 'opaque': ['keep']}
    assert api().resolve_legacy_chat_options(options, store=store) == expected
    assert options == {'recipe_name': 'Old', 'opaque': ['keep']}
    assert api().resolve_legacy_chat_options({'recipe_name': ' Old'}, store=store) == {'recipe_name': ' Old'}
    assert tables(store) == before
    doc = deepcopy(saved['document']); doc['name'] = 'Native renamed'
    store.save_draft(doc, expected_edit_token=saved['edit_token'])
    reopened = SkeletonResourceStore(store.root)
    assert api().resolve_legacy_chat_options(options, store=reopened) == expected
    assert api().legacy_chat_catalog(reopened)['resources'][0]['upgraded'] is True
    assert source.read_bytes() == raw


@pytest.mark.parametrize('bad', ['archive', 'ambiguous', 'receipt', 'wrong-scope'])
def test_invalid_alias_never_falls_back_to_default(legacy, bad):
    store, resource, choices, _ = legacy
    apply(store, resource, choices)
    if bad == 'archive':
        store.archive(resource['id'], expected_edit_token=store.get_resource(resource['id'])['edit_token'])
    elif bad == 'ambiguous':
        with pytest.raises(SkeletonResourceError):
            migrate(store, recipe(name='Old'), identity='other.recipe')
    elif bad == 'receipt':
        with store._connect() as conn:
            conn.execute("UPDATE store_meta SET value='{}' WHERE key=?", ('pupu.legacy_upgrade.receipt.v1:' + resource['id'],))
    else:
        with store._connect() as conn:
            conn.execute("UPDATE legacy_aliases SET source_scope='user:subagents'")
        assert api().resolve_legacy_chat_options({'recipe_name': 'Old'}, store=store) == {'recipe_name': 'Old'}
        return
    before = tables(store)
    with pytest.raises(SkeletonResourceError):
        api().resolve_legacy_chat_options({'recipe_name': 'Old'}, store=store)
    assert tables(store) == before


def test_native_selection_and_unselected_are_unchanged(legacy):
    store, resource, choices, _ = legacy
    apply(store, resource, choices)
    for options in ({}, {'recipe_name': ''}, {'skeleton_selection': {'kind': 'bogus'}, 'recipe_name': 'Old'}):
        assert api().resolve_legacy_chat_options(options, store=store) == options


def test_start_credentials_follow_alias_only_after_explicit_upgrade(legacy):
    from skeleton_credential_requirements import requirements_for_start
    store, resource, choices, _ = legacy
    query = {'schema': 'pupu.skeleton_credential_query.v1', 'mode': 'start', 'session_id': 'session',
        'owner_chat_id': 'chat', 'interaction_id': '', 'source_attempt_id': '', 'selection': None,
        'recipe_name': 'Old', 'memory_agent_config': None}
    assert requirements_for_start(query, memory_provider='openai', store=store) == {'schema': 'pupu.skeleton_credential_requirements.v1', 'kind': 'not_skeleton'}
    apply(store, resource, choices)
    result = requirements_for_start(query, memory_provider='openai', store=store)
    assert result['kind'] == 'skeleton'
    assert result['profiles'][0]['model'] == 'test-model'


@pytest.mark.parametrize('operation', ['save', 'delete'])
def test_obsolete_writers_cannot_fork_or_delete_upgraded_original(legacy, operation):
    from recipe_loader import save_recipe, delete_recipe
    store, resource, choices, source = legacy
    apply(store, resource, choices)
    before = tables(store); raw = source.read_bytes()
    with pytest.raises(SkeletonResourceError) as exc:
        if operation == 'save': save_recipe(recipe(name='Old', description='fork'))
        else: delete_recipe('Old')
    assert exc.value.code == 'legacy_resource_upgraded'
    assert source.read_bytes() == raw and tables(store) == before


def test_missing_alias_keeps_explicit_old_path_not_default(legacy):
    store, _, _, _ = legacy
    assert api().resolve_legacy_chat_options({'recipe_name': 'Missing'}, store=store) == {'recipe_name': 'Missing'}


def test_authenticated_catalog_and_obsolete_write_errors_are_real_producer(legacy):
    from app import create_app
    store, resource, choices, source = legacy
    saved, _ = apply(store, resource, choices)
    app = create_app(); app.config['UNCHAIN_AUTH_TOKEN'] = 'offline-only'
    client = app.test_client(); headers = {'x-unchain-auth': 'offline-only'}
    url = '/skeleton_resources/legacy_chat_catalog?contract=legacy_chat_v1'
    assert client.get(url).status_code == 401
    for query in ('', '?contract=bad', '?contract=legacy_chat_v1&extra=x', '?contract=legacy_chat_v1&contract=legacy_chat_v1'):
        assert client.get('/skeleton_resources/legacy_chat_catalog' + query, headers=headers).status_code == 400
    before = tables(store); raw = source.read_bytes()
    response = client.get(url, headers=headers)
    assert response.status_code == 200 and response.get_json() == api().legacy_chat_catalog(store)
    for response in (client.post('/agent_recipes', headers=headers, json=recipe(name='Old')),
                     client.delete('/agent_recipes/Old', headers=headers)):
        assert response.status_code == 409
        assert response.get_json()['error']['code'] == 'legacy_resource_upgraded'
    assert source.read_bytes() == raw and tables(store) == before


def test_start_options_keep_host_only_noncopyable_runtime_objects(legacy):
    import threading
    store, resource, choices, _ = legacy
    apply(store, resource, choices)
    lock = threading.Lock()
    result = api().resolve_legacy_chat_options({'recipe_name': 'Old', '_host_runtime': lock}, store=store)
    assert result['_host_runtime'] is lock
