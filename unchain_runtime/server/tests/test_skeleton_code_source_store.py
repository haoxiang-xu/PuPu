"""Aggregate storage qualification; real SQLite, no routes or provider SDK."""
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from hashlib import sha256
import json
import sqlite3
from threading import Barrier

import pytest

from skeleton_code_sources import ManagedCodeSourceResolver
from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from tests.test_skeleton_code_sources import edit


@pytest.fixture
def store(tmp_path):
    return SkeletonResourceStore(tmp_path / 'skeletons')


def response_snapshot(value):
    # Strict consumer record assembled from real response; not a mocked store.
    assert set(value) == {'schema', 'resource', 'sources_manifest', 'contents', 'content_digest'}
    assert value['schema'] == 'pupu.skeleton-resource.v2'
    assert set(value['resource']) == {'id', 'kind', 'name', 'description', 'archived',
                                     'edit_token', 'draft_digest', 'source_identity',
                                     'document', 'diagnostics'}
    return {'schema': 'pupu.skeleton-code-snapshot.v1',
            'document': value['resource']['document'],
            **{key: value[key] for key in ('sources_manifest', 'contents', 'content_digest')}}


def next_edit(saved, text='def main(input, context):\n    return {"rows": 7}\n'):
    value = edit(text)
    value['document'] = deepcopy(saved['resource']['document'])
    value['expected_edit_token'] = saved['resource']['edit_token']
    return value


def logical_state(store):
    with store._connect() as connection:
        tables = connection.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
        return {row['name']: [tuple(item) for item in connection.execute(
            'SELECT * FROM "' + row['name'] + '" ORDER BY rowid').fetchall()]
                for row in tables}


def schema(store):
    with store._connect() as connection:
        return connection.execute("SELECT value FROM store_meta WHERE key='schema'").fetchone()['value']


def test_first_save_returns_stored_aggregate_and_cold_reopen(store):
    request = edit('# café\r\ndef main(input, context):\r\n    return {"rows": 5}\r\n')
    saved = store.save_managed_draft(request)
    frame = response_snapshot(saved)
    node = frame['document']['nodes'][1]
    resolved = ManagedCodeSourceResolver(frame)(node['config']['code']['source']['path'])
    assert resolved.content == request['managed_sources'][0]['text'].encode('utf-8')
    assert resolved.sha256 == sha256(resolved.content).hexdigest()
    assert saved['resource']['draft_digest'] == sha256(json.dumps(
        frame['document'], ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    reopened = SkeletonResourceStore(store.root).get_managed_resource(saved['resource']['id'])
    assert reopened == saved
    assert schema(store) == 'pupu.skeleton_resource_store.v3'


def test_old_graph_read_can_be_explicitly_upgraded_and_unrelated_resource_stays_v1(store):
    request = edit()
    legacy = store.save_draft(request['document'])
    empty = store.get_managed_resource(legacy['id'])
    assert empty['contents'] == [] and empty['sources_manifest']['entries'] == []
    assert schema(store) == 'pupu.skeleton_resource_store.v1'
    request['expected_edit_token'] = legacy['edit_token']
    store.save_managed_draft(request)
    sibling = deepcopy(request['document']); sibling['id'] = 'unrelated'
    row = store.save_draft(sibling)
    assert store.get_resource('unrelated') == row
    row = store.rename('unrelated', 'Renamed', expected_edit_token=row['edit_token'])
    assert row['name'] == 'Renamed'
    row = store.archive('unrelated', expected_edit_token=row['edit_token'])
    assert row['archived'] is True
    row = store.restore('unrelated', expected_edit_token=row['edit_token'])
    store.delete('unrelated', expected_edit_token=row['edit_token'])


def test_stale_cas_and_missing_create_token_leave_no_new_blobs(store):
    saved = store.save_managed_draft(edit())
    stale = next_edit(saved)
    newer = store.save_managed_draft(next_edit(saved, 'new text'))
    before = logical_state(store)
    for value in [stale, edit('create on occupied id')]:
        with pytest.raises(SkeletonResourceError) as caught:
            store.save_managed_draft(value)
        assert caught.value.code == 'edit_conflict'
        assert logical_state(store) == before
    assert store.get_managed_resource(newer['resource']['id']) == newer


def test_real_concurrent_writers_only_one_commits(store):
    saved = store.save_managed_draft(edit())
    requests = [next_edit(saved, 'first'), next_edit(saved, 'second')]
    ready = Barrier(2)
    def save(value):
        ready.wait(timeout=5)
        try:
            return store.save_managed_draft(value)
        except SkeletonResourceError as error:
            return error.code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(save, requests))
    assert sum(type(value) is dict for value in results) == 1
    assert results.count('edit_conflict') == 1
    winner = next(value for value in results if type(value) is dict)
    assert store.get_managed_resource(winner['resource']['id']) == winner
    with store._connect() as connection:
        assert connection.execute('SELECT count(*) FROM code_source_blobs').fetchone()[0] == 2


def test_same_content_save_still_moves_token_and_does_not_duplicate_blob(store):
    first = store.save_managed_draft(edit())
    request = next_edit(first, edit()['managed_sources'][0]['text'])
    second = store.save_managed_draft(request)
    assert first['resource']['document'] == second['resource']['document']
    assert first['content_digest'] == second['content_digest']
    assert first['resource']['edit_token'] != second['resource']['edit_token']
    with store._connect() as connection:
        assert connection.execute('SELECT count(*) FROM code_source_blobs').fetchone()[0] == 1


@pytest.mark.parametrize('operation', ['read', 'save', 'import', 'rename', 'duplicate',
                                     'archive', 'restore', 'delete', 'preflight', 'convert'])
def test_graph_only_operations_refuse_managed_row_without_mutation(store, operation):
    saved = store.save_managed_draft(edit())
    row = saved['resource']; document = row['document']; identity = row['id']; token = row['edit_token']
    calls = {'read': lambda: store.get_resource(identity),
             'save': lambda: store.save_draft(document, expected_edit_token=token),
             'import': lambda: store.import_resource(document),
             'rename': lambda: store.rename(identity, 'Other', expected_edit_token=token),
             'duplicate': lambda: store.duplicate(identity, new_id='copy', name='Copy'),
             'archive': lambda: store.archive(identity, expected_edit_token=token),
             'restore': lambda: store.restore(identity, expected_edit_token=token),
             'delete': lambda: store.delete(identity, expected_edit_token=token),
             'preflight': lambda: store.preflight(identity),
             'convert': lambda: store.convert_legacy_pools(identity, expected_edit_token=token)}
    before = logical_state(store)
    with pytest.raises(SkeletonResourceError) as caught:
        calls[operation]()
    assert caught.value.code == 'source_api_required'
    assert caught.value.status == 409
    assert logical_state(store) == before


def test_managed_workflow_cannot_publish_through_graph_only_path(store):
    request = edit(); request['document']['kind'] = 'workflow'
    saved = store.save_managed_draft(request)
    before = logical_state(store)
    with pytest.raises(SkeletonResourceError, match='source') as caught:
        store.publish_workflow(saved['resource']['id'], expected_edit_token=saved['resource']['edit_token'])
    assert caught.value.code == 'source_api_required'
    assert logical_state(store) == before


def test_omitting_a_still_managed_path_is_not_source_removal_even_after_reorder(store):
    saved = store.save_managed_draft(edit())
    for reorder in [False, True]:
        value = next_edit(saved); value['managed_sources'] = []
        if reorder:
            value['document']['nodes'] = list(reversed(value['document']['nodes']))
        before = logical_state(store)
        with pytest.raises(SkeletonResourceError) as caught:
            store.save_managed_draft(value)
        assert caught.value.code == 'managed_source_required'
        assert logical_state(store) == before


def test_explicit_source_change_can_remove_binding_but_keeps_immutable_old_blob(store):
    saved = store.save_managed_draft(edit())
    value = next_edit(saved); value['managed_sources'] = []
    value['document']['nodes'][1]['config']['code']['source'] = {'kind': 'file', 'path': 'external.py'}
    updated = store.save_managed_draft(value)
    assert updated['contents'] == [] and updated['sources_manifest']['entries'] == []
    assert updated['resource']['document'] == value['document']
    with store._connect() as connection:
        assert connection.execute('SELECT count(*) FROM code_source_blobs').fetchone()[0] == 1
    with pytest.raises(SkeletonResourceError) as caught:
        store.get_resource(saved['resource']['id'])
    assert caught.value.code == 'source_api_required'


def test_shared_content_is_immutable_across_resource_edits(store):
    first = store.save_managed_draft(edit())
    value = edit(); value['document']['id'] = 'other'
    other = store.save_managed_draft(value)
    store.save_managed_draft(next_edit(first, 'different'))
    assert store.get_managed_resource('other') == other
    with store._connect() as connection:
        with pytest.raises(sqlite3.DatabaseError):
            connection.execute('UPDATE code_source_blobs SET content=?', (b'evil',))
        with pytest.raises(sqlite3.DatabaseError):
            connection.execute('DELETE FROM code_source_blobs')


@pytest.mark.parametrize('target', ['blob', 'resource'])
def test_replace_cannot_bypass_immutable_blob_or_managed_row_guard(store, target):
    saved = store.save_managed_draft(edit()); before = logical_state(store)
    with store._connect() as connection:
        assert connection.execute('PRAGMA recursive_triggers').fetchone()[0] == 0
        if target == 'blob':
            with pytest.raises(sqlite3.DatabaseError):
                connection.execute('INSERT OR REPLACE INTO code_source_blobs(sha256,content) VALUES(?,?)',
                                   (saved['contents'][0]['sha256'], b'replacement'))
        else:
            row = connection.execute('SELECT * FROM resources').fetchone()
            names = [name for name in row.keys() if name not in {'code_sources_manifest', 'code_content_digest'}]
            with pytest.raises(sqlite3.DatabaseError):
                connection.execute('INSERT OR REPLACE INTO resources(' + ','.join(names) + ') VALUES(' +
                                   ','.join('?' for _ in names) + ')', tuple(row[name] for name in names))
    assert logical_state(store) == before


@pytest.mark.parametrize('reader', ['graph', 'aggregate'])
def test_half_missing_manifest_is_not_mistaken_for_a_graph_only_resource(store, reader):
    saved = store.save_managed_draft(edit())
    with store._connect() as connection:
        for row in connection.execute("SELECT name FROM sqlite_master WHERE type='trigger'").fetchall():
            connection.execute('DROP TRIGGER "' + row['name'] + '"')
        connection.execute('UPDATE resources SET code_sources_manifest=NULL')
    with pytest.raises(SkeletonResourceError) as caught:
        (store.get_resource if reader == 'graph' else store.get_managed_resource)(saved['resource']['id'])
    assert caught.value.code == ('source_api_required' if reader == 'graph' else 'managed_source_corrupt')


def test_legacy_parent_cannot_admit_a_managed_reference_without_source_aware_closure(store):
    from tests.test_skeleton_resource_store import agent
    value = edit(); value['document']['kind'] = 'agent'
    saved = store.save_managed_draft(value)
    parent = agent('parent', child_source={'kind': 'agent_ref', 'agent_id': saved['resource']['id']})
    store.save_draft(parent)
    with pytest.raises(SkeletonResourceError) as caught:
        store.preflight('parent')
    assert caught.value.code == 'source_api_required'


def test_embedded_source_ownership_survives_real_store_cold_read(store):
    from tests.test_skeleton_resource_store import agent
    child = edit()['document']; child['kind'] = 'agent'
    parent = agent('parent', child_source={'kind': 'embedded', 'document': child})
    request = edit(); request['document'] = parent
    address = ['nodes', 3, 'config', 'subagents', 0, 'source', 'document', 'nodes', 1]
    request['managed_sources'][0]['node_path'] = address
    saved = store.save_managed_draft(request)
    cold = SkeletonResourceStore(store.root).get_managed_resource('parent')
    assert cold == saved
    assert cold['sources_manifest']['entries'][0]['node_path'] == address
    ManagedCodeSourceResolver(response_snapshot(cold))


def test_failure_after_blobs_before_graph_rolls_back_schema_too(store):
    with store._connect() as connection:
        connection.execute("CREATE TRIGGER test_abort BEFORE INSERT ON resources BEGIN SELECT RAISE(ABORT,'injected graph refusal'); END")
    before = logical_state(store)
    with pytest.raises(SkeletonResourceError) as caught:
        store.save_managed_draft(edit())
    assert caught.value.code == 'source_store_unavailable'
    assert logical_state(store) == before
    assert schema(store) == 'pupu.skeleton_resource_store.v1'
    with store._connect() as connection:
        assert 'code_sources_manifest' not in {row['name'] for row in connection.execute('PRAGMA table_info(resources)')}


def test_failure_building_response_after_graph_update_rolls_back_everything(store, monkeypatch):
    saved = store.save_managed_draft(edit()); before = logical_state(store)
    def refuse(_):
        raise OSError('injected response failure')
    monkeypatch.setattr(store, 'diagnose', refuse)
    with pytest.raises(OSError, match='injected response failure'):
        store.save_managed_draft(next_edit(saved))
    assert logical_state(store) == before


def test_initialized_old_raw_connection_cannot_silently_overwrite_managed_data(store):
    # Simulate a prior binary: no new UDF is registered on this connection.
    old_connection = sqlite3.connect(store.database_path, isolation_level=None)
    try:
        saved = store.save_managed_draft(edit()); before = logical_state(store)
        for sql in ['UPDATE resources SET draft_json=\'{}\'', 'DELETE FROM resources']:
            with pytest.raises(sqlite3.DatabaseError):
                old_connection.execute(sql)
        assert logical_state(store) == before
        assert store.get_managed_resource(saved['resource']['id']) == saved
    finally:
        old_connection.close()


@pytest.mark.parametrize('fault', ['missing', 'bytes', 'manifest', 'aggregate'])
def test_storage_corruption_is_typed_and_never_falls_back_to_live_file(store, fault, tmp_path):
    saved = store.save_managed_draft(edit())
    node = saved['resource']['document']['nodes'][1]
    path = tmp_path / node['config']['code']['source']['path']; path.parent.mkdir(parents=True)
    path.write_text('not authorized fallback')
    # Deliberate forensic corruption in this disposable DB, not a production edit.
    with store._connect() as connection:
        for row in connection.execute("SELECT name FROM sqlite_master WHERE type='trigger'").fetchall():
            connection.execute('DROP TRIGGER "' + row['name'] + '"')
        if fault == 'missing':
            connection.execute('DELETE FROM code_source_blobs')
        elif fault == 'bytes':
            connection.execute('UPDATE code_source_blobs SET content=?', (b'not the hash',))
        elif fault == 'manifest':
            connection.execute("UPDATE resources SET code_sources_manifest='{}'")
        else:
            connection.execute("UPDATE resources SET code_content_digest='wrong'")
    with pytest.raises(SkeletonResourceError) as caught:
        store.get_managed_resource(saved['resource']['id'])
    assert caught.value.code in {'managed_source_missing', 'managed_source_corrupt'}


def test_coherent_graph_digest_does_not_make_a_non_graph_document_readable(store):
    saved = store.save_managed_draft(edit())
    with store._connect() as connection:
        for row in connection.execute("SELECT name FROM sqlite_master WHERE type='trigger'").fetchall():
            connection.execute('DROP TRIGGER "' + row['name'] + '"')
        connection.execute('UPDATE resources SET draft_json=?,draft_digest=?',
                           ('[]', sha256(b'[]').hexdigest()))
    with pytest.raises(SkeletonResourceError) as caught:
        store.get_managed_resource(saved['resource']['id'])
    assert caught.value.code == 'managed_source_corrupt'


def test_cold_stored_snapshot_runs_in_exact_installed_code_worker(store, tmp_path):
    import sys
    from unchain.skeleton import prepare_workflow
    from unchain.skeleton.code_runtime import CodeSourceSnapshot, PythonEnvironmentProfile, SkeletonCodeRuntime
    from unchain.skeleton.durable_execution import DurableWorkflowRunner
    from unchain.skeleton.durable_store import WorkflowExecutionStore
    from unchain.journal import GenerationRef, AttemptRef
    from unchain.persistence.sqlite_v2 import SQLiteContextV2Store

    saved = store.save_managed_draft(edit())
    frame = response_snapshot(SkeletonResourceStore(store.root).get_managed_resource(saved['resource']['id']))
    resolver = ManagedCodeSourceResolver(frame)
    path = frame['document']['nodes'][1]['config']['code']['source']['path']
    assert type(resolver(path)) is CodeSourceSnapshot
    plan = prepare_workflow(frame['document'])
    repository = SQLiteContextV2Store(database_path=tmp_path / 'context.sqlite3', object_directory=tmp_path / 'objects')
    generation = GenerationRef('stored-source-test', 'generation')
    journal = repository.bind_execution(generation.execution_id)
    execution = WorkflowExecutionStore(journal, plan, graph_id='graph', attempt=AttemptRef(generation, 'attempt'))
    profile = PythonEnvironmentProfile.bundled('builtin', (sys.executable,))
    handler = SkeletonCodeRuntime(plan, source_resolver=resolver, profile_resolver=lambda _: profile,
                                  staging_root=tmp_path / 'staging')
    runner = DurableWorkflowRunner(execution, {'code': handler})
    runner.create({'message': 'hello'})
    result = runner.run()
    assert result.status == 'completed' and result.outputs == {'rows': 5}
    assert execution.load().state['status'] == 'completed'


def test_wrong_token_on_new_identity_does_not_opt_in_schema(store):
    value = edit(); value['expected_edit_token'] = 'edit-not-present'
    before = logical_state(store)
    with pytest.raises(SkeletonResourceError) as caught:
        store.save_managed_draft(value)
    assert caught.value.code == 'edit_conflict'
    assert logical_state(store) == before


@pytest.mark.parametrize('operation', ['migrate', 'equivalent'])
def test_completed_legacy_migration_status_remains_idempotent_after_source_upgrade(store, operation):
    source_identity = 'test-legacy-source'
    identity = 'legacy-' + sha256(source_identity.encode()).hexdigest()[:24]
    request = edit(); request['document']['id'] = identity
    request['document']['kind'] = 'agent'
    legacy = store.save_draft(request['document'], source_identity=source_identity)
    source = '{}'; source_hash = sha256(source.encode()).hexdigest()
    with store._connect() as connection:
        connection.execute('''INSERT INTO legacy_migrations(source_identity,source_kind,source_sha256,
            target_id,target_sha256,stage,updated_at_ms) VALUES(?,?,?,?,?,'active',123)''',
            (source_identity, 'recipe', source_hash, identity, legacy['draft_digest']))
        connection.execute('INSERT INTO legacy_aliases(source_scope,legacy_name,target_id,source_identity) VALUES(?,?,?,?)',
                           ('test', legacy['name'], identity, source_identity))
    request['expected_edit_token'] = legacy['edit_token']
    store.save_managed_draft(request)
    before = logical_state(store)
    arguments = {'source_identity': source_identity, 'source_scope': 'test', 'source_kind': 'recipe', 'source': source}
    if operation == 'migrate':
        result = store.migrate_legacy(**arguments)
    else:
        result = store.link_equivalent_legacy_source(**arguments, legacy_name=legacy['name'], target_id=identity)
    assert result['stage'] == 'active'
    assert logical_state(store) == before


def test_unknown_store_version_still_fails_closed(store):
    with store._connect() as connection:
        connection.execute("UPDATE store_meta SET value='pupu.skeleton_resource_store.v999' WHERE key='schema'")
    with pytest.raises(SkeletonResourceError) as caught:
        SkeletonResourceStore(store.root)
    assert caught.value.code == 'unknown_version'
