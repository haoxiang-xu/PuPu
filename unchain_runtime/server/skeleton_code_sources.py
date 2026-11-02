"""Versioned host-owned Code text; no filesystem or production dispatch authority.

The graph keeps core's file-source shape. This module projects an explicit edit
to content-addressed paths and admits immutable source snapshots for core's
existing callable resolver seam. Store CAS, closure admission, launch retention
and routes are deliberately separate integration work (the direct G1 plan).
"""
from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
import json
import re
from typing import Any

from unchain.skeleton import validate_skeleton_document
from unchain.skeleton.code_runtime import CodeSourceSnapshot
from unchain.skeleton.errors import SkeletonValidationError

from skeleton_resource_store import SkeletonResourceError, _json_bytes, _resource_id


_EDIT_SCHEMA = 'pupu.skeleton-edit.v2'
_MANIFEST_SCHEMA = 'pupu.skeleton-code-sources.v1'
_SNAPSHOT_SCHEMA = 'pupu.skeleton-code-snapshot.v1'
_MAX_SOURCE_BYTES = 4 * 1024 * 1024
_MAX_TOTAL_BYTES = 16 * 1024 * 1024
_MAX_BINDINGS = 256
_DIGEST = re.compile(r'^[0-9a-f]{64}$')


def _fail(code, path, message):
    raise SkeletonResourceError(code, tuple(path), message)


def _closed(value, fields, path):
    if type(value) is not dict or any(type(key) is not str for key in value):
        _fail('invalid_type', path, 'Source record must be an object with string keys.')
    unknown = set(value) - fields
    if unknown:
        _fail('unknown_field', path + (sorted(unknown)[0],), 'Unknown source field.')
    if set(value) != fields:
        _fail('invalid_shape', path, 'Source record is missing required fields.')


def _version(value, schema, path):
    if value != schema:
        _fail('unsupported_version', path, 'Unsupported managed-source version.')


def _source_bytes(text, path):
    if type(text) is not str:
        _fail('invalid_type', path, 'Code source text must be a string.')
    try:
        content = text.encode('utf-8')
    except UnicodeError:
        _fail('invalid_value', path, 'Code source must be valid Unicode.')
    if len(content) > _MAX_SOURCE_BYTES:
        _fail('limit_bytes', path, 'Code source exceeds four MiB.')
    return content


def _path(digest):
    return '__pupu_code__/sha256/' + digest + '.py'


def _document(value):
    try:
        checked = validate_skeleton_document(value)
    except SkeletonValidationError as error:
        raise SkeletonResourceError(error.code, error.path, str(error)) from error
    identity = _resource_id(checked['id'], ('document', 'id'))
    if checked['id'] != identity:
        _fail('invalid_value', ('document', 'id'), 'Resource id must have canonical spelling.')
    return checked


def _code_at(document, address, path):
    """A full typed address in this version, never a first/last id lookup."""
    if type(address) is not list or not 2 <= len(address) <= 256:
        _fail('invalid_target', path, 'Code target must be a full document address.')
    current = document
    offset = 0
    while True:
        if (offset + 2 > len(address) or address[offset] != 'nodes'
                or type(address[offset + 1]) is not int or address[offset + 1] < 0
                or type(current) is not dict or type(current.get('nodes')) is not list
                or address[offset + 1] >= len(current['nodes'])):
            _fail('invalid_target', path, 'Code target is not present in this document.')
        node = current['nodes'][address[offset + 1]]
        if type(node) is not dict or type(node.get('config')) is not dict:
            _fail('invalid_target', path, 'Code target has an unreadable node container.')
        offset += 2
        if offset == len(address):
            if node.get('type') != 'code' or ('code' in node['config']
                    and type(node['config']['code']) is not dict):
                _fail('invalid_target', path, 'Source must address a Code settings object.')
            return node
        if (offset + 5 >= len(address) or address[offset] != 'config'
                or type(address[offset + 2]) is not int or address[offset + 2] < 0
                or (node.get('type'), address[offset + 1], address[offset + 3], address[offset + 4]) not in [
                    ('subagent_pool', 'subagents', 'source', 'document'),
                    ('hooks_pool', 'hooks', 'workflow', 'document')]):
            _fail('invalid_target', path, 'Only owned embedded graphs can be source targets.')
        entries = node['config'].get(address[offset + 1])
        if type(entries) is not list or address[offset + 2] >= len(entries):
            _fail('invalid_target', path, 'Embedded source target is not present.')
        entry = entries[address[offset + 2]]
        source = entry.get(address[offset + 3]) if type(entry) is dict else None
        if type(source) is not dict or source.get('kind') != 'embedded':
            _fail('invalid_target', path, 'Referenced Agent source belongs to another resource.')
        current = source.get('document')
        offset += 5


def _address_key(address):
    return tuple((0, item) if type(item) is str else (1, item) for item in address)


def _content_digest(document, manifest):
    return sha256(_json_bytes({'document': document, 'sources_manifest': manifest})).hexdigest()


def _decode(content):
    return json.loads(content.decode('utf-8', 'surrogatepass'))


@dataclass(frozen=True)
class PreparedManagedCodeEdit:
    """Immutable projected draft; no save or execution has happened yet."""

    _snapshot_bytes: bytes
    expected_edit_token: str | None

    def snapshot(self):
        return _decode(self._snapshot_bytes)

    @property
    def document(self):
        return self.snapshot()['document']


def prepare_managed_code_edit(value: Any) -> PreparedManagedCodeEdit:
    _closed(value, {'schema', 'document', 'expected_edit_token', 'managed_sources'}, ())
    _version(value['schema'], _EDIT_SCHEMA, ('schema',))
    token = value['expected_edit_token']
    if token is not None:
        if type(token) is not str:
            _fail('invalid_type', ('expected_edit_token',), 'Edit token must be a string or null.')
        if not token or token != token.strip() or '\0' in token or len(token) > 256:
            _fail('invalid_value', ('expected_edit_token',), 'Edit token is not canonical.')
        try:
            token.encode('utf-8')
        except UnicodeError:
            _fail('invalid_value', ('expected_edit_token',), 'Edit token must be valid Unicode.')
    document = _document(value['document'])
    rows = value['managed_sources']
    if type(rows) is not list:
        _fail('invalid_type', ('managed_sources',), 'Managed sources must be an array.')
    if len(rows) > _MAX_BINDINGS:
        _fail('limit_count', ('managed_sources',), 'Too many managed source bindings.')
    entries = []
    contents = {}
    targets = set()
    total = 0
    for index, row in enumerate(rows):
        row_path = ('managed_sources', index)
        _closed(row, {'node_path', 'text'}, row_path)
        node = _code_at(document, row['node_path'], row_path + ('node_path',))
        target = tuple(row['node_path'])
        if target in targets:
            _fail('duplicate_identity', row_path + ('node_path',), 'Code target is listed twice.')
        targets.add(target)
        content = _source_bytes(row['text'], row_path + ('text',))
        identity = sha256(content).hexdigest()
        if identity not in contents:
            total += len(content)
            if total > _MAX_TOTAL_BYTES:
                _fail('limit_bytes', ('managed_sources',), 'Managed source set exceeds sixteen MiB.')
            contents[identity] = row['text']
        elif contents[identity] != row['text']:
            _fail('identity_conflict', row_path + ('text',), 'Source digest conflicts with another body.')
        node['config'].setdefault('code', {})['source'] = {'kind': 'file', 'path': _path(identity)}
        entries.append({'node_path': list(row['node_path']), 'sha256': identity})
    entries.sort(key=lambda entry: _address_key(entry['node_path']))
    manifest = {'schema': _MANIFEST_SCHEMA, 'entries': entries}
    frame = {'schema': _SNAPSHOT_SCHEMA, 'document': document, 'sources_manifest': manifest,
             'contents': [{'sha256': identity, 'text': contents[identity]} for identity in sorted(contents)],
             'content_digest': _content_digest(document, manifest)}
    return PreparedManagedCodeEdit(_json_bytes(frame), token)


class ManagedCodeSourceResolver:
    """Strict immutable consumer; missing membership never reads a live file."""

    def __init__(self, value):
        _closed(value, {'schema', 'document', 'sources_manifest', 'contents', 'content_digest'}, ())
        _version(value['schema'], _SNAPSHOT_SCHEMA, ('schema',))
        document = _document(value['document'])
        manifest = value['sources_manifest']
        _closed(manifest, {'schema', 'entries'}, ('sources_manifest',))
        _version(manifest['schema'], _MANIFEST_SCHEMA, ('sources_manifest', 'schema'))
        entries = manifest['entries']
        if type(entries) is not list:
            _fail('invalid_type', ('sources_manifest', 'entries'), 'Source bindings must be an array.')
        if len(entries) > _MAX_BINDINGS:
            _fail('limit_count', ('sources_manifest', 'entries'), 'Too many source bindings.')
        targets, identities = set(), set()
        for index, row in enumerate(entries):
            row_path = ('sources_manifest', 'entries', index)
            _closed(row, {'node_path', 'sha256'}, row_path)
            node = _code_at(document, row['node_path'], row_path + ('node_path',))
            target = tuple(row['node_path'])
            if target in targets:
                _fail('duplicate_identity', row_path + ('node_path',), 'Source target is repeated.')
            targets.add(target)
            identity = row['sha256']
            if type(identity) is not str or _DIGEST.fullmatch(identity) is None:
                _fail('invalid_value', row_path + ('sha256',), 'Invalid source digest.')
            if node['config'].get('code', {}).get('source') != {'kind': 'file', 'path': _path(identity)}:
                _fail('identity_mismatch', row_path, 'Source binding differs from its Code node.')
            identities.add(identity)
        if entries != sorted(entries, key=lambda row: _address_key(row['node_path'])):
            _fail('invalid_value', ('sources_manifest', 'entries'), 'Source bindings are not canonical.')
        if value['content_digest'] != _content_digest(document, manifest):
            _fail('identity_mismatch', ('content_digest',), 'Source aggregate digest differs.')
        rows = value['contents']
        if type(rows) is not list or len(rows) > _MAX_BINDINGS:
            _fail('invalid_shape', ('contents',), 'Source contents must be a bounded array.')
        blobs = {}
        order = []
        total = 0
        for index, row in enumerate(rows):
            row_path = ('contents', index)
            _closed(row, {'sha256', 'text'}, row_path)
            identity = row['sha256']
            if type(identity) is not str or _DIGEST.fullmatch(identity) is None:
                _fail('invalid_value', row_path + ('sha256',), 'Invalid source digest.')
            if identity in blobs:
                _fail('duplicate_identity', row_path + ('sha256',), 'Source body is repeated.')
            content = _source_bytes(row['text'], row_path + ('text',))
            if sha256(content).hexdigest() != identity:
                _fail('identity_mismatch', row_path + ('sha256',), 'Source bytes differ from their digest.')
            blobs[identity] = content
            order.append(identity)
            total += len(content)
            if total > _MAX_TOTAL_BYTES:
                _fail('limit_bytes', ('contents',), 'Source contents exceed sixteen MiB.')
        if order != sorted(order) or set(blobs) != identities:
            _fail('identity_mismatch', ('contents',), 'Source bodies differ from the owned manifest.')
        self._sources = {_path(identity): content for identity, content in blobs.items()}

    def __call__(self, relative_path):
        if type(relative_path) is not str:
            _fail('invalid_type', ('source', 'path'), 'Source path must be a string.')
        if relative_path not in self._sources:
            _fail('managed_source_missing', ('source', 'path'), 'Source is not owned by this snapshot.')
        content = self._sources[relative_path]
        return CodeSourceSnapshot(relative_path, content, sha256(content).hexdigest())


__all__ = ['prepare_managed_code_edit', 'PreparedManagedCodeEdit', 'ManagedCodeSourceResolver']
