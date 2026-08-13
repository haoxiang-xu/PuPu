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
  assert.match(runner, /--test-name-pattern/);
  assert.doesNotMatch(runner, /continue-on-error|advisory/i);
});
