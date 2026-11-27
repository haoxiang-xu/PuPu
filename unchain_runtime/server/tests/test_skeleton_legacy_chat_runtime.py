"""Real SDK boundary, real durable Store: A survives cutover and B runs next."""
from collections import Counter
from copy import deepcopy
import json
from pathlib import Path
import threading
from types import SimpleNamespace

import pytest

import unchain_adapter as adapter
from skeleton_resource_store import SkeletonResourceStore
from test_skeleton_legacy_upgrade_save import migrate, recipe, apply, choices
from test_skeleton_resource_store import agent
from test_skeleton_production_chat import production, _approval_fixture, Stream


def test_running_upgraded_native_snapshot_survives_save_b_and_new_legacy_send_uses_b(production, monkeypatch):
    import openai
    store, options, calls = production
    source = recipe(name='Old')
    resource, request = migrate(store, source)
    resource, _ = apply(store, resource, request)
    doc = agent(resource['id']); doc['nodes'][1]['config']['kernel']['prompt'] = 'A frozen prompt'
    original = store.save_draft(doc, expected_edit_token=resource['edit_token'])
    options['skeleton_selection']['resource_id'] = resource['id']
    entered, release = threading.Event(), threading.Event()
    def factory(**kwargs):
        def create(**wire):
            calls.append({'client': deepcopy(kwargs), 'wire': deepcopy(wire)})
            if len(calls) == 1:
                entered.set(); assert release.wait(10)
            return Stream('End from A' if len(calls) == 1 else 'End from B')
        return SimpleNamespace(responses=SimpleNamespace(create=create))
    monkeypatch.setattr(openai, 'OpenAI', factory)
    result, errors = [], []
    def run():
        try: result.extend(adapter.stream_chat_events(message='A starts', history=[], options=options, session_id='cutover-session', attempt_id='cutover-A'))
        except BaseException as exc: errors.append(exc)
    thread = threading.Thread(target=run); thread.start()
    try:
        assert entered.wait(10)
        saved = original
        updated = deepcopy(saved['document']); updated['nodes'][1]['config']['kernel']['prompt'] = 'B new prompt'
        store.save_draft(updated, expected_edit_token=saved['edit_token'])
    finally:
        release.set(); thread.join(15)
    assert not thread.is_alive() and errors == []
    assert 'A frozen prompt' in json.dumps(calls[0]['wire']) and 'B new prompt' not in json.dumps(calls[0]['wire'])
    from skeleton_production_state import load_launch
    old = load_launch('cutover-session', 'cutover-A', expected_owner_chat_id='production-chat')
    assert old.selection.to_dict()['document'] == original['document']
    fresh = dict(options, recipe_name='Old'); fresh.pop('skeleton_selection')
    second = list(adapter.stream_chat_events(message='B starts', history=[], options=fresh, session_id='cutover-session', attempt_id='cutover-B'))
    assert 'B new prompt' in json.dumps(calls[1]['wire'])
    assert any(e.get('content') == 'End from A' for e in result)
    assert any(e.get('content') == 'End from B' for e in second)
    assert old.selection.to_dict()['document'] == original['document']
    (Path(options['workspace_root']) / 'cutover-evidence.json').write_text(json.dumps({
        'scenario': 'running-native-A-save-B-new-legacy-send', 'calls': calls,
        'launch_a': old.descriptor, 'document_a': original['document'],
        'launch_b': load_launch('cutover-session', 'cutover-B', expected_owner_chat_id='production-chat').descriptor,
        'events_a': result, 'events_b': second}, default=str, indent=2))


def test_parked_upgraded_native_a_uses_retained_kernel_after_save_b_and_reconstruction(production, monkeypatch):
    import durable_interaction_host as interactions
    store, options, calls = production
    options, effects, calls = _approval_fixture(production, monkeypatch, count=1)
    original = store.get_resource('production-agent')
    # Previously upgraded native A is retained while its stored definition
    # changes to B. The separate legacy graph case performs upgrade while parked.
    resource, upgrade_choices = migrate(store, recipe(name='Old'))
    resource, _ = apply(store, resource, upgrade_choices)
    doc = deepcopy(original['document']); doc['id'] = resource['id']
    authored = store.save_draft(doc, expected_edit_token=resource['edit_token'])
    options['skeleton_selection']['resource_id'] = resource['id']
    started = list(adapter.stream_chat_events(message='park A', history=[], options=options, session_id='cutover-wait', attempt_id='wait-A'))
    pending = interactions.get_pending_interaction('cutover-wait')
    assert pending['status'] == 'awaiting_response' and effects == [] and len(calls) == 1
    saved = authored
    changed = deepcopy(saved['document']); changed['nodes'][1]['config']['kernel']['profile']['model'] = 'B-new-model'
    store.save_draft(changed, expected_edit_token=saved['edit_token'])
    from skeleton_production_state import load_launch
    old = load_launch('cutover-wait', 'wait-A', expected_owner_chat_id='production-chat')
    assert old.selection.to_dict()['document'] == authored['document']
    interactions.record_interaction_receipt(session_id='cutover-wait', interaction_id=pending['interaction_id'], approved=True)
    import skeleton_legacy_chat
    monkeypatch.setattr(skeleton_legacy_chat, 'resolve_legacy_chat_options', lambda *a, **k: pytest.fail('resume consulted a mutable alias'))
    monkeypatch.setattr(SkeletonResourceStore, 'get_resource', lambda *a, **k: pytest.fail('resume consulted a mutable graph'))
    resumed = list(adapter.resume_chat_interaction_events(session_id='cutover-wait', interaction_id=pending['interaction_id'], options=dict(options, recipe_name='Old'), attempt_id='wait-resume', source_attempt_id='wait-A'))
    assert effects == ['effect-0'] and len(calls) == 2
    assert calls[1]['wire']['model'] != 'B-new-model'
    assert any(e.get('content') == 'Approved End' for e in resumed)
    assert old.selection.to_dict()['document'] == authored['document']
    (Path(options['workspace_root']) / 'cutover-evidence.json').write_text(json.dumps({
        'scenario': 'parked-native-A-save-B-reconstruct-resume', 'calls': calls,
        'pending': pending, 'launch_a': old.descriptor, 'document_a': authored['document'],
        'document_b': changed, 'effects': effects, 'events': resumed}, default=str, indent=2))


@pytest.mark.parametrize('cutover', ['waiting', 'running'])
def test_legacy_graph_before_upgrade_resumes_from_preserved_original(tmp_path, cutover):
    from test_memory_v2_unchain_active_graph_interaction_resume import (
        _production_patches, _recipe_payload, EXECUTION_ID, OWNER_CHAT_ID, COORDINATOR_ATTEMPT_ID, RECIPE_NAME)
    from recipe_loader import save_recipe, recipes_dir
    from durable_interaction_host import record_interaction_receipt
    entered, release = threading.Event(), threading.Event()
    class Requests(dict):
        def setdefault(self, key, default):
            if cutover == 'running' and not entered.is_set():
                entered.set(); assert release.wait(10)
            return super().setdefault(key, default)
    calls, requests, agents = Counter(), Requests(), []
    with _production_patches(tmp_path=tmp_path, provider_calls=calls, provider_requests=requests, agent_calls=agents):
        source = _recipe_payload(); save_recipe(source)
        path = recipes_dir() / (RECIPE_NAME + '.recipe'); raw = path.read_bytes()
        store = SkeletonResourceStore(); resource, request = migrate(store, source, identity=str(path))
        options = {'modelId': 'openai:graph-base', 'recipe_name': RECIPE_NAME, 'memory_enabled': True,
                   'durable_interactions_required': True, '_memory_v2_requested': True,
                   '_memory_v2_owner_chat_id': OWNER_CHAT_ID, '_memory_v2_session_id': EXECUTION_ID,
                   '_memory_v2_attempt_id': COORDINATOR_ATTEMPT_ID}
        first, failures = [], []
        def start():
            try: first.extend(adapter.stream_chat_events(message='legacy A', history=[], options=options, session_id=EXECUTION_ID, attempt_id=COORDINATOR_ATTEMPT_ID))
            except BaseException as error: failures.append(error)
        for row in request['kernels']:
            row['model_policy'] = 'replace'; row['prompt_policy'] = 'replace'
        if cutover == 'running':
            worker = threading.Thread(target=start); worker.start()
            try:
                assert entered.wait(10)
                apply(store, resource, request)
            finally:
                release.set(); worker.join(15)
            assert not worker.is_alive() and failures == []
        else:
            start(); assert failures == []
        pending = adapter.get_pending_interaction(EXECUTION_ID)
        assert pending['resume_kind'] == 'graph_step' and pending['status'] == 'awaiting_response'
        if cutover == 'waiting':
            apply(store, resource, request)
        assert path.read_bytes() == raw
        upgraded = store.get_resource(resource['id'])
        record_interaction_receipt(session_id=EXECUTION_ID, interaction_id=pending['interaction_id'], approved=True,
            modified_arguments={'user_response': {'selected_values': ['react']}}, submitted_by='offline-test')
        resumed = list(adapter.resume_chat_interaction_events(session_id=EXECUTION_ID, interaction_id=pending['interaction_id'],
            options=dict(options, skeleton_selection={'schema': 'pupu.skeleton_chat_selection.v1', 'kind': 'resource', 'resource_id': upgraded['id']}), attempt_id='legacy-resume', source_attempt_id=pending['source_run_id']))
        assert calls == Counter({('openai','graph-collect'): 2, ('anthropic','graph-write'): 1})
        assert any(e.get('content') == 'Restart-safe React report' for e in resumed)
        assert path.read_bytes() == raw
        (tmp_path / 'cutover-evidence.json').write_text(json.dumps({
            'scenario': 'legacy-' + cutover + '-upgrade-resume', 'source_bytes': raw.decode(),
            'document_b': upgraded['document'], 'pending': pending,
            'provider_requests': {str(k): [r.messages for r in rows] for k, rows in requests.items()},
            'provider_calls': {str(k): v for k,v in calls.items()}, 'events': resumed}, default=str, indent=2))


def test_cancel_retained_a_after_b_is_saved_does_not_execute_or_commit(production, monkeypatch):
    import durable_interaction_host as interactions
    store, options, calls = production
    options, effects, calls = _approval_fixture(production, monkeypatch, count=1)
    resource, request = migrate(store, recipe(name='Old'))
    resource, _ = apply(store, resource, request)
    doc = deepcopy(store.get_resource('production-agent')['document']); doc['id'] = resource['id']
    saved = store.save_draft(doc, expected_edit_token=resource['edit_token'])
    options['skeleton_selection']['resource_id'] = resource['id']
    events = list(adapter.stream_chat_events(message='A cancel', history=[], options=options, session_id='cutover-cancel', attempt_id='cancel-A'))
    pending = interactions.get_pending_interaction('cutover-cancel')
    changed = deepcopy(saved['document']); changed['nodes'][1]['config']['kernel']['profile']['model'] = 'new-B'
    store.save_draft(changed, expected_edit_token=saved['edit_token'])
    cancelled = interactions.cancel_chat_execution(session_id='cutover-cancel', attempt_id='cancel-A',
        owner_chat_id='production-chat', expected_interaction_id=pending['interaction_id'], reason='offline-cancel')
    assert cancelled['state'] == 'cancelled' and effects == [] and len(calls) == 1
    assert interactions.get_pending_interaction('cutover-cancel')['status'] == 'none'
    from skeleton_production_state import load_launch
    launch = load_launch('cutover-cancel', 'cancel-A', expected_owner_chat_id='production-chat')
    assert launch.store.load().state['status'] == 'cancelled'
    assert launch.store.load().state['root_committed'] is False
    assert launch.selection.to_dict()['document'] == saved['document']
    (Path(options['workspace_root']) / 'cutover-evidence.json').write_text(json.dumps({
        'scenario': 'cancel-A-after-save-B', 'calls': calls, 'pending': pending,
        'cancelled': cancelled, 'effects': effects, 'launch': launch.descriptor}, default=str, indent=2))
