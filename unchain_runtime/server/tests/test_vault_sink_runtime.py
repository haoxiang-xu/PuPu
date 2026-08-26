from __future__ import annotations

from dataclasses import dataclass, field
from types import SimpleNamespace

import pytest

from unchain.kernel.types import ToolCall
from unchain.tools.models import ToolParameter
from unchain.tools.runtime import ToolRuntimeOutcome, run_tool_runtime_plugins
from unchain.tools.tool import Tool
from unchain.tools.toolkit import Toolkit

from vault_sink_runtime import (
    VAULT_SUBAGENT_BOUNDARY_ERROR,
    VaultGuardedSubagentModule,
    VaultGuardedSubagentRuntimePlugin,
    VaultSinkAgentModule,
    VaultSinkRuntimePlugin,
    augment_toolkits_for_vault,
    classify_vault_tool_call,
    clone_toolkits_for_vault,
)


HANDLE_A = "pvh1_" + "a" * 64
HANDLE_B = "pvh1_" + "b" * 64
INTENT_ID = "pvi1_" + "c" * 32
RECEIPT_ID = "pvr1_" + "d" * 32


def marker(handle=HANDLE_A):
    return f'<secret-handle label="API key" handle="{handle}"/>'


@dataclass
class _Client:
    prepared: list[dict] = field(default_factory=list)
    executed: list[dict] = field(default_factory=list)
    cancelled: list[dict] = field(default_factory=list)

    def prepare_intent(self, payload):
        self.prepared.append(payload)
        return {
            "ok": True,
            "intent_id": INTENT_ID,
            "status": "pending_confirmation",
            "descriptor": {
                "label": "API key",
                "sink_kind": payload["sink_kind"],
                "target": "approved target",
            },
            "expires_at": 1_735_689_900_000,
        }

    def execute_intent(self, payload):
        self.executed.append(payload)
        return {
            "ok": True,
            "intent_id": INTENT_ID,
            "status": "complete",
            "receipt_id": RECEIPT_ID,
            "result": {"exit_category": "success", "stdout": "safe"},
            "replayed": False,
        }

    def cancel_intent(self, payload):
        self.cancelled.append(payload)
        return {
            "ok": True,
            "intent_id": INTENT_ID,
            "status": "cancelled",
            "receipt_id": RECEIPT_ID,
        }


def _shell_tool():
    def shell(
        action: str,
        command: str = "",
        cwd: str = "",
        run_in_background: bool = False,
    ):
        raise AssertionError("original shell must never run")

    return Tool.from_callable(
        shell,
        name="shell",
        requires_confirmation=True,
        confirmation_resolver=lambda _args, _ctx: {
            "requires_confirmation": True,
            "description": "normal shell confirmation",
        },
    )


def _context(tool, *, approved=None, include_interaction=True):
    toolkit = Toolkit()
    toolkit.register(tool)
    raw_event = {}
    if include_interaction:
        raw_event["interaction_request"] = {
            "interaction_id": "interaction-1",
            "subject": {"vault_intent_id": INTENT_ID},
        }
    if approved is not None:
        raw_event["interaction_response"] = {"approved": approved}
    return SimpleNamespace(
        toolkit=toolkit,
        session_id="session-a",
        run_id="run-a",
        provider="openai",
        model="gpt-test",
        iteration=2,
        memory_namespace="",
        execution_guard=None,
        raw_event=raw_event,
    )


def _plugin(client=None):
    return VaultSinkRuntimePlugin(
        client=client or _Client(),
        owner_chat_id="chat-a",
        session_id="session-a",
        attempt_id="attempt-a",
    )


def _mount(plugin):
    builder = SimpleNamespace(tool_runtime_plugins=[])
    builder.add_tool_runtime_plugin = builder.tool_runtime_plugins.append
    VaultSinkAgentModule(plugin).configure(builder)
    return builder


def test_shell_env_is_reference_only_and_public_command_is_bound():
    classification = classify_vault_tool_call(
        tool_name="shell",
        arguments={
            "action": "run",
            "command": "deploy --token-env API_TOKEN",
            "cwd": "/workspace",
            "run_in_background": False,
            "secret_env": {"API_TOKEN": marker()},
        },
    )

    assert classification.supported is True
    assert classification.sink_kind == "shell_secret_env"
    assert classification.handles == (("API_TOKEN", HANDLE_A),)
    assert "secret_env" not in classification.audit_arguments
    assert HANDLE_A not in str(classification.audit_arguments)
    assert classification.audit_arguments["command"] == "deploy --token-env API_TOKEN"


@pytest.mark.parametrize(
    "arguments,error_code",
    [
        (
            {
                "action": "run",
                "command": f"echo {HANDLE_A}",
                "secret_env": {"TOKEN": HANDLE_A},
            },
            "vault_handle_in_public_argument",
        ),
        (
            {
                "action": "run",
                "command": "x",
                "run_in_background": True,
                "secret_env": {"TOKEN": HANDLE_A},
            },
            "vault_sink_not_allowed",
        ),
        (
            {
                "action": "run",
                "command": "x",
                "secret_env": {"TOKEN": HANDLE_A},
                "secret_stdin": HANDLE_B,
            },
            "vault_multiple_sink_kinds",
        ),
    ],
)
def test_shell_rejects_ambiguous_or_public_handle_use(arguments, error_code):
    classification = classify_vault_tool_call(
        tool_name="shell",
        arguments=arguments,
    )
    assert classification.matched is True
    assert classification.supported is False
    assert classification.error_code == error_code


def test_computer_requires_one_standalone_handle_in_one_type_action():
    valid = classify_vault_tool_call(
        tool_name="computer",
        arguments={"action": "type", "text": marker()},
    )
    assert valid.supported is True
    assert valid.sink_kind == "computer_input"
    assert valid.handles == (("text", HANDLE_A),)

    mixed = classify_vault_tool_call(
        tool_name="computer",
        arguments={"action": "type", "text": "prefix " + marker()},
    )
    assert mixed.supported is False
    assert mixed.error_code == "vault_computer_single_handle_required"

    batch = classify_vault_tool_call(
        tool_name="computer",
        arguments={
            "actions": [
                {"type": "type", "text": marker()},
                {"type": "click", "coordinate": [1, 2]},
            ]
        },
    )
    assert batch.supported is False


def test_mcp_uses_only_server_discovered_secret_fields():
    tool = Tool(
        name="send_message",
        description="test",
        func=lambda **_kwargs: {},
    )
    tool._pupu_vault_secret_fields = ("token",)
    tool._pupu_vault_schema_fingerprint = "e" * 64
    tool._pupu_vault_mcp_toolkit_id = "mcp.example"

    classification = classify_vault_tool_call(
        tool_name="send_message",
        arguments={"channel": "alerts", "token": marker()},
        tool_obj=tool,
    )
    assert classification.supported is True
    assert classification.sink_kind == "mcp_schema_secret"
    assert classification.schema_fingerprint == "e" * 64
    assert classification.audit_arguments["channel"] == "alerts"
    assert classification.audit_arguments["tool_name"] == "send_message"
    assert "token" not in classification.audit_arguments

    mismatched = classify_vault_tool_call(
        tool_name="different_tool",
        arguments={"channel": "alerts", "token": marker()},
        tool_obj=tool,
    )
    assert mismatched.matched is True
    assert mismatched.supported is False
    assert mismatched.error_code == "vault_mcp_tool_binding_mismatch"

    unmarked = Tool(name="send_message", func=lambda **_kwargs: {})
    rejected = classify_vault_tool_call(
        tool_name="send_message",
        arguments={"token": HANDLE_A},
        tool_obj=unmarked,
    )
    assert rejected.matched is True
    assert rejected.supported is False


def test_augment_adds_handle_only_shell_schema_and_preserves_normal_policy():
    shell = _shell_tool()
    toolkit = Toolkit()
    toolkit.register(shell)
    plugin = _plugin()
    augment_toolkits_for_vault([toolkit], plugin)

    names = {parameter.name for parameter in shell.parameters}
    assert {"secret_env", "secret_stdin"}.issubset(names)
    assert shell.confirmation_resolver(
        {"action": "run", "command": "pwd"},
        None,
    ) == {
        "requires_confirmation": True,
        "description": "normal shell confirmation",
    }
    secret_arguments = {
        "action": "run",
        "command": "deploy",
        "secret_env": {"TOKEN": HANDLE_A},
    }
    assert shell.confirmation_resolver(secret_arguments, None) == {
        "requires_confirmation": True,
        "description": "normal shell confirmation",
    }
    _mount(plugin)
    assert shell.confirmation_resolver(
        secret_arguments,
        None,
    ) == {"requires_confirmation": False}


def test_root_clone_is_independent_and_double_augment_is_single_layer():
    baseline_toolkit = Toolkit()
    baseline_shell = _shell_tool()
    baseline_toolkit.register(baseline_shell)
    baseline_schema = baseline_shell.to_provider_json("openai")

    root_toolkits = clone_toolkits_for_vault([baseline_toolkit])
    root_shell = root_toolkits[0].get("shell")
    plugin = _plugin()
    augment_toolkits_for_vault(root_toolkits, plugin)
    first_func = root_shell.func
    first_resolver = root_shell.confirmation_resolver
    augment_toolkits_for_vault(root_toolkits, plugin)

    assert root_toolkits[0] is not baseline_toolkit
    assert root_toolkits[0].tools is not baseline_toolkit.tools
    assert root_shell is not baseline_shell
    assert root_shell.parameters is not baseline_shell.parameters
    assert all(
        root is not baseline
        for root, baseline in zip(root_shell.parameters[:4], baseline_shell.parameters)
    )
    assert root_shell.func is first_func
    assert root_shell.confirmation_resolver is first_resolver
    _mount(plugin)
    augment_toolkits_for_vault(root_toolkits, plugin)
    assert root_shell.func is first_func
    assert root_shell.confirmation_resolver is first_resolver
    assert baseline_shell.to_provider_json("openai") == baseline_schema
    assert "secret_env" not in {parameter.name for parameter in baseline_shell.parameters}
    with pytest.raises(ValueError, match="another_plugin"):
        augment_toolkits_for_vault(root_toolkits, _plugin())


def test_unsupported_secret_call_keeps_original_confirmation_and_never_executes():
    calls = []

    def shell(action, command="", run_in_background=False):
        calls.append((action, command, run_in_background))
        return {"ok": True}

    tool = Tool.from_callable(
        shell,
        name="shell",
        requires_confirmation=True,
        confirmation_resolver=lambda _args, _ctx: {
            "requires_confirmation": True,
            "description": "original",
        },
    )
    toolkit = Toolkit()
    toolkit.register(tool)
    plugin = _plugin()
    augment_toolkits_for_vault([toolkit], plugin)
    _mount(plugin)
    arguments = {
        "action": "run",
        "command": "deploy",
        "run_in_background": True,
        "secret_env": {"TOKEN": HANDLE_A},
    }

    assert tool.confirmation_resolver(arguments, None) == {
        "requires_confirmation": True,
        "description": "original",
    }
    outcome = plugin.execute(
        tool_call=ToolCall(call_id="call-a", name="shell", arguments=arguments),
        context=_context(tool, approved=True),
    )
    assert outcome.tool_result["error"] == "vault_sink_not_allowed"
    assert calls == []


def test_vault_module_precedes_jobs_and_guarded_subagent_plugin():
    plugin = _plugin()
    toolkit = Toolkit()
    toolkit.register(_shell_tool())
    augment_toolkits_for_vault([toolkit], plugin)

    class Builder:
        def __init__(self):
            self.tool_runtime_plugins = []
            self.tools = []

        def add_tool_runtime_plugin(self, value):
            self.tool_runtime_plugins.append(value)

        def add_tool(self, value):
            self.tools.append(value)

    class JobsModule:
        def configure(self, builder):
            builder.add_tool_runtime_plugin("jobs")

    class SubagentModule:
        def configure(self, builder):
            builder.add_tool("delegate_to_subagent")
            builder.add_tool_runtime_plugin("subagent")

    builder = Builder()
    VaultSinkAgentModule(plugin).configure(builder)
    JobsModule().configure(builder)
    VaultGuardedSubagentModule(SubagentModule()).configure(builder)

    assert builder.tool_runtime_plugins[0] is plugin
    assert builder.tool_runtime_plugins[1] == "jobs"
    assert isinstance(
        builder.tool_runtime_plugins[2],
        VaultGuardedSubagentRuntimePlugin,
    )
    supported_call = ToolCall(
        call_id="call-a",
        name="shell",
        arguments={
            "action": "run",
            "command": "deploy",
            "secret_env": {"TOKEN": HANDLE_A},
        },
    )
    context = _context(toolkit.get("shell"))
    assert plugin.can_handle(tool_call=supported_call, context=context) is True

    class JobsPlugin:
        def __init__(self):
            self.calls = 0

        def can_handle(self, **_kwargs):
            return True

        def execute(self, **_kwargs):
            self.calls += 1
            return ToolRuntimeOutcome(tool_result={"job": "ran"})

    jobs = JobsPlugin()
    outcome = run_tool_runtime_plugins(
        [plugin, jobs],
        tool_call=supported_call,
        context=_context(toolkit.get("shell"), include_interaction=False),
    )
    assert outcome.tool_result["error"] == "vault_confirmation_required"
    assert jobs.calls == 0


class _BoundaryContext:
    def __init__(self, *, messages=None, callback=None):
        self._messages = list(messages or [])
        self.callback = callback

    def latest_messages(self):
        return list(self._messages)


class _BoundaryInnerPlugin:
    def __init__(self, *, outcome=None, callback_event=None):
        self.outcome = outcome or ToolRuntimeOutcome(
            handled=True,
            tool_result={"ok": True},
        )
        self.callback_event = callback_event
        self.calls = 0

    def can_handle(self, **_kwargs):
        return True

    def execute(self, *, context, **_kwargs):
        self.calls += 1
        if self.callback_event is not None:
            context.callback(self.callback_event)
        return self.outcome


def _boundary_call(name="delegate_to_subagent", arguments=None):
    return ToolCall(
        call_id="boundary-call",
        name=name,
        arguments=arguments or {"target": "Explore", "task": "safe task"},
    )


def _assert_boundary_rejection(outcome):
    assert outcome.tool_result == {
        "ok": False,
        "error": VAULT_SUBAGENT_BOUNDARY_ERROR,
    }
    assert outcome.result_messages == []
    assert outcome.state_updates == {}


def test_subagent_boundary_rejects_task_and_handoff_carried_context():
    task_inner = _BoundaryInnerPlugin()
    task_guard = VaultGuardedSubagentRuntimePlugin(task_inner)
    task_outcome = task_guard.execute(
        tool_call=_boundary_call(
            arguments={"target": "Explore", "task": f"use {HANDLE_A}"}
        ),
        context=_BoundaryContext(),
    )
    _assert_boundary_rejection(task_outcome)
    assert task_inner.calls == 0

    handoff_inner = _BoundaryInnerPlugin()
    handoff_guard = VaultGuardedSubagentRuntimePlugin(handoff_inner)
    handoff_outcome = handoff_guard.execute(
        tool_call=_boundary_call(
            "handoff_to_subagent",
            {"target": "Explore", "carry_context": True},
        ),
        context=_BoundaryContext(
            messages=[{"role": "user", "content": HANDLE_A}]
        ),
    )
    _assert_boundary_rejection(handoff_outcome)
    assert handoff_inner.calls == 0


def test_root_vault_plugin_has_priority_for_handle_bearing_delegate_args():
    plugin = _plugin()
    inner = _BoundaryInnerPlugin()
    guarded_subagent = VaultGuardedSubagentRuntimePlugin(inner)
    outcome = run_tool_runtime_plugins(
        [plugin, guarded_subagent],
        tool_call=_boundary_call(
            arguments={"target": "Explore", "task": f"use {HANDLE_A}"}
        ),
        context=_BoundaryContext(),
    )

    _assert_boundary_rejection(outcome)
    assert inner.calls == 0


def test_subagent_boundary_blocks_child_callback_before_parent():
    forwarded = []
    inner = _BoundaryInnerPlugin(
        callback_event={"type": "tool_result", "result": {"value": HANDLE_A}}
    )
    guard = VaultGuardedSubagentRuntimePlugin(inner)
    outcome = guard.execute(
        tool_call=_boundary_call(),
        context=_BoundaryContext(callback=forwarded.append),
    )

    _assert_boundary_rejection(outcome)
    assert forwarded == []


@pytest.mark.parametrize(
    "outcome",
    [
        ToolRuntimeOutcome(tool_result={"board": {"content": HANDLE_A}}),
        ToolRuntimeOutcome(
            tool_result={"mode": "full_trace", "messages": [HANDLE_A]}
        ),
        ToolRuntimeOutcome(result_messages=[{"content": HANDLE_A}]),
        ToolRuntimeOutcome(state_updates={"subagent_state": {"value": HANDLE_A}}),
        ToolRuntimeOutcome(
            tool_result={
                "mode": "return_to_parent",
                "return": {"result": HANDLE_A},
            }
        ),
        ToolRuntimeOutcome(suspend_override=SimpleNamespace(payload=HANDLE_A)),
    ],
)
def test_subagent_boundary_rejects_every_outcome_surface(outcome):
    guard = VaultGuardedSubagentRuntimePlugin(
        _BoundaryInnerPlugin(outcome=outcome)
    )
    rejected = guard.execute(
        tool_call=_boundary_call("read_agent_board", {"board_id": "default"}),
        context=_BoundaryContext(),
    )
    _assert_boundary_rejection(rejected)


def test_subagent_boundary_no_handle_is_complete_passthrough():
    forwarded = []
    expected = ToolRuntimeOutcome(
        handled=True,
        tool_result={"mode": "agent_board_read", "items": [{"content": "safe"}]},
        state_updates={"subagent_state": {"safe": True}},
    )
    inner = _BoundaryInnerPlugin(
        outcome=expected,
        callback_event={"type": "subagent_completed", "summary": "safe"},
    )
    guard = VaultGuardedSubagentRuntimePlugin(inner)
    actual = guard.execute(
        tool_call=_boundary_call("read_agent_board", {"board_id": "default"}),
        context=_BoundaryContext(callback=forwarded.append),
    )

    assert actual is expected
    assert forwarded == [{"type": "subagent_completed", "summary": "safe"}]


def test_augmented_tool_function_is_a_subagent_fail_closed_backstop():
    calls = []

    class Owner:
        def fetch(self, url):
            calls.append(url)
            return {"url": url}

    owner = Owner()
    tool = Tool.from_callable(owner.fetch, name="web_fetch")
    toolkit = Toolkit()
    toolkit.register(tool)
    augment_toolkits_for_vault([toolkit], _plugin())

    assert getattr(tool.func, "__self__", None) is owner
    assert tool.func(url="https://example.test") == {
        "url": "https://example.test"
    }
    assert tool.func(url=f"https://example.test/?token={HANDLE_A}") == {
        "ok": False,
        "error": "vault_subagent_or_runtime_plugin_required",
    }
    assert calls == ["https://example.test"]


def test_prepare_creates_an_intent_bound_synthetic_confirmation_without_handles():
    client = _Client()
    plugin = _plugin(client)
    call = ToolCall(
        call_id="call-a",
        name="shell",
        arguments={
            "action": "run",
            "command": "deploy",
            "secret_env": {"TOKEN": HANDLE_A},
        },
    )
    prepared = plugin.prepare_durable_confirmation(
        tool_call=call,
        context=_context(_shell_tool(), include_interaction=False),
    )

    assert prepared is not None
    assert prepared["tool_call"].name == "vault_sink_use"
    assert prepared["tool_call"].arguments["vault_intent_id"] == INTENT_ID
    assert prepared["tool_call"].arguments["vault_use"] == {
        "intent_id": INTENT_ID,
        "operation_id": client.prepared[0]["operation_id"],
        "owner_chat_id": "chat-a",
        "session_id": "session-a",
        "attempt_id": "attempt-a",
        "run_id": "run-a",
        "call_id": "call-a",
    }
    assert HANDLE_A not in str(prepared["tool_call"].arguments)
    assert prepared["preparation"].needs_confirmation_response is True
    assert client.prepared[0]["owner_chat_id"] == "chat-a"
    assert client.prepared[0]["handles"] == [
        {"field": "TOKEN", "handle": HANDLE_A}
    ]
    assert HANDLE_A not in str(client.prepared[0]["audit_arguments"])


def test_approved_execute_calls_only_broker_and_returns_safe_receipt():
    client = _Client()
    plugin = _plugin(client)
    call = ToolCall(
        call_id="call-a",
        name="shell",
        arguments={
            "action": "run",
            "command": "deploy",
            "secret_env": {"TOKEN": HANDLE_A},
        },
    )
    outcome = plugin.execute(
        tool_call=call,
        context=_context(_shell_tool(), approved=True),
    )

    assert outcome.handled is True
    assert outcome.should_observe is False
    assert outcome.tool_result["ok"] is True
    assert outcome.tool_result["receipt_id"] == RECEIPT_ID
    assert len(client.executed) == 1
    assert client.executed[0]["interaction_id"] == "interaction-1"
    assert client.executed[0]["handles"] == [
        {"field": "TOKEN", "handle": HANDLE_A}
    ]


def test_missing_durable_confirmation_fails_closed_without_execute():
    client = _Client()
    plugin = _plugin(client)
    call = ToolCall(
        call_id="call-a",
        name="shell",
        arguments={
            "action": "run",
            "command": "deploy",
            "secret_env": {"TOKEN": HANDLE_A},
        },
    )
    outcome = plugin.execute(
        tool_call=call,
        context=_context(_shell_tool(), include_interaction=False),
    )
    assert outcome.tool_result == {
        "ok": False,
        "error": "vault_confirmation_required",
        "tool": "shell",
    }
    assert client.executed == []


def test_denied_confirmation_cancels_and_never_executes():
    client = _Client()
    plugin = _plugin(client)
    call = ToolCall(
        call_id="call-a",
        name="shell",
        arguments={
            "action": "run",
            "command": "deploy",
            "secret_stdin": HANDLE_A,
        },
    )
    outcome = plugin.execute(
        tool_call=call,
        context=_context(_shell_tool(), approved=False),
    )
    assert outcome.tool_result["denied"] is True
    assert len(client.cancelled) == 1
    assert client.executed == []


def test_unsupported_generic_handle_is_terminally_rejected():
    generic = Tool(
        name="web_fetch",
        func=lambda url: {"url": url},
        parameters=[
            ToolParameter(
                name="url",
                description="url",
                type_="string",
                required=True,
            )
        ],
    )
    plugin = _plugin()
    call = ToolCall(
        call_id="call-a",
        name="web_fetch",
        arguments={"url": f"https://example.test/?token={HANDLE_A}"},
    )
    outcome = plugin.execute(tool_call=call, context=_context(generic))
    assert outcome.tool_result == {
        "ok": False,
        "error": "vault_sink_not_allowed",
        "tool": "web_fetch",
    }
