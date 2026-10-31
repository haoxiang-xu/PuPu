"""Local production capability bindings for one admitted Skeleton selection.

Definitions and profiles come exclusively from the frozen launch material.
Only credentials, selected toolkit factories, Python environments and local
Skill discovery are host capabilities; none becomes part of the definition.
"""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
import os
from pathlib import Path
import time

from unchain.agent.modules.base import BaseAgentModule
from unchain.agent.modules.skills import SkillsModule
from unchain.skeleton.agent_preparation import checked_execution_plan, execution_definition_digest
from unchain.skeleton.code_runtime import FileCodeSourceResolver, SkeletonCodeRuntime
from unchain.skeleton.durable_store import WorkflowExecutionStore
from unchain.skeleton.kernel_config import validate_kernel_config
from unchain.skeleton.kernel_profile import bind_kernel_profile
from unchain.skeleton.tool_runtime import SkeletonSkillRuntime, SkeletonToolRuntime
from unchain.skeleton.workflow_runtime import SkeletonWorkflowCallRuntime
from unchain.skeleton import prepare_workflow
from unchain.skills import SkillRegistry
from unchain.tools import Toolkit, Tool

from secret_scrub_registry import register_secret_values
from skeleton_chat_selection import FrozenSkeletonChatSelection, _check_preflight
from skeleton_resource_store import SkeletonResourceError, SkeletonResourceStore
from skeleton_workflow_snapshot import FrozenSkeletonWorkflowDependencies
from skills_inventory import build_skills_config, installed_pack_skill_descriptors, skills_options


_OFFICIAL = {
    "openai": ("https://api.openai.com/v1", ("openaiApiKey", "openai_api_key"), ("OPENAI_API_KEY",)),
    "anthropic": ("https://api.anthropic.com", ("anthropicApiKey", "anthropic_api_key"), ("ANTHROPIC_API_KEY",)),
    "gemini": ("https://generativelanguage.googleapis.com", ("geminiApiKey", "gemini_api_key"),
               ("GEMINI_API_KEY", "GOOGLE_API_KEY")),
}


def _fail(code, path, message):
    raise SkeletonResourceError(code, tuple(path), message)


def _identity(value, path):
    if type(value) is not str or not value or value != value.strip():
        _fail("invalid_value", path, "Capability identity must be an exact non-empty string.")
    return value


@dataclass(frozen=True)
class _ToolkitMetadataModule(BaseAgentModule):
    sections: tuple = ()
    skills: tuple = ()
    name: str = field(default="skeleton-toolkit-context", init=False)

    def configure(self, builder):
        builder.add_tool(Toolkit(prompt_sections=self.sections, skills=self.skills))


class SkeletonProductionBindings:
    """Strict bridge between admitted definitions and actual local adapters."""

    def __init__(self, selection: FrozenSkeletonChatSelection,
                 workflows: FrozenSkeletonWorkflowDependencies, options: dict, *,
                 session_id, workspace_root, resource_store=None, workspace_roots=None):
        if type(selection) is not FrozenSkeletonChatSelection:
            _fail("invalid_type", ("selection",), "An admitted Skeleton selection is required.")
        if type(workflows) is not FrozenSkeletonWorkflowDependencies:
            _fail("invalid_type", ("workflows",), "Fixed Workflow dependencies are required.")
        if type(options) is not dict:
            _fail("invalid_type", ("options",), "Options must be an object.")
        selected = selection.to_dict()
        _check_preflight(selected, selection.resource_id)
        if workflows.dependencies != selected["dependencies"]:
            # Ordering is canonical in each producer; compare records if a
            # trusted host has restored their order differently.
            normalize = lambda rows: sorted(rows, key=lambda row: (row["workflow_id"], row["revision_id"]))
            if normalize(workflows.dependencies) != normalize(selected["dependencies"]):
                _fail("dependency_conflict", ("workflows",), "Workflow snapshot differs from the selection.")
        self.session_id = _identity(session_id, ("session_id",))
        if workspace_root is not None and (type(workspace_root) is not str or not workspace_root.strip()):
            _fail("invalid_value", ("workspace_root",), "Workspace root must be a directory path.")
        roots = ([workspace_root] if workspace_root is not None else []) if workspace_roots is None else workspace_roots
        if type(roots) not in (list, tuple):
            _fail("invalid_type", ("workspace_roots",), "Authorized workspace roots must be a list.")
        admitted_roots = []
        for index, root in enumerate(roots):
            root = _identity(root, ("workspace_roots", index))
            resolved = str(Path(root).expanduser().resolve())
            if not Path(resolved).is_dir():
                _fail("workspace_unavailable", ("workspace_roots", index), "Authorized workspace is unavailable.")
            if resolved in admitted_roots:
                _fail("duplicate_identity", ("workspace_roots", index), "Authorized workspace roots must be unique.")
            admitted_roots.append(resolved)
        primary = str(Path(workspace_root).expanduser().resolve()) if workspace_root is not None else None
        if primary is not None and (not admitted_roots or primary != admitted_roots[0]):
            _fail("workspace_conflict", ("workspace_root",), "Code workspace must be the first authorized workspace.")
        self.workspace_roots = tuple(admitted_roots)
        self.workspace_root = self.workspace_roots[0] if self.workspace_roots else None
        self.resource_store = resource_store if resource_store is not None else SkeletonResourceStore()
        self._options = deepcopy(options)
        self._workflows = workflows
        self._documents = {}
        self._profiles = {}
        self._configs = []
        self._instances = {}
        self._tools_by_scope = {}
        self._metadata_by_scope = {}
        self._closed = False

        def admit(value):
            document = value["document"]
            previous = self._documents.get(document["id"])
            if previous is not None and previous != document:
                _fail("identity_conflict", ("document", "id"), "Distinct fixed Agents share a document identity.")
            self._documents[document["id"]] = deepcopy(document)
            for node in document["nodes"]:
                if node["type"] == "agent":
                    config = validate_kernel_config(node["config"]["kernel"])
                    profile = config["profile"]
                    previous_profile = self._profiles.get(profile["id"])
                    if previous_profile is not None and previous_profile != profile:
                        _fail("profile_conflict", ("profile", "id"), "Fixed Kernel profiles reuse an identity with different values.")
                    self._profiles[profile["id"]] = deepcopy(profile)
                    self._configs.append(config)
            for child in value["subagents"]:
                admit(child)

        admit(selected)
        self._credentials = self._admit_credentials(options.get("skeleton_credentials", {}))
        self._include_user_dirs, _revision = skills_options(options)
        self._pack_skills = tuple(installed_pack_skill_descriptors())
        self._user_toolkit_ids = self._toolkit_ids(options.get("toolkits", []), ("options", "toolkits"))
        try:
            self._admit_toolkits()
        except Exception:
            self.close()
            raise

    def _active(self):
        if self._closed:
            _fail("binding_closed", ("binding",), "Skeleton capability bindings are closed.")

    def _admit_credentials(self, value):
        if type(value) is not dict:
            _fail("invalid_type", ("options", "skeleton_credentials"), "Credential bindings must be an object.")
        result = {}
        references = {profile["credential_ref"] for profile in self._profiles.values()}
        for ref, item in value.items():
            path = ("options", "skeleton_credentials", ref)
            _identity(ref, path)
            if ref not in references:
                _fail("credential_unavailable", path, "Credential reference is not used by the fixed selection.")
            if type(item) is not dict or set(item) != {"provider", "endpoint", "api_key"}:
                _fail("invalid_shape", path, "Credential binding requires provider, endpoint and api_key only.")
            for key in item:
                _identity(item[key], path + (key,))
            targets = [profile for profile in self._profiles.values() if profile["credential_ref"] == ref]
            if any((item["provider"], item["endpoint"]) != (profile["provider"], profile["endpoint"])
                   for profile in targets):
                _fail("credential_conflict", path, "Credential target differs from its fixed provider or endpoint.")
            result[ref] = deepcopy(item)
        return result

    def bind_profile(self, kernel_config):
        self._active()
        config = validate_kernel_config(kernel_config)
        if config not in self._configs:
            _fail("profile_conflict", ("kernel",), "Kernel config is not in the fixed selection.")
        profile = config["profile"]
        explicit = self._credentials.get(profile["credential_ref"])
        credential = explicit["api_key"] if explicit is not None else None
        if credential is None:
            official = _OFFICIAL.get(profile["provider"])
            if official is not None and profile["endpoint"] == official[0]:
                candidates = [self._options.get(key) for key in official[1]] + [os.environ.get(key) for key in official[2]]
                credential = next((value for value in candidates if type(value) is str and value.strip()), None)
        if credential is None and profile["protocol"] != "ollama":
            _fail("credential_unavailable", ("profile", "credential_ref"),
                  "This provider and endpoint require a dedicated credential binding.")
        if credential is not None:
            register_secret_values((credential,), source="provider")
        return bind_kernel_profile(config,
            profile_resolver=lambda profile_id: deepcopy(self._profiles[profile_id]),
            credential_resolver=lambda _ref: credential)

    def _toolkit_ids(self, values, path):
        import unchain_adapter as adapter
        if type(values) is not list:
            _fail("invalid_type", path, "Toolkit identities must be a list.")
        result = []
        for index, value in enumerate(values):
            value = _identity(value, path + (index,))
            canonical = adapter._canonical_runtime_toolkit_id(value)
            if canonical in result:
                _fail("duplicate_identity", path + (index,), "Toolkit identities must be unique.")
            result.append(canonical)
        return result

    def _toolkit(self, toolkit_id):
        import unchain_adapter as adapter
        from skill_packs import SKILL_PACK_ID_PREFIX, get_installed_skill_pack
        if toolkit_id in self._instances:
            return self._instances[toolkit_id]
        if toolkit_id.startswith(SKILL_PACK_ID_PREFIX):
            if get_installed_skill_pack(toolkit_id) is None:
                _fail("toolkit_unavailable", ("toolkits", toolkit_id), "Selected Skill pack is unavailable.")
            toolkit = Toolkit(skills=tuple(skill for skill in self._pack_skills if skill.source_id == toolkit_id))
            self._instances[toolkit_id] = toolkit
            return toolkit
        if toolkit_id == adapter._canonical_runtime_toolkit_id("CoreToolkit") and not self.workspace_roots:
            _fail("workspace_unavailable", ("toolkits", toolkit_id),
                  "Filesystem tools require an explicitly authorized workspace.")
        options = deepcopy(self._options)
        # The authorized workspace is a host argument, not an arbitrary second
        # workspace supplied by options while binding a fixed graph.
        options.update(toolkits=[toolkit_id], workspace_roots=list(self.workspace_roots),
                       workspaceRoot=self.workspace_root, workspace_root=self.workspace_root,
                       disable_workspace_root=not bool(self.workspace_roots),
                       disableWorkspaceRoot=not bool(self.workspace_roots))
        try:
            produced = adapter._build_selected_toolkits(options, session_id=self.session_id)
        except Exception as exc:
            _fail("toolkit_unavailable", ("toolkits", toolkit_id), "Selected Toolkit could not be initialized.")
        # Retain all instantiated handles for deterministic cleanup, including
        # a factory's unexpected result that strict identity admission rejects.
        for index, item in enumerate(produced):
            self._instances[(toolkit_id, index)] = item
        if len(produced) != 1 or not isinstance(produced[0], Toolkit):
            _fail("toolkit_unavailable", ("toolkits", toolkit_id), "Selected Toolkit did not produce one runtime Toolkit.")
        toolkit = produced[0]
        if adapter._get_runtime_toolkit_metadata(toolkit)["toolkit_id"] != toolkit_id:
            _fail("identity_conflict", ("toolkits", toolkit_id), "Runtime Toolkit identity differs from selection.")
        self._instances[toolkit_id] = toolkit
        return toolkit

    def _pool_toolkits(self, node):
        config = node["config"]
        if "legacy_fields" in config:
            config = config["legacy_fields"]
        elif set(config) != {"toolkits", "merge_with_user_selected"}:
            _fail("invalid_shape", ("document", "nodes", node["id"], "config"), "Toolkit Pool config is invalid.")
        if type(config) is not dict or type(config.get("toolkits")) is not list or type(config.get("merge_with_user_selected")) is not bool:
            _fail("invalid_shape", ("document", "nodes", node["id"], "config"), "Toolkit Pool requires toolkits and merge_with_user_selected.")
        references = config["toolkits"]
        ids = self._toolkit_ids([ref.get("id") if type(ref) is dict else None for ref in references],
                               ("document", "nodes", node["id"], "config", "toolkits"))
        result = {}
        for toolkit_id, ref in zip(ids, references):
            path = ("document", "nodes", node["id"], "config", "toolkits", toolkit_id)
            if set(ref) != {"id", "enabled_tools"}:
                _fail("invalid_shape", path, "Toolkit reference requires id and enabled_tools only.")
            toolkit = self._toolkit(toolkit_id)
            enabled = ref["enabled_tools"]
            if enabled is not None:
                if type(enabled) is not list:
                    _fail("invalid_type", path + ("enabled_tools",), "Enabled tool names must be a list or null.")
                names = [_identity(name, path + ("enabled_tools", index)) for index, name in enumerate(enabled)]
                if len(set(names)) != len(names):
                    _fail("duplicate_identity", path + ("enabled_tools",), "Enabled tool names must be unique.")
                if any(name not in toolkit.tools for name in names):
                    _fail("tool_unavailable", path + ("enabled_tools",), "Enabled tool does not exist in this Toolkit.")
                toolkit = Toolkit({name: toolkit.tools[name] for name in names},
                                  prompt_sections=toolkit.prompt_sections, skills=toolkit.skills)
            result[toolkit_id] = toolkit
        if config["merge_with_user_selected"]:
            for toolkit_id in self._user_toolkit_ids:
                result.setdefault(toolkit_id, self._toolkit(toolkit_id))
        return result

    @staticmethod
    def _flatten(toolkits):
        tools = {}
        for toolkit in toolkits:
            for name, tool in toolkit.tools.items():
                if not isinstance(tool, Tool) or tool.name != name:
                    _fail("invalid_shape", ("tools", name), "Runtime tool identity is invalid.")
                if name in tools and tools[name] is not tool:
                    _fail("duplicate_identity", ("tools", name), "Distinct selected Toolkits export the same tool name.")
                tools[name] = tool
        return tools

    def _admit_toolkits(self):
        global_toolkits = [self._toolkit(value) for value in self._user_toolkit_ids]
        for document_id, document in self._documents.items():
            pools = {node["id"]: self._pool_toolkits(node) for node in document["nodes"] if node["type"] == "toolkit_pool"}
            global_toolkits.extend(toolkit for pool in pools.values() for toolkit in pool.values())
            for node in document["nodes"]:
                if node["type"] != "agent":
                    continue
                selected = {}
                for edge in document["edges"]:
                    if edge["kind"] != "attach":
                        continue
                    endpoints = {edge["source_node_id"], edge["target_node_id"]}
                    if node["id"] in endpoints:
                        for pool_id in endpoints.intersection(pools):
                            for toolkit_id, toolkit in pools[pool_id].items():
                                if toolkit_id in selected:
                                    _fail("duplicate_identity", ("document", "nodes", node["id"]), "Kernel attaches the same Toolkit more than once.")
                                selected[toolkit_id] = toolkit
                values = tuple(selected.values())
                key = (document_id, node["id"])
                self._tools_by_scope[key] = tuple(self._flatten(values).values())
                self._metadata_by_scope[key] = (
                    tuple(section for toolkit in values for section in toolkit.prompt_sections),
                    tuple(skill for toolkit in values for skill in toolkit.skills))
        self._toolkit_catalog = Toolkit(self._flatten(global_toolkits),
            prompt_sections=tuple(section for toolkit in global_toolkits for section in toolkit.prompt_sections),
            skills=tuple(skill for toolkit in global_toolkits for skill in toolkit.skills))

    def _scope(self, context):
        self._active()
        assert_current = getattr(context, "assert_current", None)
        if callable(assert_current):
            assert_current()
        key = (context.document_id, context.node_id)
        if key not in self._tools_by_scope:
            _fail("identity_conflict", ("context",), "Kernel context is not in the fixed selection.")
        return key

    def tools_for_node(self, context):
        return self._tools_by_scope[self._scope(context)]

    def tool_presentation(self, name):
        """Snapshot the identity of the actual resolved Tool, not a guessed owner."""
        self._active()
        import unchain_adapter as host
        tool = self._toolkit_catalog.tools.get(name)
        owners = [toolkit for toolkit in self._instances.values()
                  if tool is not None and toolkit.tools.get(name) is tool]
        identities = {tuple(sorted(host._get_runtime_toolkit_metadata(owner).items())) for owner in owners}
        if len(identities) != 1:
            _fail("identity_conflict", ("tool", name), "The resolved tool has no unique Toolkit identity.")
        metadata = dict(next(iter(identities)))
        title = name
        for row in host.get_toolkit_catalog_v2()["toolkits"]:
            if row.get("toolkitId") == metadata["toolkit_id"]:
                declared = [item for item in row.get("tools", ()) if item.get("name") == name]
                if len(declared) == 1 and type(declared[0].get("title")) is str and declared[0]["title"]:
                    title = declared[0]["title"]
        return {"tool_name": name, "tool_display_name": title,
                "toolkit_id": metadata["toolkit_id"], "toolkit_name": metadata["toolkit_name"]}

    def modules_for_node(self, context, *, allowed_tools=None, disabled_tools=()):
        sections, skills = self._metadata_by_scope[self._scope(context)]
        can_read_skill = (allowed_tools is None or "skill" in allowed_tools) and "skill" not in disabled_tools
        metadata = _ToolkitMetadataModule(sections=sections, skills=skills if can_read_skill else ())
        if not can_read_skill:
            return (metadata,)
        config = build_skills_config(workspace_root=self.workspace_root,
                                    include_user_dirs=self._include_user_dirs, extra_skills=self._pack_skills)
        return metadata, SkillsModule(config)

    def handlers_for_store(self, store, plan, *, allowed_tools=None, disabled_tools=()):
        self._active()
        plan = checked_execution_plan(plan)
        if type(store) is not WorkflowExecutionStore or execution_definition_digest(store.plan) != execution_definition_digest(plan):
            _fail("identity_conflict", ("store",), "Handler plan differs from the execution store.")
        # Workflow Call clones each provided host onto its child plan. Include
        # the reachable children's capabilities even if the caller itself has
        # no Code/Tool/Skill node; otherwise a valid call fails at child Start.
        documents = []
        visited = set()

        def visit(document):
            documents.append(document)
            for node in document["nodes"]:
                refs = ([node["config"]["workflow"]] if node["type"] == "workflow_call" else
                        [hook["workflow"] for hook in node["config"]["hooks"]]
                        if node["type"] == "hooks_pool" else [])
                for ref in refs:
                    key = (ref["workflow_id"], ref["revision_id"])
                    if key in visited:
                        continue
                    visited.add(key)
                    child = self._workflows.resolve(*key)
                    visit(prepare_workflow(child.document).snapshot())

        visit(plan.snapshot())
        kinds = {node["type"] for document in documents for node in document["nodes"]}
        allowed = None if allowed_tools is None else self._policy_names(allowed_tools, ("allowed_tools",))
        disabled = self._policy_names(disabled_tools, ("disabled_tools",))

        def permitted(name):
            return (allowed is None or name in allowed) and name not in disabled

        toolkit = Toolkit({name: tool for name, tool in self._toolkit_catalog.tools.items() if permitted(name)},
                          prompt_sections=self._toolkit_catalog.prompt_sections,
                          skills=self._toolkit_catalog.skills if permitted("skill") else ())
        handlers = {}
        if "code" in kinds:
            if self.workspace_root is None:
                _fail("workspace_unavailable", ("workspace_root",), "Code requires an authorized workspace.")
            handlers["code"] = SkeletonCodeRuntime(plan,
                source_resolver=FileCodeSourceResolver(self.workspace_root),
                profile_resolver=self.resource_store.resolve_python_profile,
                staging_root=self.resource_store.root / "code-runs")
        if "tool_call" in kinds:
            for node in (node for document in documents for node in document["nodes"]):
                if node["type"] == "tool_call":
                    name = node["config"]["tool"]["name"]
                    path = ("document", "nodes", node["id"], "config", "tool", "name")
                    if not permitted(name):
                        _fail("tool_forbidden", path, "This subagent attachment does not permit the deterministic tool.")
                    if name not in toolkit.tools:
                        _fail("tool_unavailable", path, "Deterministic tool is absent from selected Toolkits.")
            handlers["tool_call"] = SkeletonToolRuntime(plan, toolkit, self.session_id,
                                                       lambda: time.time_ns() // 1_000_000)
        if "skill_read" in kinds:
            if not permitted("skill"):
                _fail("tool_forbidden", ("document", "nodes", "skill_read"),
                      "This subagent attachment does not permit Skill Read.")
            config = build_skills_config(workspace_root=self.workspace_root,
                include_user_dirs=self._include_user_dirs, extra_skills=self._pack_skills)
            handlers["skill_read"] = SkeletonSkillRuntime(plan, SkillRegistry(config, runtime_toolkit=toolkit))
        if "workflow_call" in kinds:
            handlers["workflow_call"] = SkeletonWorkflowCallRuntime(store, self._workflows.resolve, handlers=handlers)
        return handlers

    @staticmethod
    def _policy_names(names, path):
        if type(names) not in (list, tuple):
            _fail("invalid_type", path, "Tool policy must be a list of exact names.")
        admitted = [_identity(name, path + (index,)) for index, name in enumerate(names)]
        if len(set(admitted)) != len(admitted):
            _fail("duplicate_identity", path, "Tool policy names must be unique.")
        return frozenset(admitted)

    def child_handlers_factory(self, store, plan, *, allowed_tools=None, disabled_tools=()):
        return self.handlers_for_store(store, plan, allowed_tools=allowed_tools, disabled_tools=disabled_tools)

    def close(self):
        if self._closed:
            return
        self._closed = True
        seen = set()
        for toolkit in self._instances.values():
            if id(toolkit) in seen:
                continue
            seen.add(id(toolkit))
            disconnect = getattr(toolkit, "disconnect", None)
            if callable(disconnect):
                try:
                    disconnect()
                except Exception:
                    # Cleanup must continue across independent capability handles.
                    pass


__all__ = ["SkeletonProductionBindings"]
