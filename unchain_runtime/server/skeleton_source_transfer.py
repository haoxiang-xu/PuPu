"""One-resource portable source snapshots and explicit local runtime rebinding.

The file stays JSON text across JS so Python numeric tokens are not rewritten.
No arbitrary file reads, profile registration or execution occurs during import.
"""
from copy import deepcopy
from hashlib import sha256
import json

from skeleton_code_sources import (ManagedCodeSourceResolver, _closed, _code_at,
    _address_key, _document, prepare_managed_code_edit)
from skeleton_resource_store import SkeletonResourceError, _json_bytes, _resource_id
from skeleton_runtime_capability import require_skeleton_runtime

FILE_BYTES = 40 * 1024 * 1024
REQUEST_BYTES = 96 * 1024 * 1024


def _fail(code, path, message, status=400):
    raise SkeletonResourceError(code, tuple(path), message, status=status)


def managed_transfer_capabilities():
    manifest = require_skeleton_runtime()
    return {'schema': 'pupu.skeleton-transfer-capabilities.v1',
        'import_schema': 'pupu.skeleton-import.v2', 'export_schema': 'pupu.skeleton-export.v2',
        'source_schema': 'pupu.skeleton-code-snapshot.v1', 'native_graph_version': 1,
        'binding_policy': 'explicit-all-owned-code-nodes', 'identity_policy': 'create-or-identical',
        'scope': 'one-resource', 'file_bytes': FILE_BYTES, 'request_bytes': REQUEST_BYTES,
        'runtime_manifest_digest': manifest['manifest_digest']}


def _owned_code_paths(document):
    stack = [(document, [])]
    while stack:
        body, prefix = stack.pop()
        if type(body) is not dict or type(body.get('nodes')) is not list:
            continue
        for index, node in enumerate(body['nodes']):
            if type(node) is not dict:
                continue
            path = prefix + ['nodes', index]
            if node.get('type') == 'code':
                yield path
            config = node.get('config')
            if type(config) is not dict:
                continue
            if node.get('type') == 'subagent_pool':
                entries = config.get('subagents')
                for offset, entry in enumerate(entries if type(entries) is list else []):
                    source = entry.get('source') if type(entry) is dict else None
                    if type(source) is dict and source.get('kind') == 'embedded':
                        stack.append((source.get('document'), path + ['config', 'subagents', offset, 'source', 'document']))
            elif node.get('type') == 'hooks_pool':
                entries = config.get('hooks')
                for offset, entry in enumerate(entries if type(entries) is list else []):
                    source = entry.get('workflow') if type(entry) is dict else None
                    if type(source) is dict and source.get('kind') == 'embedded':
                        stack.append((source.get('document'), path + ['config', 'hooks', offset, 'workflow', 'document']))


def _complete(frame):
    ManagedCodeSourceResolver(frame)
    expected = {tuple(path) for path in _owned_code_paths(frame['document'])}
    present = {tuple(row['node_path']) for row in frame['sources_manifest']['entries']}
    if expected != present:
        address = min(expected - present, key=_address_key)
        _fail('managed_source_required', ('document',) + address + ('config', 'code', 'source'),
              'Portable Code requires its owned source text; no live file is read.', status=409)
    return expected


def _file_text(frame):
    try:
        text = _json_bytes(frame).decode('utf-8')
        size = len(text.encode('utf-8'))
    except UnicodeError as error:
        raise SkeletonResourceError('invalid_value', ('source_json',),
                                    'Portable source must be valid UTF-8.') from error
    if size > FILE_BYTES:
        _fail('limit_bytes', ('source_json',), 'Portable file exceeds forty MiB.', status=413)
    return text


def export_managed_resource(store, resource_id):
    require_skeleton_runtime()
    value = store.get_managed_resource(resource_id)
    frame = {'schema': 'pupu.skeleton-code-snapshot.v1', 'document': value['resource']['document'],
        **{key: value[key] for key in ('sources_manifest', 'contents', 'content_digest')}}
    _complete(frame)
    text = _file_text(frame)
    return {'schema': 'pupu.skeleton-export.v2', 'source_json': text,
            'sha256': sha256(text.encode('utf-8')).hexdigest()}


def _parse_file(text):
    if type(text) is not str:
        _fail('invalid_type', ('source_json',), 'Portable file must be UTF-8 JSON text.')
    try:
        raw = text.encode('utf-8')
    except UnicodeError as error:
        raise SkeletonResourceError('invalid_value', ('source_json',), 'Portable file is not valid UTF-8.') from error
    if len(raw) > FILE_BYTES:
        _fail('limit_bytes', ('source_json',), 'Portable file exceeds forty MiB.', status=413)
    def pairs(items):
        value = {}
        for key, entry in items:
            if key in value:
                raise ValueError('duplicate JSON key')
            value[key] = entry
        return value
    def constant(_value):
        raise ValueError('non-JSON numeric constant')
    try:
        value = json.loads(text, object_pairs_hook=pairs, parse_constant=constant)
        # Reject invalid Unicode and non-finite floats even in an opaque draft field.
        json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8')
        return value
    except (ValueError, UnicodeError, RecursionError) as error:
        raise SkeletonResourceError('invalid_json', ('source_json',),
                                    'Portable file must be unambiguous valid UTF-8 JSON.') from error


def _source_frame(text):
    source = _parse_file(text)
    wrapped = type(source) is dict and 'schema' in source
    try:
        if wrapped:
            ManagedCodeSourceResolver(source)
            frame = source
        else:
            document = _document(source)
            frame = prepare_managed_code_edit({'schema': 'pupu.skeleton-edit.v2',
                'document': document, 'expected_edit_token': None, 'managed_sources': []}).snapshot()
        expected = _complete(frame)
    except SkeletonResourceError as error:
        path = error.path
        if not wrapped and path[:1] == ('document',):
            path = path[1:]
        raise SkeletonResourceError(error.code, ('source_json',) + tuple(path), str(error), status=error.status) from error
    return frame, expected


def import_managed_resource(store, value):
    _closed(value, {'schema', 'source_json', 'runtime_bindings'}, ())
    if value['schema'] != 'pupu.skeleton-import.v2':
        _fail('unsupported_version', ('schema',), 'Unsupported portable import version.')
    require_skeleton_runtime()
    frame, expected = _source_frame(value['source_json'])
    rows = value['runtime_bindings']
    if type(rows) is not list or len(rows) > 256:
        _fail('invalid_type', ('runtime_bindings',), 'Runtime bindings must be a bounded array.')
    document = deepcopy(frame['document'])
    seen, bindings = set(), []
    for index, row in enumerate(rows):
        path = ('runtime_bindings', index)
        _closed(row, {'node_path', 'environment_profile_id'}, path)
        node = _code_at(document, row['node_path'], path + ('node_path',))
        address = tuple(row['node_path'])
        if address in seen:
            _fail('duplicate_identity', path + ('node_path',), 'Code runtime binding is repeated.')
        seen.add(address)
        if address not in expected:
            _fail('invalid_target', path + ('node_path',), 'Runtime binding is not owned by this file.')
        identity = _resource_id(row['environment_profile_id'], path + ('environment_profile_id',))
        if identity != row['environment_profile_id']:
            _fail('invalid_value', path + ('environment_profile_id',), 'Runtime id must be canonical.')
        bindings.append((index, node, identity))
    if seen != expected:
        _fail('runtime_binding_required', ('runtime_bindings',),
              'Choose a local Python runtime for every owned Code node, including matching names.')
    # All shape/ownership checks precede any local profile lookup.
    for index, node, identity in bindings:
        try:
            store.resolve_python_profile(identity)
        except SkeletonResourceError as error:
            raise SkeletonResourceError(error.code, ('runtime_bindings', index, 'environment_profile_id'),
                                        str(error), status=error.status) from error
        node['config']['code']['environment_profile_id'] = identity
    contents = {row['sha256']: row['text'] for row in frame['contents']}
    prepared = prepare_managed_code_edit({'schema': 'pupu.skeleton-edit.v2', 'document': document,
        'expected_edit_token': None, 'managed_sources': [
            {'node_path': row['node_path'], 'text': contents[row['sha256']]}
            for row in frame['sources_manifest']['entries']]})
    from skeleton_code_source_store import write_prepared_draft
    return write_prepared_draft(store, prepared, importing=True)
