"""Production Skeleton chat dispatch on PuPu's canonical active host.

Each transport owns the existing session guard. The durable graph, original
root input and descendant requests keep their original identities on resume.
"""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import queue
import threading

from durable_interaction_host import (DurableInteractionHostError, bind_execution_attempt,
    clear_execution_attempt_binding)
from skeleton_agent_runtime import PupuSkeletonAgentExecution
from skeleton_chat_selection import prepare_skeleton_chat_selection
from skeleton_production_bindings import SkeletonProductionBindings
from skeleton_production_state import load_active_launch, save_launch, assert_launch_current
from skeleton_production_interactions import (resolve_pending_skeleton_interaction,
    get_pending_skeleton_interaction, cancel_skeleton_execution)
from skeleton_resource_store import SkeletonResourceError
from skeleton_workflow_snapshot import freeze_skeleton_workflow_dependencies


def _fail(code, message, status=409):
    raise DurableInteractionHostError(code, message, status_code=status, retryable=False)


def _identifiers(session_id, attempt_id):
    if any(type(value) is not str or not value or value != value.strip() or "\0" in value
           for value in (session_id, attempt_id)):
        _fail("invalid_skeleton_execution_identity", "Skeleton chat requires exact session and attempt IDs.", 400)


def _bridge(selection, *, options, session_id, root_run_id, message, history, attachments, launch=None):
    import unchain_adapter as host
    from memory_v2_unchain_active_bridge import (preflight_pupu_unchain_active_host,
        bind_pupu_unchain_active_bridge)
    from memory_v2_unchain_lazy_bootstrap import bootstrap_pupu_unchain_active_chat
    from memory_v2_unchain_shadow_bridge import PupuUnchainShadowRunDraft
    from memory_v2_unchain_run_binding import PupuMemoryV2TextInputDraft
    from memory_v2_unchain_runtime_context import runtime_context_from_memory_binding_snapshot
    from memory_v2_unchain_agent_selection import select_pupu_memory_agent_invoker
    from unchain.context import HostResolvedAttachment
    from unchain.memory import MEMORY_V2_MODULE_KEY

    selected = selection.to_dict()
    kernel = next(node["config"]["kernel"] for node in selected["document"]["nodes"] if node["type"] == "agent")
    profile = kernel["profile"]
    if launch is None:
        if not host._memory_v2_active_graph_candidate(options):
            _fail("skeleton_active_context_required", "Skeleton chat requires the active Context V2 host.", 422)
        context = host._memory_v2_root_runtime_context(options=options, execution_id=session_id, run_id=root_run_id)
        draft = PupuMemoryV2TextInputDraft(content=message) if message.strip() else None
        raw_attachments = tuple(deepcopy(attachments or ()))
    else:
        assert_launch_current(launch)
        context = runtime_context_from_memory_binding_snapshot(launch.descriptor["binding"])
        saved = launch.descriptor["binding"]["current_input_draft"]
        draft = PupuMemoryV2TextInputDraft(content=saved["content"], message_index=saved["message_index"],
            attachments=tuple(HostResolvedAttachment.from_dict(row) for row in saved.get("attachments", ())))
        raw_attachments = ()
    if context is None or not options.get("_memory_v2_owner_chat_id"):
        _fail("skeleton_active_context_required", "Skeleton chat requires a validated chat owner.", 422)
    owner = options["_memory_v2_owner_chat_id"] if launch is None else launch.descriptor["owner_chat_id"]
    if options["_memory_v2_owner_chat_id"] != owner:
        _fail("skeleton_launch_owner_mismatch", "Skeleton execution belongs to another chat.")
    run = PupuUnchainShadowRunDraft(session_id=session_id, identity=context.identity,
        grant=context.grant_for(MEMORY_V2_MODULE_KEY), current_input_draft=draft, attachment_blocks=raw_attachments)
    memory_agent = select_pupu_memory_agent_invoker(options=options, chat_provider=profile["provider"],
        chat_model_id=profile["model"], provider_default_resolver=host._memory_v2_provider_default)
    windows = {(node["config"]["kernel"]["profile"]["provider"], node["config"]["kernel"]["profile"]["model"]): node["config"]["kernel"]["profile"]["context_window"]
        for node in selected["document"]["nodes"] if node["type"] == "agent"}
    preflight = preflight_pupu_unchain_active_host(owner_chat_id=owner, run=run,
        bootstrap_history=history if launch is None else (), no_unfinished_durable_checkpoint=launch is None,
        no_pending_interaction=launch is None,
        model_window_fallback=lambda provider, model: windows.get((provider, model)) or host.get_max_context_window_tokens(provider, model, options=options),
        partial_attempt_sink=lambda value, error: None, memory_agent_enabled=True,
        memory_agent_model_invoker_factory=memory_agent.host_invoker_factory())
    admitted_options = dict(options, _memory_v2_unchain_active_preflight=True,
        _memory_v2_session_id=session_id, _memory_v2_attempt_id=root_run_id)
    admission = host._resolve_memory_v2_admission(admitted_options, provider=profile["provider"],
        model=profile["model"], real_context_window_tokens=profile["context_window"], session_id=session_id)
    if not admission.is_active:
        _fail("skeleton_active_context_required", "Skeleton chat requires active Context V2 admission.", 422)
    bridge = bind_pupu_unchain_active_bridge(admission=admission, preflight=preflight)
    if launch is None:
        receipt = bootstrap_pupu_unchain_active_chat(preflight=preflight, admission=admission)
        host._memory_v2_apply_chat_admission_record(admission, receipt["admission"])
    elif bridge.preparation.binding.canonical_value() != launch.descriptor["binding"]:
        _fail("skeleton_launch_binding_mismatch", "Skeleton root binding changed on recovery.")
    _, durability = host._resolve_memory_runtime(admitted_options, session_id=session_id, memory_v2_admission=admission)
    if durability is None:
        _fail("skeleton_durability_unavailable", "Skeleton execution storage is unavailable.", 503)
    return bridge, durability


def _attachments(bridge):
    from unchain.context import HostResolvedAttachment
    draft = bridge.preparation.binding.canonical_value()["current_input_draft"]
    return tuple(HostResolvedAttachment.from_dict(row) for row in draft.get("attachments", ()))


def _node_attachments(authorized):
    from unchain.context import HostResolvedAttachment
    by_value = {str(row.to_dict()): row for row in authorized}
    def resolve(_context, inputs):
        found = []
        def visit(value):
            if type(value) is dict and value.get("schema") == "unchain.host_resolved_attachment.v1":
                row = HostResolvedAttachment.from_dict(value)
                key = str(row.to_dict())
                if key not in by_value:
                    _fail("skeleton_attachment_not_authorized", "Node attachment is outside the root request.")
                if row not in found:
                    found.append(row)
            elif type(value) is dict:
                for item in value.values(): visit(item)
            elif type(value) is list:
                for item in value: visit(item)
        visit(inputs)
        return tuple(found)
    return resolve


def _stream_worker(*, host, bridge, durability, bindings, plan, selection, workflows,
                   session_id, attempt_id, root_run_id, token, cancel_event, launch=None,
                   pending=None, response=None):
    from unchain.execution import ExecutionRuntime
    events = queue.Queue()
    done = object()
    holder = {}
    cancellation_requested = False
    def request_cancellation(reason):
        nonlocal cancellation_requested
        if cancellation_requested:
            return
        # Fence the actual graph before any delayed SDK/tool response can
        # reach End. The worker keeps the session occupied until cleanup.
        public = get_pending_skeleton_interaction(session_id)
        if public is None:
            ExecutionRuntime(durability.store).request_cancel(session_id, attempt_id, reason=reason)
        host._execution_control_call("request_cancel", session_id, attempt_id, reason=reason)
        cancel_skeleton_execution(session_id=session_id, attempt_id=attempt_id, source_attempt_id=root_run_id,
            owner_chat_id=bridge.preparation.binding.owner_chat_id,
            expected_interaction_id=public["interaction_id"] if public else "", reason=reason)
        ExecutionRuntime(durability.store).request_cancel(session_id, attempt_id, reason=reason)
        cancellation_requested = True
    def emit(raw):
        event = dict(raw)
        if event.get("scope") == "node":
            # Legacy and v4 clients both reserve final_message/token_delta for
            # the root answer. Keep node text solely on workflow progress.
            if event.get("type") == "final_message": event["type"] = "workflow_step_final"
            elif event.get("type") == "token_delta": event["type"] = "workflow_step_delta"
            elif event.get("type") in {"run_started", "run_completed", "run_failed"}: return
            elif event.get("type") == "interaction_requested": return
        events.put(event)
    def work():
        guard = None
        execution = None
        waiting = False
        try:
            host._execution_raise_if_cancelled(token)
            guard = ExecutionRuntime(durability.store).acquire(session_id, owner_id=attempt_id)
            resolved = _attachments(bridge)
            execution = PupuSkeletonAgentExecution(plan, bridge, graph_id=launch.descriptor["graph_id"] if launch else root_run_id,
                bind_profile=bindings.bind_profile, durability_runtime=durability, execution_guard=guard,
                tools_for_node=bindings.tools_for_node, host_modules_for_node=bindings.modules_for_node,
                attachments_for_node=_node_attachments(resolved), root_handlers_factory=bindings.handlers_for_store,
                child_handlers_factory=bindings.child_handlers_factory,
                hook_workflow_resolver=workflows.resolve, subagent_manifests=selection.to_dict()["subagents"],
                callback=emit, interject_options=host._public_interject_options(bindings._options))
            if launch is None:
                draft = bridge.preparation.binding.canonical_value()["current_input_draft"]
                inputs = {"message": draft["content"], "images": [row.to_dict() for row in resolved if row.kind == "image"],
                    "files": [row.to_dict() for row in resolved if row.kind != "image"]}
                binary = {}
                for row in resolved:
                    if row.name in binary: _fail("skeleton_attachment_name_conflict", "Attachment names must be unique.", 422)
                    binary[row.name] = (execution.store.journal.read_full_verified(artifact=row.artifact), row.media_type)
                execution.create(inputs, attachments=binary)
                save_launch(bridge=bridge, store=execution.store, selection=selection, workflows=workflows,
                    workspace_root=bindings.workspace_root, inputs=inputs, attachments=[row.to_dict() for row in resolved],
                    capabilities={"toolkits": list(bindings._user_toolkit_ids), "include_user_dirs": bindings._include_user_dirs,
                        "workspace_roots": list(bindings.workspace_roots)})
                result, _receipt = execution.run(original_task=inputs["message"])
            else:
                assert_launch_current(launch)
                root_node_type = execution.runner.nodes[launch.store.load().state["active"]["node_id"]]["type"]
                wait_id = pending.root_wait_id if root_node_type == "agent" else pending.request.interaction_id
                result, _receipt = execution.resume_current_interaction(wait_id, response,
                    node_invocation_id=pending.root_node_invocation_id, original_task=launch.descriptor["inputs"]["message"])
            host._execution_raise_if_cancelled(token)
            if result.status == "waiting":
                public = get_pending_skeleton_interaction(session_id)
                actual = resolve_pending_skeleton_interaction(session_id)
                if public is None or actual is None: _fail("skeleton_interaction_missing", "Graph wait has no approved interaction contract.")
                host._session_execution_guard_transition("park_session_guard", session_id=session_id,
                    interaction_id=actual.request.interaction_id, source_attempt_id=root_run_id, owner_attempt_id=attempt_id)
                waiting = True
                events.put({"type": "interaction_requested", "run_id": root_run_id,
                    "interaction_id": actual.request.interaction_id, "interaction_request": actual.request.to_dict(),
                    "presentation": public["presentation"], "source_run_id": root_run_id, "resume_kind": "skeleton"})
                events.put({"type": "run_suspended", "run_id": root_run_id, "interaction_id": actual.request.interaction_id})
            elif result.status == "completed":
                host._execution_control_call("mark_completed", session_id, attempt_id)
                events.put({"type": "run_completed", "run_id": root_run_id, "status": "completed"})
            else:
                _fail("skeleton_execution_" + result.status, "Skeleton execution did not complete safely.")
        except BaseException as error:
            holder["error"] = error
            durable_cancelled = guard is not None and ExecutionRuntime(durability.store).load_cancellation(session_id, attempt_id) is not None
            if durable_cancelled or host._execution_is_cancelled(token) or host._is_execution_cancelled_error(error):
                holder["cancelled"] = True
                if execution is not None: execution.cancel()
                host._execution_control_call("finish_cancelled_run", session_id, attempt_id)
            else:
                host._execution_control_call("mark_failed", session_id, attempt_id, reason=host._memory_v2_failure_reason(error))
        finally:
            try:
                if guard is not None: guard.release()
                bindings.close()
                if not waiting: clear_execution_attempt_binding(session_id, attempt_id)
            except BaseException as cleanup_error:
                holder.setdefault("error", cleanup_error)
            finally:
                events.put(done)
    thread = threading.Thread(target=work, name="skeleton-chat-" + attempt_id, daemon=True)
    thread.start()
    try:
        while True:
            if cancel_event is not None and cancel_event.is_set():
                request_cancellation("stream cancelled")
            try: event = events.get(timeout=0.1)
            except queue.Empty: continue
            if event is done: break
            yield event
        thread.join()
        if "error" in holder and not holder.get("cancelled") and not host._execution_is_cancelled(token): raise holder["error"]
    finally:
        if thread.is_alive():
            request_cancellation("stream disconnected")


def stream_skeleton_chat_events(*, message, history, attachments, options, session_id, attempt_id, cancel_event=None):
    import unchain_adapter as host
    try:
        selection = prepare_skeleton_chat_selection(options)
        workflows = freeze_skeleton_workflow_dependencies(selection)
        plan = __import__("unchain.skeleton", fromlist=["prepare_agent_graph"]).prepare_agent_graph(selection.to_dict()["document"])
        roots = [] if options.get("disable_workspace_root") is True else host._extract_workspace_roots_from_options(options)
        roots = list(dict.fromkeys(str(Path(root).expanduser().resolve()) for root in roots))
        workspace = str(Path(roots[0]).expanduser().resolve()) if roots else None
    except SkeletonResourceError as error:
        wrapped = DurableInteractionHostError(error.code, str(error), status_code=error.status, retryable=False)
        wrapped.path = error.path
        raise wrapped from error
    if not host._memory_v2_active_graph_candidate(options):
        _fail("skeleton_active_context_required", "Skeleton chat requires the active Context V2 host.", 422)
    _identifiers(session_id, attempt_id)
    registration = host._execution_control_call("register", session_id, attempt_id)
    token = host._execution_cancellation_token(session_id, attempt_id)
    if host._execution_result_is_terminal(registration):
        return
    running = host._execution_control_call("mark_running", session_id, attempt_id)
    with host._AppliedExecutionOwnerScope(session_id=session_id, attempt_id=attempt_id, running=running, execution_token=token) as owner:
        if getattr(running, "disposition", "") != "applied" or host._execution_result_is_terminal(running):
            return
        worker_started = False
        bindings = None
        try:
            bindings = SkeletonProductionBindings(selection, workflows, options, session_id=session_id,
                workspace_root=workspace, workspace_roots=roots)
            takeover = host._memory_v2_guard_reclaimed_execution(options=options, session_id=session_id,
                attempt_id=attempt_id, registration=registration, running=running)
            if takeover is not None:
                yield takeover
                return
            old = load_active_launch(session_id, allow_terminal_stale=True)
            if old and old.store.load().state["status"] not in {"completed", "failed", "cancelled", "outcome_unknown"}:
                _fail("skeleton_execution_already_active", "Resume or cancel the current Skeleton execution first.")
            bridge, durability = _bridge(selection, options=options, session_id=session_id, root_run_id=attempt_id,
                message=message, history=history, attachments=attachments)
            stream = _stream_worker(host=host, bridge=bridge, durability=durability, bindings=bindings, plan=plan,
                selection=selection, workflows=workflows, session_id=session_id, attempt_id=attempt_id,
                root_run_id=attempt_id, token=token, cancel_event=cancel_event)
            worker_started = True
            for event in stream:
                owner.handoff()
                yield event
            owner.handoff()
        finally:
            if bindings is not None and not worker_started: bindings.close()


def resume_skeleton_chat_events(*, session_id, interaction_id, options=None, attempt_id="", source_attempt_id="", cancel_event=None):
    import unchain_adapter as host
    _identifiers(session_id, attempt_id)
    options = dict(options or {})
    pending = resolve_pending_skeleton_interaction(session_id,
        expected_owner_chat_id=options.get("_memory_v2_owner_chat_id"))
    public = host.get_pending_interaction(session_id)
    if pending is None or public is None or public["interaction_id"] != interaction_id:
        _fail("interaction_not_found", "No current Skeleton interaction matches this request.", 404)
    if public["status"] != "receipt_recorded": _fail("interaction_receipt_required", "Submit the interaction response before resuming.")
    launch = pending.launch
    options["toolkits"] = list(launch.descriptor["capabilities"]["toolkits"])
    options["skills"] = {"include_user_dirs": launch.descriptor["capabilities"]["include_user_dirs"]}
    options["workspace_roots"] = list(launch.descriptor["capabilities"]["workspace_roots"])
    options["workspace_root"] = launch.descriptor["workspace_root"]
    options["workspaceRoot"] = launch.descriptor["workspace_root"]
    options["disable_workspace_root"] = not options["workspace_roots"]
    root_run_id = launch.descriptor["root_run_id"]
    if source_attempt_id and source_attempt_id != root_run_id:
        _fail("execution_attempt_binding_conflict", "Resume source does not match the Skeleton root.")
    bind_execution_attempt(session_id=session_id, attempt_id=attempt_id, source_attempt_id=root_run_id)
    registration = host._execution_control_call("register", session_id, attempt_id)
    token = host._execution_cancellation_token(session_id, attempt_id)
    if host._execution_result_is_terminal(registration): return
    transfer = host._session_execution_guard_transition("prepare_parked_session_guard_transfer", session_id=session_id,
        interaction_id=interaction_id, source_attempt_id=root_run_id, receipt_id=public["receipt_id"], attempt_id=attempt_id)
    try:
        running = host._execution_control_call("mark_running", session_id, attempt_id)
    except BaseException:
        ambiguity = host._execution_control_call("inspect_mark_running_ambiguity", session_id, attempt_id)
        disposition = getattr(ambiguity, "disposition", "")
        if disposition == "applied":
            host._session_execution_guard_transition("validate_parked_session_guard_transfer", transfer=transfer)
            running = ambiguity
        elif disposition == "already_terminal":
            host._session_execution_guard_transition("release_parked_session_guard_transfer", transfer=transfer)
            return
        else:
            if ambiguity is None or disposition == "not_applied":
                host._session_execution_guard_transition("rollback_parked_session_guard_transfer", transfer=transfer)
            raise
    if getattr(running, "disposition", "") == "unchanged" and host._execution_result_status(running) == "running":
        ambiguity = host._execution_control_call("inspect_mark_running_ambiguity", session_id, attempt_id)
        if getattr(ambiguity, "disposition", "") != "applied":
            _fail("execution_running_owner_ambiguous", "Skeleton resume owner cannot be verified.")
        host._session_execution_guard_transition("validate_parked_session_guard_transfer", transfer=transfer)
        running = ambiguity
    if getattr(running, "disposition", "") != "applied":
        host._session_execution_guard_transition("rollback_parked_session_guard_transfer", transfer=transfer)
        return
    with host._AppliedExecutionOwnerScope(session_id=session_id, attempt_id=attempt_id, running=running, execution_token=token) as owner:
        selection, workflows = launch.selection, launch.workflows
        bindings = None
        worker_started = False
        try:
            bindings = SkeletonProductionBindings(selection, workflows, options, session_id=session_id,
                workspace_root=launch.descriptor["workspace_root"], workspace_roots=options["workspace_roots"])
            bridge, durability = _bridge(selection, options=options, session_id=session_id, root_run_id=root_run_id,
                message="", history=(), attachments=(), launch=launch)
            worker_started = True
            for event in _stream_worker(host=host, bridge=bridge, durability=durability, bindings=bindings, plan=launch.plan,
                    selection=selection, workflows=workflows, session_id=session_id, attempt_id=attempt_id,
                    root_run_id=root_run_id, token=token, cancel_event=cancel_event, launch=launch, pending=pending,
                    response=public["resolution"]["response"]):
                owner.handoff()
                yield event
            owner.handoff()
        except BaseException:
            if not worker_started:
                # No runner owns the continuation yet. Restore the exact
                # parked receipt so a corrected setup can retry this wait.
                host._session_execution_guard_transition("rollback_parked_session_guard_transfer", transfer=transfer)
            raise
        finally:
            if bindings is not None and not worker_started: bindings.close()
