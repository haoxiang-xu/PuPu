import context_memory_v2_capability as gate
from test_context_memory_v2_runtime_protocol import _producer_manifest, _protocol, _resign


def test_runtime_without_read_recovery_is_rejected_even_with_paging():
    manifest = _producer_manifest()
    context = _protocol(manifest, 'context_memory')
    assert 'context_content_paging_v1' in context['features']
    context['features'].remove('context_content_read_recovery_v1')
    verdict = gate.verify_context_memory_v2_capability(
        manifest=_resign(manifest), requested_mode='all',
    )
    assert verdict.ready is False
    assert verdict.reason=='unchain_runtime_protocol_required_feature_missing'
