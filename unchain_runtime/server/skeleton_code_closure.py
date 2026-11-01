"""Closed source ownership and retained runtime bytes; never a live-store resolver."""
from dataclasses import dataclass
from hashlib import sha256
import base64
import json

from unchain.skeleton import FileCodeSourceResolver, prepare_workflow
from unchain.skeleton.agent_preparation import execution_definition_digest
from unchain.skeleton.code_runtime import CodeSourceSnapshot

from skeleton_code_sources import ManagedCodeSourceResolver, _closed, _code_at, _content_digest
from skeleton_resource_store import SkeletonResourceError, _json_bytes, _resource_id


_CLOSURE = 'pupu.skeleton-code-closure.v1'
_RUNTIME = 'pupu.skeleton-code-runtime-snapshot.v1'
_MAX_BYTES = 16 * 1024 * 1024
_MAX_BINDINGS = 256


def _fail(code='managed_source_invalid', path=('code_sources',)):
    raise SkeletonResourceError(code, tuple(path), 'Managed execution sources are unavailable or invalid.', status=409)


def _code_nodes(document):
    return [(i, node) for i, node in enumerate(document['nodes']) if node['type'] == 'code']


def _owner_keys(selection, workflows):
    selected = selection.to_dict()
    keys = {('resource', selected['id'], selected['edit_token'])}
    def visit(value):
        for child in value['subagents']:
            if child['source_kind'] == 'agent_ref':
                keys.add(('resource', child['agent_id'], child['edit_token']))
            visit(child)
    visit(selected)
    keys.update(('workflow', row['workflow_id'], row['revision_id']) for row in workflows.to_dict()['workflows'])
    return keys


def _at_document(document, path):
    if type(path) is not list or len(path) % 7 or len(path) > 252:
        _fail()
    current = document
    for offset in range(0, len(path), 7):
        part = path[offset:offset + 7]
        if (part[0] != 'nodes' or type(part[1]) is not int or part[1] < 0
                or part[2] != 'config' or type(part[4]) is not int or part[4] < 0
                or (part[3], part[5], part[6]) not in [
                    ('subagents', 'source', 'document'), ('hooks', 'workflow', 'document')]):
            _fail()
        try:
            pool = current['nodes'][part[1]]
            entry = pool['config'][part[3]][part[4]]
            expected = 'subagent_pool' if part[3] == 'subagents' else 'hooks_pool'
            if pool['type'] != expected or entry[part[5]]['kind'] != 'embedded':
                _fail()
            current = entry[part[5]]['document']
        except (KeyError, IndexError, TypeError):
            _fail()
    return current


def _locations(selection, workflows, owners):
    index = {(row['kind'], row['id'], row['revision']): i for i, row in enumerate(owners)}
    result = []
    def visit(value, key, prefix):
        document = value['document']
        if _code_nodes(document):
            if prefix is None:
                _fail('managed_source_owner_mismatch')
            result.append({'document_id': document['id'], 'definition_digest': value['definition_digest'],
                           'owner_index': index[key], 'document_path': prefix})
        from skeleton_embedded_hooks import embedded_hook_bodies
        for address, body in embedded_hook_bodies(document, include_disabled=True):
            if _code_nodes(body):
                if prefix is None:
                    _fail('managed_source_owner_mismatch')
                body_plan = prepare_workflow(body)
                result.append({'document_id': body['id'], 'definition_digest': execution_definition_digest(body_plan),
                    'owner_index': index[key], 'document_path': prefix + address})
        for child in value['subagents']:
            if child['source_kind'] == 'agent_ref':
                visit(child, ('resource', child['agent_id'], child['edit_token']), [])
                continue
            raw = _at_document(owners[index[key]]['document'], prefix) if prefix is not None else None
            matches = []
            if type(raw) is dict:
                for pool_index, pool in enumerate(raw['nodes']):
                    if pool['type'] != 'subagent_pool' or pool['id'] != child['pool_node_id']:
                        continue
                    entries = pool['config'].get('subagents')
                    for entry_index, entry in enumerate(entries if type(entries) is list else []):
                        if type(entry) is dict and entry.get('id') == child['entry_id']:
                            source = entry.get('source')
                            if type(source) is dict and source.get('kind') == 'embedded':
                                matches.append(prefix + ['nodes', pool_index, 'config', 'subagents', entry_index, 'source', 'document'])
            visit(child, key, matches[0] if len(matches) == 1 else None)
    selected = selection.to_dict()
    visit(selected, ('resource', selected['id'], selected['edit_token']), [])
    for row in workflows.to_dict()['workflows']:
        if _code_nodes(row['document']):
            result.append({'document_id': row['document']['id'], 'definition_digest': row['definition_digest'],
                'owner_index': index[('workflow', row['workflow_id'], row['revision_id'])], 'document_path': []})
    unique = {_json_bytes(row): row for row in result}
    return [unique[key] for key in sorted(unique)]


def _documents(selection, workflows):
    result = {}
    def owned_hooks(body):
        from skeleton_embedded_hooks import embedded_hook_bodies
        for _address, child in embedded_hook_bodies(body, include_disabled=True):
            plan = prepare_workflow(child)
            key = (plan.document_id, execution_definition_digest(plan))
            if key in result and result[key] != child:
                _fail('managed_source_owner_mismatch')
            result[key] = child
    def visit(value):
        key = (value['document']['id'], value['definition_digest'])
        prior = result.get(key)
        if prior is not None and prior != value['document']:
            _fail('managed_source_owner_mismatch')
        result[key] = value['document']
        owned_hooks(value['document'])
        for child in value['subagents']:
            visit(child)
    visit(selection.to_dict())
    for row in workflows.to_dict()['workflows']:
        result[(row['document']['id'], row['definition_digest'])] = row['document']
        owned_hooks(row['document'])
    return result


def _active_owned_path(document, path):
    """Disabled owned bodies are retained but acquire no execution capability."""
    current = document
    for offset in range(0, len(path), 7):
        part = path[offset:offset + 7]
        if part[3] == 'hooks' and current['nodes'][part[1]]['config']['hooks'][part[4]].get('enabled') is False:
            return False
        current = _at_document(current, part)
    return True


@dataclass(frozen=True)
class FrozenSkeletonCodeClosure:
    _canonical: bytes

    def to_dict(self):
        return json.loads(self._canonical)

    @classmethod
    def capture(cls, selection, workflows, records):
        expected = _owner_keys(selection, workflows)
        owners, contents = [], {}
        for key in sorted(expected):
            if key not in records:
                _fail('managed_source_owner_mismatch')
            owner, bodies = records[key]
            owners.append(owner)
            for row in bodies:
                previous = contents.get(row['sha256'])
                if previous is not None and previous != row['text']:
                    _fail('managed_source_conflict')
                contents[row['sha256']] = row['text']
        frame = {'schema': _CLOSURE, 'owners': owners,
                 'contents': [{'sha256': key, 'text': contents[key]} for key in sorted(contents)],
                 'bindings': _locations(selection, workflows, owners)}
        return cls.restore(frame, selection, workflows)

    @classmethod
    def restore(cls, value, selection, workflows):
        _closed(value, {'schema', 'owners', 'contents', 'bindings'}, ('code_sources',))
        if value['schema'] != _CLOSURE or type(value['owners']) is not list or not 1 <= len(value['owners']) <= 256:
            _fail()
        owners = value['owners']
        keys, declared, total = [], set(), 0
        if type(value['contents']) is not list or len(value['contents']) > _MAX_BINDINGS:
            _fail()
        contents = {}
        for row in value['contents']:
            _closed(row, {'sha256', 'text'}, ('code_sources', 'contents'))
            if type(row['text']) is not str:
                _fail()
            try:
                content = row['text'].encode('utf-8')
            except UnicodeError:
                _fail()
            if (len(content) > 4 * 1024 * 1024 or row['sha256'] != sha256(content).hexdigest()
                    or row['sha256'] in contents):
                _fail()
            total += len(content)
            if total > _MAX_BYTES:
                _fail('limit_bytes')
            contents[row['sha256']] = row['text']
        if [row['sha256'] for row in value['contents']] != sorted(contents):
            _fail()
        for owner in owners:
            _closed(owner, {'kind', 'id', 'revision', 'managed', 'document', 'sources_manifest', 'content_digest'},
                    ('code_sources', 'owners'))
            if (owner['kind'] not in ('resource', 'workflow') or type(owner['managed']) is not bool
                    or type(owner['id']) is not str or _resource_id(owner['id'], ('code_sources',)) != owner['id']
                    or type(owner['revision']) is not str or not owner['revision']):
                _fail()
            keys.append((owner['kind'], owner['id'], owner['revision']))
            if type(owner['document']) is not dict or owner['document'].get('id') != owner['id']:
                _fail()
            manifest = owner['sources_manifest']
            if type(manifest) is not dict or type(manifest.get('entries')) is not list:
                _fail()
            identities = {row.get('sha256') for row in manifest['entries'] if type(row) is dict and type(row.get('sha256')) is str}
            if not identities <= contents.keys():
                _fail('managed_source_missing')
            ManagedCodeSourceResolver({'schema': 'pupu.skeleton-code-snapshot.v1', 'document': owner['document'],
                'sources_manifest': manifest, 'contents': [{'sha256': key, 'text': contents[key]} for key in sorted(identities)],
                'content_digest': owner['content_digest']})
            if not owner['managed'] and manifest['entries']:
                _fail()
            declared.update(identities)
        if keys != sorted(set(keys)) or set(keys) != _owner_keys(selection, workflows) or declared != set(contents):
            _fail('managed_source_owner_mismatch')
        expected = _locations(selection, workflows, owners)
        if type(value['bindings']) is not list or _json_bytes(value['bindings']) != _json_bytes(expected):
            _fail('managed_source_owner_mismatch')
        documents = _documents(selection, workflows)
        covered = set()
        for binding in expected:
            owner_index, prefix = binding['owner_index'], binding['document_path']
            raw = _at_document(owners[owner_index]['document'], prefix)
            prepared = documents[(binding['document_id'], binding['definition_digest'])]
            raw_nodes = {node['id']: (index, node) for index, node in _code_nodes(raw)}
            if len(raw_nodes) != len(_code_nodes(raw)):
                _fail()
            for _, node in _code_nodes(prepared):
                pair = raw_nodes.get(node['id'])
                if pair is None or pair[1]['config']['code'] != node['config']['code']:
                    _fail('managed_source_owner_mismatch')
                covered.add((owner_index, tuple(prefix + ['nodes', pair[0]])))
        count = 0
        for index, owner in enumerate(owners):
            for entry in owner['sources_manifest']['entries']:
                count += 1
                if (index, tuple(entry['node_path'])) not in covered:
                    _fail('managed_source_owner_mismatch')
        if count > _MAX_BINDINGS or len(_json_bytes(value)) > 32 * 1024 * 1024:
            _fail('limit_bytes')
        return cls(_json_bytes(value))

    def paths(self):
        value = self.to_dict()
        managed, external = {}, set()
        texts = {row['sha256']: row['text'] for row in value['contents']}
        for binding in value['bindings']:
            owner = value['owners'][binding['owner_index']]
            prefix = binding['document_path']
            if not _active_owned_path(owner['document'], prefix):
                continue
            document = _at_document(owner['document'], prefix)
            by_path = {tuple(row['node_path']): row['sha256'] for row in owner['sources_manifest']['entries']}
            for index, node in _code_nodes(document):
                path = node['config']['code']['source']['path']
                identity = by_path.get(tuple(prefix + ['nodes', index]))
                if identity is None:
                    external.add(path)
                else:
                    content = texts[identity].encode('utf-8')
                    if path in managed and managed[path].content != content:
                        _fail('managed_source_conflict')
                    managed[path] = CodeSourceSnapshot(path, content, identity)
        return managed, external


@dataclass(frozen=True)
class FrozenCodeRuntimeSnapshot:
    _canonical: bytes

    def to_dict(self):
        return json.loads(self._canonical)

    @classmethod
    def prepare(cls, closure, *, workspace_root):
        managed, paths = closure.paths()
        total = sum(len(row.content) for row in managed.values())
        if total > _MAX_BYTES or len(paths) > _MAX_BINDINGS:
            _fail('limit_bytes')
        if paths and workspace_root is None:
            _fail('workspace_unavailable', ('workspace_root',))
        resolver = FileCodeSourceResolver(workspace_root) if paths else None
        external = []
        for path in sorted(paths):
            snapshot = resolver(path)
            total += len(snapshot.content)
            if len(snapshot.content) > 4 * 1024 * 1024 or total > _MAX_BYTES:
                _fail('limit_bytes')
            if path in managed and managed[path].content != snapshot.content:
                _fail('managed_source_conflict')
            external.append({'path': path, 'sha256': snapshot.sha256,
                             'base64': base64.b64encode(snapshot.content).decode('ascii')})
        value = {'schema': _RUNTIME, 'closure': closure.to_dict(), 'external': external}
        if len(_json_bytes(value)) > 56 * 1024 * 1024:
            _fail('limit_bytes')
        return cls(_json_bytes(value))

    @classmethod
    def restore(cls, value, selection, workflows):
        _closed(value, {'schema', 'closure', 'external'}, ('code_sources',))
        if (value['schema'] != _RUNTIME or type(value['external']) is not list
                or len(value['external']) > _MAX_BINDINGS or len(_json_bytes(value)) > 56 * 1024 * 1024):
            _fail()
        closure = FrozenSkeletonCodeClosure.restore(value['closure'], selection, workflows)
        if selection.code_sources is None or _json_bytes(selection.code_sources) != closure._canonical:
            _fail('managed_source_owner_mismatch')
        managed, expected = closure.paths()
        paths, total = [], sum(len(row.content) for row in managed.values())
        if total > _MAX_BYTES:
            _fail('limit_bytes')
        for row in value['external']:
            _closed(row, {'path', 'sha256', 'base64'}, ('code_sources', 'external'))
            if type(row['path']) is not str or type(row['base64']) is not str or len(row['base64']) > 6 * 1024 * 1024:
                _fail()
            try:
                content = base64.b64decode(row['base64'], validate=True)
            except (ValueError, TypeError):
                _fail()
            total += len(content)
            if (len(content) > 4 * 1024 * 1024 or total > _MAX_BYTES
                    or row['sha256'] != sha256(content).hexdigest()):
                _fail()
            if row['path'] in managed and managed[row['path']].content != content:
                _fail('managed_source_conflict')
            paths.append(row['path'])
        if paths != sorted(expected):
            _fail('managed_source_owner_mismatch')
        return cls(_json_bytes(value))

    def resolver(self, path):
        value = self.to_dict()
        for row in value['closure']['contents']:
            expected = '__pupu_code__/sha256/' + row['sha256'] + '.py'
            if path == expected:
                return CodeSourceSnapshot(path, row['text'].encode('utf-8'), row['sha256'])
        for row in value['external']:
            if path == row['path']:
                return CodeSourceSnapshot(path, base64.b64decode(row['base64'], validate=True), row['sha256'])
        _fail('managed_source_missing', ('source', 'path'))
