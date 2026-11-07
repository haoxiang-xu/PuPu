/* What the real store says about drilling into a subagent — frozen.
 *
 * Machine-written by `write_capture.py` in
 * `.codex/artifacts/pupu-356/341-drill-20261016/`, from
 * `SkeletonResourceStore` running against the installed wheel of the fixed
 * pair. Every row is one `save_draft` / `preflight` / `convert_legacy_pools`
 * call on the real store, read back out of the stored document. The document
 * fixtures come from the store's own committed tests, so the inputs are shapes
 * the store is tested on.
 *
 * Four things are frozen here, and the editor is checked against each:
 *
 *   1. Every pool entry source shape, with the code and path the store answers
 *      at. A row carries the WHOLE entry as stored, so the editor is asked the
 *      same question about the same input rather than about a shorter fixture
 *      written in a test file.
 *   2. Where an embedded Agent document actually lives, after the real legacy
 *      conversion put one there.
 *   3. The parent document before an embedded child was edited, the child
 *      after, and what the store then held — so writing a child back is
 *      checked against the document the store really stored.
 *   4. What the draft check says about a problem inside an embedded child.
 *      It used to say nothing — the same `[]` for a child with no End as for a
 *      healthy one — and since the #356 embedded-diagnostics repair it reports
 *      the child's own problems at their full path, one `source.document`
 *      segment per level: a structural fault lands on the child graph
 *      (`…source.document.nodes`), a node fault on the child's node, and a
 *      binding fault on that node's own input row. Re-measured on the new
 *      fixed pair; the rows below are that producer's answers, which is what
 *      lets a child view show its own problems.
 *
 * Two measured facts that belong in a report rather than a table: editing a
 * referenced Agent leaves the parent's document and token untouched while the
 * parent's own subagent digest changes (so other parents see it next run), and
 * six levels of embedding are accepted while the seventh is refused with
 * `subagent_depth`. */

export const CAPTURED_ENTRY_SOURCES = [
    {
      "case": "agent_ref to an Agent",
      "entry": "{\"allowed_modes\": [\"delegate\", \"handoff\", \"worker\"], \"allowed_tools\": null, \"description\": \"review\", \"disabled_tools\": [], \"id\": \"reviewer\", \"memory_policy\": \"ephemeral\", \"name\": \"Reviewer\", \"output_mode\": \"summary\", \"parallel_safe\": true, \"source\": {\"agent_id\": \"child\", \"kind\": \"agent_ref\"}}",
      "preflight": {
        "code": null,
        "ok": true,
        "path": null
      },
      "saved": true
    },
    {
      "case": "agent_ref to nothing",
      "entry": "{\"allowed_modes\": [\"delegate\", \"handoff\", \"worker\"], \"allowed_tools\": null, \"description\": \"review\", \"disabled_tools\": [], \"id\": \"reviewer\", \"memory_policy\": \"ephemeral\", \"name\": \"Reviewer\", \"output_mode\": \"summary\", \"parallel_safe\": true, \"source\": {\"agent_id\": \"child\", \"kind\": \"agent_ref\"}}",
      "preflight": {
        "code": "resource_missing",
        "ok": false,
        "path": [
          "document",
          "nodes",
          3,
          "config",
          "subagents",
          0,
          "source"
        ]
      },
      "saved": true
    },
    {
      "case": "agent_ref to a Workflow",
      "entry": "{\"allowed_modes\": [\"delegate\", \"handoff\", \"worker\"], \"allowed_tools\": null, \"description\": \"review\", \"disabled_tools\": [], \"id\": \"reviewer\", \"memory_policy\": \"ephemeral\", \"name\": \"Reviewer\", \"output_mode\": \"summary\", \"parallel_safe\": true, \"source\": {\"agent_id\": \"child\", \"kind\": \"agent_ref\"}}",
      "preflight": {
        "code": "wrong_kind",
        "ok": false,
        "path": [
          "document",
          "nodes",
          3,
          "config",
          "subagents",
          0,
          "source"
        ]
      },
      "saved": true
    },
    {
      "case": "agent_ref to an archived Agent",
      "entry": "{\"allowed_modes\": [\"delegate\", \"handoff\", \"worker\"], \"allowed_tools\": null, \"description\": \"review\", \"disabled_tools\": [], \"id\": \"reviewer\", \"memory_policy\": \"ephemeral\", \"name\": \"Reviewer\", \"output_mode\": \"summary\", \"parallel_safe\": true, \"source\": {\"agent_id\": \"child\", \"kind\": \"agent_ref\"}}",
      "preflight": {
        "code": "resource_archived",
        "ok": false,
        "path": [
          "document",
          "nodes",
          3,
          "config",
          "subagents",
          0,
          "source"
        ]
      },
      "saved": true
    },
    {
      "case": "agent_ref to itself",
      "entry": "{\"allowed_modes\": [\"delegate\", \"handoff\", \"worker\"], \"allowed_tools\": null, \"description\": \"review\", \"disabled_tools\": [], \"id\": \"reviewer\", \"memory_policy\": \"ephemeral\", \"name\": \"Reviewer\", \"output_mode\": \"summary\", \"parallel_safe\": true, \"source\": {\"agent_id\": \"parent\", \"kind\": \"agent_ref\"}}",
      "preflight": {
        "code": "recursive_reference",
        "ok": false,
        "path": [
          "document",
          "nodes",
          3,
          "config",
          "subagents",
          0,
          "source"
        ]
      },
      "saved": true
    },
    {
      "case": "embedded Agent",
      "entry": "{\"allowed_modes\": [\"delegate\", \"handoff\", \"worker\"], \"allowed_tools\": null, \"description\": \"review\", \"disabled_tools\": [], \"id\": \"reviewer\", \"memory_policy\": \"ephemeral\", \"name\": \"Reviewer\", \"output_mode\": \"summary\", \"parallel_safe\": true, \"source\": {\"document\": {\"edges\": [{\"id\": \"a\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"kernel\", \"target_port_id\": \"in\"}, {\"id\": \"b\", \"kind\": \"flow\", \"source_node_id\": \"kernel\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-1\", \"kind\": \"agent\", \"name\": \"Child\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 8, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 8192, \"credential_ref\": \"test.key\", \"endpoint\": \"https://example.test/v1\", \"id\": \"test\", \"model\": \"test-model\", \"output_limit\": 2048, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"resolved builtin\", \"schema_version\": 1}}, \"id\": \"kernel\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"kernel\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}",
      "preflight": {
        "code": null,
        "ok": true,
        "path": null
      },
      "saved": true
    },
    {
      "case": "embedded Agent with a faulty Kernel",
      "entry": "{\"allowed_modes\": [\"delegate\", \"handoff\", \"worker\"], \"allowed_tools\": null, \"description\": \"review\", \"disabled_tools\": [], \"id\": \"reviewer\", \"memory_policy\": \"ephemeral\", \"name\": \"Reviewer\", \"output_mode\": \"summary\", \"parallel_safe\": true, \"source\": {\"document\": {\"edges\": [{\"id\": \"a\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"kernel\", \"target_port_id\": \"in\"}, {\"id\": \"b\", \"kind\": \"flow\", \"source_node_id\": \"kernel\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-1\", \"kind\": \"agent\", \"name\": \"Child\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 8, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 8192, \"credential_ref\": \"test.key\", \"id\": \"test\", \"model\": \"test-model\", \"output_limit\": 2048, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"resolved builtin\", \"schema_version\": 1}}, \"id\": \"kernel\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"kernel\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}",
      "preflight": {
        "code": "missing_field",
        "ok": false,
        "path": [
          "document",
          "nodes",
          3,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "nodes",
          1,
          "config",
          "kernel",
          "profile",
          "endpoint"
        ]
      },
      "saved": true
    },
    {
      "case": "embedded Agent with no End",
      "entry": "{\"allowed_modes\": [\"delegate\", \"handoff\", \"worker\"], \"allowed_tools\": null, \"description\": \"review\", \"disabled_tools\": [], \"id\": \"reviewer\", \"memory_policy\": \"ephemeral\", \"name\": \"Reviewer\", \"output_mode\": \"summary\", \"parallel_safe\": true, \"source\": {\"document\": {\"edges\": [{\"id\": \"a\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"kernel\", \"target_port_id\": \"in\"}], \"id\": \"embedded-1\", \"kind\": \"agent\", \"name\": \"Child\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 8, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 8192, \"credential_ref\": \"test.key\", \"endpoint\": \"https://example.test/v1\", \"id\": \"test\", \"model\": \"test-model\", \"output_limit\": 2048, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"resolved builtin\", \"schema_version\": 1}}, \"id\": \"kernel\", \"type\": \"agent\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}",
      "preflight": {
        "code": "end_count",
        "ok": false,
        "path": [
          "document",
          "nodes",
          3,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "nodes"
        ]
      },
      "saved": true
    },
    {
      "case": "embedded Workflow",
      "entry": "{\"allowed_modes\": [\"delegate\", \"handoff\", \"worker\"], \"allowed_tools\": null, \"description\": \"review\", \"disabled_tools\": [], \"id\": \"reviewer\", \"memory_policy\": \"ephemeral\", \"name\": \"Reviewer\", \"output_mode\": \"summary\", \"parallel_safe\": true, \"source\": {\"document\": {\"edges\": [{\"id\": \"a\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"code\", \"target_port_id\": \"in\"}, {\"id\": \"b\", \"kind\": \"flow\", \"source_node_id\": \"code\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-1\", \"kind\": \"workflow\", \"name\": \"Workflow\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"value\", \"source\": {\"kind\": \"result\", \"path\": [\"value\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"value\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"value\"]}}], \"outputs\": [{\"name\": \"value\", \"source\": {\"kind\": \"result\", \"path\": [\"value\"]}}]}}, \"id\": \"code\", \"type\": \"code\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"value\", \"value\": {\"kind\": \"ref\", \"node_id\": \"code\", \"path\": [\"value\"]}}], \"outputs\": [{\"name\": \"value\", \"source\": {\"kind\": \"input\", \"path\": [\"value\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}",
      "preflight": {
        "code": "wrong_kind",
        "ok": false,
        "path": [
          "document",
          "nodes",
          3,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "kind"
        ]
      },
      "saved": true
    },
    {
      "case": "embedded that is not a document",
      "entry": "{\"allowed_modes\": [\"delegate\", \"handoff\", \"worker\"], \"allowed_tools\": null, \"description\": \"review\", \"disabled_tools\": [], \"id\": \"reviewer\", \"memory_policy\": \"ephemeral\", \"name\": \"Reviewer\", \"output_mode\": \"summary\", \"parallel_safe\": true, \"source\": {\"document\": \"a graph\", \"kind\": \"embedded\"}}",
      "preflight": {
        "code": "invalid_type",
        "ok": false,
        "path": [
          "document",
          "nodes",
          3,
          "config",
          "subagents",
          0,
          "source",
          "document"
        ]
      },
      "saved": true
    },
    {
      "case": "an unknown source kind",
      "entry": "{\"allowed_modes\": [\"delegate\", \"handoff\", \"worker\"], \"allowed_tools\": null, \"description\": \"review\", \"disabled_tools\": [], \"id\": \"reviewer\", \"memory_policy\": \"ephemeral\", \"name\": \"Reviewer\", \"output_mode\": \"summary\", \"parallel_safe\": true, \"source\": {\"document\": {\"edges\": [{\"id\": \"a\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"kernel\", \"target_port_id\": \"in\"}, {\"id\": \"b\", \"kind\": \"flow\", \"source_node_id\": \"kernel\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-1\", \"kind\": \"agent\", \"name\": \"Child\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 8, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 8192, \"credential_ref\": \"test.key\", \"endpoint\": \"https://example.test/v1\", \"id\": \"test\", \"model\": \"test-model\", \"output_limit\": 2048, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"resolved builtin\", \"schema_version\": 1}}, \"id\": \"kernel\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"kernel\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"graph\"}}",
      "preflight": {
        "code": "unknown_variant",
        "ok": false,
        "path": [
          "document",
          "nodes",
          3,
          "config",
          "subagents",
          0,
          "source",
          "kind"
        ]
      },
      "saved": true
    },
    {
      "case": "an entry with no source at all",
      "entry": "{\"allowed_modes\": [\"delegate\", \"handoff\", \"worker\"], \"allowed_tools\": null, \"description\": \"review\", \"disabled_tools\": [], \"id\": \"reviewer\", \"memory_policy\": \"ephemeral\", \"name\": \"Reviewer\", \"output_mode\": \"summary\", \"parallel_safe\": true}",
      "preflight": {
        "code": "missing_field",
        "ok": false,
        "path": [
          "document",
          "nodes",
          3,
          "config",
          "subagents",
          0,
          "source"
        ]
      },
      "saved": true
    }
  ];

export const CAPTURED_EMBEDDED_LOCATION = {
    "entries": [
      {
        "agent_id": "legacy-c7b5f8080b4b9d712ca3f8e8",
        "document_keys": null,
        "entry_id": "legacy-pool-0",
        "name": "Summarizer",
        "path": [
          "document",
          "nodes",
          3,
          "config",
          "subagents",
          0,
          "source",
          "document"
        ],
        "source_kind": "agent_ref"
      },
      {
        "agent_id": null,
        "document_keys": [
          "description",
          "edges",
          "id",
          "kind",
          "name",
          "nodes",
          "schema_version"
        ],
        "entry_id": "legacy-pool-1",
        "name": "Inline Soul",
        "path": [
          "document",
          "nodes",
          3,
          "config",
          "subagents",
          1,
          "source",
          "document"
        ],
        "source_kind": "embedded"
      }
    ],
    "parent_document": "{\"description\": \"Reviewer description\", \"edges\": [{\"id\": \"e1\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"e2\", \"kind\": \"flow\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"e3\", \"kind\": \"attach\", \"source_node_id\": \"pool\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}], \"id\": \"legacy-132613d90b9bfa97c0545330\", \"kind\": \"agent\", \"name\": \"Reviewer\", \"nodes\": [{\"config\": {\"legacy_fields\": {\"outputs\": [{\"name\": \"text\", \"type\": \"string\"}]}, \"legacy_source\": {\"document\": {\"description\": \"Reviewer description\", \"edges\": [{\"id\": \"e1\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"e2\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"e3\", \"source_node_id\": \"pool\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}], \"max_iterations\": 4, \"merge_with_user_selected\": true, \"model\": \"openai:gpt-4.1\", \"name\": \"Reviewer\", \"nodes\": [{\"id\": \"start\", \"outputs\": [{\"name\": \"text\", \"type\": \"string\"}], \"type\": \"start\"}, {\"id\": \"a1\", \"override\": {\"model\": \"openai:gpt-4.1\", \"prompt\": \"Do Reviewer\", \"prompt_format\": \"soul\"}, \"type\": \"agent\"}, {\"id\": \"end\", \"type\": \"end\"}, {\"id\": \"pool\", \"subagents\": [{\"kind\": \"recipe_ref\", \"recipe_name\": \"Summarizer\"}, {\"kind\": \"inline\", \"name\": \"Inline Soul\", \"prompt_format\": \"soul\", \"template\": {\"allowed_modes\": [\"delegate\"], \"allowed_tools\": [\"read\"], \"description\": \"  padded  \", \"memory_policy\": \"ephemeral\", \"model\": \"openai:gpt-4.1\", \"output_mode\": \"summary\", \"parallel_safe\": false, \"prompt\": \"Be brief\"}}], \"type\": \"subagent_pool\"}], \"subagent_pool\": [], \"toolkits\": []}, \"format\": \"recipe\"}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 1, \"output_tokens\": 1024, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": false, \"json_schema\": true}, \"context_window\": 128000, \"credential_ref\": \"openai\", \"endpoint\": \"https://api.openai.com/v1/responses\", \"id\": \"legacy-choice\", \"model\": \"gpt-4.1\", \"output_limit\": 4096, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"placeholder\", \"schema_version\": 1}, \"legacy_fields\": {\"override\": {\"model\": \"openai:gpt-4.1\", \"prompt\": \"Do Reviewer\", \"prompt_format\": \"soul\"}}, \"legacy_recipe\": {\"description\": \"Reviewer description\", \"edges\": [{\"id\": \"e1\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"e2\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"e3\", \"source_node_id\": \"pool\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}], \"max_iterations\": 4, \"merge_with_user_selected\": true, \"model\": \"openai:gpt-4.1\", \"name\": \"Reviewer\", \"nodes\": [{\"id\": \"start\", \"outputs\": [{\"name\": \"text\", \"type\": \"string\"}], \"type\": \"start\"}, {\"id\": \"a1\", \"override\": {\"model\": \"openai:gpt-4.1\", \"prompt\": \"Do Reviewer\", \"prompt_format\": \"soul\"}, \"type\": \"agent\"}, {\"id\": \"end\", \"type\": \"end\"}, {\"id\": \"pool\", \"subagents\": [{\"kind\": \"recipe_ref\", \"recipe_name\": \"Summarizer\"}, {\"kind\": \"inline\", \"name\": \"Inline Soul\", \"prompt_format\": \"soul\", \"template\": {\"allowed_modes\": [\"delegate\"], \"allowed_tools\": [\"read\"], \"description\": \"  padded  \", \"memory_policy\": \"ephemeral\", \"model\": \"openai:gpt-4.1\", \"output_mode\": \"summary\", \"parallel_safe\": false, \"prompt\": \"Be brief\"}}], \"type\": \"subagent_pool\"}], \"subagent_pool\": [], \"toolkits\": []}, \"prompt\": {\"kind\": \"text\", \"text\": \"Do Reviewer\"}}, \"id\": \"a1\", \"type\": \"agent\"}, {\"config\": {\"legacy_fields\": {}}, \"id\": \"end\", \"type\": \"end\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"delegate\", \"worker\"], \"allowed_tools\": null, \"description\": \"\", \"disabled_tools\": [], \"id\": \"legacy-pool-0\", \"memory_policy\": \"ephemeral\", \"name\": \"Summarizer\", \"output_mode\": \"summary\", \"parallel_safe\": true, \"source\": {\"agent_id\": \"legacy-c7b5f8080b4b9d712ca3f8e8\", \"kind\": \"agent_ref\"}}, {\"allowed_modes\": [\"delegate\"], \"allowed_tools\": [\"read\"], \"description\": \"  padded  \", \"disabled_tools\": [], \"id\": \"legacy-pool-1\", \"memory_policy\": \"ephemeral\", \"name\": \"Inline Soul\", \"output_mode\": \"summary\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"  padded  \", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-1\", \"kind\": \"agent\", \"name\": \"Inline Soul\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 1, \"output_tokens\": 1024, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": false, \"json_schema\": true}, \"context_window\": 128000, \"credential_ref\": \"openai\", \"endpoint\": \"https://api.openai.com/v1/responses\", \"id\": \"legacy-choice\", \"model\": \"gpt-4.1\", \"output_limit\": 4096, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Be brief\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool\", \"type\": \"subagent_pool\"}], \"schema_version\": 1}",
    "pool_config_keys": [
      "subagents"
    ],
    "pool_node_id": "pool"
  };

export const CAPTURED_EMBEDDED_WRITE_BACK = {
    "child_after": "{\"description\": \"  padded  \", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-1\", \"kind\": \"agent\", \"name\": \"Renamed in the drill\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 1, \"output_tokens\": 1024, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": false, \"json_schema\": true}, \"context_window\": 128000, \"credential_ref\": \"openai\", \"endpoint\": \"https://api.openai.com/v1/responses\", \"id\": \"legacy-choice\", \"model\": \"gpt-4.1\", \"output_limit\": 4096, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"edited inside the embedded graph\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}",
    "child_before": "{\"description\": \"  padded  \", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-1\", \"kind\": \"agent\", \"name\": \"Inline Soul\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 1, \"output_tokens\": 1024, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": false, \"json_schema\": true}, \"context_window\": 128000, \"credential_ref\": \"openai\", \"endpoint\": \"https://api.openai.com/v1/responses\", \"id\": \"legacy-choice\", \"model\": \"gpt-4.1\", \"output_limit\": 4096, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Be brief\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}",
    "diagnostics": [],
    "parent_before": "{\"description\": \"Reviewer description\", \"edges\": [{\"id\": \"e1\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"e2\", \"kind\": \"flow\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"e3\", \"kind\": \"attach\", \"source_node_id\": \"pool\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}], \"id\": \"legacy-132613d90b9bfa97c0545330\", \"kind\": \"agent\", \"name\": \"Reviewer\", \"nodes\": [{\"config\": {\"legacy_fields\": {\"outputs\": [{\"name\": \"text\", \"type\": \"string\"}]}, \"legacy_source\": {\"document\": {\"description\": \"Reviewer description\", \"edges\": [{\"id\": \"e1\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"e2\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"e3\", \"source_node_id\": \"pool\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}], \"max_iterations\": 4, \"merge_with_user_selected\": true, \"model\": \"openai:gpt-4.1\", \"name\": \"Reviewer\", \"nodes\": [{\"id\": \"start\", \"outputs\": [{\"name\": \"text\", \"type\": \"string\"}], \"type\": \"start\"}, {\"id\": \"a1\", \"override\": {\"model\": \"openai:gpt-4.1\", \"prompt\": \"Do Reviewer\", \"prompt_format\": \"soul\"}, \"type\": \"agent\"}, {\"id\": \"end\", \"type\": \"end\"}, {\"id\": \"pool\", \"subagents\": [{\"kind\": \"recipe_ref\", \"recipe_name\": \"Summarizer\"}, {\"kind\": \"inline\", \"name\": \"Inline Soul\", \"prompt_format\": \"soul\", \"template\": {\"allowed_modes\": [\"delegate\"], \"allowed_tools\": [\"read\"], \"description\": \"  padded  \", \"memory_policy\": \"ephemeral\", \"model\": \"openai:gpt-4.1\", \"output_mode\": \"summary\", \"parallel_safe\": false, \"prompt\": \"Be brief\"}}], \"type\": \"subagent_pool\"}], \"subagent_pool\": [], \"toolkits\": []}, \"format\": \"recipe\"}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 1, \"output_tokens\": 1024, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": false, \"json_schema\": true}, \"context_window\": 128000, \"credential_ref\": \"openai\", \"endpoint\": \"https://api.openai.com/v1/responses\", \"id\": \"legacy-choice\", \"model\": \"gpt-4.1\", \"output_limit\": 4096, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"placeholder\", \"schema_version\": 1}, \"legacy_fields\": {\"override\": {\"model\": \"openai:gpt-4.1\", \"prompt\": \"Do Reviewer\", \"prompt_format\": \"soul\"}}, \"legacy_recipe\": {\"description\": \"Reviewer description\", \"edges\": [{\"id\": \"e1\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"e2\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"e3\", \"source_node_id\": \"pool\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}], \"max_iterations\": 4, \"merge_with_user_selected\": true, \"model\": \"openai:gpt-4.1\", \"name\": \"Reviewer\", \"nodes\": [{\"id\": \"start\", \"outputs\": [{\"name\": \"text\", \"type\": \"string\"}], \"type\": \"start\"}, {\"id\": \"a1\", \"override\": {\"model\": \"openai:gpt-4.1\", \"prompt\": \"Do Reviewer\", \"prompt_format\": \"soul\"}, \"type\": \"agent\"}, {\"id\": \"end\", \"type\": \"end\"}, {\"id\": \"pool\", \"subagents\": [{\"kind\": \"recipe_ref\", \"recipe_name\": \"Summarizer\"}, {\"kind\": \"inline\", \"name\": \"Inline Soul\", \"prompt_format\": \"soul\", \"template\": {\"allowed_modes\": [\"delegate\"], \"allowed_tools\": [\"read\"], \"description\": \"  padded  \", \"memory_policy\": \"ephemeral\", \"model\": \"openai:gpt-4.1\", \"output_mode\": \"summary\", \"parallel_safe\": false, \"prompt\": \"Be brief\"}}], \"type\": \"subagent_pool\"}], \"subagent_pool\": [], \"toolkits\": []}, \"prompt\": {\"kind\": \"text\", \"text\": \"Do Reviewer\"}}, \"id\": \"a1\", \"type\": \"agent\"}, {\"config\": {\"legacy_fields\": {}}, \"id\": \"end\", \"type\": \"end\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"delegate\", \"worker\"], \"allowed_tools\": null, \"description\": \"\", \"disabled_tools\": [], \"id\": \"legacy-pool-0\", \"memory_policy\": \"ephemeral\", \"name\": \"Summarizer\", \"output_mode\": \"summary\", \"parallel_safe\": true, \"source\": {\"agent_id\": \"legacy-c7b5f8080b4b9d712ca3f8e8\", \"kind\": \"agent_ref\"}}, {\"allowed_modes\": [\"delegate\"], \"allowed_tools\": [\"read\"], \"description\": \"  padded  \", \"disabled_tools\": [], \"id\": \"legacy-pool-1\", \"memory_policy\": \"ephemeral\", \"name\": \"Inline Soul\", \"output_mode\": \"summary\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"  padded  \", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-1\", \"kind\": \"agent\", \"name\": \"Inline Soul\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 1, \"output_tokens\": 1024, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": false, \"json_schema\": true}, \"context_window\": 128000, \"credential_ref\": \"openai\", \"endpoint\": \"https://api.openai.com/v1/responses\", \"id\": \"legacy-choice\", \"model\": \"gpt-4.1\", \"output_limit\": 4096, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Be brief\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool\", \"type\": \"subagent_pool\"}], \"schema_version\": 1}",
    "parent_stored": "{\"description\": \"Reviewer description\", \"edges\": [{\"id\": \"e1\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"e2\", \"kind\": \"flow\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"e3\", \"kind\": \"attach\", \"source_node_id\": \"pool\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}], \"id\": \"legacy-132613d90b9bfa97c0545330\", \"kind\": \"agent\", \"name\": \"Reviewer\", \"nodes\": [{\"config\": {\"legacy_fields\": {\"outputs\": [{\"name\": \"text\", \"type\": \"string\"}]}, \"legacy_source\": {\"document\": {\"description\": \"Reviewer description\", \"edges\": [{\"id\": \"e1\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"e2\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"e3\", \"source_node_id\": \"pool\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}], \"max_iterations\": 4, \"merge_with_user_selected\": true, \"model\": \"openai:gpt-4.1\", \"name\": \"Reviewer\", \"nodes\": [{\"id\": \"start\", \"outputs\": [{\"name\": \"text\", \"type\": \"string\"}], \"type\": \"start\"}, {\"id\": \"a1\", \"override\": {\"model\": \"openai:gpt-4.1\", \"prompt\": \"Do Reviewer\", \"prompt_format\": \"soul\"}, \"type\": \"agent\"}, {\"id\": \"end\", \"type\": \"end\"}, {\"id\": \"pool\", \"subagents\": [{\"kind\": \"recipe_ref\", \"recipe_name\": \"Summarizer\"}, {\"kind\": \"inline\", \"name\": \"Inline Soul\", \"prompt_format\": \"soul\", \"template\": {\"allowed_modes\": [\"delegate\"], \"allowed_tools\": [\"read\"], \"description\": \"  padded  \", \"memory_policy\": \"ephemeral\", \"model\": \"openai:gpt-4.1\", \"output_mode\": \"summary\", \"parallel_safe\": false, \"prompt\": \"Be brief\"}}], \"type\": \"subagent_pool\"}], \"subagent_pool\": [], \"toolkits\": []}, \"format\": \"recipe\"}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 1, \"output_tokens\": 1024, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": false, \"json_schema\": true}, \"context_window\": 128000, \"credential_ref\": \"openai\", \"endpoint\": \"https://api.openai.com/v1/responses\", \"id\": \"legacy-choice\", \"model\": \"gpt-4.1\", \"output_limit\": 4096, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"placeholder\", \"schema_version\": 1}, \"legacy_fields\": {\"override\": {\"model\": \"openai:gpt-4.1\", \"prompt\": \"Do Reviewer\", \"prompt_format\": \"soul\"}}, \"legacy_recipe\": {\"description\": \"Reviewer description\", \"edges\": [{\"id\": \"e1\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"e2\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"e3\", \"source_node_id\": \"pool\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}], \"max_iterations\": 4, \"merge_with_user_selected\": true, \"model\": \"openai:gpt-4.1\", \"name\": \"Reviewer\", \"nodes\": [{\"id\": \"start\", \"outputs\": [{\"name\": \"text\", \"type\": \"string\"}], \"type\": \"start\"}, {\"id\": \"a1\", \"override\": {\"model\": \"openai:gpt-4.1\", \"prompt\": \"Do Reviewer\", \"prompt_format\": \"soul\"}, \"type\": \"agent\"}, {\"id\": \"end\", \"type\": \"end\"}, {\"id\": \"pool\", \"subagents\": [{\"kind\": \"recipe_ref\", \"recipe_name\": \"Summarizer\"}, {\"kind\": \"inline\", \"name\": \"Inline Soul\", \"prompt_format\": \"soul\", \"template\": {\"allowed_modes\": [\"delegate\"], \"allowed_tools\": [\"read\"], \"description\": \"  padded  \", \"memory_policy\": \"ephemeral\", \"model\": \"openai:gpt-4.1\", \"output_mode\": \"summary\", \"parallel_safe\": false, \"prompt\": \"Be brief\"}}], \"type\": \"subagent_pool\"}], \"subagent_pool\": [], \"toolkits\": []}, \"prompt\": {\"kind\": \"text\", \"text\": \"Do Reviewer\"}}, \"id\": \"a1\", \"type\": \"agent\"}, {\"config\": {\"legacy_fields\": {}}, \"id\": \"end\", \"type\": \"end\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"delegate\", \"worker\"], \"allowed_tools\": null, \"description\": \"\", \"disabled_tools\": [], \"id\": \"legacy-pool-0\", \"memory_policy\": \"ephemeral\", \"name\": \"Summarizer\", \"output_mode\": \"summary\", \"parallel_safe\": true, \"source\": {\"agent_id\": \"legacy-c7b5f8080b4b9d712ca3f8e8\", \"kind\": \"agent_ref\"}}, {\"allowed_modes\": [\"delegate\"], \"allowed_tools\": [\"read\"], \"description\": \"  padded  \", \"disabled_tools\": [], \"id\": \"legacy-pool-1\", \"memory_policy\": \"ephemeral\", \"name\": \"Inline Soul\", \"output_mode\": \"summary\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"  padded  \", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-1\", \"kind\": \"agent\", \"name\": \"Renamed in the drill\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 1, \"output_tokens\": 1024, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": false, \"json_schema\": true}, \"context_window\": 128000, \"credential_ref\": \"openai\", \"endpoint\": \"https://api.openai.com/v1/responses\", \"id\": \"legacy-choice\", \"model\": \"gpt-4.1\", \"output_limit\": 4096, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"edited inside the embedded graph\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool\", \"type\": \"subagent_pool\"}], \"schema_version\": 1}",
    "referenced_untouched": true,
    "resources_after": 2,
    "resources_before": 2,
    "saved": true,
    "step": {
      "entry_id": "legacy-pool-1",
      "node_id": "pool"
    }
  };

export const CAPTURED_EMBEDDED_DIAGNOSTICS = [
    {
      "case": "the embedded child has no End",
      "draft_diagnostics": [
        {
          "code": "end_count",
          "message": "graph requires exactly one end node",
          "path": [
            "document",
            "nodes",
            3,
            "config",
            "subagents",
            0,
            "source",
            "document",
            "nodes"
          ]
        },
        {
          "code": "flow_output_required",
          "message": "execution node requires flow output",
          "path": [
            "document",
            "nodes",
            3,
            "config",
            "subagents",
            0,
            "source",
            "document",
            "nodes",
            1
          ]
        }
      ],
      "preflight": {
        "code": "end_count",
        "ok": false,
        "path": [
          "document",
          "nodes",
          3,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "nodes"
        ]
      }
    },
    {
      "case": "a binding in the embedded child carries an unknown field",
      "draft_diagnostics": [
        {
          "code": "unknown_field",
          "message": "default is only allowed for default policy",
          "path": [
            "document",
            "nodes",
            3,
            "config",
            "subagents",
            0,
            "source",
            "document",
            "nodes",
            1,
            "config",
            "execution",
            "inputs",
            0,
            "default"
          ]
        }
      ],
      "preflight": {
        "code": "unknown_field",
        "ok": false,
        "path": [
          "document",
          "nodes",
          3,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "nodes",
          1,
          "config",
          "execution",
          "inputs",
          0,
          "default"
        ]
      }
    },
    {
      "case": "the embedded child is complete",
      "draft_diagnostics": [],
      "preflight": {
        "code": null,
        "ok": true,
        "path": null
      }
    },
    {
      "case": "the parent carries the unknown field instead",
      "draft_diagnostics": [
        {
          "code": "unknown_field",
          "message": "default is only allowed for default policy",
          "path": [
            "document",
            "nodes",
            1,
            "config",
            "execution",
            "inputs",
            0,
            "default"
          ]
        }
      ],
      "preflight": null
    }
  ];
