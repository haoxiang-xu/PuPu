import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  PUPU_ADAPTER_CONTRACT_TESTS,
  STRICT_FAKE_CONTRACT_FILE,
  STRICT_FAKE_CONTRACT_TEST_NAMES,
  UNCHAIN_CORE_CONTRACT_TESTS,
} from "./context-v2-contract-matrix.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");

test("Context V2 release contract keeps all three blocking evidence layers", () => {
  assert.deepEqual(UNCHAIN_CORE_CONTRACT_TESTS, [
    "tests/test_tool_output_management.py",
    "tests/test_toolkit_design.py::test_tool_output_policy_is_declared_through_every_public_tool_api",
    "tests/test_toolkit_design.py::test_tool_output_policy_rejects_unknown_declarations_at_registration",
    "tests/context_v2/test_tool_handler_registry.py::test_tool_output_policy_changes_the_durable_handler_config_digest",
    "tests/context_v2/test_tool_handler_registry.py::test_registry_rejects_output_policy_drift_for_a_recovered_binding",
    "tests/context_v2/test_semantic_event_projector.py::test_prepared_tool_result_keeps_sealed_result_and_records_model_projection",
    "tests/context_v2/test_compiler.py::test_current_native_tool_result_prefers_manager_projection",
    "tests/context_v2/test_durable_tool_executor.py::test_executor_carries_the_request_policy_into_the_durable_projection",
    "tests/context_v2/test_durable_tool_executor.py::test_runtime_uses_durable_projection_without_rereading_tool_artifact",
    "tests/context_v2/test_context_runtime_factory.py::test_active_factory_derives_tool_output_snapshot_from_exposed_toolkit",
    "tests/context_v2/test_context_runtime_factory.py::test_active_factory_reuses_frozen_snapshot_on_repeated_bootstrap",
    "tests/context_v2/test_context_runtime_factory.py::test_active_factory_cold_restart_rejects_changed_attempt_policy_snapshot",
    "tests/context_v2/test_context_shadow_module.py::test_shadow_context_keeps_legacy_tool_budget",
    "tests/context_v2/test_context_provider_turn_boundary.py::test_tool_bearing_turn_persists_result_and_continues_through_same_boundary",
    "tests/context_v2/test_context_provider_turn_boundary.py::test_graph_tool_turn_projects_artifact_only_before_second_provider_turn",
    "tests/context_v2/test_context_provider_turn_approval_resume.py::test_cold_resume_projects_artifact_only_before_second_provider_turn",
    "tests/context_v2/test_context_provider_turn_boundary.py::test_subagent_tool_turn_projects_artifact_only_before_second_provider_turn",
    "tests/context_v2/test_interaction_resolution_compat.py::test_exact_malformed_legacy_and_authorized_canonical_pair_is_narrowly_bound",
    "tests/context_v2/test_compiler.py::test_authorized_canonical_resolution_supersedes_one_malformed_legacy_event",
    "tests/context_v2/test_graph_interaction_resume_checkpoint.py::test_canonical_resolution_supersedes_unadmitted_malformed_legacy_cursor",
    "tests/context_v2/test_sqlite_generation_rebase_v2.py::test_authorized_canonical_resolution_supersedes_malformed_legacy_for_rebase",
    "tests/test_durable_interaction_runtime.py::test_cancel_pending_atomically_terminalizes_journal_and_checkpoint",
    "tests/test_durable_interaction_runtime.py::test_cancel_pending_rejects_normal_application_winner",
    "tests/test_provider_message_contract.py::test_openai_native_and_exact_wire_reject_unknown_message_fields",
    "tests/context_v2/test_model_context_projection.py::test_coordinator_materializes_image_and_removes_top_level_provenance",
    "tests/context_v2/test_journal_message_projection.py::test_plain_root_final_and_terminal_accept_matching_iteration_identity",
    "tests/context_v2/test_journal_message_projection.py::test_plain_root_final_and_terminal_require_matching_iteration_identity",
    "tests/context_v2/test_context_provider_turn_approval_resume.py::test_official_context_boundary_starts_a_new_approval_after_resume",
    "tests/context_v2/test_context_runtime_tool_approval_authority.py::test_answered_approval_does_not_bind_the_next_confirmable_call",
    "tests/context_v2/test_context_p0_cold_composition_matrix.py::test_sqlite_reopen_second_chat_projects_real_kernel_terminal_history",
    "tests/context_v2/test_context_p0_cold_composition_matrix.py::test_file_backed_cold_rebuild_keeps_sequential_approvals_distinct_and_once",
  ]);
  assert.deepEqual(PUPU_ADAPTER_CONTRACT_TESTS, [
    "tests/test_memory_v2_context.py::MemoryV2ContextTests::test_tool_result_projection_respects_head_tail_policy",
    "tests/test_memory_v2_context.py::MemoryV2ContextTests::test_tool_result_projection_respects_artifact_only_policy",
    "tests/test_memory_v2_context.py::MemoryV2ContextTests::test_build_tool_runtime_config_leaves_active_snapshot_to_unchain",
    "tests/test_custom_provider.py::PresetAnthropicRouteTests::test_deepseek_and_kimi_presets_use_the_hyperspace_tool_route",
    "tests/test_unchain_adapter_capabilities.py::MisoAdapterCapabilityCatalogTests::test_toolkit_metadata_does_not_interpret_host_tool_policy",
    "tests/test_unchain_adapter_capabilities.py::MisoAdapterCapabilityCatalogTests::test_toolkit_metadata_does_not_mutate_runtime_tool_policy",
    "tests/test_memory_v2_unchain_runtime_factory.py::test_explicit_production_gate_mounts_only_canonical_context_owner",
    "tests/test_memory_v2_unchain_runtime_factory.py::test_active_pupu_admission_leaves_snapshot_to_exposed_unchain_toolkit",
    "tests/test_context_memory_v2_runtime_protocol.py::test_tool_output_management_feature_is_required",
    "tests/test_memory_v2_unchain_attachment_projection.py",
    "tests/test_memory_v2_unchain_graph_root_completion.py::test_candidate_free_root_completion_is_model_free_and_restart_idempotent",
    "tests/test_memory_v2_unchain_graph_root_completion.py::test_memory_model_failure_is_isolated_after_graph_and_root_journal_complete",
    "tests/test_memory_v2_unchain_active_graph_restart.py::test_active_two_node_graph_restarts_without_provider_reexecution",
    "tests/test_memory_v2_unchain_active_graph_interaction_resume.py::test_active_graph_cold_resume_continues_exact_step_without_replaying_start",
    "tests/test_memory_v2_unchain_active_resume.py::test_active_resume_uses_canonical_host_without_legacy_double_write",
    "tests/test_unchain_adapter_recipe_graph_runtime.py::RecipeGraphRuntimeTests::test_plain_stream_preserves_typed_context_v2_error",
    "tests/test_unchain_adapter_recipe_graph_runtime.py::RecipeGraphRuntimeTests::test_memory_v2_failure_reason_preserves_only_safe_context_reason",
    "tests/test_chat_stream_v4.py::ChatStreamV4RouteTests::test_context_v2_stream_error_exposes_only_allowlisted_reason",
  ]);
  assert.equal(
    STRICT_FAKE_CONTRACT_FILE,
    "scripts/test-api/fake_openai_responses_server.test.mjs",
  );
  assert.deepEqual(STRICT_FAKE_CONTRACT_TEST_NAMES, [
    "accepts legal message content blocks and rejects leaked attachment metadata",
    "fails closed over HTTP when message metadata leaks into Responses input",
  ]);

  for (const selector of PUPU_ADAPTER_CONTRACT_TESTS) {
    const [relativePath] = selector.split("::", 1);
    assert.equal(
      fs.existsSync(path.join(ROOT, "unchain_runtime", "server", relativePath)),
      true,
      `missing PuPu contract test: ${relativePath}`,
    );
  }
  const strictFakePath = path.join(ROOT, STRICT_FAKE_CONTRACT_FILE);
  assert.equal(fs.existsSync(strictFakePath), true);
  const strictFakeSource = fs.readFileSync(strictFakePath, "utf8");
  for (const testName of STRICT_FAKE_CONTRACT_TEST_NAMES) {
    assert.match(strictFakeSource, new RegExp(`it\\(\\"${testName}\\"`));
  }

  const runner = fs.readFileSync(
    path.join(ROOT, "scripts", "release-qa", "run-context-v2-contract.mjs"),
    "utf8",
  );
  assert.match(runner, /name: "Unchain core contract matrix"/);
  assert.match(runner, /name: "PuPu adapter contract matrix"/);
  assert.match(runner, /name: "Node strict provider fake"/);
  assert.match(runner, /verifyUnchainTestSourceProvenance/);
  assert.match(runner, /--test-name-pattern/);
  assert.doesNotMatch(runner, /continue-on-error|advisory/i);
});
