"""Builder display caches never become a second plaintext credential store."""
from copy import deepcopy
import base64
import json
from types import SimpleNamespace

import pytest

from test_skeleton_production_chat import production, Stream  # noqa: F401
from test_skeleton_resource_store import agent


@pytest.fixture(autouse=True)
def clean_secret_registry():
    from secret_scrub_registry import get_secret_scrub_registry
    registry = get_secret_scrub_registry()
    registry.reset_for_tests()
    yield registry
    registry.reset_for_tests()


@pytest.mark.parametrize('sensitive', [False, True])
def test_native_child_observation_is_sanitized_before_cache_and_cold_read(production, monkeypatch, sensitive):
    from skeleton_builder_tests import BuilderTestSessions
    from secret_scrub_registry import get_secret_scrub_registry
    secret = 'production-test-secret'
    child_text = 'Child harmless text; ' + (secret if sensitive else 'ordinary child answer')
    responses = iter([
        SimpleNamespace(id='parent-delegates', output=[{'type':'function_call','call_id':'delegate-canary',
            'name':'delegate_to_subagent','arguments':json.dumps({'target':'Reviewer','task':'review this'})}], usage={}),
        SimpleNamespace(id='child-reply', output=[{'type':'message','role':'assistant',
            'content':[{'type':'output_text','text':child_text}]}], usage={}),
        SimpleNamespace(id='parent-finish', output=[{'type':'message','role':'assistant',
            'content':[{'type':'output_text','text':'Harmless parent final'}]}], usage={}),
    ])
    def events(self):
        yield SimpleNamespace(type='response.completed', response=next(responses))
    monkeypatch.setattr(Stream, '__iter__', events)
    store, options, calls = production
    old = store.get_resource('production-agent')
    saved = store.save_draft(agent('production-agent', child_source={'kind':'embedded','document':agent('child')}),
        expected_edit_token=old['edit_token'])
    tests = BuilderTestSessions(background=False)
    session = tests.open(saved['id'], 'agent')['session']['id']
    prepared = tests.prepare(session, saved['id'], saved['edit_token'], {'message':'delegate a review'},
        'child-secret-regression', context=options)
    view = tests.execute(session, saved['id'], prepared['run_id'], options)
    assert len(calls) >= 2, (len(calls), view['runs'][-1]['status'], view['runs'][-1]['error'])
    registry = get_secret_scrub_registry()
    assert registry.snapshot().redact_text(secret) != secret
    encoded = json.dumps(view)
    assert 'Child harmless text' in encoded
    if not sensitive:
        assert view['runs'][-1]['status'] == 'completed', view['runs'][-1]['error']
        assert 'Harmless parent final' in encoded
    with tests._db() as db:
        raw = [row[0] for row in db.execute('SELECT body FROM events')]
    assert all(secret not in body for body in raw)
    assert secret not in encoded
    registry.reset_for_tests()
    cold = BuilderTestSessions(background=False).read(session, saved['id'])
    assert secret not in json.dumps(cold)


def _prepared(production):
    from skeleton_builder_tests import BuilderTestSessions
    store, options, _calls = production
    tests = BuilderTestSessions(background=False)
    saved = store.get_resource('production-agent')
    session = tests.open(saved['id'], 'agent')['session']['id']
    prepared = tests.prepare(session, saved['id'], saved['edit_token'], {'message':'cache control'},
        'cache-regression', context=options)
    return tests, session, saved['id'], prepared['run_id']


def test_cache_redacts_registered_encoded_values_without_changing_event_identity(production, clean_secret_registry):
    tests, session, resource, run = _prepared(production)
    secret = 'registered-credential-canary-123'
    clean_secret_registry.register((secret,), source='provider')
    event = {'schema_version':'v4','type':'message.final','event_id':'safe-event','session_id':session,
        'run_id':run,'payload':{'final_text':'benign ' + secret,
            'encoded':base64.b64encode(secret.encode()).decode(),'api_key':secret,'ordinary':'keep me'}}
    original = deepcopy(event)
    tests._record_event({'id':run}, event)
    assert event == original
    clean_secret_registry.reset_for_tests()
    view = tests.read(session, resource)['runs'][0]
    retained = view['events'][0]
    assert {key:retained[key] for key in event if key != 'payload'} == {key:event[key] for key in event if key != 'payload'}
    assert retained['payload']['ordinary'] == 'keep me'
    assert secret not in json.dumps(retained)
    assert base64.b64encode(secret.encode()).decode() not in json.dumps(retained)
    assert view['trace_complete'] is True


@pytest.mark.parametrize('legacy', [True, False])
def test_unverified_legacy_or_late_writer_cache_is_purged_without_replaying(production, legacy):
    from skeleton_builder_tests import BuilderTestSessions
    tests, session, resource, run = _prepared(production)
    secret = 'old-cache-credential-canary'
    event = json.dumps({'event_id':'old-event','payload':{'text':secret}})
    with tests._db() as db:
        if legacy:
            db.execute('DROP TABLE trace_redactions')
        # Preserve the previous writer's three-column cache format.
        db.execute('INSERT INTO events VALUES (?,?,?)', (run,'old-event',event))
    if legacy:
        tests = BuilderTestSessions(background=False)
    view = tests.read(session, resource)['runs'][0]
    assert view['status'] == 'ready'
    assert view['events'] == [] and view['trace_complete'] is False
    assert production[2] == []
    with tests._db() as db:
        assert db.execute('SELECT count(*) FROM events').fetchone()[0] == 0
    assert secret.encode() not in tests.path.read_bytes()


@pytest.mark.parametrize('corruption', ['policy', 'body'])
def test_cached_attestation_must_match_policy_and_exact_bytes(production, corruption):
    tests, session, resource, run = _prepared(production)
    tests._record_event({'id':run}, {'event_id':'trusted','payload':{'text':'benign'}})
    with tests._db() as db:
        if corruption == 'policy':
            db.execute("UPDATE trace_redactions SET policy='unknown-future-policy'")
        else:
            db.execute('UPDATE events SET body=?', (json.dumps({'event_id':'trusted','payload':{'text':'changed'}}),))
    view = tests.read(session, resource)['runs'][0]
    assert view['events'] == [] and view['trace_complete'] is False


def test_duplicate_event_id_cannot_certify_preexisting_unsanitized_bytes(production, clean_secret_registry):
    tests, session, resource, run = _prepared(production)
    secret = 'duplicate-event-credential-canary'
    clean_secret_registry.register((secret,), source='provider')
    event = {'event_id':'duplicate','payload':{'text':secret}}
    with tests._db() as db:
        db.execute('INSERT INTO events VALUES (?,?,?)', (run,'duplicate',json.dumps(event)))
    tests._record_event({'id':run}, event)
    clean_secret_registry.reset_for_tests()
    view = tests.read(session, resource)['runs'][0]
    assert view['events'] == [] and view['trace_complete'] is False


def test_sanitizer_failure_or_sensitive_identity_never_persists_an_event(production, monkeypatch, clean_secret_registry):
    import memory_v2_sanitizer
    from skeleton_resource_store import SkeletonResourceError
    tests, _session, _resource, run = _prepared(production)
    secret = 'event-identity-credential-canary'
    clean_secret_registry.register((secret,), source='provider')
    with pytest.raises(SkeletonResourceError, match='Sensitive trace identifiers'):
        tests._record_event({'id':run}, {'event_id':secret,'payload':{'text':'ordinary'}})
    def unavailable(_value):
        raise RuntimeError('sanitizer unavailable')
    monkeypatch.setattr(memory_v2_sanitizer, 'sanitize_value', unavailable)
    with pytest.raises(RuntimeError, match='sanitizer unavailable'):
        tests._record_event({'id':run}, {'event_id':'safe','payload':{'text':secret}})
    with tests._db() as db:
        assert db.execute('SELECT count(*) FROM events').fetchone()[0] == 0
        assert db.execute('SELECT count(*) FROM trace_redactions').fetchone()[0] == 0


def setup_run(production):
    from skeleton_builder_tests import BuilderTestSessions
    store,options,calls=production; tests=BuilderTestSessions(background=False)
    saved=store.get_resource("production-agent"); session=tests.open(saved["id"],"agent")["session"]["id"]
    prepared=tests.prepare(session,saved["id"],saved["edit_token"],{"message":"control"},"additional-probe",context=options)
    return tests,session,saved,prepared["run_id"],options,calls


@pytest.mark.parametrize('raw_type', ['reasoning', 'token_delta'])
def test_registered_secret_split_across_real_normalized_frames(production, raw_type):
    from unchain.events import RuntimeEventBridge
    from secret_scrub_registry import get_secret_scrub_registry
    registry=get_secret_scrub_registry();registry.reset_for_tests()
    secret="production-test-secret";registry.register((secret,),source="provider")
    tests,session,saved,run,_options,_calls=setup_run(production)
    bridge=RuntimeEventBridge(session_id=session,root_run_id=run,root_agent_id="developer",trace_level="full")
    tests._record_event({"id":run},bridge.emit_session_started({"execution_id":session,"attempt_id":run}).to_dict())
    produced=[]
    for piece in ("production-","test-secret"):
        for event in bridge.normalize({"type":raw_type,"run_id":run,"iteration":1,"content":piece}):
            value=event.to_dict();produced.append(value);tests._record_event({"id":run},value)
    assert len(produced)==2 and all(e["type"]=="step.delta" for e in produced)
    view=tests.read(session,saved["id"])["runs"][0]
    text="".join(e.get("payload",{}).get("delta","") for e in view["events"])
    assert secret not in text,"Credential reconstructed from cached reasoning fragments"
    assert view['trace_complete'] is False
    tests._record_event({'id':run}, {'event_id':'safe-final','type':'message.final',
        'payload':{'final_text':'Complete harmless result'}})
    registry.reset_for_tests()
    cold=tests.read(session,saved["id"])["runs"][0]
    assert secret not in "".join(e.get("payload",{}).get("delta","") for e in cold["events"])
    assert cold['trace_complete'] is False
    assert any(e['payload'].get('final_text') == 'Complete harmless result' for e in cold['events'])


@pytest.mark.parametrize("operation",["prepare","new","execute"])
def test_untrusted_cache_cleanup_never_reenters_own_sqlite_write_lock(production,monkeypatch,operation):
    import sqlite3
    tests,session,saved,run,options,calls=setup_run(production)
    if operation=="execute":
        assert tests.execute(session,saved["id"],run,options)["runs"][0]["status"]=="completed"
    with tests._db() as db:
        db.execute("INSERT INTO events VALUES (?,?,?)",(run,"late-old-writer",json.dumps({"event_id":"late-old-writer","payload":{"text":"old"}})))
    original=sqlite3.connect
    def short_timeout(*args,**kwargs):
        kwargs["timeout"]=0.05
        return original(*args,**kwargs)
    monkeypatch.setattr(sqlite3,"connect",short_timeout)
    if operation=="prepare":
        tests.prepare(session,saved["id"],saved["edit_token"],{"message":"next"},"next-probe",context=options)
    elif operation=="new":
        tests.open(saved["id"],"agent",new=True)
    else:
        assert tests.execute(session,saved["id"],run,options)["runs"][0]["status"]=="completed"
    assert len(calls)==(1 if operation=="execute" else 0)
