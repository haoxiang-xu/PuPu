/* What the real store says about an entry's identity and a graph's shape.
 *
 * Machine-written by `write_capture.py` from `identity_probe.py`, which runs
 * `SkeletonResourceStore` against the installed wheel of the fixed pair. Do
 * not edit by hand: every row is one `save_draft` + `get_resource` +
 * `preflight` on a mutation of the real converted parent from the pinned run,
 * and a row written here by hand would be this editor agreeing with itself.
 *
 * Two questions, both raised by the acceptance-8 review:
 *
 *   1. A pool can hold two entries the document cannot tell apart. Every such
 *      draft below SAVES and comes back verbatim, and Run refuses it at the
 *      SECOND entry — `duplicate_name` at its `id`, or at its `name`. So
 *      "which child did the author click" cannot be answered by the id alone,
 *      and the answer must not be the first match.
 *   2. An embedded graph's container can be any JSON: every row below SAVES.
 *      Re-measured on the embedded-diagnostics pair — the draft check now
 *      descends, so a row's `draft_diagnostics` is the child's own problems at
 *      their full path rather than the `[]` this capture used to hold. Run
 *      refuses the ones whose container is not the shape at all with
 *      `invalid_type`, and the ones whose VALUES are wrong with a value code.
 *      That is the line this editor draws: it refuses to OPEN a graph it
 *      cannot draw — and only ever a graph Run refuses too — while a graph
 *      with a bad value in it opens, because that is the author's to fix on
 *      the canvas.
 *
 * `child` and `entries` are the stored JSON, as text, so a reader of the
 * mirror is asked about the same bytes the store held. */

export const IDENTITY_CAPTURE_IDENTITY = Object.freeze({
  "interpreter": "3.12.10",
  "manifest_digest": "sha256:f6daf3894dd947723ee7dc60392277896b88c4890d35373b26442a1833a28101",
  "manifest_digest_expected": "sha256:f6daf3894dd947723ee7dc60392277896b88c4890d35373b26442a1833a28101",
  "schema_path": "/Users/red/.codex/artifacts/pupu-356/embedded-diagnostics-20261017/fixed-pair/install-venv/lib/python3.12/site-packages/unchain/skeleton/schema.py",
  "schema_sha256": "41633fb9b081cd34786731442840d59ed4d5d1e6a5d111a56f50381d685b4caf",
  "sidecar_sha256": "3a6d1b6383928b867bdad48aa2f909386130460e0dee1bcd52bd836455492242",
  "sidecar_sha256_expected": "3a6d1b6383928b867bdad48aa2f909386130460e0dee1bcd52bd836455492242",
  "source": "/Users/red/.codex/artifacts/pupu-356/legacy-child-boundary-20261016/independent/green-v3-d5e98032-2aaee80c-20261016/results.json",
  "source_sha256": "7d133cef76e280529a93370afaada9e64476ed2ebd2fc7adb2b86a42a634efbf",
  "store_path": "/Users/red/Desktop/GITRepo/pupu-341/unchain_runtime/server/skeleton_resource_store.py",
  "store_sha256": "267cfc3faa16cbda440d2ca9eafff1d73f7194dddb2ecce7d44acb7574c24611",
  "subagent_config_sha256": "df225ca9b01e7e64eeadae0cc83f790f35b044c6568e26ebc254ea5494f9d13f",
  "wheel_sha256": "4e3efdc0acd9563e484ad91fa392cff0eeeb22c5793313e936c643614945427b",
  "wheel_sha256_expected": "4e3efdc0acd9563e484ad91fa392cff0eeeb22c5793313e936c643614945427b"
});

/* Two entries one document cannot tell apart: saved, round-tripped,
   refused at Run at the second one. */
export const CAPTURED_DUPLICATE_ENTRIES = Object.freeze([
  {
    "case": "duplicate-entry-ids",
    "question": "two embedded entries, one id",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [],
    "run": {
      "ok": false,
      "code": "duplicate_name",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        1,
        "id"
      ]
    },
    "document": "{\"edges\": [{\"id\": \"flow-a1\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a2\", \"kind\": \"flow\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"a2\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a3\", \"kind\": \"flow\", \"source_node_id\": \"a2\", \"source_port_id\": \"out\", \"target_node_id\": \"a3\", \"target_port_id\": \"in\"}, {\"id\": \"flow-end\", \"kind\": \"flow\", \"source_node_id\": \"a3\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"attach-pool-a-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-a\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}, {\"id\": \"attach-pool-b-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-b\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a2\", \"target_port_id\": \"attach_bot\"}], \"id\": \"probe-duplicate-entry-ids\", \"kind\": \"agent\", \"name\": \"Probe duplicate-entry-ids\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a1\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a1\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_b\": {\"type\": \"string\"}}, \"required\": [\"root_b\"], \"type\": \"object\"}, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Authored Anthropic owner\", \"schema_version\": 1}}, \"id\": \"a2\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a2\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 2, \"output_tokens\": 777, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"unrelated.third\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"independent-unrelated-third\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a3\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a3\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"First child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-first\", \"kind\": \"agent\", \"name\": \"Child First\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}, {\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Second child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-second\", \"kind\": \"agent\", \"name\": \"Child Second\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-a\", \"type\": \"subagent_pool\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-b-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-b-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-b\", \"type\": \"subagent_pool\"}], \"schema_version\": 1}"
  },
  {
    "case": "duplicate-entry-ids-three",
    "question": "three embedded entries, one id",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [],
    "run": {
      "ok": false,
      "code": "duplicate_name",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        1,
        "id"
      ]
    },
    "document": "{\"edges\": [{\"id\": \"flow-a1\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a2\", \"kind\": \"flow\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"a2\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a3\", \"kind\": \"flow\", \"source_node_id\": \"a2\", \"source_port_id\": \"out\", \"target_node_id\": \"a3\", \"target_port_id\": \"in\"}, {\"id\": \"flow-end\", \"kind\": \"flow\", \"source_node_id\": \"a3\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"attach-pool-a-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-a\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}, {\"id\": \"attach-pool-b-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-b\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a2\", \"target_port_id\": \"attach_bot\"}], \"id\": \"probe-duplicate-entry-ids-three\", \"kind\": \"agent\", \"name\": \"Probe duplicate-entry-ids-three\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a1\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a1\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_b\": {\"type\": \"string\"}}, \"required\": [\"root_b\"], \"type\": \"object\"}, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Authored Anthropic owner\", \"schema_version\": 1}}, \"id\": \"a2\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a2\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 2, \"output_tokens\": 777, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"unrelated.third\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"independent-unrelated-third\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a3\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a3\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Child 0\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-0\", \"kind\": \"agent\", \"name\": \"Child 0\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}, {\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Child 1\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-1\", \"kind\": \"agent\", \"name\": \"Child 1\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}, {\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Child 2\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-2\", \"kind\": \"agent\", \"name\": \"Child 2\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-a\", \"type\": \"subagent_pool\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-b-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-b-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-b\", \"type\": \"subagent_pool\"}], \"schema_version\": 1}"
  },
  {
    "case": "duplicate-entry-names",
    "question": "two embedded entries, one name",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [],
    "run": {
      "ok": false,
      "code": "duplicate_name",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        1,
        "name"
      ]
    },
    "document": "{\"edges\": [{\"id\": \"flow-a1\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a2\", \"kind\": \"flow\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"a2\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a3\", \"kind\": \"flow\", \"source_node_id\": \"a2\", \"source_port_id\": \"out\", \"target_node_id\": \"a3\", \"target_port_id\": \"in\"}, {\"id\": \"flow-end\", \"kind\": \"flow\", \"source_node_id\": \"a3\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"attach-pool-a-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-a\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}, {\"id\": \"attach-pool-b-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-b\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a2\", \"target_port_id\": \"attach_bot\"}], \"id\": \"probe-duplicate-entry-names\", \"kind\": \"agent\", \"name\": \"Probe duplicate-entry-names\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a1\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a1\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_b\": {\"type\": \"string\"}}, \"required\": [\"root_b\"], \"type\": \"object\"}, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Authored Anthropic owner\", \"schema_version\": 1}}, \"id\": \"a2\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a2\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 2, \"output_tokens\": 777, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"unrelated.third\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"independent-unrelated-third\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a3\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a3\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"entry-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"One name\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-0\", \"kind\": \"agent\", \"name\": \"Child 0\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}, {\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"entry-1\", \"memory_policy\": \"scoped_persistent\", \"name\": \"One name\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-1\", \"kind\": \"agent\", \"name\": \"Child 1\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-a\", \"type\": \"subagent_pool\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-b-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-b-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-b\", \"type\": \"subagent_pool\"}], \"schema_version\": 1}"
  },
  {
    "case": "duplicate-child-document-ids",
    "question": "two embedded entries, one child document id",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [],
    "run": {
      "ok": true,
      "code": null,
      "path": null
    },
    "document": "{\"edges\": [{\"id\": \"flow-a1\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a2\", \"kind\": \"flow\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"a2\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a3\", \"kind\": \"flow\", \"source_node_id\": \"a2\", \"source_port_id\": \"out\", \"target_node_id\": \"a3\", \"target_port_id\": \"in\"}, {\"id\": \"flow-end\", \"kind\": \"flow\", \"source_node_id\": \"a3\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"attach-pool-a-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-a\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}, {\"id\": \"attach-pool-b-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-b\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a2\", \"target_port_id\": \"attach_bot\"}], \"id\": \"probe-duplicate-child-document-ids\", \"kind\": \"agent\", \"name\": \"Probe duplicate-child-document-ids\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a1\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a1\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_b\": {\"type\": \"string\"}}, \"required\": [\"root_b\"], \"type\": \"object\"}, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Authored Anthropic owner\", \"schema_version\": 1}}, \"id\": \"a2\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a2\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 2, \"output_tokens\": 777, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"unrelated.third\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"independent-unrelated-third\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a3\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a3\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"entry-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Child 0\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}, {\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"entry-1\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Child 1\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-a\", \"type\": \"subagent_pool\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-b-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-b-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-b\", \"type\": \"subagent_pool\"}], \"schema_version\": 1}"
  },
  {
    "case": "duplicate-child-document-ids-differing",
    "question": "one child document id, two different definitions",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [],
    "run": {
      "ok": false,
      "code": "dependency_conflict",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        1,
        "source"
      ]
    },
    "document": "{\"edges\": [{\"id\": \"flow-a1\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a2\", \"kind\": \"flow\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"a2\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a3\", \"kind\": \"flow\", \"source_node_id\": \"a2\", \"source_port_id\": \"out\", \"target_node_id\": \"a3\", \"target_port_id\": \"in\"}, {\"id\": \"flow-end\", \"kind\": \"flow\", \"source_node_id\": \"a3\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"attach-pool-a-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-a\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}, {\"id\": \"attach-pool-b-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-b\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a2\", \"target_port_id\": \"attach_bot\"}], \"id\": \"probe-duplicate-child-document-ids-differing\", \"kind\": \"agent\", \"name\": \"Probe duplicate-child-document-ids-differing\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a1\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a1\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_b\": {\"type\": \"string\"}}, \"required\": [\"root_b\"], \"type\": \"object\"}, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Authored Anthropic owner\", \"schema_version\": 1}}, \"id\": \"a2\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a2\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 2, \"output_tokens\": 777, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"unrelated.third\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"independent-unrelated-third\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a3\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a3\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"entry-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Child 0\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}, {\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"entry-1\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Child 1\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"A different prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-a\", \"type\": \"subagent_pool\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-b-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-b-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-b\", \"type\": \"subagent_pool\"}], \"schema_version\": 1}"
  }
]);

/* One embedded child per row, mutated in its container or in a value.
   `run.code` is the store's own verdict at Run. */
export const CAPTURED_EMBEDDED_SHAPES = Object.freeze([
  {
    "case": "embedded-nodes-not-a-list",
    "question": "nodes is an object",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [
      {
        "code": "invalid_type",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "nodes"
        ],
        "message": "nodes must be an array"
      }
    ],
    "run": {
      "ok": false,
      "code": "invalid_type",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        0,
        "source",
        "document",
        "nodes"
      ]
    },
    "entry": "{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"the-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"The child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": {\"toString\": null}, \"schema_version\": 1}, \"kind\": \"embedded\"}}"
  },
  {
    "case": "embedded-nodes-a-string",
    "question": "nodes is a string",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [
      {
        "code": "invalid_type",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "nodes"
        ],
        "message": "nodes must be an array"
      }
    ],
    "run": {
      "ok": false,
      "code": "invalid_type",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        0,
        "source",
        "document",
        "nodes"
      ]
    },
    "entry": "{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"the-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"The child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": \"start,end\", \"schema_version\": 1}, \"kind\": \"embedded\"}}"
  },
  {
    "case": "embedded-node-not-an-object",
    "question": "a node is null",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [
      {
        "code": "invalid_type",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "nodes",
          0
        ],
        "message": "expected an object"
      }
    ],
    "run": {
      "ok": false,
      "code": "invalid_type",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        0,
        "source",
        "document",
        "nodes",
        0
      ]
    },
    "entry": "{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"the-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"The child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [null], \"schema_version\": 1}, \"kind\": \"embedded\"}}"
  },
  {
    "case": "embedded-node-id-not-text",
    "question": "a node id is an object",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [
      {
        "code": "invalid_type",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "nodes",
          0,
          "id"
        ],
        "message": "node id must be a string"
      }
    ],
    "run": {
      "ok": false,
      "code": "invalid_type",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        0,
        "source",
        "document",
        "nodes",
        0,
        "id"
      ]
    },
    "entry": "{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"the-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"The child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": {\"toString\": null}, \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}"
  },
  {
    "case": "embedded-node-type-not-text",
    "question": "a node type is an object",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [
      {
        "code": "invalid_type",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "nodes",
          0,
          "type"
        ],
        "message": "node type must be a string"
      }
    ],
    "run": {
      "ok": false,
      "code": "invalid_type",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        0,
        "source",
        "document",
        "nodes",
        0,
        "type"
      ]
    },
    "entry": "{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"the-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"The child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": {\"toString\": null}}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}"
  },
  {
    "case": "embedded-edges-not-a-list",
    "question": "edges is an object",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [
      {
        "code": "invalid_type",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "edges"
        ],
        "message": "edges must be an array"
      }
    ],
    "run": {
      "ok": false,
      "code": "invalid_type",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        0,
        "source",
        "document",
        "edges"
      ]
    },
    "entry": "{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"the-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"The child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": {}, \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}"
  },
  {
    "case": "embedded-edge-not-an-object",
    "question": "an edge is a string",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [
      {
        "code": "invalid_type",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "edges",
          0
        ],
        "message": "expected an object"
      }
    ],
    "run": {
      "ok": false,
      "code": "invalid_type",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        0,
        "source",
        "document",
        "edges",
        0
      ]
    },
    "entry": "{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"the-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"The child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [\"flow-a1\"], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}"
  },
  {
    "case": "embedded-edge-id-not-text",
    "question": "an edge id is an object",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [
      {
        "code": "invalid_type",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "edges",
          0,
          "id"
        ],
        "message": "edge id must be a string"
      }
    ],
    "run": {
      "ok": false,
      "code": "invalid_type",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        0,
        "source",
        "document",
        "edges",
        0,
        "id"
      ]
    },
    "entry": "{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"the-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"The child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": {\"toString\": null}, \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}"
  },
  {
    "case": "embedded-edge-endpoint-not-text",
    "question": "an edge source node id is an object",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [
      {
        "code": "invalid_type",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "edges",
          0,
          "source_node_id"
        ],
        "message": "source_node_id must be a string"
      }
    ],
    "run": {
      "ok": false,
      "code": "invalid_type",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        0,
        "source",
        "document",
        "edges",
        0,
        "source_node_id"
      ]
    },
    "entry": "{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"the-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"The child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": {\"toString\": null}, \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}"
  },
  {
    "case": "embedded-edge-port-not-text",
    "question": "an edge source port id is an object",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [
      {
        "code": "invalid_type",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "edges",
          0,
          "source_port_id"
        ],
        "message": "source_port_id must be a string"
      }
    ],
    "run": {
      "ok": false,
      "code": "invalid_type",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        0,
        "source",
        "document",
        "edges",
        0,
        "source_port_id"
      ]
    },
    "entry": "{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"the-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"The child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": {\"toString\": null}, \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}"
  },
  {
    "case": "embedded-node-config-not-an-object",
    "question": "a node config is a string",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [
      {
        "code": "invalid_type",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "nodes",
          0,
          "config"
        ],
        "message": "node config must be an object"
      }
    ],
    "run": {
      "ok": false,
      "code": "invalid_type",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        0,
        "source",
        "document",
        "nodes",
        0,
        "config"
      ]
    },
    "entry": "{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"the-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"The child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": \"nothing\", \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}"
  },
  {
    "case": "embedded-node-id-empty",
    "question": "a node id is the empty string",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [
      {
        "code": "invalid_value",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "nodes",
          0,
          "id"
        ],
        "message": "node id must be non-empty"
      }
    ],
    "run": {
      "ok": false,
      "code": "invalid_value",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        0,
        "source",
        "document",
        "nodes",
        0,
        "id"
      ]
    },
    "entry": "{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"the-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"The child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}"
  },
  {
    "case": "embedded-node-type-unknown",
    "question": "a node type is not one the schema knows",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [
      {
        "code": "unknown_variant",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "nodes",
          0,
          "type"
        ],
        "message": "unknown node type"
      }
    ],
    "run": {
      "ok": false,
      "code": "unknown_variant",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        0,
        "source",
        "document",
        "nodes",
        0,
        "type"
      ]
    },
    "entry": "{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"the-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"The child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"daydream\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}"
  },
  {
    "case": "embedded-duplicate-node-ids",
    "question": "two nodes share an id",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [
      {
        "code": "duplicate_name",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "nodes",
          1,
          "id"
        ],
        "message": "node id is duplicated"
      }
    ],
    "run": {
      "ok": false,
      "code": "duplicate_name",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        0,
        "source",
        "document",
        "nodes",
        1,
        "id"
      ]
    },
    "entry": "{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"the-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"The child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"start\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}"
  },
  {
    "case": "embedded-edge-endpoint-missing",
    "question": "an edge names a node that is not there",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [
      {
        "code": "missing_value",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "edges",
          0,
          "source_node_id"
        ],
        "message": "edge source node is unavailable"
      }
    ],
    "run": {
      "ok": false,
      "code": "missing_value",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        0,
        "source",
        "document",
        "edges",
        0,
        "source_node_id"
      ]
    },
    "entry": "{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"the-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"The child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"nowhere\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}"
  },
  {
    "case": "embedded-no-nodes-at-all",
    "question": "the child holds no nodes and no edges",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [
      {
        "code": "start_count",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "nodes"
        ],
        "message": "graph requires exactly one start node"
      },
      {
        "code": "end_count",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "nodes"
        ],
        "message": "graph requires exactly one end node"
      },
      {
        "code": "agent_required",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "nodes"
        ],
        "message": "agent graph requires an agent node"
      }
    ],
    "run": {
      "ok": false,
      "code": "start_count",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        0,
        "source",
        "document",
        "nodes"
      ]
    },
    "entry": "{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"the-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"The child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [], \"schema_version\": 1}, \"kind\": \"embedded\"}}"
  },
  {
    "case": "embedded-no-end-node",
    "question": "the child has no End",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [
      {
        "code": "end_count",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "nodes"
        ],
        "message": "graph requires exactly one end node"
      },
      {
        "code": "flow_output_required",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "nodes",
          1
        ],
        "message": "execution node requires flow output"
      }
    ],
    "run": {
      "ok": false,
      "code": "end_count",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        0,
        "source",
        "document",
        "nodes"
      ]
    },
    "entry": "{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"the-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"The child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}"
  }
]);
