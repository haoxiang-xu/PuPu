"""Versioned managed-source API. No arbitrary file read/write endpoint."""
from contextlib import closing

from flask import request
from werkzeug.exceptions import BadRequest, RequestEntityTooLarge

from route_blueprint import api_blueprint
from route_skeleton_resources import _authorized, _run
from skeleton_code_admission import _AdmissionStore
from skeleton_code_sources import _closed
from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from skeleton_runtime_capability import require_skeleton_runtime
from skeleton_source_transfer import REQUEST_BYTES as TRANSFER_REQUEST_BYTES, managed_transfer_capabilities


MAX_REQUEST_BYTES = 40 * 1024 * 1024


def _body():
    # Bound the raw stream before JSON allocation, including chunked requests.
    request.max_content_length = MAX_REQUEST_BYTES
    try:
        return request.get_json(force=True)
    except RequestEntityTooLarge as error:
        raise SkeletonResourceError('limit_bytes', ('body',), 'Managed source request is too large.', status=413) from error
    except BadRequest as error:
        raise SkeletonResourceError('invalid_json', ('body',), 'Request must contain valid JSON.', status=400) from error


def _serve(operation):
    denied = _authorized()
    return denied if denied is not None else _run(operation)


@api_blueprint.get('/skeleton_resources/v2/capabilities')
def managed_code_capabilities():
    def operation():
        return {'schema': 'pupu.skeleton-code-capabilities.v1',
            'edit_schema': 'pupu.skeleton-edit.v2', 'resource_schema': 'pupu.skeleton-resource.v2',
            'publication_schema': 'pupu.skeleton-publish.v2',
            'version_schema': 'pupu.skeleton-workflow-version.v2',
            'preflight_schema': 'pupu.skeleton-preflight.v2',
            'source_bytes': 4 * 1024 * 1024, 'total_bytes': 16 * 1024 * 1024,
            'bindings': 256, 'request_bytes': MAX_REQUEST_BYTES,
            'runtime_manifest': require_skeleton_runtime()}
    return _serve(operation)


@api_blueprint.post('/skeleton_resources/v2')
def save_managed_code_resource():
    return _serve(lambda: SkeletonResourceStore().save_managed_draft(_body()))


@api_blueprint.get('/skeleton_resources/v2/<resource_id>')
def get_managed_code_resource(resource_id):
    return _serve(lambda: SkeletonResourceStore().get_managed_resource(resource_id))


@api_blueprint.post('/skeleton_resources/v2/<resource_id>/preflight')
def preflight_managed_code_resource(resource_id):
    def operation():
        _closed(_body(), set(), ('body',))
        store = SkeletonResourceStore()
        with closing(store._connect()) as connection, connection:
            connection.execute('BEGIN')
            result = _AdmissionStore(store, connection).preflight(resource_id)
            return {'schema': 'pupu.skeleton-preflight.v2', 'preflight': result}
    return _serve(operation)


@api_blueprint.post('/skeleton_resources/v2/<resource_id>/publish')
def publish_managed_code_workflow(resource_id):
    return _serve(lambda: SkeletonResourceStore().publish_managed_workflow(resource_id, _body()))


@api_blueprint.get('/skeleton_resources/v2/<resource_id>/versions/<revision_id>')
def get_managed_code_version(resource_id, revision_id):
    return _serve(lambda: SkeletonResourceStore().get_managed_workflow_version(resource_id, revision_id))


def _transfer_query():
    if request.args:
        key = sorted(request.args)[0]
        raise SkeletonResourceError('unknown_field', ('query', key), 'Transfer endpoints accept no query fields.')


def _transfer_body():
    request.max_content_length = TRANSFER_REQUEST_BYTES
    try:
        return request.get_json(force=True)
    except RequestEntityTooLarge as error:
        raise SkeletonResourceError('limit_bytes', ('body',), 'Portable import request is too large.', status=413) from error
    except BadRequest as error:
        raise SkeletonResourceError('invalid_json', ('body',), 'Request must contain valid JSON.') from error


@api_blueprint.get('/skeleton_resources/v2/transfer/capabilities')
def get_managed_transfer_capabilities():
    def operation():
        _transfer_query()
        return managed_transfer_capabilities()
    return _serve(operation)


@api_blueprint.get('/skeleton_resources/v2/<resource_id>/export')
def export_managed_skeleton_resource(resource_id):
    def operation():
        _transfer_query()
        return SkeletonResourceStore().export_managed_resource(resource_id)
    return _serve(operation)


@api_blueprint.post('/skeleton_resources/v2/import')
def import_managed_skeleton_resource():
    def operation():
        _transfer_query()
        return SkeletonResourceStore().import_managed_resource(_transfer_body())
    return _serve(operation)
