"""Internal atomic graph/source persistence; no HTTP or execution authority."""
from contextlib import closing
from hashlib import sha256
import json
import sqlite3
import time

from skeleton_code_sources import (
    ManagedCodeSourceResolver, _content_digest, _path, prepare_managed_code_edit,
)
from skeleton_resource_store import (
    SkeletonResourceError, _digest, _json_text, _resource_id, _strict_json,
)


_STORE_SCHEMA = 'pupu.skeleton_resource_store.v3'
_RESPONSE_SCHEMA = 'pupu.skeleton-resource.v2'
_MANIFEST_SCHEMA = 'pupu.skeleton-code-sources.v1'
_SNAPSHOT_SCHEMA = 'pupu.skeleton-code-snapshot.v1'


def _fail(code, path, message, status=409):
    raise SkeletonResourceError(code, tuple(path), message, status=status)


def validate_managed_store_schema(connection):
    columns = {row['name'] for row in connection.execute('PRAGMA table_info(resources)')}
    blob_columns = {row['name'] for row in connection.execute('PRAGMA table_info(code_source_blobs)')}
    if (not {'code_sources_manifest', 'code_content_digest'} <= columns
            or blob_columns != {'sha256', 'content'}):
        _fail('managed_source_corrupt', ('store', 'schema'),
              'Managed source storage schema is incomplete.')
    version = connection.execute("SELECT value FROM store_meta WHERE key='schema'").fetchone()['value']
    if version == _STORE_SCHEMA:
        published = {row['name'] for row in connection.execute('PRAGMA table_info(workflow_versions)')}
        if not {'code_sources_manifest', 'code_content_digest'} <= published:
            _fail('managed_source_corrupt', ('store', 'schema'), 'Published source schema is incomplete.')


def _upgrade_published_schema(connection):
    connection.execute('ALTER TABLE workflow_versions ADD COLUMN code_sources_manifest TEXT')
    connection.execute('ALTER TABLE workflow_versions ADD COLUMN code_content_digest TEXT')
    connection.execute("""CREATE TRIGGER managed_version_update BEFORE UPDATE ON workflow_versions
        WHEN OLD.code_sources_manifest IS NOT NULL OR NEW.code_sources_manifest IS NOT NULL
        BEGIN SELECT RAISE(ABORT, 'immutable source version'); END""")
    connection.execute("""CREATE TRIGGER managed_version_delete BEFORE DELETE ON workflow_versions
        WHEN OLD.code_sources_manifest IS NOT NULL
        BEGIN SELECT RAISE(ABORT, 'retained source version'); END""")
    connection.execute("""CREATE TRIGGER managed_version_insert BEFORE INSERT ON workflow_versions
        WHEN EXISTS(SELECT 1 FROM workflow_versions WHERE workflow_id=NEW.workflow_id
            AND revision_id=NEW.revision_id AND code_sources_manifest IS NOT NULL)
            OR (NEW.code_sources_manifest IS NOT NULL AND pupu_managed_write() != 1)
        BEGIN SELECT RAISE(ABORT, 'managed source API required'); END""")
    connection.execute("UPDATE store_meta SET value=? WHERE key='schema'", (_STORE_SCHEMA,))


def _ensure_schema(connection):
    version = connection.execute("SELECT value FROM store_meta WHERE key='schema'").fetchone()['value']
    if version == _STORE_SCHEMA:
        validate_managed_store_schema(connection)
        return
    if version == 'pupu.skeleton_resource_store.v2':
        validate_managed_store_schema(connection)
        _upgrade_published_schema(connection)
        return
    if version != 'pupu.skeleton_resource_store.v1':
        _fail('unknown_version', ('store', 'schema'), 'Resource store schema is unsupported.')
    # execute(), not executescript(): DDL must share the caller's CAS transaction.
    connection.execute('ALTER TABLE resources ADD COLUMN code_sources_manifest TEXT')
    connection.execute('ALTER TABLE resources ADD COLUMN code_content_digest TEXT')
    connection.execute('CREATE TABLE code_source_blobs(sha256 TEXT PRIMARY KEY, content BLOB NOT NULL)')
    connection.execute("""CREATE TRIGGER code_blob_no_replace BEFORE INSERT ON code_source_blobs
        WHEN EXISTS(SELECT 1 FROM code_source_blobs
            WHERE sha256=NEW.sha256 AND content != NEW.content)
        BEGIN SELECT RAISE(ABORT, 'immutable source body'); END""")
    connection.execute("""CREATE TRIGGER code_blob_no_update BEFORE UPDATE ON code_source_blobs
        BEGIN SELECT RAISE(ABORT, 'immutable source body'); END""")
    connection.execute("""CREATE TRIGGER code_blob_no_delete BEFORE DELETE ON code_source_blobs
        BEGIN SELECT RAISE(ABORT, 'retained source body'); END""")
    connection.execute("""CREATE TRIGGER managed_resource_insert BEFORE INSERT ON resources
        WHEN (NEW.code_sources_manifest IS NOT NULL OR EXISTS(
            SELECT 1 FROM resources WHERE resource_id=NEW.resource_id
                AND code_sources_manifest IS NOT NULL)) AND pupu_managed_write() != 1
        BEGIN SELECT RAISE(ABORT, 'managed source API required'); END""")
    connection.execute("""CREATE TRIGGER managed_resource_update BEFORE UPDATE ON resources
        WHEN (OLD.code_sources_manifest IS NOT NULL OR NEW.code_sources_manifest IS NOT NULL)
            AND pupu_managed_write() != 1
        BEGIN SELECT RAISE(ABORT, 'managed source API required'); END""")
    connection.execute("""CREATE TRIGGER managed_resource_delete BEFORE DELETE ON resources
        WHEN OLD.code_sources_manifest IS NOT NULL AND pupu_managed_write() != 1
        BEGIN SELECT RAISE(ABORT, 'managed source API required'); END""")
    connection.execute("""CREATE TRIGGER managed_resource_shape_insert BEFORE INSERT ON resources
        WHEN (NEW.code_sources_manifest IS NULL) != (NEW.code_content_digest IS NULL)
        BEGIN SELECT RAISE(ABORT, 'incomplete managed aggregate'); END""")
    connection.execute("""CREATE TRIGGER managed_resource_shape_update BEFORE UPDATE ON resources
        WHEN (NEW.code_sources_manifest IS NULL) != (NEW.code_content_digest IS NULL)
        BEGIN SELECT RAISE(ABORT, 'incomplete managed aggregate'); END""")
    _upgrade_published_schema(connection)


def _frame(connection, row):
    try:
        document = _strict_json(row['draft_json'])
        if (type(document) is not dict or _digest(document) != row['draft_digest']
                or document.get('id') != row['resource_id']
                or document.get('kind') != row['kind']
                or document.get('name') != row['name']
                or document.get('description', '') != row['description']):
            _fail('managed_source_corrupt', ('document',), 'Stored graph identity differs.')
        manifest_present = 'code_sources_manifest' in row.keys() and row['code_sources_manifest'] is not None
        digest_present = 'code_content_digest' in row.keys() and row['code_content_digest'] is not None
        if manifest_present != digest_present:
            _fail('managed_source_corrupt', ('sources_manifest',), 'Stored source manifest is incomplete.')
        managed = manifest_present
        manifest = (_strict_json(row['code_sources_manifest']) if managed
                    else {'schema': _MANIFEST_SCHEMA, 'entries': []})
        digest = row['code_content_digest'] if managed else _content_digest(document, manifest)
        # Validate manifest structure before using any digest to query storage.
        identities = set()
        if type(manifest) is not dict or type(manifest.get('entries')) is not list:
            _fail('managed_source_corrupt', ('sources_manifest',), 'Stored source manifest is unreadable.')
        for entry in manifest['entries']:
            if type(entry) is not dict or type(entry.get('sha256')) is not str:
                _fail('managed_source_corrupt', ('sources_manifest',), 'Stored source identity is unreadable.')
            identities.add(entry['sha256'])
        contents = []
        for identity in sorted(identities):
            blob = connection.execute('SELECT content FROM code_source_blobs WHERE sha256=?',
                                      (identity,)).fetchone()
            if blob is None:
                _fail('managed_source_missing', ('contents', identity), 'Managed source body is missing.')
            content = blob['content']
            if type(content) is not bytes or sha256(content).hexdigest() != identity:
                _fail('managed_source_corrupt', ('contents', identity), 'Managed source bytes differ from their digest.')
            contents.append({'sha256': identity, 'text': content.decode('utf-8')})
        frame = {'schema': _SNAPSHOT_SCHEMA, 'document': document,
                 'sources_manifest': manifest, 'contents': contents, 'content_digest': digest}
        ManagedCodeSourceResolver(frame)
        return frame
    except SkeletonResourceError as error:
        if error.code in {'managed_source_corrupt', 'managed_source_missing'}:
            raise
        raise SkeletonResourceError('managed_source_corrupt', error.path,
                                    'Stored managed source aggregate is invalid.', status=409) from error
    except (ValueError, TypeError, UnicodeError, KeyError, IndexError) as error:
        raise SkeletonResourceError('managed_source_corrupt', ('sources_manifest',),
                                    'Stored managed source aggregate is unreadable.', status=409) from error


def _response(store, row, frame):
    resource = store._summary(row)
    resource['document'] = frame['document']
    resource['diagnostics'] = store.diagnose(frame['document'])
    return {'schema': _RESPONSE_SCHEMA, 'resource': resource,
            **{key: frame[key] for key in ('sources_manifest', 'contents', 'content_digest')}}


def _code_sources(document):
    stack = [(document, ())]
    while stack:
        body, prefix = stack.pop()
        if type(body) is not dict or type(body.get('nodes')) is not list:
            continue
        for index, node in enumerate(body['nodes']):
            if type(node) is not dict or type(node.get('config')) is not dict:
                continue
            address = prefix + ('nodes', index)
            if node.get('type') == 'code':
                config = node['config'].get('code')
                source = config.get('source') if type(config) is dict else None
                if type(source) is dict and source.get('kind') == 'file' and type(source.get('path')) is str:
                    yield address, source['path']
            elif node.get('type') == 'subagent_pool':
                entries = node['config'].get('subagents')
                for offset, entry in enumerate(entries if type(entries) is list else []):
                    source = entry.get('source') if type(entry) is dict else None
                    if type(source) is dict and source.get('kind') == 'embedded':
                        stack.append((source.get('document'), address +
                                      ('config', 'subagents', offset, 'source', 'document')))
            elif node.get('type') == 'hooks_pool':
                entries = node['config'].get('hooks')
                for offset, entry in enumerate(entries if type(entries) is list else []):
                    source = entry.get('workflow') if type(entry) is dict else None
                    if type(source) is dict and source.get('kind') == 'embedded':
                        stack.append((source.get('document'), address +
                                      ('config', 'hooks', offset, 'workflow', 'document')))


def _require_retained_bindings(previous, current):
    old_paths = {_path(row['sha256']) for row in previous['sources_manifest']['entries']}
    bound = {tuple(row['node_path']) for row in current['sources_manifest']['entries']}
    for address, path in _code_sources(current['document']):
        if path in old_paths and address not in bound:
            _fail('managed_source_required', ('document',) + address + ('config', 'code', 'source'),
                  'This Code source still names managed bytes; supply its source or explicitly change/remove it.')


def get_managed_resource(store, resource_id):
    identity = _resource_id(resource_id, ('resource_id',))
    if resource_id != identity:
        _fail('invalid_value', ('resource_id',), 'Resource id must have canonical spelling.', status=400)
    try:
        with closing(store._connect()) as connection, connection:
            connection.execute('BEGIN')
            row = connection.execute('SELECT * FROM resources WHERE resource_id=?', (identity,)).fetchone()
            if row is None:
                _fail('resource_missing', ('resource_id',), 'Skeleton resource was not found.', status=404)
            return _response(store, row, _frame(connection, row))
    except sqlite3.Error as error:
        raise SkeletonResourceError('source_store_unavailable', ('store',),
                                    'Managed source storage is unavailable.', status=503) from error


def save_managed_draft(store, value):
    return write_prepared_draft(store, prepare_managed_code_edit(value))


def write_prepared_draft(store, prepared, *, importing=False):
    """One transaction for normal CAS edits or create-or-identical imports."""
    frame = prepared.snapshot()
    document = frame['document']
    identity = document['id']
    try:
        with closing(store._connect()) as connection, connection:
            connection.execute('BEGIN IMMEDIATE')
            current = connection.execute('SELECT * FROM resources WHERE resource_id=?', (identity,)).fetchone()
            if importing and current is not None:
                previous = _frame(connection, current)
                if _json_text(previous) != _json_text(frame):
                    _fail('import_conflict', ('source_json', 'document', 'id'),
                          'Resource id already exists with different graph or source content.')
                result = _response(store, current, previous)
                connection.commit()
                return result
            if not importing and (current is None and prepared.expected_edit_token is not None
                    or current is not None and current['edit_token'] != prepared.expected_edit_token):
                _fail('edit_conflict', ('expected_edit_token',), 'Resource changed in another editor.')
            if current is not None:
                if current['kind'] != document['kind']:
                    _fail('kind_changed', ('document', 'kind'), 'Resource kind cannot change.')
                _require_retained_bindings(_frame(connection, current), frame)
            _ensure_schema(connection)
            connection.create_function('pupu_managed_write', 0, lambda: 1)
            for row in frame['contents']:
                content = row['text'].encode('utf-8')
                existing = connection.execute('SELECT content FROM code_source_blobs WHERE sha256=?',
                                              (row['sha256'],)).fetchone()
                if existing is None:
                    connection.execute('INSERT INTO code_source_blobs(sha256,content) VALUES(?,?)',
                                       (row['sha256'], content))
                elif existing['content'] != content:
                    _fail('managed_source_corrupt', ('contents', row['sha256']),
                          'Existing source bytes conflict with their digest.')
            revision = 1 if current is None else current['edit_revision'] + 1
            token = store._token(revision, frame['content_digest'])
            now = int(time.time() * 1000)
            fields = (document['name'], document.get('description', ''), _json_text(document),
                      _digest(document), revision, token, now,
                      _json_text(frame['sources_manifest']), frame['content_digest'])
            if current is None:
                connection.execute('''INSERT INTO resources(
                    name,description,draft_json,draft_digest,edit_revision,edit_token,updated_at_ms,
                    code_sources_manifest,code_content_digest,resource_id,kind,archived,source_identity,created_at_ms)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,0,NULL,?)''', (*fields, identity, document['kind'], now))
            else:
                connection.execute('''UPDATE resources SET name=?,description=?,draft_json=?,draft_digest=?,
                    edit_revision=?,edit_token=?,updated_at_ms=?,code_sources_manifest=?,code_content_digest=?
                    WHERE resource_id=?''', (*fields, identity))
            stored = connection.execute('SELECT * FROM resources WHERE resource_id=?', (identity,)).fetchone()
            # Read exact stored bytes and build the response before committing.
            # Any refusal here rolls back blobs, graph, migration and token.
            result = _response(store, stored, _frame(connection, stored))
            connection.commit()
            return result
    except sqlite3.Error as error:
        raise SkeletonResourceError('source_store_unavailable', ('store',),
                                    'Managed source save could not be committed.', status=503) from error
