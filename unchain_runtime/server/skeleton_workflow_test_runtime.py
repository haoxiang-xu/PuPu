"""A real root Workflow using the existing production hosts, not a fake Agent."""
from unchain.kernel.harness import HarnessContext
from unchain.kernel.state import RunState
from unchain.skeleton.durable_execution import DurableWorkflowRunner
from unchain.skeleton.durable_store import WorkflowExecutionStore
from unchain.skeleton.workflow_runtime import SkeletonWorkflowCallRuntime
from unchain.skeleton import PreparedWorkflowPlan
from memory_v2_unchain_active_bridge import PupuUnchainActiveBridge


class PupuSkeletonWorkflowExecution:
    def __init__(self, plan, bridge, *, graph_id, execution_guard,
                 durability_runtime, root_handlers_factory, callback=None, **_agent_only):
        if type(plan) is not PreparedWorkflowPlan or type(bridge) is not PupuUnchainActiveBridge:
            raise TypeError("A Workflow test requires a prepared Workflow")
        from unchain.execution import ExecutionGuard
        from unchain.memory import KernelMemoryRuntime
        if (type(durability_runtime) is not KernelMemoryRuntime or type(execution_guard) is not ExecutionGuard
                or execution_guard._runtime.store is not durability_runtime.store
                or execution_guard.lease.execution_id!=bridge.execution_id):
            raise ValueError('A Workflow test requires one shared durable root guard')
        execution_guard.assert_active()
        self.plan, self.bridge, self.callback = plan, bridge, callback
        self.binding = bridge.preparation.binding
        factory = bridge.preparation.host_factory
        state = RunState()
        state.session_state.session_id = bridge.execution_id
        factory.context_module.runtime.bind_context(HarnessContext(
            state=state, phase="bootstrap", event={"run_id": self.binding.root_run_id}))
        self.root = bridge.attempt_for_run(self.binding.root_run_id).bundle
        self.store = WorkflowExecutionStore(self.root.journal, plan, graph_id=graph_id, attempt=self.root.attempt)
        self.runner = DurableWorkflowRunner(self.store, root_handlers_factory(self.store, plan))

    def create(self, inputs, *, attachments=None):
        return self.runner.create(inputs, attachments=attachments)

    def _advance(self, operation):
        result = operation()
        if result.status == "result_received":
            result = self.runner.run()
        if result.status == "completed":
            # A function End is a structured result, not a chat final or a
            # Memory Agent invocation. The durable graph owns its CAS bytes.
            self.root.durable_event_sink({"type": "run_completed", "run_id": self.binding.root_run_id,
                "iteration": len(self.store.load().state["completed"]), "status": "completed"})
            self.runner.commit_root()
            result = self.runner.inspect()
        return result, None

    def run(self, *, original_task=""):
        return self._advance(self.runner.run)

    def resume_current_interaction(self, wait_id, response, *, node_invocation_id, original_task=""):
        record = self.store.load()
        active = record.state["active"] if record else None
        if record is None or record.state["status"] != "waiting" or not active or active["node_invocation_id"] != node_invocation_id:
            raise ValueError("Workflow interaction is no longer current")
        node = self.runner.nodes[active["node_id"]]
        wait = active["wait"]
        if node["type"] == "tool_call" and wait["kind"] == "interaction" and wait["id"] == wait_id:
            return self._advance(lambda: self.runner.resume_tool_interaction(wait_id, response, node_invocation_id=node_invocation_id))
        runtime = self.runner.handlers.get("workflow_call")
        if node["type"] == "workflow_call" and wait["kind"] == "child" and type(runtime) is SkeletonWorkflowCallRuntime:
            return self._advance(lambda: runtime.resume_tool_interaction(self.runner,
                wait_id=wait_id, response=response, node_invocation_id=node_invocation_id))
        raise ValueError("Workflow wait is not a tool interaction")

    def cancel(self):
        return self.runner.cancel()
