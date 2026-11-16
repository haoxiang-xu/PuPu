"""Builder-owned test sessions over the production Skeleton execution host.

SQLite contains only session locators and immutable, pre-dispatch material. Run
state, End results, history, approvals and cancellation remain in the canonical
execution Journal/CAS. Closing a renderer never owns a worker's cancellation.
"""
from contextlib import contextmanager
from copy import deepcopy
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import sqlite3
import threading
from uuid import uuid4

from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from skeleton_production_state import canonical, load_launch

SCHEMA = 'pupu.builder-test.v1'
_LOCK = threading.RLock()
_WORKERS = {}
_TERMINAL = {'completed', 'failed', 'cancelled', 'outcome_unknown'}
CONTEXT_FIELDS={'toolkits','skills','workspace_root','workspace_roots','disable_workspace_root'}
TRANSIENT_FIELDS={'skeleton_credentials','skeleton_credential_scope','openaiApiKey','openai_api_key',
    'anthropicApiKey','anthropic_api_key','geminiApiKey','gemini_api_key'}
_TRACE_REDACTION_POLICY = 'registered-secrets-v1'
# The editor's own defaults for a Kernel it writes when a model is picked
# (kernel_config.js `new_kernel_config`), so a test's fallback is the Kernel
# the author would get by picking the same model on the node.
_DEFAULT_MAX_ITERATIONS = 12


def fallback_kernel(profile):
    """The Kernel an unconfigured Agent runs with in a test.

    ``profile`` is the catalog entry Main resolved for the model picked in the
    test composer — the same entries the node's model picker offers (this
    runtime's profiles plus Main's custom providers). The renderer only ever
    names a model; credentials are still injected by Main per run. The Kernel
    is the editor's default for a newly picked model and passes the runtime's
    own validator before anything is admitted.
    """
    from unchain.skeleton.errors import SkeletonValidationError
    from unchain.skeleton.kernel_config import validate_kernel_config
    if type(profile) is not dict or type(profile.get('context_window')) is not int or type(profile.get('output_limit')) is not int:
        _fail('invalid_shape','The chosen model profile is incomplete.',('fallback_profile',),400)
    window=profile['context_window']; limit=profile['output_limit']
    kernel={'schema_version':1,'profile':deepcopy(profile),'prompt':'','max_iterations':_DEFAULT_MAX_ITERATIONS,
        'output_tokens':max(1,min(limit,window-1)),'history':'root','overflow':'error','json_schema':None}
    try:
        return validate_kernel_config(kernel)
    except SkeletonValidationError as error:
        _fail('test_model_unavailable','This model cannot run an Agent test: its profile was refused.',('fallback_model','profile_refused'),409)


def runtime_import_observation(manifest):
    """Diagnostic evidence only; never a compatibility or admission decision."""
    import sys
    modules={}
    for name in ('unchain','unchain.runtime.runtime_protocol'):
        module=sys.modules.get(name)
        origin=getattr(module,'__file__','') or ''
        loader=getattr(module,'__loader__',None)
        modules[name]={'file':str(Path(origin).resolve()) if type(origin) is str and origin else '',
            'loader':type(loader).__module__+'.'+type(loader).__qualname__ if loader is not None else ''}
    return {'schema':'pupu.runtime-import-observation.v1','pid':os.getpid(),
        'executable':str(Path(sys.executable).resolve()),'frozen':bool(getattr(sys,'frozen',False)),
        'bundle_root':str(getattr(sys,'_MEIPASS','') or ''),'modules':modules,
        'manifest_digest':manifest['manifest_digest']}


def _fail(code, message, path=(), status=409):
    raise SkeletonResourceError(code, path, message, status=status)


def _json(value, *, max_bytes=2*1024*1024):
    try:
        raw = canonical(value)
    except (ValueError, TypeError, RecursionError):
        _fail('invalid_value', 'Test arguments must be finite JSON.', ('inputs',), 400)
    if len(raw) > max_bytes:
        _fail('test_input_too_large', 'Test arguments exceed the limit.', ('inputs',), 413)
    return raw.decode('utf-8')


def freeze_test_context(options):
    """Main-resolved capability scope, with no provider secret or model choice."""
    if type(options) is not dict:
        _fail('invalid_shape','Test context must be an object.',('context',),400)
    tools=options.get('toolkits',[])
    skills=options.get('skills',{'include_user_dirs':True})
    disabled=options.get('disable_workspace_root',False)
    if (type(tools) is not list or len(tools)>100 or any(type(value) is not str or not value or value!=value.strip() for value in tools)
            or len(set(tools))!=len(tools) or type(skills) is not dict or set(skills)!={'include_user_dirs'}
            or type(skills['include_user_dirs']) is not bool or type(disabled) is not bool):
        _fail('invalid_value','Invalid tool or skill context.',('context',),400)
    roots=options.get('workspace_roots',[])
    root=options.get('workspace_root',options.get('workspaceRoot'))
    if type(roots) is not list or len(roots)>64 or root is not None and type(root) is not str:
        _fail('invalid_value','Invalid workspace context.',('context',),400)
    roots=([root] if root else [])+roots
    if disabled and roots:
        _fail('invalid_value','Disabled workspace context cannot contain roots.',('context',),400)
    if any(type(value) is not str or not value or value!=value.strip() or not Path(value).is_absolute() for value in roots):
        _fail('invalid_value','Workspace roots must be Main-resolved absolute paths.',('context',),400)
    roots=list(dict.fromkeys(str(Path(value).resolve()) for value in roots))
    return {'toolkits':deepcopy(tools),'skills':deepcopy(skills),'workspace_root':roots[0] if roots else None,
        'workspace_roots':roots,'disable_workspace_root':not roots}


class BuilderTestSessions:
    def __init__(self, *, background=True):
        root = os.environ.get('UNCHAIN_DATA_DIR', '')
        if not root:
            _fail('test_storage_unavailable', 'Test storage is unavailable.', status=503)
        self.path = Path(root).expanduser().resolve() / 'builder_tests.sqlite3'
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.background = background
        with self._db() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, resource_id TEXT NOT NULL, kind TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS panels (resource_id TEXT PRIMARY KEY, session_id TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, request_id TEXT NOT NULL,
                    fingerprint TEXT NOT NULL, material TEXT NOT NULL, phase TEXT NOT NULL, error TEXT,
                    UNIQUE(session_id, request_id));
                CREATE TABLE IF NOT EXISTS events (run_id TEXT NOT NULL, event_id TEXT NOT NULL, body TEXT NOT NULL,
                    PRIMARY KEY(run_id,event_id));
                CREATE TABLE IF NOT EXISTS trace_limits (run_id TEXT PRIMARY KEY);
                CREATE TABLE IF NOT EXISTS trace_omissions (run_id TEXT PRIMARY KEY);
            ''')
            # Only the derived display cache changes. Retained executions and
            # the legacy three-column events layout remain readable on rollback.
            db.execute('BEGIN IMMEDIATE')
            known = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='trace_redactions'").fetchone()
            db.execute('''CREATE TABLE IF NOT EXISTS trace_redactions (
                run_id TEXT NOT NULL, event_id TEXT NOT NULL, policy TEXT NOT NULL,
                body_sha256 TEXT NOT NULL, PRIMARY KEY(run_id,event_id))''')
            if known is None:
                # An old event has no trustworthy sanitization provenance. Do
                # not depend on credentials still being registered after restart.
                db.execute('INSERT OR IGNORE INTO trace_limits SELECT DISTINCT run_id FROM events')
                db.execute('DELETE FROM events')

    @contextmanager
    def _db(self, existing=None):
        if existing is not None:
            yield existing
            return
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            db.execute('PRAGMA secure_delete=ON')
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def _session(self, db, session, resource):
        row = db.execute('SELECT * FROM sessions WHERE id=? AND resource_id=?', (session,resource)).fetchone()
        if row is None:
            _fail('test_session_not_found', 'This test belongs to another resource.', ('session_id',), 404)
        return dict(row)

    def _run_row(self, db, session, resource, run):
        self._session(db,session,resource)
        row=db.execute('SELECT * FROM runs WHERE id=? AND session_id=?',(run,session)).fetchone()
        if row is None:
            _fail('test_run_not_found','This run does not belong to the test session.',('run_id',),404)
        return dict(row)

    def open(self, resource, kind, *, new=False):
        saved=SkeletonResourceStore().get_managed_resource(resource)['resource']
        if kind not in ('agent','workflow') or saved['kind']!=kind:
            _fail('wrong_kind','Select an Agent or a Workflow.',('kind',),400)
        with _LOCK, self._db() as db:
            db.execute('BEGIN IMMEDIATE')
            prior=db.execute('SELECT session_id FROM panels WHERE resource_id=?',(resource,)).fetchone()
            if prior and new:
                self._assert_idle(db,prior['session_id'],resource)
            session=prior['session_id'] if prior and not new else 'builder-test-'+uuid4().hex
            if not prior or new:
                db.execute('INSERT INTO sessions VALUES (?,?,?)',(session,resource,kind))
                db.execute('INSERT OR REPLACE INTO panels VALUES (?,?)',(resource,session))
        return self.read(session,resource)

    def _assert_idle(self, db, session, resource):
        for row in db.execute('SELECT * FROM runs WHERE session_id=?',(session,)):
            status=self._project(dict(row),_cache_db=db)['status']
            if status not in _TERMINAL and status!='ready':
                _fail('test_already_active','Resume or stop the current test first.',('session_id',))

    def prepare(self, session, resource, token, inputs, request_id, *, memory_agent_config=None, context=None, fallback_profile=None):
        from skeleton_code_admission import prepare_test_execution_material
        from unchain.skeleton.workflow_inputs import bind_workflow_inputs
        from route_chat import _sanitize_memory_agent_config
        try:
            memory_config=_sanitize_memory_agent_config(memory_agent_config)
        except ValueError as error:
            _fail('context_v2_invalid_memory_agent_config',str(error),('memory_agent_config',),400)
        if type(request_id) is not str or not request_id or len(request_id)>200:
            _fail('invalid_value','A test request identity is required.',('request_id',),400)
        if type(inputs) is not dict:
            _fail('invalid_type','Test arguments must be an object.',('inputs',),400)
        context=freeze_test_context(context or {})
        if fallback_profile is not None and type(fallback_profile) is not dict:
            _fail('invalid_type','The chosen model profile must be an object.',('fallback_profile',),400)
        identity={'resource':resource,'token':token,'inputs':inputs,'memory_agent_config':memory_config,'context':context}
        if fallback_profile is not None:
            identity['fallback_profile']=fallback_profile
        fingerprint=sha256(_json(identity).encode()).hexdigest()
        with _LOCK, self._db() as db:
            db.execute('BEGIN IMMEDIATE')
            owner=self._session(db,session,resource)
            old=db.execute('SELECT * FROM runs WHERE session_id=? AND request_id=?',(session,request_id)).fetchone()
            if old:
                if old['fingerprint']!=fingerprint:
                    _fail('test_request_conflict','A request identity cannot be reused for different inputs.',('request_id',))
                row=dict(old)
            else:
                self._assert_idle(db,session,resource)
                if db.execute('SELECT count(*) FROM runs WHERE session_id=?',(session,)).fetchone()[0]>=100:
                    _fail('test_session_full','Start a new test conversation.',('session_id',))
                if fallback_profile is not None and owner['kind']!='agent':
                    _fail('invalid_value','Only an Agent test takes a model.',('fallback_profile',),400)
                draft=fallback_kernel(fallback_profile) if fallback_profile is not None else None
                selected,deps=prepare_test_execution_material(resource,token,owner['kind'],draft_kernel=draft)
                if owner['kind']=='workflow':
                    normalized=bind_workflow_inputs(selected.to_dict()['document'],inputs)
                else:
                    if set(inputs)!={'message'} or type(inputs['message']) is not str or not inputs['message'].strip():
                        _fail('invalid_value','Enter a test message.',('inputs','message'),400)
                    normalized=deepcopy(inputs)
                material={'selection':selected.to_dict(),'workflows':deps.to_dict(),
                    'code_sources':selected.code_sources,'inputs':normalized,'memory_agent_config':memory_config,'context':context}
                run='builder-run-'+uuid4().hex
                db.execute("UPDATE runs SET phase='cancelled' WHERE session_id=? AND phase='ready'",(session,))
                db.execute('INSERT INTO runs VALUES (?,?,?,?,?,?,NULL)',
                    (run,session,request_id,fingerprint,_json(material,max_bytes=64*1024*1024),'ready'))
                row=dict(db.execute('SELECT * FROM runs WHERE id=?',(run,)).fetchone())
        return self._requirements(row)

    def _material(self, row):
        from skeleton_chat_selection import FrozenSkeletonChatSelection, _check_preflight
        from skeleton_production_state import _restore_workflows
        from skeleton_code_closure import FrozenSkeletonCodeClosure
        material=json.loads(row['material'])
        selected=material['selection']
        _check_preflight(selected,selected['id'],kind=selected['kind'])
        sources=material['code_sources']
        selection=FrozenSkeletonChatSelection(canonical(selected),canonical(sources) if sources is not None else None,
            canonical(material['workflows']))
        workflows=_restore_workflows(selection,material['workflows'])
        if sources is not None:
            FrozenSkeletonCodeClosure.restore(sources,selection,workflows)
        return selection,workflows,material['inputs']

    def _requirements(self,row,*,interaction_id=''):
        from skeleton_credential_requirements import requirements_from_frozen
        selection,workflows,_inputs=self._material(row)
        requirements=query=None
        if selection.to_dict()['kind']=='agent':
            config=json.loads(row['material']).get('memory_agent_config')
            launch=load_launch(row['session_id'],row['id'],expected_owner_chat_id=row['session_id']) if interaction_id else None
            mode='resume' if interaction_id else 'start'
            requirements=requirements_from_frozen(selection,workflows,mode=mode,session_id=row['session_id'],
                owner_chat_id=row['session_id'],interaction_id=interaction_id,
                source_attempt_id=row['id'] if interaction_id else '',launch=launch,memory_provider=config['provider'] if config else '')
            query={'schema':'pupu.skeleton_credential_query.v1','mode':mode,'session_id':row['session_id'],
                'owner_chat_id':row['session_id'],'interaction_id':interaction_id,'source_attempt_id':row['id'] if interaction_id else '',
                'selection':None if interaction_id else {'schema':'pupu.skeleton_chat_selection.v1','kind':'resource','resource_id':selection.resource_id},
                'recipe_name':'','memory_agent_config':config}
        return {'schema':SCHEMA,'session_id':row['session_id'],'resource_id':selection.resource_id,
            'run_id':row['id'],'credential_query':query,'requirements':requirements}

    def _options(self, options, session, row):
        # This method receives Main-injected options, not a renderer's runtime
        # authority. Never persist transient credentials or provider objects.
        material=json.loads(row['material'])
        context=freeze_test_context(material.get('context',{}))
        if any(key in options for key in CONTEXT_FIELDS|{'workspaceRoot'}) and freeze_test_context(options)!=context:
            _fail('test_context_conflict','Test capabilities differ from the admitted request.',('context',))
        return dict({key:value for key,value in options.items() if key in TRANSIENT_FIELDS},**context,
            _memory_v2_requested=True,_memory_v2_owner_chat_id=session,
            _memory_v2_memory_agent_config=material.get('memory_agent_config'),
            durable_interactions_required=True)

    def _cached_events(self, db, run):
        rows = db.execute('''SELECT e.event_id,e.body,r.policy,r.body_sha256
            FROM events e LEFT JOIN trace_redactions r
            ON r.run_id=e.run_id AND r.event_id=e.event_id
            WHERE e.run_id=? ORDER BY e.rowid''', (run,)).fetchall()
        safe, rejected = [], []
        for row in rows:
            if (row['policy'] != _TRACE_REDACTION_POLICY or
                    row['body_sha256'] != sha256(row['body'].encode('utf-8')).hexdigest()):
                rejected.append((run,row['event_id']))
            else:
                safe.append(json.loads(row['body']))
        if rejected:
            db.execute('INSERT OR IGNORE INTO trace_limits VALUES (?)', (run,))
            db.executemany('DELETE FROM events WHERE run_id=? AND event_id=?', rejected)
            db.executemany('DELETE FROM trace_redactions WHERE run_id=? AND event_id=?', rejected)
        return safe

    def _record_event(self, row, event):
        from memory_v2_sanitizer import sanitize_value
        # Separate reasoning/text chunks can each contain only part of a
        # registered secret. Cache complete, sanitized observations instead;
        # a missing incremental trace is explicit and never stops execution.
        if (event.get('type') == 'step.delta' and
                event.get('payload',{}).get('kind') in ('text','reasoning')):
            with self._db() as db:
                db.execute('INSERT OR IGNORE INTO trace_omissions VALUES (?)',(row['id'],))
            return
        safe = sanitize_value(event)
        for key in ('schema_version','type','event_id','session_id','run_id','parent_run_id',
                    'root_run_id','trace_id','span_id','parent_span_id'):
            if safe.get(key) != event.get(key):
                _fail('test_trace_sensitive_identity','Sensitive trace identifiers cannot be cached.',('events',))
        raw=canonical(safe).decode('utf-8')
        with self._db() as db:
            size,count=db.execute('SELECT coalesce(sum(length(CAST(body AS BLOB))),0),count(*) FROM events WHERE run_id=?',(row['id'],)).fetchone()
            if size+len(raw.encode('utf-8'))>2*1024*1024 or count>=10000:
                db.execute('INSERT OR IGNORE INTO trace_limits VALUES (?)',(row['id'],))
            elif not db.execute('SELECT 1 FROM trace_limits WHERE run_id=?',(row['id'],)).fetchone():
                db.execute('INSERT OR IGNORE INTO events VALUES (?,?,?)',(row['id'],event['event_id'],raw))
                # A duplicate id must not bless different pre-existing bytes.
                db.execute('''INSERT OR IGNORE INTO trace_redactions
                    SELECT ?,?,?,? WHERE EXISTS (
                        SELECT 1 FROM events WHERE run_id=? AND event_id=? AND body=?)''',
                    (row['id'],event['event_id'],_TRACE_REDACTION_POLICY,sha256(raw.encode('utf-8')).hexdigest(),
                     row['id'],event['event_id'],raw))

    def _schedule(self, row, operation, *, transport_attempt=None):
        key=(str(self.path),row['id'])
        def work():
            try:
                from unchain.events import RuntimeEventBridge
                from skeleton_child_events import strip_attribution, project_attribution
                from pupu_tool_call_ref import TOOL_CALL_DISPLAY_METADATA_SIDECAR_KEY, ToolCallDisplayMetadataSidecar
                from route_chat import project_tool_call_display_metadata
                attempt=transport_attempt or row['id']
                bridge=RuntimeEventBridge(session_id=row['session_id'],root_run_id=attempt,root_agent_id='developer',trace_level='full')
                started=bridge.emit_session_started({'execution_id':row['session_id'],'attempt_id':attempt,
                    'thread_id':row['session_id'],'resume_interaction':bool(transport_attempt)})
                self._record_event(row,started.to_dict())
                for raw in operation():
                    # The same V4 normalizer, typed child attribution and
                    # display sidecar APIs as the public production stream.
                    raw,attribution=strip_attribution(raw)
                    sidecar=raw.pop(TOOL_CALL_DISPLAY_METADATA_SIDECAR_KEY,None)
                    for item in bridge.normalize(raw):
                        event=project_attribution(item.to_dict(),attribution,transport_attempt_id=attempt)
                        if isinstance(sidecar,ToolCallDisplayMetadataSidecar):
                            event=project_tool_call_display_metadata(event,sidecar) or event
                        self._record_event(row,event)
            except Exception as error:
                code=getattr(error,'code','builder_test_failed')
                if type(code) is not str: code='builder_test_failed'
                # Host refusals carry sentences written here, never provider
                # text; anything else keeps the generic one.
                known=isinstance(error,SkeletonResourceError) and type(getattr(error,'message',None) or str(error)) is str
                message=str(error) if known and str(error) else 'The test did not complete.'
                with self._db() as db:
                    db.execute('UPDATE runs SET error=? WHERE id=?',
                        (json.dumps({'code':code,'path':list(getattr(error,'path',())),
                            'message':message}),row['id']))
            finally:
                with _LOCK:
                    _WORKERS.pop(key,None)
        worker=threading.Thread(target=work,name='builder-test',daemon=True)
        _WORKERS[key]=worker
        if self.background: worker.start()
        else: work()

    def execute(self,session,resource,run,options):
        from skeleton_production_chat import stream_skeleton_test_events
        with _LOCK,self._db() as db:
            db.execute('BEGIN IMMEDIATE')
            row=self._run_row(db,session,resource,run)
            if row['phase']!='ready':
                return self.read(session,resource,_cache_db=db)
            selection,workflows,inputs=self._material(row)
            # Validate credentials against this frozen snapshot before consuming
            # the one dispatch claim. Missing credentials can be corrected.
            from skeleton_credential_requirements import assert_credential_scope
            opts=self._options(options,session,row)
            if selection.to_dict()['kind']=='agent':
                assert_credential_scope(opts,selection,workflows,mode='start',session_id=session,owner_chat_id=session)
            db.execute('UPDATE runs SET phase=? WHERE id=?',('dispatching',run))
        with _LOCK:
            self._schedule(row,lambda:stream_skeleton_test_events(selection=selection,workflows=workflows,
                inputs=inputs,options=opts,session_id=session,attempt_id=run))
        return self.read(session,resource)

    def _project(self,row,*,_recheck=True,_cache_db=None):
        material=json.loads(row['material'])
        selected=material['selection']
        result={'id':row['id'],'request_id':row['request_id'],'edit_token':selected['edit_token'],
            'definition_digest':selected['definition_digest'],'inputs':material['inputs'],
            'status':row['phase'] if row['phase'] in ('ready','cancelled') else 'starting','output':None,'error':json.loads(row['error']) if row['error'] else None,
            'pending':None,'graphs':[],'events':[],'trace_complete':True}
        with self._db(_cache_db) as db:
            result['events']=self._cached_events(db,row['id'])
            result['trace_complete']=db.execute('''SELECT 1 FROM trace_limits WHERE run_id=?
                UNION ALL SELECT 1 FROM trace_omissions WHERE run_id=?''',(row['id'],row['id'])).fetchone() is None
        if row['phase'] in ('ready','cancelled'): return result
        try:
            return self._project_launch(row,result,material,selected,_recheck=_recheck,_cache_db=_cache_db)
        except Exception as error:
            # A read that races the worker writing the run can find an
            # artifact listed but not yet readable. While the worker is alive
            # the run is still in progress; read it again on the next poll
            # instead of failing the request that only asked to look.
            if getattr(error,'code',None)=='artifact_unavailable' and (str(self.path),row['id']) in _WORKERS:
                result['status']='running'
                return result
            raise

    def _project_launch(self,row,result,material,selected,*,_recheck,_cache_db):
        try:
            launch=load_launch(row['session_id'],row['id'],expected_owner_chat_id=row['session_id'],allow_terminal_stale=True)
        except Exception:
            if (str(self.path),row['id']) in _WORKERS: return result
            result['status']='failed' if result['error'] else 'outcome_unknown'
            return result
        state=launch.store.load().state
        selection,workflows,inputs=self._material(row)
        if (launch.selection.snapshot_digest!=selection.snapshot_digest or launch.workflows.snapshot_digest!=workflows.snapshot_digest
                or (launch.descriptor['inputs']!=inputs if selected['kind']=='workflow'
                    else launch.descriptor['inputs'].get('message')!=inputs.get('message'))):
            _fail('test_launch_mismatch','The recorded test does not match its retained launch.',('run_id',))
        result['status']={'ready':'starting','result_received':'running'}.get(state['status'],state['status'])
        # End may finish before its root result is durably committed. Keep the
        # renderer polling through that interval instead of losing the reply.
        if state['status']=='completed' and not state['root_committed']:
            result['status']='running' if (str(self.path),row['id']) in _WORKERS else 'outcome_unknown'
        from skeleton_run_observation import project_launch
        observation=project_launch(launch)
        result['graphs']=[{'id':graph['graph_id'],'attempt_id':graph['attempt_id'],'name':graph['document']['name'],'status':graph['status'],
            'nodes':[{'id':node['node_id'],'status':node['state']} for node in graph['nodes']]}
            for graph in observation['graphs']]
        if state['status']=='completed' and state['root_committed']:
            result['output']=launch.store.read_json(state['completed'][-1]['output_ref'])
        elif state['status']=='waiting':
            from durable_interaction_host import get_pending_interaction, DurableInteractionHostError
            try:
                pending=get_pending_interaction(row['session_id'])
                if pending and pending.get('status') in ('awaiting_response','receipt_recorded'):
                    from skeleton_production_interactions import resolve_pending_skeleton_interaction
                    fixed=resolve_pending_skeleton_interaction(row['session_id'],expected_owner_chat_id=row['session_id'])
                    if fixed is None or fixed.request.interaction_id!=pending['interaction_id']:
                        _fail('interaction_not_found','The interaction changed while reading the test.',('interaction_id',))
                    request=fixed.request.to_dict()
                    result['pending']={'interaction_id':pending['interaction_id'],'kind':pending['kind'],
                        'status':pending['status'],'payload':request['payload'],'subject':request['subject'],
                        'presentation':pending['presentation']}
            except (DurableInteractionHostError, SkeletonResourceError):
                # The worker can settle a wait between these independent
                # canonical reads. Re-read once; never retry an actor operation.
                if _recheck:return self._project(row,_recheck=False,_cache_db=_cache_db)
                raise
            if result['pending'] is None and _recheck:
                return self._project(row,_recheck=False,_cache_db=_cache_db)
        elif state['status']=='running' and (str(self.path),row['id']) not in _WORKERS:
            # No automatic retry of a potentially effectful interrupted node.
            result['status']='outcome_unknown'
        if state.get('error') is not None:
            result['error']={'code':state['error']['code'],'path':state['error'].get('path',[]),
                'message':'The recorded test failed.'}
        return result

    def read(self,session,resource,*,_cache_db=None):
        with self._db(_cache_db) as db:
            owner=self._session(db,session,resource)
            rows=[dict(row) for row in db.execute('SELECT * FROM runs WHERE session_id=? ORDER BY rowid',(session,))]
            result={'schema':SCHEMA,'session':owner,'runs':[self._project(row,_cache_db=db) for row in rows]}
        if len(canonical(result))>16*1024*1024:
            _fail('test_result_too_large','Recorded test history exceeds the display limit. Start a new test conversation.',status=413)
        return result

    def resume_requirements(self,session,resource,run,interaction):
        with self._db() as db:
            row=self._run_row(db,session,resource,run)
        view=self._project(row)
        if not view['pending'] or view['pending']['interaction_id']!=interaction:
            _fail('interaction_not_found','The interaction is no longer current.',('interaction_id',),404)
        return self._requirements(row,interaction_id=interaction)

    def respond(self,session,resource,run,interaction,approved,options,*,answer=None):
        from durable_interaction_host import record_interaction_receipt, get_pending_interaction
        from skeleton_production_chat import resume_skeleton_chat_events
        with _LOCK:
            with self._db() as db:
                row=self._run_row(db,session,resource,run)
            view=self._project(row)
            if not view['pending'] or view['pending']['interaction_id']!=interaction:
                _fail('interaction_not_found','The interaction is no longer current.',('interaction_id',),404)
            key=(str(self.path),run)
            if key in _WORKERS: return self.read(session,resource)
            opts=self._options(options,session,row)
            if approved is not None:
                record_interaction_receipt(session_id=session,interaction_id=interaction,approved=approved,
                    modified_arguments={'user_response':answer} if answer is not None else None)
            elif view['pending']['status']!='receipt_recorded':
                _fail('interaction_receipt_required','Answer the interaction before resuming.',('interaction_id',))
            with self._db() as db:
                db.execute('UPDATE runs SET error=NULL WHERE id=?',(run,))
            attempt='builder-resume-'+uuid4().hex
            self._schedule(row,lambda:resume_skeleton_chat_events(session_id=session,interaction_id=interaction,
                options=opts,attempt_id=attempt,source_attempt_id=run),transport_attempt=attempt)
        return self.read(session,resource)

    def cancel(self,session,resource,run):
        from durable_interaction_host import cancel_chat_execution
        with _LOCK:
            with self._db() as db:
                row=self._run_row(db,session,resource,run)
            view=self._project(row)
            if view['status'] in _TERMINAL: return self.read(session,resource)
            if row['phase']=='ready':
                with self._db() as db:
                    db.execute('UPDATE runs SET phase=?, error=? WHERE id=?',('cancelled',None,run))
                # There was no execution or effect to cancel.
                return self.read(session,resource)
            cancel_chat_execution(session_id=session,attempt_id=run,source_attempt_id=run,owner_chat_id=session,
                expected_interaction_id=view['pending']['interaction_id'] if view['pending'] else '',reason='user_stop')
        return self.read(session,resource)
