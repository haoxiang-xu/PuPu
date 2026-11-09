"""Exact legacy chat aliases, enabled only by an explicit atomic upgrade.

Start admission only. Retained legacy/native resumes must not call this module.
The read-only catalog is a projection of Store identities, never display names.
"""
from contextlib import closing, contextmanager

from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from skeleton_legacy_upgrade_save import _RECEIPT, _receipt_policy

RECIPE_SCOPE = 'user:agent_recipes'


def _error(code, message, status=409):
    raise SkeletonResourceError(code, ('options', 'recipe_name'), message, status=status)


def _alias_rows(connection, name):
    aliases = connection.execute('SELECT DISTINCT target_id FROM legacy_aliases WHERE source_scope=? AND legacy_name=?', (RECIPE_SCOPE, name)).fetchall()
    if len(aliases) > 1:
        _error('legacy_name_ambiguous', 'The selected legacy Agent alias is ambiguous.')
    if not aliases:
        return []
    rows = connection.execute('SELECT * FROM resources WHERE resource_id=?', (aliases[0]['target_id'],)).fetchall()
    if not rows:
        _error('resource_missing', 'The selected legacy Agent alias has no resource.', 404)
    if len(rows) > 1:
        _error('legacy_name_ambiguous', 'The selected legacy Agent alias is ambiguous.')
    return rows


def _upgraded(connection, row):
    if connection.execute('SELECT 1 FROM store_meta WHERE key=?', (_RECEIPT + row['resource_id'],)).fetchone() is None:
        return False
    _receipt_policy(connection, row)
    return True


def resolve_legacy_chat_options(options, *, store=None):
    """Return detached start options; a missing alias remains an explicit Recipe."""
    result = dict(options) if type(options) is dict else {}
    if 'skeleton_selection' in result or result.get('recipe_name') in (None, ''):
        return result
    name = result['recipe_name']
    if type(name) is not str or not name or '\0' in name:
        _error('invalid_recipe_selection', 'Recipe selection must be an exact name.', 400)
    store = SkeletonResourceStore() if store is None else store
    with closing(store._connect()) as connection:
        connection.execute('BEGIN')
        rows = _alias_rows(connection, name)
        if not rows or not _upgraded(connection, rows[0]):
            return result
        row = rows[0]
        if row['archived'] or row['kind'] != 'agent':
            _error('resource_archived' if row['archived'] else 'wrong_kind', 'The upgraded Agent is unavailable.')
        result.pop('recipe_name')
        result['skeleton_selection'] = {'schema': 'pupu.skeleton_chat_selection.v1',
            'kind': 'resource', 'resource_id': row['resource_id']}
    return result


def legacy_chat_catalog(store=None):
    store = SkeletonResourceStore() if store is None else store
    from skeleton_runtime_capability import require_skeleton_runtime
    manifest = require_skeleton_runtime()
    with closing(store._connect()) as connection:
        connection.execute('BEGIN')
        resources = [{'resource_id': row['resource_id'], 'upgraded': _upgraded(connection, row)}
                     for row in connection.execute('SELECT * FROM resources WHERE source_identity IS NOT NULL ORDER BY resource_id')]
        grouped = {}
        for row in connection.execute('SELECT source_scope,legacy_name,target_id FROM legacy_aliases ORDER BY source_scope,legacy_name,target_id'):
            grouped.setdefault((row['source_scope'], row['legacy_name']), set()).add(row['target_id'])
        aliases = [{'source_scope': scope, 'legacy_name': name, 'resource_ids': sorted(ids)}
                   for (scope, name), ids in grouped.items()]
        return {'schema': 'pupu.legacy-chat-catalog.v1', 'runtime_manifest_digest': manifest['manifest_digest'],
                'resources': resources, 'aliases': aliases}


@contextmanager
def legacy_recipe_write(name, *, store=None):
    """Serialize obsolete file writers with apply; an upgraded original is read-only."""
    store = SkeletonResourceStore() if store is None else store
    with closing(store._connect()) as connection:
        connection.execute('BEGIN IMMEDIATE')
        try:
            for row in _alias_rows(connection, name):
                if _upgraded(connection, row):
                    _error('legacy_resource_upgraded', 'Edit this upgraded Agent in Agent Builder.')
            yield
        finally:
            connection.rollback()
