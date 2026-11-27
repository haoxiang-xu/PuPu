"""Host-owned source bytes, tested through the public producer/consumer seam.

No HTTP/provider calls. The last test executes only the audited local fixture
through the exact installed SkeletonCodeRuntime, not a fake Code handler.
"""
from copy import deepcopy
from hashlib import sha256
import json
import sys

import pytest

from skeleton_resource_store import SkeletonResourceError
from skeleton_code_sources import prepare_managed_code_edit, ManagedCodeSourceResolver


SOURCE = 'def main(input, context):\n    return {"rows": len(input["value"])}\n'
SOURCE_PATH = '__pupu_code__/sha256/' + sha256(SOURCE.encode()).hexdigest() + '.py'


def graph():
    return {'schema_version': 1, 'kind': 'workflow', 'id': 'managed-code', 'name': 'Managed Code',
        'nodes': [
            {'id': 'start', 'type': 'start', 'config': {'execution': {'outputs': [
                {'name': 'message', 'source': {'kind': 'result', 'path': ['message']}}]}}},
            {'id': 'code', 'type': 'code', 'config': {'execution': {
                'inputs': [{'name': 'value', 'value': {'kind': 'ref', 'node_id': 'start', 'path': ['message']}, 'missing': 'error'}],
                'outputs': [{'name': 'rows', 'source': {'kind': 'result', 'path': ['rows']}}]},
                'code': {'source': {'kind': 'file', 'path': 'old/file.py'}, 'environment_profile_id': 'builtin',
                    'timeout_ms': 5000, 'max_result_bytes': 10000, 'max_log_bytes': 10000,
                    'result_schema': {'type': 'object', 'properties': {'rows': {'type': 'integer'}},
                                      'required': ['rows'], 'additionalProperties': False}}}},
            {'id': 'end', 'type': 'end', 'config': {'execution': {
                'inputs': [{'name': 'rows', 'value': {'kind': 'ref', 'node_id': 'code', 'path': ['rows']}, 'missing': 'error'}],
                'outputs': [{'name': 'rows', 'source': {'kind': 'input', 'path': ['rows']}}]}}}],
        'edges': [
            {'id': 'a', 'kind': 'flow', 'source_node_id': 'start', 'source_port_id': 'out', 'target_node_id': 'code', 'target_port_id': 'in'},
            {'id': 'b', 'kind': 'flow', 'source_node_id': 'code', 'source_port_id': 'out', 'target_node_id': 'end', 'target_port_id': 'in'}]}


def edit(text=SOURCE):
    return {'schema': 'pupu.skeleton-edit.v2', 'document': graph(), 'expected_edit_token': None,
            'managed_sources': [{'node_path': ['nodes', 1], 'text': text}]}


def digest(value):
    return sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False,
                             allow_nan=False).encode('utf-8')).hexdigest()


def test_projects_only_source_and_returns_independently_checkable_snapshot():
    request = edit()
    before = deepcopy(request)
    prepared = prepare_managed_code_edit(request)
    snapshot = prepared.snapshot()
    expected = deepcopy(request['document'])
    expected['nodes'][1]['config']['code']['source'] = {'kind': 'file', 'path': SOURCE_PATH}
    assert request == before
    assert prepared.document == expected
    assert prepared.expected_edit_token is None
    assert set(snapshot) == {'schema', 'document', 'sources_manifest', 'contents', 'content_digest'}
    assert snapshot['schema'] == 'pupu.skeleton-code-snapshot.v1'
    assert snapshot['document'] == expected
    assert snapshot['sources_manifest'] == {'schema': 'pupu.skeleton-code-sources.v1', 'entries': [
        {'node_path': ['nodes', 1], 'sha256': sha256(SOURCE.encode()).hexdigest()}]}
    assert snapshot['contents'] == [{'sha256': sha256(SOURCE.encode()).hexdigest(), 'text': SOURCE}]
    assert snapshot['content_digest'] == digest({'document': expected, 'sources_manifest': snapshot['sources_manifest']})


def test_immutable_after_input_and_returned_view_are_mutated():
    request = edit()
    prepared = prepare_managed_code_edit(request)
    original = prepared.snapshot()
    resolver = ManagedCodeSourceResolver(original)
    request['managed_sources'][0]['text'] = 'changed'
    original['contents'][0]['text'] = 'also changed'
    prepared.document['nodes'].clear()
    assert prepared.snapshot()['contents'][0]['text'] == SOURCE
    assert resolver(SOURCE_PATH).content == SOURCE.encode()


@pytest.mark.parametrize('text', ['', '\ufeff# BOM\r\n# 中文\n', 'a\r\nb\r\n', '# café e\u0301\n'])
def test_preserves_exact_unicode_and_line_endings(text):
    snapshot = prepare_managed_code_edit(edit(text)).snapshot()
    row = snapshot['contents'][0]
    assert row['text'] == text
    assert row['sha256'] == sha256(text.encode('utf-8')).hexdigest()
    path = snapshot['document']['nodes'][1]['config']['code']['source']['path']
    assert ManagedCodeSourceResolver(snapshot)(path).content == text.encode('utf-8')


@pytest.mark.parametrize('text', ['\ud800', '\udfff', 'x\ud800y'])
def test_invalid_unicode_refuses_at_text_before_projection(text):
    with pytest.raises(SkeletonResourceError) as caught:
        prepare_managed_code_edit(edit(text))
    assert caught.value.code == 'invalid_value'
    assert caught.value.path == ('managed_sources', 0, 'text')


def test_four_mib_edge_and_excess_are_measured_as_utf8_bytes():
    text = 'é' * (2 * 1024 * 1024)
    assert len(prepare_managed_code_edit(edit(text)).snapshot()['contents'][0]['text'].encode()) == 4 * 1024 * 1024
    with pytest.raises(SkeletonResourceError) as caught:
        prepare_managed_code_edit(edit(text + 'a'))
    assert caught.value.code == 'limit_bytes'


@pytest.mark.parametrize('change,code', [
    (lambda v: v.update(extra=True), 'unknown_field'),
    (lambda v: v.pop('managed_sources'), 'invalid_shape'),
    (lambda v: v.update(schema='pupu.skeleton-edit.v99'), 'unsupported_version'),
    (lambda v: v.update(expected_edit_token=False), 'invalid_type'),
    (lambda v: v['managed_sources'][0].update(extra=True), 'unknown_field'),
    (lambda v: v['managed_sources'][0].update(text={'toString': None}), 'invalid_type'),
])
def test_closed_edit_request_rejects_malformed_shape(change, code):
    value = edit(); change(value)
    with pytest.raises(SkeletonResourceError) as caught:
        prepare_managed_code_edit(value)
    assert caught.value.code == code


@pytest.mark.parametrize('path', [['nodes', True], ['nodes', -1], ['nodes', '1'], ['nodes', 99],
                                 ['nodes', 0], ['nodes', 1, 'config'], ['extra', 1], [], '__proto__'])
def test_path_cannot_select_another_field_or_coerce_an_index(path):
    value = edit(); value['managed_sources'][0]['node_path'] = path
    with pytest.raises(SkeletonResourceError) as caught:
        prepare_managed_code_edit(value)
    assert caught.value.path[:2] == ('managed_sources', 0)


def test_duplicate_target_refuses_even_if_source_text_is_equal():
    value = edit(); value['managed_sources'].append(deepcopy(value['managed_sources'][0]))
    with pytest.raises(SkeletonResourceError) as caught:
        prepare_managed_code_edit(value)
    assert caught.value.code == 'duplicate_identity'


def test_request_binding_count_is_bounded_before_resolving_targets():
    value = edit(); value['managed_sources'] *= 257
    with pytest.raises(SkeletonResourceError) as caught:
        prepare_managed_code_edit(value)
    assert caught.value.code == 'limit_count'


def test_source_byte_budget_counts_unique_blobs_not_bindings():
    value = edit()
    node = deepcopy(value['document']['nodes'][1])
    value['document']['nodes'] = [deepcopy(node) for _ in range(5)]
    for i, item in enumerate(value['document']['nodes']):
        item['id'] = 'code-' + str(i)
    value['document']['edges'] = []
    value['managed_sources'] = [
        {'node_path': ['nodes', i], 'text': '#' + str(i) + 'x' * (4 * 1024 * 1024 - 2)}
        for i in range(4)]
    snapshot = prepare_managed_code_edit(value).snapshot()
    assert len(snapshot['contents']) == 4
    # A fifth reference to the same bytes does not exceed the unique budget.
    value['managed_sources'].append({'node_path': ['nodes', 4], 'text': value['managed_sources'][0]['text']})
    assert len(prepare_managed_code_edit(value).snapshot()['contents']) == 4
    value['managed_sources'][-1]['text'] = '# another unique source'
    with pytest.raises(SkeletonResourceError) as caught:
        prepare_managed_code_edit(value)
    assert caught.value.code == 'limit_bytes'


def test_other_invalid_stored_settings_are_preserved_for_repair():
    value = edit()
    code = value['document']['nodes'][1]['config']['code']
    code.update(artifacts=False, result_schema=None, future={'toString': None})
    snapshot = prepare_managed_code_edit(value).snapshot()
    actual = snapshot['document']['nodes'][1]['config']['code']
    assert actual['artifacts'] is False
    assert actual['result_schema'] is None
    assert actual['future'] == {'toString': None}
    assert actual['source']['path'] == SOURCE_PATH


def test_two_code_rows_share_bytes_without_sharing_row_ownership():
    value = edit()
    value['document']['nodes'].insert(2, deepcopy(value['document']['nodes'][1]))
    value['document']['nodes'][2]['id'] = 'second-code'
    value['managed_sources'].append({'node_path': ['nodes', 2], 'text': SOURCE})
    snapshot = prepare_managed_code_edit(value).snapshot()
    assert len(snapshot['contents']) == 1
    assert [row['node_path'] for row in snapshot['sources_manifest']['entries']] == [['nodes', 1], ['nodes', 2]]
    assert snapshot['document']['nodes'][1]['id'] == 'code'
    assert snapshot['document']['nodes'][2]['id'] == 'second-code'


def test_embedded_ownership_uses_explicit_full_address_not_duplicate_graph_or_node_id():
    value = edit(); value['document']['kind'] = 'agent'
    child = graph(); child['kind'] = 'agent'
    pool = {'id': 'pool', 'type': 'subagent_pool', 'config': {'subagents': [
        {'id': 'same', 'name': 'First', 'source': {'kind': 'embedded', 'document': deepcopy(child)}},
        {'id': 'same', 'name': 'Second', 'source': {'kind': 'embedded', 'document': deepcopy(child)}}]}}
    value['document']['nodes'].append(pool)
    path = ['nodes', 3, 'config', 'subagents', 1, 'source', 'document', 'nodes', 1]
    value['managed_sources'] = [{'node_path': path, 'text': SOURCE}]
    snapshot = prepare_managed_code_edit(value).snapshot()
    entries = snapshot['document']['nodes'][3]['config']['subagents']
    assert entries[0]['source']['document']['nodes'][1]['config']['code']['source']['path'] == 'old/file.py'
    assert entries[1]['source']['document']['nodes'][1]['config']['code']['source']['path'] == SOURCE_PATH
    assert snapshot['sources_manifest']['entries'][0]['node_path'] == path


def test_referenced_agent_is_not_a_child_write_target():
    value = edit(); value['document']['kind'] = 'agent'
    value['document']['nodes'].append({'id': 'pool', 'type': 'subagent_pool', 'config': {'subagents': [
        {'id': 'ref', 'name': 'Other', 'source': {'kind': 'ref', 'agent_id': 'other'}}]}})
    value['managed_sources'][0]['node_path'] = ['nodes', 3, 'config', 'subagents', 0, 'source', 'document', 'nodes', 1]
    with pytest.raises(SkeletonResourceError):
        prepare_managed_code_edit(value)


def test_no_manifest_membership_means_no_source_authority_even_for_the_prefix(tmp_path):
    value = edit(); value['document']['nodes'][1]['config']['code']['source']['path'] = SOURCE_PATH
    value['managed_sources'] = []
    snapshot = prepare_managed_code_edit(value).snapshot()
    resolver = ManagedCodeSourceResolver(snapshot)
    file = tmp_path / SOURCE_PATH; file.parent.mkdir(parents=True); file.write_text(SOURCE)
    with pytest.raises(SkeletonResourceError) as caught:
        resolver(SOURCE_PATH)
    assert caught.value.code == 'managed_source_missing'


@pytest.mark.parametrize('change', [
    lambda v: v.update(extra=True),
    lambda v: v.update(schema='pupu.skeleton-code-snapshot.v99'),
    lambda v: v['contents'][0].update(text='tampered'),
    lambda v: v['contents'].clear(),
    lambda v: v['contents'].append(deepcopy(v['contents'][0])),
    lambda v: v['sources_manifest']['entries'][0].update(node_path=['nodes', 0]),
    lambda v: v['document']['nodes'][1]['config']['code']['source'].update(path='borrowed.py'),
    lambda v: v.update(content_digest='0' * 64),
])
def test_strict_consumer_refuses_corrupt_or_rebound_snapshot(change):
    snapshot = prepare_managed_code_edit(edit()).snapshot(); change(snapshot)
    with pytest.raises(SkeletonResourceError):
        ManagedCodeSourceResolver(snapshot)


@pytest.mark.parametrize('change', [
    lambda v: v['sources_manifest']['entries'][0].update(node_path=['nodes', 0]),
    lambda v: v['document']['nodes'][1]['config']['code']['source'].update(path='borrowed.py'),
])
def test_consumer_checks_source_ownership_even_when_outer_digest_is_recomputed(change):
    snapshot = prepare_managed_code_edit(edit()).snapshot()
    change(snapshot)
    snapshot['content_digest'] = digest({'document': snapshot['document'],
                                          'sources_manifest': snapshot['sources_manifest']})
    with pytest.raises(SkeletonResourceError):
        ManagedCodeSourceResolver(snapshot)


def test_real_runtime_freezes_and_executes_exact_managed_bytes_without_a_workspace(tmp_path):
    from unchain.skeleton import prepare_workflow
    from unchain.skeleton.code_runtime import CodeSourceSnapshot, PythonEnvironmentProfile, SkeletonCodeRuntime
    from unchain.skeleton.durable_execution import DurableWorkflowRunner
    from unchain.skeleton.durable_store import WorkflowExecutionStore
    from unchain.journal import GenerationRef, AttemptRef
    from unchain.persistence.sqlite_v2 import SQLiteContextV2Store

    prepared = prepare_managed_code_edit(edit())
    resolver = ManagedCodeSourceResolver(prepared.snapshot())
    assert type(resolver(SOURCE_PATH)) is CodeSourceSnapshot
    plan = prepare_workflow(prepared.document)
    repository = SQLiteContextV2Store(database_path=tmp_path / 'context.sqlite3', object_directory=tmp_path / 'objects')
    generation = GenerationRef('managed-source-test', 'generation')
    journal = repository.bind_execution(generation.execution_id)
    execution = WorkflowExecutionStore(journal, plan, graph_id='graph', attempt=AttemptRef(generation, 'attempt'))
    profile = PythonEnvironmentProfile.bundled('builtin', (sys.executable,))
    handler = SkeletonCodeRuntime(plan, source_resolver=resolver, profile_resolver=lambda _: profile,
                                  staging_root=tmp_path / 'staging')
    runner = DurableWorkflowRunner(execution, {'code': handler})
    runner.create({'message': 'hello'})
    result = runner.run()
    assert result.status == 'completed'
    assert result.outputs == {'rows': 5}
    assert execution.load().state['status'] == 'completed'
