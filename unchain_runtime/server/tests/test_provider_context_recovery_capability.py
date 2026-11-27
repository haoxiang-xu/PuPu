"""Admit recovery only from the actually imported runtime's public manifest."""

import context_memory_v2_capability as gate
from test_context_memory_v2_runtime_protocol import _producer_manifest, _protocol, _resign


def test_updated_imported_runtime_declares_provider_context_recovery():
    manifest = _producer_manifest()
    assert 'provider_context_limit_recovery_v1' in _protocol(manifest, 'context_memory')['features']
    assert gate.verify_context_memory_v2_capability(manifest=manifest, requested_mode='all').ready


def test_old_runtime_does_not_claim_context_recovery():
    manifest = _producer_manifest()
    _protocol(manifest, 'context_memory')['features'].remove('provider_context_limit_recovery_v1')
    verdict = gate.verify_context_memory_v2_capability(manifest=_resign(manifest), requested_mode='all')
    assert verdict.ready is False
    assert verdict.reason == 'unchain_runtime_protocol_required_feature_missing'
