"""Opt-in Skeleton Agent execution on PuPu's existing active Memory V2 host.

Resource selection/admission owns entry into this adapter. Legacy chat and
recipe routing remain separate until the Skeleton storage migration lands.
"""
from __future__ import annotations

from copy import deepcopy
from functools import partial
from hashlib import sha256
from inspect import Parameter, signature
from threading import RLock
from types import SimpleNamespace

from interaction_channels import register_interject_channels, release_interject_channels
from memory_v2_skeleton_root_completion import complete_pupu_skeleton_root
from memory_v2_unchain_active_bridge import PupuUnchainActiveBridge
from skeleton_runtime_capability import require_skeleton_runtime
from unchain.kernel.harness import HarnessContext
from unchain.kernel.state import RunState
from unchain.skeleton.agent_preparation import (
    PreparedAgentPlan, execution_definition_digest, prepare_agent_graph,
)
from unchain.skeleton.durable_execution import DurableWorkflowRunner
from unchain.skeleton.durable_store import WorkflowExecutionStore
from unchain.skeleton.hook_runtime import SkeletonHookRuntime
from unchain.skeleton.hooks_runtime import HOOK_CHILD_WAIT_SCHEMA
from unchain.skeleton.hooks_config import attached_hooks
from unchain.skeleton.kernel_runtime import SkeletonKernelHandler
from unchain.skeleton.subagent_runtime import SkeletonSubagentRuntime
from unchain.journal import AttemptRef
from unchain.subagents.types import SubagentWaitSignal


_SUBAGENT_WAIT_SCHEMA_V1 = "pupu.skeleton_subagent_wait.v1"
_SUBAGENT_WAIT_SCHEMA = "pupu.skeleton_subagent_wait.v2"
_SUBAGENT_WAIT_FIELDS = {
    "schema", "parent_graph_id", "parent_node_invocation_id", "parent_kernel_node_id",
    "child_graph_id", "child_attempt_id", "entry_id", "definition_digest",
    "child_guard_session_id", "child_node_invocation_id", "child_wait_kind", "child_wait_id",
    "interaction_request", "mode",
}
_SUBAGENT_WAIT_V2_FIELDS = _SUBAGENT_WAIT_FIELDS | {"parent_tool_call"}


class PupuSkeletonAgentExecution:
    """One fixed graph attempt with scoped events and End-only chat delivery."""

    def __init__(self, plan, bridge, *, graph_id, bind_profile, durability_runtime,
                 execution_guard=None, tools_for_node=None, attachments_for_node=None,
                 other_handlers=None, callback=None, interject_options=None,
                 subagent_manifests=None, child_handlers_factory=None,
                 hook_workflow_resolver=None, host_modules_for_node=None,
                 root_handlers_factory=None):
        if type(plan) is not PreparedAgentPlan or type(bridge) is not PupuUnchainActiveBridge:
            raise TypeError("Skeleton chat requires an Agent plan and active PuPu bridge")
        from unchain.execution import ExecutionGuard
        from unchain.memory import KernelMemoryRuntime
        if (type(durability_runtime) is not KernelMemoryRuntime or type(execution_guard) is not ExecutionGuard
                or execution_guard._runtime.store is not durability_runtime.store
                or execution_guard.lease.execution_id != bridge.execution_id):
            raise ValueError("PuPu Skeleton requires one shared durable root execution guard")
        execution_guard.assert_active()
        require_skeleton_runtime()
        self.plan = plan
        self.bridge = bridge
        self.callback = callback
        self.interject_options = dict(interject_options or {})
        if host_modules_for_node is not None and not callable(host_modules_for_node):
            raise TypeError("host_modules_for_node must be callable")
        self._host_modules_for_node = host_modules_for_node or (lambda _context, **_policy: ())
        self.binding = bridge.preparation.binding
        self.factory = bridge.preparation.host_factory
        if root_handlers_factory is not None and not callable(root_handlers_factory):
            raise TypeError("root_handlers_factory must be callable")
        if root_handlers_factory is not None and other_handlers is not None:
            raise ValueError("provide root_handlers_factory or other_handlers, not both")
        self._root_handlers_factory = root_handlers_factory
        self._child_handlers_factory = child_handlers_factory or root_handlers_factory
        state = RunState()
        state.session_state.session_id = bridge.execution_id
        self.factory.context_module.runtime.bind_context(HarnessContext(
            state=state, phase="bootstrap", event={"run_id": self.binding.root_run_id}))
        root = bridge.attempt_for_run(self.binding.root_run_id).bundle
        self.store = WorkflowExecutionStore(root.journal, plan, graph_id=graph_id, attempt=root.attempt)
        self._kernel_arguments = dict(bind_profile=bind_profile,
            bundle_builder=partial(self.factory.build_skeleton_node_bundle, root_bundle=root),
            tools_for_node=tools_for_node or (lambda _context: ()),
            attachments_for_node=attachments_for_node or (lambda _context, _inputs: ()),
            execution_guard=execution_guard,
            durability_runtime=durability_runtime,
            hook_workflow_resolver=hook_workflow_resolver)
        self._subagent_runtime = SkeletonSubagentRuntime(
            tuple(subagent_manifests or ()), run_child=self._run_subagent_child,
        )
        self._hook_workflow_resolver = hook_workflow_resolver
        self._hook_runtimes = {}
        self._active_hook_runners = {}
        self._active_hook_lock = RLock()
        self._admit_hook_plan(self.plan)
        self._admit_subagent_hook_dependencies(self._subagent_runtime.by_attachment.values())
        self._kernel_arguments["modules_for_node"] = self._modules_for_node(self._subagent_runtime)
        if self._root_handlers_factory is None:
            self._handlers = dict(other_handlers or {})
        else:
            self._handlers = self._root_handlers_factory(self.store, self.plan)
            if type(self._handlers) is not dict:
                raise TypeError("root handler factory must return an object")
            self._handlers = dict(self._handlers)
        if "agent" in self._handlers:
            raise ValueError("PuPu Skeleton must use the official Kernel handler")
        self._queue_only = sum(n["type"] == "agent" for n in plan.snapshot()["nodes"]) > 1
        # Construct profiles now, before any graph dispatch or interaction registration.
        self.runner = DurableWorkflowRunner(self.store, {**self._handlers,
            "agent": SkeletonKernelHandler(
                self.store, **self._kernel_handler_arguments(self.plan),
            )})

    @staticmethod
    def _hook_runtime_key(plan):
        return plan.document_id, execution_definition_digest(plan)

    def _admit_hook_plan(self, plan):
        """Resolve every Hook dependency once, before any Kernel profile is bound."""
        if not attached_hooks(plan.snapshot()):
            return None
        key = self._hook_runtime_key(plan)
        runtime = self._hook_runtimes.get(key)
        if runtime is not None:
            if runtime.plan.snapshot() != plan.snapshot():
                raise ValueError("Hook runtime identity changed the fixed definition")
            return runtime
        if not callable(self._hook_workflow_resolver):
            raise ValueError("Hook pools require a callable hook_workflow_resolver")
        runtime = SkeletonHookRuntime(plan, self._hook_workflow_resolver)
        self._hook_runtimes[key] = runtime
        return runtime

    def _admit_subagent_hook_dependencies(self, adapters):
        for adapter in adapters:
            self._admit_hook_plan(adapter.plan)
            self._admit_nested_subagent_hook_dependencies(adapter.child_manifests)

    def _admit_nested_subagent_hook_dependencies(self, manifests):
        for raw in manifests:
            if type(raw) is not dict:
                raise TypeError("Subagent manifest entry must be an object")
            child_plan = prepare_agent_graph(deepcopy(raw["document"]))
            self._admit_hook_plan(child_plan)
            children = raw.get("subagents") or ()
            if type(children) not in {tuple, list}:
                raise TypeError("Subagent manifest descendants must be an array")
            self._admit_nested_subagent_hook_dependencies(children)

    def _hook_runtime_for(self, plan):
        if not attached_hooks(plan.snapshot()):
            return None
        runtime = self._hook_runtimes.get(self._hook_runtime_key(plan))
        if runtime is None or runtime.plan.snapshot() != plan.snapshot():
            raise ValueError("Kernel Hook dependencies were not admitted before execution")
        return runtime

    def _kernel_handler_arguments(self, plan):
        arguments = dict(self._kernel_arguments)
        arguments["hook_runtime"] = self._hook_runtime_for(plan)
        arguments["hook_workflow_runner"] = self._run_hook_workflow
        arguments["hook_workflow_canceller"] = self._cancel_active_hook
        return arguments

    def _modules_for_node(self, subagent_runtime, adapter=None):
        def modules(context):
            host_modules = (
                self._host_modules_for_node(context)
                if adapter is None else self._host_modules_for_node(
                    context, allowed_tools=adapter.allowed_tools,
                    disabled_tools=adapter.disabled_tools,
                )
            )
            return tuple(subagent_runtime.modules_for_node(context)) + tuple(host_modules)
        return modules

    @staticmethod
    def _hook_invocation_key(parent_graph_id, parent_node_invocation_id):
        if (
            type(parent_graph_id) is not str
            or not parent_graph_id
            or type(parent_node_invocation_id) is not str
            or not parent_node_invocation_id
        ):
            raise ValueError("Hook runner cancellation requires a fixed parent invocation")
        return parent_graph_id, parent_node_invocation_id

    def _cancel_active_hook(self, *, parent_graph_id, parent_node_invocation_id):
        """Cancel the one Hook child scoped to a currently active Agent node."""
        key = self._hook_invocation_key(parent_graph_id, parent_node_invocation_id)
        with self._active_hook_lock:
            entry = self._active_hook_runners.get(key)
            if entry is None:
                return None
            entry["cancel_requested"] = True
            runner = entry["runner"]
            created = entry["created"]
        if created:
            return runner.cancel()
        return None

    @staticmethod
    def _child_inputs(plan, messages):
        text = messages if type(messages) is str else "\n".join(
            str(item.get("content") or "") for item in messages if type(item) is dict
        )
        start = next(node for node in plan.snapshot()["nodes"] if node["type"] == "start")
        names = [item["name"] for item in start["config"]["execution"]["outputs"]]
        return {name: text for name in names}

    def _handlers_for_child(self, store, plan, adapter=None):
        if self._child_handlers_factory is not None:
            factory = self._child_handlers_factory
            policy = {}
            if adapter is not None:
                try:
                    parameters = signature(factory).parameters.values()
                except (TypeError, ValueError):
                    parameters = ()
                accepts_kwargs = any(parameter.kind is Parameter.VAR_KEYWORD
                                     for parameter in parameters)
                names = {parameter.name for parameter in parameters}
                if accepts_kwargs or "allowed_tools" in names:
                    policy["allowed_tools"] = adapter.allowed_tools
                if accepts_kwargs or "disabled_tools" in names:
                    policy["disabled_tools"] = adapter.disabled_tools
            handlers = factory(store, plan, **policy)
            if type(handlers) is not dict:
                raise TypeError("child handler factory must return an object")
            return dict(handlers)
        handlers = {}
        for kind, handler in self._handlers.items():
            clone = getattr(handler, "for_plan", None)
            handlers[kind] = clone(plan) if callable(clone) else handler
        return handlers

    def _run_hook_workflow(self, *, binding, inputs, parent_context, parent_store,
                           hook_resume=None):
        """Execute one pinned non-LLM Hook as a scoped durable child graph.

        The Context authority owns tool selection and parent approval.  This
        adapter receives only the fixed Hook Workflow and its event input; a
        Hook Workflow cannot gain the enclosing Hook Pool by this route.
        """
        from unchain.skeleton.errors import SkeletonValidationError
        from unchain.skeleton.workflow_runtime import SkeletonWorkflowCallRuntime

        if parent_store is None or parent_context is None:
            raise TypeError("Hook Workflow requires its parent execution scope")
        if type(inputs) is not dict:
            raise TypeError("Hook Workflow inputs must be an object")
        hook = binding.hook
        call_id = inputs.get("call_id")
        if (
            type(call_id) is not str
            or not call_id
            or type(hook) is not dict
            or type(hook.get("id")) is not str
            or not hook["id"]
        ):
            raise SkeletonValidationError(
                "identity_mismatch",
                ("hook",),
                "Hook invocation identity is invalid",
            )
        parent_context.assert_current()
        parent = parent_store.load()
        active = parent.state.get("active") if parent is not None else None
        if (
            active is None
            or active.get("node_invocation_id") != parent_context.node_invocation_id
        ):
            raise SkeletonValidationError(
                "identity_mismatch",
                ("hook",),
                "Hook parent invocation is no longer current",
            )
        basis = "\x00".join(
            (
                parent_store.graph_id,
                parent_context.node_invocation_id,
                call_id,
                hook["id"],
                binding.workflow.workflow_id,
                binding.workflow.revision_id,
            )
        )
        suffix = sha256(basis.encode("utf-8", "surrogatepass")).hexdigest()
        graph_id = f"{parent_store.graph_id}.hook.{suffix}"
        attempt = AttemptRef(parent_store.attempt.generation, "hook." + suffix)
        store = WorkflowExecutionStore(
            parent_store.journal,
            binding.plan,
            graph_id=graph_id,
            attempt=attempt,
        )
        handlers = self._handlers_for_child(store, binding.plan)
        handlers.pop("agent", None)
        handlers["workflow_call"] = SkeletonWorkflowCallRuntime(
            store,
            self._hook_workflow_resolver,
            handlers=handlers,
        )
        # The root execution guard is the durable user-cancellation lease for
        # every nested child. The parent node context separately protects this
        # specific Agent invocation in the graph.
        parent_execution_guard = self._kernel_arguments["execution_guard"]
        def assert_parent_authority():
            parent_context.assert_current()
            parent_execution_guard.assert_active()

        runner = DurableWorkflowRunner(
            store,
            handlers,
            ancestor_assert_current=assert_parent_authority,
        )
        key = self._hook_invocation_key(
            parent_store.graph_id,
            parent_context.node_invocation_id,
        )
        entry = {"runner": runner, "created": False, "cancel_requested": False}
        with self._active_hook_lock:
            if key in self._active_hook_runners:
                raise SkeletonValidationError(
                    "identity_mismatch",
                    ("hook", hook["id"]),
                    "Hook invocation is already active",
                )
            self._active_hook_runners[key] = entry
        frames = [dict(frame) for frame in parent.state["call_stack"]]
        frames[-1]["caller_node_invocation_id"] = parent_context.node_invocation_id
        frames.append(
            {
                "execution_id": store.attempt.generation.execution_id,
                "graph_invocation_id": graph_id,
                "attempt_id": store.attempt.attempt_id,
                "definition_id": binding.plan.document_id,
                "definition_digest": execution_definition_digest(binding.plan),
            }
        )
        try:
            # The parent might have been cancelled between its first ownership
            # check and registration above.  The registration lets cancellation
            # mark this entry before the child state exists; this check prevents
            # a new child from being created after that cancellation.
            parent_context.assert_current()
            runner.create(deepcopy(inputs), call_stack=frames)
            with self._active_hook_lock:
                entry["created"] = True
                cancel_requested = entry["cancel_requested"]
            if cancel_requested:
                runner.cancel()
            parent_context.assert_current()
            child_record = store.load()
            child_active = child_record.state["active"] if child_record is not None else None
            child_wait = child_active.get("wait") if child_active is not None else None
            if hook_resume is not None:
                from unchain.interaction.durable import InteractionRequest
                workflow_runtime = handlers.get("workflow_call")
                if (type(hook_resume) is not dict or set(hook_resume) != {"request", "response"}
                        or child_record.state["status"] != "waiting" or child_wait is None
                        or child_wait["kind"] not in {"interaction", "child"}):
                    raise SkeletonValidationError("identity_mismatch", ("hook", hook["id"]),
                        "Hook approval is not waiting")
                leaf = (
                    workflow_runtime.tool_interaction_wait(
                        runner, node_invocation_id=child_active["node_invocation_id"],
                    )
                    if child_wait["kind"] == "child"
                    and type(workflow_runtime) is SkeletonWorkflowCallRuntime
                    else {
                        "graph_id": graph_id,
                        "attempt_id": attempt.attempt_id,
                        "wait_id": child_wait["id"],
                        "node_invocation_id": child_active["node_invocation_id"],
                        "request": store.read_json(child_wait["request_ref"]),
                    }
                )
                parent_request = InteractionRequest.from_dict(hook_resume["request"])
                subject = parent_request.subject
                wait = subject.get("hook_child_wait") if type(subject) is dict else None
                child_request = leaf["request"]
                expected = {
                    "schema": HOOK_CHILD_WAIT_SCHEMA,
                    "parent_graph_id": parent_store.graph_id,
                    "parent_node_invocation_id": parent_context.node_invocation_id,
                    "parent_tool_call": {"call_id": call_id, "tool_name": inputs["tool_name"]},
                    "hook_id": hook["id"],
                    "workflow_id": binding.workflow.workflow_id,
                    "revision_id": binding.workflow.revision_id,
                    "definition_digest": execution_definition_digest(binding.plan),
                    "child_graph_id": leaf["graph_id"],
                    "child_attempt_id": leaf["attempt_id"],
                    "child_node_invocation_id": leaf["node_invocation_id"],
                    "child_wait_kind": "interaction",
                    "child_wait_id": leaf["wait_id"],
                    "interaction_request": child_request["interaction"],
                }
                if (wait != expected or parent_request.payload != child_request["interaction"]["payload"]
                        or parent_request.response_contract != child_request["interaction"]["response_contract"]):
                    raise SkeletonValidationError("identity_mismatch", ("hook", hook["id"]),
                        "Hook approval changed its durable child binding")
                try:
                    if child_wait["kind"] == "child":
                        workflow_runtime.resume_tool_interaction(
                            runner,
                            node_invocation_id=child_active["node_invocation_id"],
                            wait_id=leaf["wait_id"],
                            response=hook_resume["response"],
                        )
                    else:
                        runner.resume_tool_interaction(child_wait["id"], hook_resume["response"],
                            node_invocation_id=child_active["node_invocation_id"])
                except SkeletonValidationError as error:
                    if error.code != "interaction_expired":
                        raise
                    # The official Tool handler already observed a clock value
                    # past this stored deadline. Preserve that observation if a
                    # later wall-clock read moves backwards.
                    try:
                        observed_expiration_ms = child_request["expires_at_ms"] + 1
                        if child_wait["kind"] == "child":
                            expired = workflow_runtime.expire_tool_interaction(
                                runner,
                                node_invocation_id=child_active["node_invocation_id"],
                                wait_id=leaf["wait_id"], now_ms=observed_expiration_ms,
                            )
                        else:
                            expired = runner.expire_tool_interaction(child_wait["id"],
                                node_invocation_id=child_active["node_invocation_id"],
                                now_ms=observed_expiration_ms)
                    except Exception as terminal_error:
                        raise SkeletonValidationError("child_outcome_unknown", ("hook", hook["id"]),
                            "Expired Hook approval could not be terminalized") from terminal_error
                    if expired.status != "failed":
                        raise SkeletonValidationError("child_outcome_unknown", ("hook", hook["id"]),
                            "Expired Hook child did not reach a terminal failure") from error
                    raise SkeletonValidationError("child_failed", ("hook", hook["id"]),
                        "Hook Tool approval expired") from error
            result = runner.run()
            if result.status == "waiting":
                from unchain.interaction.durable import InteractionRequest
                child_record = store.load()
                child_active = child_record.state["active"]
                child_wait = child_active["wait"]
                workflow_runtime = handlers.get("workflow_call")
                if child_wait["kind"] == "child" and type(workflow_runtime) is SkeletonWorkflowCallRuntime:
                    leaf = workflow_runtime.tool_interaction_wait(
                        runner, node_invocation_id=child_active["node_invocation_id"],
                    )
                elif child_wait["kind"] == "interaction":
                    leaf = {
                        "graph_id": graph_id,
                        "attempt_id": attempt.attempt_id,
                        "wait_id": child_wait["id"],
                        "node_invocation_id": child_active["node_invocation_id"],
                        "request": store.read_json(child_wait["request_ref"]),
                    }
                else:
                    raise SkeletonValidationError("child_waiting", ("hook", hook["id"]),
                        "Hook Workflow requires an unsupported continuation")
                child_request = leaf["request"]
                if (type(child_request) is not dict
                        or set(child_request) != {"schema", "interaction", "expires_at_ms"}
                        or child_request["schema"] != "unchain.skeleton_tool_approval_wait.v1"):
                    raise SkeletonValidationError("identity_mismatch", ("hook", hook["id"]),
                        "Hook Tool approval wait is invalid")
                interaction = InteractionRequest.from_dict(child_request["interaction"])
                if (interaction.kind != "tool_approval" or interaction.interaction_id != leaf["wait_id"]
                        or interaction.source_run_id != leaf["graph_id"]):
                    raise SkeletonValidationError("identity_mismatch", ("hook", hook["id"]),
                        "Hook Tool approval identity changed")
                wait_request = {
                    "schema": HOOK_CHILD_WAIT_SCHEMA,
                    "parent_graph_id": parent_store.graph_id,
                    "parent_node_invocation_id": parent_context.node_invocation_id,
                    "parent_tool_call": {"call_id": call_id, "tool_name": inputs["tool_name"]},
                    "hook_id": hook["id"],
                    "workflow_id": binding.workflow.workflow_id,
                    "revision_id": binding.workflow.revision_id,
                    "definition_digest": execution_definition_digest(binding.plan),
                    "child_graph_id": leaf["graph_id"],
                    "child_attempt_id": leaf["attempt_id"],
                    "child_node_invocation_id": leaf["node_invocation_id"],
                    "child_wait_kind": "interaction",
                    "child_wait_id": leaf["wait_id"],
                    "interaction_request": interaction.to_dict(),
                }
                raise SubagentWaitSignal(leaf["wait_id"], wait_request,
                    parent_tool_call=wait_request["parent_tool_call"])
            if result.status != "completed" or type(result.outputs) is not dict:
                status_codes = {
                    "cancelled": "child_cancelled",
                    "failed": "child_failed",
                    "outcome_unknown": "child_outcome_unknown",
                    "waiting": "child_waiting",
                }
                raise SkeletonValidationError(
                    status_codes.get(result.status, "hook_incomplete"),
                    ("hook", hook["id"]),
                    "Hook Workflow requires a later continuation",
                )
            parent_context.assert_current()
            return deepcopy(result.outputs)
        finally:
            with self._active_hook_lock:
                if self._active_hook_runners.get(key) is entry:
                    self._active_hook_runners.pop(key)

    def _run_subagent_child(self, adapter, messages, kwargs):
        return self._run_subagent_child_from(self.store, adapter, messages, kwargs)

    def _child_runner(self, parent_store, adapter, run_id, *, execution_guard=None,
                      run_bundle_identity=None):
        basis = "\x00".join((parent_store.graph_id, run_id, adapter.entry_id))
        suffix = sha256(basis.encode("utf-8", "surrogatepass")).hexdigest()
        graph_id = f"{parent_store.graph_id}.subagent.{suffix}"
        attempt = AttemptRef(parent_store.attempt.generation, run_id)
        child_store = WorkflowExecutionStore(
            parent_store.journal, adapter.plan, graph_id=graph_id, attempt=attempt,
        )
        nested = SkeletonSubagentRuntime(
            adapter.child_manifests,
            run_child=partial(self._run_subagent_child_from, child_store),
        )
        arguments = self._kernel_handler_arguments(adapter.plan)
        if execution_guard is not None:
            arguments["execution_guard"] = execution_guard
        if run_bundle_identity is not None:
            from unchain.run_bundle import RunIdentity
            if type(run_bundle_identity) is not RunIdentity:
                raise TypeError("Skeleton child requires an exact run bundle identity")
            arguments["run_bundle_root_id"] = run_bundle_identity.root_run_id
            arguments["run_bundle_parent_id"] = run_bundle_identity.parent_run_id
        arguments["tools_for_node"] = SkeletonSubagentRuntime.tools_for_child(
            adapter,
            self._kernel_arguments["tools_for_node"],
        )
        arguments["modules_for_node"] = self._modules_for_node(nested, adapter)
        handlers = self._handlers_for_child(child_store, adapter.plan, adapter)
        handlers.pop("agent", None)
        handlers["agent"] = SkeletonKernelHandler(child_store, **arguments)
        return graph_id, child_store, nested, DurableWorkflowRunner(child_store, handlers)

    def _run_subagent_child_from(self, parent_store, adapter, messages, kwargs):
        run_id = str(kwargs.get("run_id") or "").strip()
        if not run_id:
            raise ValueError("Skeleton subagent requires a fixed child run id")
        child_guard = kwargs.get("_execution_guard")
        if child_guard is None:
            raise ValueError("Skeleton subagent requires a borrowed execution guard")
        child_guard_session_id = child_guard.lease.execution_id
        run_bundle_identity = kwargs.get("_run_bundle_identity")
        graph_id, child_store, nested, runner = self._child_runner(
            parent_store, adapter, run_id, execution_guard=child_guard,
            run_bundle_identity=run_bundle_identity,
        )
        parent = parent_store.load()
        if parent is None or parent.state["active"] is None:
            raise ValueError("parent Skeleton node is unavailable")
        frames = [dict(frame) for frame in parent.state["call_stack"]]
        frames[-1]["caller_node_invocation_id"] = parent.state["active"]["node_invocation_id"]
        frames.append({
            "execution_id": child_store.attempt.generation.execution_id,
            "graph_invocation_id": graph_id,
            "attempt_id": child_store.attempt.attempt_id,
            "definition_id": adapter.plan.document_id,
            "definition_digest": execution_definition_digest(adapter.plan),
        })
        runner.create(self._child_inputs(adapter.plan, messages), call_stack=frames)
        result = runner.run()
        if result.status == "completed":
            output = result.outputs
            if type(output) is not dict or type(output.get("message")) is not str:
                raise ValueError("subagent End must export string message")
            return SimpleNamespace(
                status="completed",
                messages=[{"role": "user", "content": messages},
                          {"role": "assistant", "content": output["message"]}],
                human_input_request=None,
                interaction_request=None,
                run_bundle=None,
            )
        if result.status == "waiting":
            request = self._subagent_wait_request(
                parent_store,
                adapter,
                child_store,
                child_guard_session_id,
                mode=self._subagent_mode(adapter),
                runner=runner,
            )
            wait_id = self._subagent_wait_identity(request)
            raise SubagentWaitSignal(wait_id, request)
        return SimpleNamespace(
            status=result.status, messages=[], human_input_request=None,
            interaction_request=None, run_bundle=None,
            error=str(getattr(result, "error", "") or ""),
        )

    @staticmethod
    def _subagent_mode(adapter):
        invocation = adapter.invocation
        mode = invocation.get("mode") if type(invocation) is dict else None
        if mode not in {"delegate", "handoff", "worker"}:
            raise ValueError("subagent invocation mode is not durable")
        return mode

    @staticmethod
    def _subagent_wait_request(parent_store, adapter, child_store, child_guard_session_id, *,
                               mode, runner=None):
        parent = parent_store.load()
        child = child_store.load()
        if (parent is None or parent.state["active"] is None
                or child is None or child.state["status"] != "waiting"):
            raise ValueError("subagent wait is not durable")
        parent_active = parent.state["active"]
        child_active = child.state["active"]
        wait = child_active["wait"]
        request = child_store.read_json(wait["request_ref"])
        if wait["kind"] == "interaction":
            interaction_request = request
        elif (wait["kind"] == "child" and type(request) is dict
              and request.get("schema") in {_SUBAGENT_WAIT_SCHEMA_V1, _SUBAGENT_WAIT_SCHEMA}
              and type(request.get("interaction_request")) is dict):
            interaction_request = request["interaction_request"]
        elif (wait["kind"] == "child" and runner is not None
              and runner.nodes[child_active["node_id"]]["type"] == "workflow_call"):
            from unchain.skeleton.workflow_runtime import SkeletonWorkflowCallRuntime
            workflow_runtime = runner.handlers.get("workflow_call")
            if type(workflow_runtime) is not SkeletonWorkflowCallRuntime:
                raise ValueError("Workflow Call wait has no official runtime")
            leaf = workflow_runtime.tool_interaction_wait(
                runner, node_invocation_id=child_active["node_invocation_id"],
            )
            interaction_request = leaf["request"]
        else:
            raise ValueError("subagent wait does not expose a resumable interaction")
        return {
            "schema": _SUBAGENT_WAIT_SCHEMA_V1,
            "parent_graph_id": parent_store.graph_id,
            "parent_node_invocation_id": parent_active["node_invocation_id"],
            "parent_kernel_node_id": parent_active["node_id"],
            "child_graph_id": child_store.graph_id,
            "child_attempt_id": child_store.attempt.attempt_id,
            "entry_id": adapter.entry_id,
            "definition_digest": execution_definition_digest(adapter.plan),
            "child_guard_session_id": child_guard_session_id,
            "child_node_invocation_id": child_active["node_invocation_id"],
            "child_wait_kind": wait["kind"],
            "child_wait_id": wait["id"],
            "interaction_request": interaction_request,
            "mode": mode,
        }

    @staticmethod
    def _request_with_parent_tool_call(request, parent_tool_call):
        if (type(request) is not dict or set(request) != _SUBAGENT_WAIT_FIELDS
                or request.get("schema") != _SUBAGENT_WAIT_SCHEMA_V1):
            raise ValueError("subagent wait receipt cannot bind a parent tool")
        if (type(parent_tool_call) is not dict or set(parent_tool_call) != {"call_id", "tool_name"}
                or any(type(value) is not str or not value.strip()
                       for value in parent_tool_call.values())):
            raise ValueError("subagent parent tool call is invalid")
        return {
            **request,
            "schema": _SUBAGENT_WAIT_SCHEMA,
            "parent_tool_call": {
                "call_id": parent_tool_call["call_id"].strip(),
                "tool_name": parent_tool_call["tool_name"].strip(),
            },
        }

    @staticmethod
    def _valid_subagent_wait_request(request):
        if type(request) is not dict:
            return False
        if (set(request) == _SUBAGENT_WAIT_FIELDS
                and request.get("schema") == _SUBAGENT_WAIT_SCHEMA_V1):
            return True
        return (
            set(request) == _SUBAGENT_WAIT_V2_FIELDS
            and request.get("schema") == _SUBAGENT_WAIT_SCHEMA
            and type(request.get("parent_tool_call")) is dict
            and set(request["parent_tool_call"]) == {"call_id", "tool_name"}
            and all(type(value) is str and value.strip()
                    for value in request["parent_tool_call"].values())
        )

    @staticmethod
    def _subagent_wait_identity(request):
        identity = "\x00".join((request["child_graph_id"], request["child_wait_id"]))
        return "subagent." + sha256(identity.encode("utf-8", "surrogatepass")).hexdigest()

    @staticmethod
    def _child_completion(child_store, result):
        if result.status not in {"completed", "failed", "cancelled", "outcome_unknown"}:
            raise ValueError("subagent child has no terminal result")
        outputs = result.outputs if result.status == "completed" else None
        if outputs is not None and type(outputs) is not dict:
            raise ValueError("subagent child outputs are invalid")
        error = result.error or {}
        return {
            "schema": "unchain.skeleton_child_completion.v1",
            "attempt": child_store.attempt.to_dict(),
            "status": result.status,
            "outputs": outputs,
            "error": "" if not error else str(error),
        }

    @staticmethod
    def _handoff_kernel_output(completion, request):
        outputs = completion["outputs"]
        message = outputs.get("message") if type(outputs) is dict else None
        if type(message) is not str:
            raise ValueError("handoff child has no string message")
        return {
            "message": message,
            "context": {
                "provider": "subagent_handoff",
                "model": request["entry_id"],
                "profile_id": request["entry_id"],
                "usage": None,
            },
        }

    def _settle_child_result(self, runner, wait_id, request, completion, *, node_invocation_id):
        if completion["status"] != "completed" and request["mode"] == "handoff":
            return runner.fail_kernel_child(
                wait_id,
                node_invocation_id=node_invocation_id,
                code="subagent_" + completion["status"],
            )
        if request["mode"] == "handoff":
            return runner.complete_kernel_child(
                wait_id,
                self._handoff_kernel_output(completion, request),
                node_invocation_id=node_invocation_id,
            )
        parent_tool_call = request.get("parent_tool_call")
        completion_for_parent = completion if parent_tool_call is None else {
            **completion,
            "parent_tool_call": parent_tool_call,
        }
        return runner.resume_kernel_child(
            wait_id,
            node_invocation_id=node_invocation_id,
            child_completion=completion_for_parent,
        )

    def _resume_child_request(self, parent_store, runtime, request, response, submitted_by):
        if not self._valid_subagent_wait_request(request):
            raise ValueError("subagent wait receipt has an unknown shape")
        parent = parent_store.load()
        if (parent is None or parent.state["status"] != "waiting"
                or parent.state["active"] is None
                or request["parent_graph_id"] != parent_store.graph_id
                or request["parent_node_invocation_id"] != parent.state["active"]["node_invocation_id"]
                or request["parent_kernel_node_id"] != parent.state["active"]["node_id"]):
            raise ValueError("subagent wait parent identity changed")
        adapter = runtime.agent_for_attachment(
            request["parent_kernel_node_id"], request["entry_id"],
        )
        from unchain.execution import _borrow_execution_guard
        child_guard = _borrow_execution_guard(
            self._kernel_arguments["execution_guard"],
            session_id=request["child_guard_session_id"],
        )
        from unchain.run_bundle import RunIdentity
        frames = parent.state["call_stack"]
        child_run_bundle_identity = RunIdentity(
            execution_id=parent_store.attempt.generation.execution_id,
            attempt_id=request["child_attempt_id"],
            root_run_id=frames[0]["attempt_id"],
            run_id=request["child_attempt_id"],
            parent_run_id=parent.state["active"]["node_attempt_id"],
            relation="subagent",
        )
        graph_id, child_store, nested, runner = self._child_runner(
            parent_store, adapter, request["child_attempt_id"], execution_guard=child_guard,
            run_bundle_identity=child_run_bundle_identity,
        )
        if (request["child_graph_id"] != graph_id
                or request["definition_digest"] != execution_definition_digest(adapter.plan)):
            raise ValueError("subagent wait definition identity changed")
        child = child_store.load()
        if child is None:
            raise ValueError("subagent child is unavailable")
        result = runner.inspect()
        if child.state["status"] in {"completed", "failed", "cancelled", "outcome_unknown"}:
            # A child can commit its terminal state before the parent transaction
            # records the settlement.  On a cold resume, settle that committed
            # result rather than replaying the already-consumed response.
            return result, None, self._child_completion(child_store, result)
        if child.state["status"] != "waiting" or child.state["active"] is None:
            raise ValueError("subagent child is not waiting")
        active = child.state["active"]
        wait = active["wait"]
        if (active["node_invocation_id"] != request["child_node_invocation_id"]
                or wait["kind"] != request["child_wait_kind"]
                or wait["id"] != request["child_wait_id"]):
            # The child committed a later interaction before its parent recorded
            # the replacement wait.  Surface that later wait without applying the
            # stale response to it.
            next_request = self._subagent_wait_request(
                parent_store,
                adapter,
                child_store,
                request["child_guard_session_id"],
                mode=request["mode"],
                runner=runner,
            )
            if request.get("parent_tool_call") is not None:
                next_request = self._request_with_parent_tool_call(
                    next_request, request["parent_tool_call"],
                )
            return result, {
                "id": self._subagent_wait_identity(next_request),
                "request": next_request,
            }, None
        node_type = runner.nodes[active["node_id"]]["type"]
        if wait["kind"] == "interaction" and node_type == "agent":
            result = runner.resume_kernel_interaction(
                wait["id"], response, node_invocation_id=active["node_invocation_id"],
                submitted_by=submitted_by,
            )
        elif wait["kind"] == "interaction" and node_type == "tool_call":
            result = runner.resume_tool_interaction(
                wait["id"], response, node_invocation_id=active["node_invocation_id"],
                submitted_by=submitted_by,
            )
        elif wait["kind"] == "child":
            if node_type == "workflow_call":
                from unchain.skeleton.workflow_runtime import SkeletonWorkflowCallRuntime
                workflow_runtime = runner.handlers.get("workflow_call")
                if type(workflow_runtime) is not SkeletonWorkflowCallRuntime:
                    raise ValueError("Workflow Call wait has no official runtime")
                leaf = workflow_runtime.tool_interaction_wait(
                    runner, node_invocation_id=active["node_invocation_id"],
                )
                result = workflow_runtime.resume_tool_interaction(
                    runner, node_invocation_id=active["node_invocation_id"],
                    wait_id=leaf["wait_id"], response=response, submitted_by=submitted_by,
                )
            elif node_type == "agent":
                nested_request = child_store.read_json(wait["request_ref"])
                _nested_result, nested_wait, nested_completion = self._resume_child_request(
                    child_store, nested, nested_request, response, submitted_by,
                )
                result = (runner.replace_kernel_child_wait(
                    wait["id"], nested_wait["request"], next_wait_id=nested_wait["id"],
                    node_invocation_id=active["node_invocation_id"],
                ) if nested_wait is not None else self._settle_child_result(
                    runner,
                    wait["id"],
                    nested_request,
                    nested_completion,
                    node_invocation_id=active["node_invocation_id"],
                ))
            else:
                raise ValueError("subagent child wait node type is unsupported")
        else:
            raise ValueError("subagent child wait kind is unsupported")
        if result.status in {"ready", "result_received"}:
            result = runner.run()
        if result.status == "waiting":
            next_request = self._subagent_wait_request(
                parent_store,
                adapter,
                child_store,
                request["child_guard_session_id"],
                mode=request["mode"],
                runner=runner,
            )
            if request.get("parent_tool_call") is not None:
                next_request = self._request_with_parent_tool_call(
                    next_request, request["parent_tool_call"],
                )
            return result, {
                "id": self._subagent_wait_identity(next_request),
                "request": next_request,
            }, None
        return result, None, self._child_completion(child_store, result)

    def create(self, inputs, *, attachments=None):
        return self.runner.create(inputs, attachments=attachments)

    def _advance(self, operation, *, original_task):
        channels = register_interject_channels(self.bridge.execution_id, original_task,
            options=self.interject_options, queue_only=self._queue_only)
        def node_event(event):
            channels.digest(event)
            if self.callback is not None:
                # A node's final text is progress on that node, never the root reply.
                self.callback({**event, "scope": "node"})
        try:
            handler = SkeletonKernelHandler(self.store, **self._kernel_handler_arguments(self.plan),
                callback=node_event, fyi_channel=None if self._queue_only else channels.fyi)
            self.runner.handlers["agent"] = handler
            result = operation(self.runner)
            if result.status == "result_received":
                result = self.runner.run()
            if result.status == "completed":
                receipt = complete_pupu_skeleton_root(self.runner, self.bridge,
                    agent_name=self.plan.snapshot()["name"])
                if self.callback is not None:
                    self.callback({"type": "final_message", "scope": "root",
                        "run_id": self.binding.root_run_id, "content": result.outputs["message"],
                        "completion_id": result.completion_id})
                return self.runner.inspect(), receipt
            return result, None
        finally:
            release_interject_channels(self.bridge.execution_id, channels)

    def run(self, *, original_task=""):
        return self._advance(lambda runner: runner.run(), original_task=original_task)

    def resume_interaction(self, wait_id, response, *, node_invocation_id,
                           submitted_by="user", original_task=""):
        return self._advance(lambda runner: runner.resume_kernel_interaction(wait_id, response,
            node_invocation_id=node_invocation_id, submitted_by=submitted_by), original_task=original_task)

    def resume_current_interaction(self, wait_id, response, *, node_invocation_id,
                                   submitted_by="user", original_task=""):
        """Resume the exact current user-facing wait using its official node runtime."""
        def resume(runner):
            record = self.store.load()
            active = record.state["active"] if record is not None else None
            if (record is None or record.state["status"] != "waiting" or active is None
                    or active["node_invocation_id"] != node_invocation_id):
                raise ValueError("interaction wait is not current")
            node_type = runner.nodes[active["node_id"]]["type"]
            wait = active["wait"]
            if wait["kind"] == "interaction" and node_type == "agent":
                if wait["id"] != wait_id:
                    raise ValueError("interaction wait is not current")
                return runner.resume_kernel_interaction(
                    wait_id, response, node_invocation_id=node_invocation_id,
                    submitted_by=submitted_by,
                )
            if wait["kind"] == "interaction" and node_type == "tool_call":
                if wait["id"] != wait_id:
                    raise ValueError("interaction wait is not current")
                return runner.resume_tool_interaction(
                    wait_id, response, node_invocation_id=node_invocation_id,
                    submitted_by=submitted_by,
                )
            if wait["kind"] == "child" and node_type == "workflow_call":
                from unchain.skeleton.workflow_runtime import SkeletonWorkflowCallRuntime
                workflow_runtime = runner.handlers.get("workflow_call")
                if type(workflow_runtime) is not SkeletonWorkflowCallRuntime:
                    raise ValueError("Workflow Call wait has no official runtime")
                leaf = workflow_runtime.tool_interaction_wait(
                    runner, node_invocation_id=node_invocation_id,
                )
                if leaf["wait_id"] != wait_id:
                    raise ValueError("interaction wait is not current")
                return workflow_runtime.resume_tool_interaction(
                    runner, node_invocation_id=node_invocation_id, wait_id=leaf["wait_id"],
                    response=response, submitted_by=submitted_by,
                )
            if wait["kind"] == "child" and node_type == "agent":
                return self._resume_subagent_wait(
                    runner, wait_id, response, node_invocation_id=node_invocation_id,
                    submitted_by=submitted_by,
                )
            raise ValueError("active wait is not a resumable interaction")
        return self._advance(resume, original_task=original_task)

    def _resume_subagent_wait(self, runner, wait_id, response, *, node_invocation_id,
                              submitted_by):
        record = self.store.load()
        active = record.state["active"] if record is not None else None
        if (record is None or record.state["status"] != "waiting" or active is None
                or active["node_invocation_id"] != node_invocation_id
                or active["wait"]["kind"] != "child" or active["wait"]["id"] != wait_id
                or runner.nodes[active["node_id"]]["type"] != "agent"):
            raise ValueError("subagent wait is not current")
        request = self.store.read_json(active["wait"]["request_ref"])
        _child_result, child_wait, child_completion = self._resume_child_request(
            self.store, self._subagent_runtime, request, response, submitted_by,
        )
        if child_wait is not None:
            return runner.replace_kernel_child_wait(
                wait_id, child_wait["request"], next_wait_id=child_wait["id"],
                node_invocation_id=node_invocation_id,
            )
        return self._settle_child_result(
            runner, wait_id, request, child_completion,
            node_invocation_id=node_invocation_id,
        )

    def resume_subagent_interaction(self, wait_id, response, *, node_invocation_id,
                                    submitted_by="user", original_task=""):
        return self._advance(lambda runner: self._resume_subagent_wait(
            runner, wait_id, response, node_invocation_id=node_invocation_id,
            submitted_by=submitted_by,
        ), original_task=original_task)

    def recover(self, *, original_task=""):
        """Recover durable graph work and finish a safely recovered node path."""
        result, _receipt = self._advance(
            lambda runner: runner.recover(), original_task=original_task,
        )
        return result

    def cancel(self):
        from unchain.execution import ExecutionRuntime
        result = self.runner.inspect()
        if result.status in {"completed", "cancelled", "failed", "outcome_unknown"}:
            return result
        lease = self._kernel_arguments["execution_guard"].lease
        ExecutionRuntime(self._kernel_arguments["durability_runtime"].store).request_cancel(
            lease.execution_id, lease.owner_id, reason="Skeleton graph cancelled")
        return self.runner.cancel()


__all__ = ["PupuSkeletonAgentExecution"]
