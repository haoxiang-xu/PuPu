"""Managed Workflow publication and pinned callers share actual retained bytes."""
from copy import deepcopy

import pytest

import unchain_adapter as adapter
from skeleton_code_admission import prepare_code_execution_material
from skeleton_code_closure import FrozenSkeletonCodeClosure, FrozenCodeRuntimeSnapshot
from skeleton_resource_store import SkeletonResourceStore, SkeletonResourceError
from tests.test_skeleton_code_sources import graph
from tests.test_skeleton_code_admission import request, select
from test_skeleton_production_chat import production
from tests.test_skeleton_code_launch import query


SOURCE_A = 'def main(input, context):\n    return {"message": "Workflow A: " + input["message"]}\n'
SOURCE_B = SOURCE_A.replace('Workflow A:', 'Workflow B:')


def message_workflow():
    document = graph(); document.update(id='source-workflow', name='Source Workflow')
    code = document['nodes'][1]['config']
    code['execution']['inputs'][0]['name'] = 'message'
    code['execution']['outputs'][0].update(name='message', source={'kind': 'result', 'path': ['message']})
    code['code']['result_schema'] = {'type': 'object', 'properties': {'message': {'type': 'string'}},
                                   'required': ['message'], 'additionalProperties': False}
    end = document['nodes'][2]['config']['execution']
    end['inputs'][0].update(name='message', value={'kind': 'ref', 'node_id': 'code', 'path': ['message']})
    end['outputs'][0].update(name='message', source={'kind': 'input', 'path': ['message']})
    return document


def publish(store, saved):
    return store.publish_managed_workflow(saved['resource']['id'],
        {'schema': 'pupu.skeleton-publish.v2', 'expected_edit_token': saved['resource']['edit_token']})


def caller(document, revision):
    document = deepcopy(document)
    document['nodes'].append({'id': 'call', 'type': 'workflow_call', 'config': {
        'workflow': {'workflow_id': 'source-workflow', 'revision_id': revision},
        'execution': {'inputs': [{'name': 'message', 'value': {'kind': 'ref', 'node_id': 'kernel', 'path': ['message']}, 'missing': 'error'}],
                      'outputs': [{'name': 'message', 'source': {'kind': 'result', 'path': ['message']}}]}}})
    document['edges'][1]['target_node_id'] = 'call'
    document['edges'].append({'id': 'call-end', 'kind': 'flow', 'source_node_id': 'call',
        'source_port_id': 'out', 'target_node_id': 'end', 'target_port_id': 'in'})
    document['nodes'][2]['config']['execution']['inputs'][0]['value']['node_id'] = 'call'
    return document


def test_publish_is_atomic_pinned_and_deduplicates_by_source_aggregate(tmp_path):
    store = SkeletonResourceStore(tmp_path / 'store')
    saved = store.save_managed_draft(request(message_workflow(), [{'node_path': ['nodes', 1], 'text': SOURCE_A}]))
    version_a = publish(store, saved)
    assert set(version_a) == {'schema', 'version', 'sources_manifest', 'contents', 'content_digest'}
    assert version_a['schema'] == 'pupu.skeleton-workflow-version.v2'
    assert publish(store, saved) == version_a
    updated = store.save_managed_draft(request(saved['resource']['document'], [{'node_path': ['nodes', 1], 'text': SOURCE_B}], saved['resource']['edit_token']))
    version_b = publish(store, updated)
    assert version_b['version']['revision_id'] != version_a['version']['revision_id']
    cold = SkeletonResourceStore(store.root)
    assert cold.get_managed_workflow_version('source-workflow', version_a['version']['revision_id']) == version_a
    assert cold.get_managed_workflow_version('source-workflow', version_b['version']['revision_id']) == version_b
    with pytest.raises(SkeletonResourceError) as caught:
        cold.get_workflow_version('source-workflow', version_a['version']['revision_id'])
    assert caught.value.code == 'source_api_required'
    with store._connect() as connection:
        assert connection.execute("SELECT value FROM store_meta WHERE key='schema'").fetchone()[0] == 'pupu.skeleton_resource_store.v3'


def test_pinned_workflow_sources_run_through_actual_production_call_without_workspace(production):
    from skeleton_credential_requirements import requirements_for_start
    store, options, calls = production
    saved = store.save_managed_draft(request(message_workflow(), [{'node_path': ['nodes', 1], 'text': SOURCE_A}]))
    version = publish(store, saved)
    parent = store.get_resource('production-agent')
    store.save_draft(caller(parent['document'], version['version']['revision_id']), expected_edit_token=parent['edit_token'])
    # Mutating/publishing the draft does not move the caller's pinned revision.
    newer = store.save_managed_draft(request(saved['resource']['document'], [{'node_path': ['nodes', 1], 'text': SOURCE_B}], saved['resource']['edit_token']))
    publish(store, newer)
    selection, workflows = prepare_code_execution_material(select('production-agent'), store=store)
    closure = FrozenSkeletonCodeClosure.restore(selection.code_sources, selection, workflows)
    owners = [row for row in closure.to_dict()['owners'] if row['kind'] == 'workflow']
    assert len(owners) == 1 and owners[0]['revision'] == version['version']['revision_id']
    options.pop('workspace_root', None); options['disable_workspace_root'] = True
    options['openaiApiKey'] = 'SENTINEL_MEMORY'
    options['skeleton_credential_scope'] = requirements_for_start(query(options, 'source-workflow-call'), memory_provider='openai', store=store)['scope']
    events = list(adapter.stream_chat_events(message='run pinned workflow', history=[], options=options,
        session_id='source-workflow-call', attempt_id='source-workflow-call-root'))
    roots = [row for row in events if row.get('type') == 'final_message' and row.get('scope') == 'root']
    assert len(roots) == 1 and roots[0]['content'] == 'Workflow A: End production reply'
    assert len(calls) == 1


def test_published_source_cannot_be_replaced_even_by_authorized_writer(tmp_path):
    import sqlite3
    store = SkeletonResourceStore(tmp_path / 'store')
    saved = store.save_managed_draft(request(message_workflow(), [{'node_path': ['nodes', 1], 'text': SOURCE_A}]))
    version = publish(store, saved)
    with store._connect() as connection:
        row = dict(connection.execute('SELECT * FROM workflow_versions').fetchone())
        connection.create_function('pupu_managed_write', 0, lambda: 1)
        columns = list(row)
        with pytest.raises(sqlite3.Error):
            connection.execute('INSERT OR REPLACE INTO workflow_versions(' + ','.join(columns) + ') VALUES(' + ','.join('?' for _ in columns) + ')',
                tuple(row[key] for key in columns))
    assert publish(store, saved) == version
