"""Atomic managed Workflow revisions; graph-only publication stays closed."""
from contextlib import closing
import sqlite3
import time

from unchain.skeleton.agent_preparation import execution_definition_digest

from skeleton_code_admission import _AdmissionStore
from skeleton_code_source_store import _ensure_schema, _frame
from skeleton_code_sources import _closed
from skeleton_resource_store import SkeletonResourceError, _resource_id, _json_text


def _fail(code, path, message, status=409):
    raise SkeletonResourceError(code, tuple(path), message, status=status)


def _version_result(store, connection, row):
    snapshot = _AdmissionStore(store, connection)
    snapshot._published_row(connection, row['workflow_id'], row['revision_id'])
    owner, bodies = snapshot.records[('workflow', row['workflow_id'], row['revision_id'])]
    dependencies = connection.execute('''SELECT target_workflow_id,target_revision_id,target_digest
        FROM workflow_dependencies WHERE workflow_id=? AND revision_id=? ORDER BY position''',
        (row['workflow_id'], row['revision_id'])).fetchall()
    return {'schema': 'pupu.skeleton-workflow-version.v2', 'version': store._version_payload(row, dependencies),
            'sources_manifest': owner['sources_manifest'], 'contents': bodies, 'content_digest': owner['content_digest']}


def get_managed_workflow_version(store, resource_id, revision_id):
    identity = _resource_id(resource_id, ('resource_id',))
    revision = _resource_id(revision_id, ('revision_id',))
    if identity != resource_id or revision != revision_id:
        _fail('invalid_value', ('resource_id',), 'Workflow identity must be canonical.', 400)
    try:
        with closing(store._connect()) as connection, connection:
            connection.execute('BEGIN')
            row = connection.execute('SELECT * FROM workflow_versions WHERE workflow_id=? AND revision_id=?',
                                     (identity, revision)).fetchone()
            if row is None:
                _fail('resource_missing', ('revision_id',), 'Workflow version was not found.', 404)
            return _version_result(store, connection, row)
    except sqlite3.Error as error:
        raise SkeletonResourceError('source_store_unavailable', ('store',),
                                    'Workflow source storage is unavailable.', status=503) from error


def publish_managed_workflow(store, resource_id, value):
    identity = _resource_id(resource_id, ('resource_id',))
    if identity != resource_id:
        _fail('invalid_value', ('resource_id',), 'Workflow identity must be canonical.', 400)
    _closed(value, {'schema', 'expected_edit_token'}, ('body',))
    if value['schema'] != 'pupu.skeleton-publish.v2':
        _fail('unsupported_version', ('body', 'schema'), 'Unsupported Workflow publication version.', 400)
    token = value['expected_edit_token']
    if type(token) is not str or not token or token != token.strip():
        _fail('invalid_value', ('body', 'expected_edit_token'), 'A canonical edit token is required.', 400)
    try:
        with closing(store._connect()) as connection, connection:
            connection.execute('BEGIN IMMEDIATE')
            row = connection.execute('SELECT * FROM resources WHERE resource_id=?', (identity,)).fetchone()
            if row is None:
                _fail('resource_missing', ('resource_id',), 'Workflow was not found.', 404)
            if row['kind'] != 'workflow':
                _fail('wrong_kind', ('resource_id',), 'Only Workflow resources can publish.')
            if row['archived']:
                _fail('resource_archived', ('resource_id',), 'Archived Workflow cannot publish.')
            if row['edit_token'] != token:
                _fail('edit_conflict', ('expected_edit_token',), 'Workflow changed before publication.')
            frame = _frame(connection, row)
            document = frame['document']
            plan = store._validate_execution(document)
            store._validate_local_profiles(document)
            snapshot = _AdmissionStore(store, connection)
            dependencies = snapshot._resolve_closure(connection, document, identity)
            definition = execution_definition_digest(plan)
            _ensure_schema(connection)
            existing = connection.execute('''SELECT * FROM workflow_versions
                WHERE workflow_id=? AND definition_digest=? AND code_content_digest=?''',
                (identity, definition, frame['content_digest'])).fetchone()
            if existing is not None:
                return _version_result(store, connection, existing)
            ordinal = connection.execute('SELECT coalesce(max(ordinal),0)+1 FROM workflow_versions WHERE workflow_id=?',
                                         (identity,)).fetchone()[0]
            revision = 'rev-' + str(ordinal) + '-' + definition[:16]
            connection.create_function('pupu_managed_write', 0, lambda: 1)
            connection.execute('''INSERT INTO workflow_versions(workflow_id,revision_id,ordinal,definition_json,
                definition_digest,created_at_ms,code_sources_manifest,code_content_digest) VALUES(?,?,?,?,?,?,?,?)''',
                (identity, revision, ordinal, _json_text(document), definition, int(time.time() * 1000),
                 _json_text(frame['sources_manifest']), frame['content_digest']))
            for position, (target, target_revision, digest) in enumerate(dependencies):
                connection.execute('''INSERT INTO workflow_dependencies(workflow_id,revision_id,position,
                    target_workflow_id,target_revision_id,target_digest) VALUES(?,?,?,?,?,?)''',
                    (identity, revision, position, target, target_revision, digest))
            row = connection.execute('SELECT * FROM workflow_versions WHERE workflow_id=? AND revision_id=?',
                                     (identity, revision)).fetchone()
            result = _version_result(store, connection, row)
            connection.commit()
            return result
    except sqlite3.Error as error:
        raise SkeletonResourceError('source_store_unavailable', ('store',),
                                    'Workflow source publication could not be committed.', status=503) from error
