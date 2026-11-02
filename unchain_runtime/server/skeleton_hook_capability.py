"""Independent CLOSED admission of the imported runtime's Hook enable contract."""
from copy import deepcopy
import importlib

from skeleton_runtime_capability import SkeletonRuntimeCompatibilityError, require_skeleton_runtime


def hook_enable_capabilities():
    manifest = require_skeleton_runtime()
    protocol = next(item for item in manifest['protocols'] if item['id'] == 'skeleton_execution')
    try:
        if 'hook_enable_v1' not in protocol['features']:
            raise ValueError('unsupported')
        module = importlib.import_module('unchain.skeleton.hooks_config')
        producer = getattr(module, 'hook_entry_contract', None)
        contract = producer() if callable(producer) else None
        if (type(contract) is not dict or set(contract) != {
                'schema', 'required_fields', 'optional_fields', 'omitted_enabled'}
                or contract['schema'] != 'unchain.skeleton_hook_entry.v1'
                or type(contract['required_fields']) is not list
                or contract['required_fields'] != ['event', 'force_approval', 'id', 'order', 'tool_name', 'workflow']
                or type(contract['optional_fields']) is not list or contract['optional_fields'] != ['enabled']
                or contract['omitted_enabled'] is not True):
            raise ValueError('unsupported')
    except Exception:
        # Never forward producer exceptions: the capability carries no secrets
        # and may not acquire one by stringifying an exception.
        raise SkeletonRuntimeCompatibilityError(
            'skeleton_hook_enable_unavailable', 'This runtime does not support Hook enable state.',
        ) from None
    return {'schema': 'pupu.skeleton_hooks_capabilities.v1',
            'runtime_manifest_digest': manifest['manifest_digest'], 'hook_entry': deepcopy(contract)}


def hook_tool_set_capabilities():
    """Independently admit the imported producer's exact-name-set extension.

    The enable envelope is deliberately unchanged. This separate contract is
    required only for the new list representation, never inferred from paths
    or a callable getter without its manifest feature.
    """
    manifest = require_skeleton_runtime()
    protocol = next(item for item in manifest['protocols'] if item['id'] == 'skeleton_execution')
    try:
        if 'hook_tool_set_v1' not in protocol['features']:
            raise ValueError('unsupported')
        module = importlib.import_module('unchain.skeleton.hooks_config')
        producer = getattr(module, 'hook_tool_set_contract', None)
        contract = producer() if callable(producer) else None
        if (type(contract) is not dict or set(contract) != {
                'schema', 'field', 'legacy_types', 'set_type', 'minimum_size',
                'duplicates', 'names', 'normalization'}
                or contract['schema'] != 'unchain.skeleton_hook_tool_set.v1'
                or contract['field'] != 'tool_name'
                or type(contract['legacy_types']) is not list
                or contract['legacy_types'] != ['null', 'string']
                or contract['set_type'] != 'array'
                or type(contract['minimum_size']) is not int or contract['minimum_size'] != 1
                or contract['duplicates'] != 'reject'
                or contract['names'] != 'nonblank_exact'
                or contract['normalization'] != 'none'):
            raise ValueError('unsupported')
    except Exception:
        raise SkeletonRuntimeCompatibilityError(
            'skeleton_hook_tool_set_unavailable', 'This runtime does not support exact Hook tool sets.',
        ) from None
    return {'schema': 'pupu.skeleton_hook_tool_set_capabilities.v1',
            'runtime_manifest_digest': manifest['manifest_digest'], 'tool_matcher': deepcopy(contract)}


def hook_workflow_capabilities():
    """Admit the separate owned-Workflow source contract from the real runtime."""
    manifest = require_skeleton_runtime()
    protocol = next(item for item in manifest['protocols'] if item['id'] == 'skeleton_execution')
    try:
        if protocol['minor'] < 4 or 'hook_embedded_workflow_v1' not in protocol['features']:
            raise ValueError('unsupported')
        producer = getattr(importlib.import_module('unchain.skeleton.hooks_config'),
                           'hook_workflow_contract', None)
        contract = producer() if callable(producer) else None
        expected = {'schema': 'unchain.skeleton_hook_workflow.v1', 'field': 'workflow',
                    'reference_fields': ['revision_id', 'workflow_id'],
                    'embedded_fields': ['document', 'kind'], 'embedded_kind': 'embedded',
                    'document_kind': 'workflow', 'identity': 'embedded-sha256'}
        if (type(contract) is not dict or set(contract) != set(expected)
                or any(type(contract[key]) is not type(value) or contract[key] != value
                       for key, value in expected.items())):
            raise ValueError('unsupported')
    except Exception:
        raise SkeletonRuntimeCompatibilityError(
            'skeleton_hook_workflow_unavailable', 'This runtime does not support owned Hook Workflows.',
        ) from None
    return {'schema': 'pupu.skeleton_hook_workflow_capabilities.v1',
            'runtime_manifest_digest': manifest['manifest_digest'], 'workflow_source': deepcopy(contract)}
