export const UNCHAIN_RUN_BUNDLE_TESTS = Object.freeze([
  "tests/test_run_bundle_v1.py::test_provider_usage_mappers_preserve_disjoint_cache_and_reasoning",
  "tests/test_run_bundle_v1.py::test_receipt_atomic_metadata_is_closed_hashed_and_route_bound",
  "tests/test_run_bundle_v1.py::test_run_topology_rejects_orphan_cycle_and_fake_child_bundle_id",
  "tests/test_run_bundle_v1.py::test_reducer_unions_root_and_child_call_sets_without_double_counting",
  "tests/test_run_bundle_v1.py::test_missing_or_uncertain_usage_is_null_and_coverage_is_not_zero_complete",
  "tests/test_run_bundle_v1.py::test_run_lifecycle_requires_exact_live_and_terminal_timestamps",
  "tests/test_run_bundle_v1.py::test_extensions_reject_prompt_secret_and_provider_request_payloads",
  "tests/test_run_bundle_v1.py::test_openai_fetch_turn_attaches_canonical_provider_usage",
  "tests/test_run_bundle_v1.py::test_anthropic_fetch_turn_attaches_canonical_provider_usage",
  "tests/test_run_bundle_v1.py::test_ollama_fetch_turn_attaches_canonical_provider_usage",
  "tests/test_run_bundle_v1.py::test_extension_reprojection_is_additive_and_exactly_next_revision",
  "tests/test_run_bundle_ledger_runtime.py::test_cold_identical_materialization_reuses_durable_revision",
  "tests/test_run_bundle_ledger_runtime.py::test_sqlite_rejects_revision_regression",
  "tests/test_run_bundle_ledger_runtime.py::test_continuation_requires_explicit_terminal_durable_predecessor",
  "tests/test_run_bundle_ledger_runtime.py::test_continued_from_without_authoritative_ledger_fails_before_send",
  "tests/test_run_bundle_ledger_runtime.py::test_run_ledger_links_fresh_bundle_without_receipt_overlap",
  "tests/test_run_bundle_ledger_runtime.py::test_kernel_retry_receipts_have_atomic_timing_and_outcomes",
  "tests/test_run_bundle_ledger_runtime.py::test_kernel_retry_exhaustion_keeps_uncertain_attempts_closed",
  "tests/test_run_bundle_ledger_runtime.py::test_failed_run_attaches_content_free_canonical_bundle",
  "tests/test_run_bundle_ledger_runtime.py::test_artifact_metrics_cover_the_full_set_without_raw_ids_or_truncation",
  "tests/test_durable_provider_turn_runtime.py::test_restart_finalizes_receipted_started_lease_without_resending",
  "tests/test_durable_provider_turn_runtime.py::test_after_send_closes_retry_attempts_immediately",
  "tests/test_durable_provider_turn_runtime.py::test_after_send_closes_fallback_and_success_attempts",
  "tests/test_durable_provider_turn_runtime.py::test_after_send_closes_uncertain_final_error_once",
  "tests/context_v2/test_provider_turn_execution_service.py::test_failed_and_uncertain_sends_persist_one_atomic_receipt",
  "tests/context_v2/test_provider_turn_execution_service.py::test_production_enforce_mode_uses_the_official_transport_identity",
  "tests/context_v2/test_provider_turn_execution_service.py::test_occurrence_namespace_preserves_owner_iteration_and_replays_distinct_calls",
  "tests/context_v2/test_provider_turn_execution_service.py::test_auxiliary_send_crash_after_atomic_cas_cold_replays_without_resend",
  "tests/context_v2/test_provider_turn_execution_service.py::test_web_extract_uses_owned_atomic_send_and_cold_replays",
  "tests/context_v2/test_provider_turn_execution_service.py::test_tool_observation_harness_uses_owned_send_and_cold_replays",
  "tests/context_v2/test_provider_turn_execution_service.py::test_memory_off_agent_and_tool_selector_share_owner_and_cold_replay",
  "tests/context_v2/test_context_runtime_factory.py::test_shadow_context_does_not_replace_explicit_provider_accounting_owner",
  "tests/context_v2/test_context_provider_turn_boundary.py::test_enabled_runtime_owns_the_final_kernel_provider_send",
  "tests/test_kernel_subagents.py::test_failed_delegate_bundle_is_preserved_in_root_call_set_union",
  "tests/test_kernel_subagents.py::test_failed_worker_bundle_is_preserved_in_root_call_set_union",
  "tests/test_subagent_worker_batch_status.py::test_subagent_result_keeps_run_bundles_out_of_model_visible_payload",
  "tests/test_durable_tool_approval.py::test_boundary_enabled_cold_tool_approval_resume_fails_closed",
  "tests/test_pricing_catalog.py::test_anthropic_cache_write_ttl_rates_remain_disjoint",
  "tests/test_pricing_catalog.py::test_unknown_identity_time_and_service_tier_fail_closed",
  "tests/test_pricing_catalog.py::test_historical_pin_is_not_repriced_by_a_new_catalog",
  "tests/test_pricing_catalog.py::test_run_receipt_builder_attaches_only_exact_pinned_pricing",
]);

export const PUPU_RUN_BUNDLE_TESTS = Object.freeze([
  "tests/test_models_catalog_route.py::ModelsCatalogRouteTests::test_legacy_chat_stream_rejects_new_writes_before_provider_send",
  "tests/test_production_run_ownership.py::test_factory_reuses_one_exact_owner_and_atomic_store",
  "tests/test_production_run_ownership.py::test_missing_data_directory_fails_closed_before_provider_send",
  "tests/test_production_run_ownership.py::test_memory_off_crash_cold_replay_is_zero_resend_with_canonical_receipt",
  "tests/test_production_run_ownership.py::test_diagnostics_revision_cold_reloads_from_the_authoritative_ledger",
  "tests/test_production_run_ownership_wiring.py::test_memory_off_root_receives_the_generic_production_factory",
  "tests/test_production_run_ownership_wiring.py::test_shadow_root_receives_generic_factory_but_active_omits_it",
  "tests/test_production_run_ownership_wiring.py::test_memory_off_graph_uses_one_ledger_for_cold_continuation_and_diagnostics",
  "tests/test_run_bundle_adapter.py::test_projects_real_locked_core_bundle_without_recomputing_usage",
  "tests/test_run_bundle_adapter.py::test_present_invalid_v1_never_falls_back_to_legacy",
  "tests/test_run_bundle_adapter.py::test_rejects_wrong_identity_and_sensitive_extension_payload",
  "tests/test_run_bundle_ledger.py::test_reopen_recovers_exact_canonical_bundle",
  "tests/test_run_bundle_ledger.py::test_revision_is_monotonic_and_same_revision_digest_is_unique",
  "tests/test_completion_diagnostics.py::test_digest_survives_json_round_trip_for_cross_language_numbers",
  "tests/test_completion_diagnostics.py::test_diagnostics_reference_uses_official_immutable_bundle_reprojection",
  "tests/test_memory_v2_unchain_runtime_factory.py::test_explicit_production_gate_mounts_only_canonical_context_owner",
  "tests/test_unchain_adapter_recipe_graph_runtime.py::RecipeGraphRuntimeTests::test_stream_recipe_graph_unions_every_canonical_step_receipt",
  "tests/test_unchain_adapter_recipe_graph_runtime.py::RecipeGraphRuntimeTests::test_stream_recipe_graph_rejects_all_missing_bundles_when_ledger_is_active",
  "tests/test_chat_stream_v4.py::ChatStreamV4RouteTests::test_fresh_run_continuation_is_allowlisted_from_top_level_only",
  "tests/test_chat_stream_v4.py::ChatStreamV4RouteTests::test_execution_cancel_route_forwards_exact_attempt_and_is_idempotent",
  "tests/test_chat_stream_v4.py::ChatStreamV4RouteTests::test_completion_bundle_with_schema_never_falls_back_to_legacy",
  "tests/test_chat_stream_v4.py::ChatStreamV4RouteTests::test_chat_stream_v4_forwards_completion_diagnostics_beside_bundle",
  "tests/test_chat_stream_v4.py::ChatStreamV4RouteTests::test_chat_stream_v4_seals_failed_bundle_before_error_done",
  "tests/test_memory_v2_lifecycle_adapter.py::MemoryV2LifecycleAdapterTests::test_failed_run_summary_projects_only_the_typed_canonical_carrier",
  "tests/test_memory_v2_unchain_active_graph_restart.py::test_active_two_node_graph_restarts_without_provider_reexecution",
]);

export const PRICING_CATALOG_TESTS = Object.freeze([
  {
    file: "scripts/pricing/catalog-lib.test.mjs",
    names: Object.freeze([
      "signs and verifies a strict Ed25519 catalog envelope",
      "prices OpenAI cache write/read as disjoint input without double counting",
      "prices Anthropic 5m and 1h cache writes separately",
      "fails cost closed when cache TTL or model identity is unknown",
      "requires every exact pricing dimension instead of applying defaults",
      "pins a long-context price multiplier into the estimate",
      "orders fractional RFC3339 effective boundaries chronologically",
    ]),
  },
  {
    file: "scripts/pricing/catalog-runtime.test.mjs",
    names: Object.freeze([
      "trusted loader rejects catalog and trust-store tampering",
      "historical projection remains hash-pinned after a catalog update",
      "projection content and caller pin are both mandatory",
      "trusted loader uses verification time rather than payload retrieval time",
      "source capture accepts only reviewed official URLs and binds response bytes",
    ]),
  },
  {
    file: "scripts/pricing/catalog-cli.test.mjs",
    names: Object.freeze([
      "offline CLI signs, verifies, projects, and inspects with an explicit trust root",
    ]),
  },
  {
    file: "scripts/pricing/catalog-parity.test.mjs",
    names: Object.freeze([
      "Node signed projection loads and estimates identically in Python",
    ]),
  },
]);

export const ELECTRON_RUN_BUNDLE_TESTS = Object.freeze([
  {
    file: "electron/tests/shared/run_bundle_v1.test.cjs",
    names: Object.freeze([
      "uses the frozen canonical digest for the producer-compatible fixture",
      "enforces atomic provider-call timing invariants",
      "enforces exact run lifecycle completion invariants",
      "rejects root-as-child and orphan run topologies",
      "requires deterministic materialized child bundle ids",
      "rejects aggregation usage that is not the exact receipt sum",
      "counts artifact events and requires opaque kind-bound evidence refs",
      "requires model_attempt metric events to match receipts exactly",
      "rejects coherent but false bundle coverage and cost projections",
    ]),
  },
  {
    file: "electron/tests/main/run_bundle_storage_service.test.cjs",
    names: Object.freeze([
      "duplicate replay is idempotent and OpenAI cached input remains a subset",
      "newer revision atomically replaces multi-model usage slices",
      "persists unavailable coverage with unknown usage as null, never zero",
      "rejects stale revisions and same-revision digest conflicts",
      "rolls the record and slices back together on an injected failure",
    ]),
  },
]);

export const RENDERER_RUN_BUNDLE_TESTS = Object.freeze([
  {
    file: "src/SERVICEs/run_bundle_v1.test.js",
    names: Object.freeze([
      "OpenAI 1000 input with 600 cached displays 1000 in, not 1600",
      "reasoning stays an output subset and partial coverage remains explicit",
      "unknown canonical counts remain null rather than becoming zero",
    ]),
  },
  {
    file: "src/SERVICEs/run_bundle_storage.test.js",
    names: Object.freeze([
      "counts each provider call once without re-adding cache or reasoning",
      "rejects present malformed and unsupported bundle schemas",
      "admits diagnostics and awaits an exact canonical UPSERT acknowledgement",
      "fails before durable completion on invalid diagnostics or acknowledgement",
    ]),
  },
  {
    file: "src/SERVICEs/completion_diagnostics_v1.test.js",
    names: Object.freeze([
      "matches the frozen Python producer digest",
      "admits the producer's JSON-round-trippable numeric domain",
      "rejects a forged diagnostics digest",
    ]),
  },
  {
    file: "src/COMPONENTs/chat-bubble/chat_bubble.token_summary.test.js",
    names: Object.freeze([
      "does not add OpenAI cached input to input_tokens a second time",
      "renders canonical RunBundle all_usage with cache and reasoning subsets",
      "renders unavailable canonical usage as dashes instead of zero",
    ]),
  },
  {
    file: "src/COMPONENTs/settings/token_usage/index.test.js",
    names: Object.freeze([
      "uses canonical per-call totals and ignores the legacy fallback",
      "shows unavailable canonical counts as dashes rather than zero",
      "clear removes canonical bundles without deleting legacy evidence",
    ]),
  },
  {
    file: "src/PAGEs/chat/chat.test.js",
    names: Object.freeze([
      "keeps a reattached terminal stream pending until canonical accounting is durable",
      "rehydrates an awaiting durable interaction without cancelling or auto-resuming it",
      "cold fresh send seals the exact awaiting attempt before starting one normal run",
      "seals a recorded durable receipt on reload without auto-resuming",
      "projects a canonical done bundle into the keyed RunBundle store",
      "keeps the assistant streaming until canonical accounting is durable",
      "turns accounting rejection into a terminal error without persisting raw bundle",
      "persists admitted V2 failed-run accounting before publishing the error",
      "holds a V4 run.failed projection until failed accounting is durable",
      "fails closed when failed-run accounting rejects without persisting raw evidence",
      "persists admitted accounting for a reattached failed canonical run",
      "fails closed when reattached failed-run accounting rejects",
    ]),
  },
]);

export const flattenNamedTests = (groups) => groups.flatMap((group) =>
  group.names.map((name) => ({ file: group.file, name }))
);
