"""One real SQLite read snapshot for graphs, published versions and owned bytes."""
from contextlib import closing, contextmanager
from dataclasses import replace
from copy import deepcopy

from skeleton_chat_selection import prepare_skeleton_chat_selection, _prepare_selected_agent, _parse_selection
from skeleton_code_closure import FrozenSkeletonCodeClosure
from skeleton_code_source_store import _frame
from skeleton_resource_store import SkeletonResourceStore, _resource_id, _digest, _strict_json
from skeleton_workflow_snapshot import freeze_skeleton_workflow_dependencies


def prepare_test_execution_material(resource_id, expected_edit_token, kind, *, store=None, draft_kernel=None):
    """Freeze a Builder test's exact saved root and closure in one read snapshot.

    Ordinary chat retains its Agent-only resolver. Only this explicit test
    boundary admits a Workflow, and it never publishes or rewrites a draft.
    """
    from skeleton_chat_selection import FrozenSkeletonChatSelection, _check_preflight
    from skeleton_resource_store import SkeletonResourceError
    from skeleton_production_state import canonical

    if kind not in {"agent", "workflow"} or type(expected_edit_token) is not str or not expected_edit_token:
        raise SkeletonResourceError("invalid_value", ("kind",), "A saved Agent or Workflow is required.")
    store = SkeletonResourceStore() if store is None else store
    with closing(store._connect()) as connection, connection:
        connection.execute('BEGIN')
        snapshot = _AdmissionStore(store, connection)
        admitted = snapshot.preflight(resource_id, draft_kernel=draft_kernel)
        if admitted['kind'] != kind:
            raise SkeletonResourceError("wrong_kind", ("kind",), "The saved resource has a different kind.")
        if admitted['edit_token'] != expected_edit_token:
            raise SkeletonResourceError("edit_conflict", ("expected_edit_token",), "The resource changed before the test started.", status=409)
        _check_preflight(admitted, resource_id, kind=kind)
        selected = FrozenSkeletonChatSelection(canonical(admitted))
        workflows = freeze_skeleton_workflow_dependencies(selected, store=snapshot)
        if any(owner['managed'] for owner, _ in snapshot.records.values()):
            closure = FrozenSkeletonCodeClosure.capture(selected, workflows, snapshot.records)
            selected = replace(selected, _code_sources_json=closure._canonical,
                               _workflows_json=workflows._canonical_json)
        return selected, workflows


class _AdmissionStore(SkeletonResourceStore):
    def __init__(self, store, connection):
        self.root = store.root
        self.database_path = store.database_path
        self.connection = connection
        self.records = {}

    @contextmanager
    def _connect(self):
        # The outer operation owns BEGIN and lifetime. Never commit this read
        # snapshot through nested helpers' connection context managers.
        yield self.connection

    def _record(self, frame, *, kind, identity, revision, managed):
        owner = {'kind': kind, 'id': identity, 'revision': revision, 'managed': managed,
                 **{key: frame[key] for key in ('document', 'sources_manifest', 'content_digest')}}
        self.records[(kind, identity, revision)] = (owner, frame['contents'])
        return deepcopy(frame['document'])

    def _document(self, row):
        frame = _frame(self.connection, row)
        managed = 'code_sources_manifest' in row.keys() and row['code_sources_manifest'] is not None
        return self._record(frame, kind='resource', identity=row['resource_id'],
                            revision=row['edit_token'], managed=managed)

    def preflight(self, resource_id, *, legacy_kernel=None, draft_kernel=None):
        identity = _resource_id(resource_id, ('resource_id',))
        return self._preflight_in_connection(self.connection, identity, legacy_kernel=legacy_kernel,
                                             draft_kernel=draft_kernel)

    def _published_row(self, connection, workflow_id, revision_id):
        row = connection.execute('''SELECT v.*,r.archived,r.kind FROM workflow_versions v
            JOIN resources r ON r.resource_id=v.workflow_id
            WHERE v.workflow_id=? AND v.revision_id=?''', (workflow_id, revision_id)).fetchone()
        if row is not None:
            document = _strict_json(row['definition_json'])
            normalized = {'resource_id': workflow_id, 'kind': 'workflow', 'name': document['name'],
                          'description': document.get('description', ''), 'draft_json': row['definition_json'],
                          'draft_digest': _digest(document)}
            managed = 'code_sources_manifest' in row.keys() and row['code_sources_manifest'] is not None
            if managed:
                normalized.update(code_sources_manifest=row['code_sources_manifest'], code_content_digest=row['code_content_digest'])
            frame = _frame(connection, normalized)
            self._record(frame, kind='workflow', identity=workflow_id, revision=revision_id, managed=managed)
        return row


def prepare_code_execution_material(options, *, store=None, legacy_kernel=None, freeze_legacy=True):
    store = SkeletonResourceStore() if store is None else store
    if type(store) is not SkeletonResourceStore:
        selected = prepare_skeleton_chat_selection(options, store=store, legacy_kernel=legacy_kernel)
        return selected, freeze_skeleton_workflow_dependencies(selected, store=store)
    with closing(store._connect()) as connection, connection:
        connection.execute('BEGIN')
        schema = connection.execute("SELECT value FROM store_meta WHERE key='schema'").fetchone()['value']
        if schema == 'pupu.skeleton_resource_store.v1' and not freeze_legacy:
            return _prepare_selected_agent(_parse_selection(options), store=store, legacy_kernel=legacy_kernel), None
        snapshot = _AdmissionStore(store, connection)
        selected = prepare_skeleton_chat_selection(options, store=snapshot, legacy_kernel=legacy_kernel)
        # Preflight has traversed every reachable version/ref on this same
        # transaction. Plain graphs retain the old lazy workflow-freezing seam.
        managed = any(owner['managed'] for owner, _ in snapshot.records.values())
        if not managed and not freeze_legacy:
            return selected, None
        workflows = freeze_skeleton_workflow_dependencies(selected, store=snapshot)
        if managed:
            closure = FrozenSkeletonCodeClosure.capture(selected, workflows, snapshot.records)
            selected = replace(selected, _code_sources_json=closure._canonical,
                               _workflows_json=workflows._canonical_json)
        return selected, workflows
