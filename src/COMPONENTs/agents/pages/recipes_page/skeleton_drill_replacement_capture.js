/* What the real store says about a node's fields, a child graph's identity,
 * and the values a drawing reads a table with.
 *
 * Machine-written by `write_capture.py` from `envelope_probe.py` and
 * `residual_probe.py`, each of which runs `SkeletonResourceStore` against the
 * installed wheel of the fixed pair. Do not edit by hand: every row is one
 * `save_draft` + `get_resource` + `preflight`, and a row written here by hand
 * would be this editor agreeing with itself.
 *
 *   `ENVELOPE_ROWS` — the drawings read a node's own `label` and `model`. Are
 *      those part of a node? No, twice over: a PARENT document carrying any
 *      other key is refused by `save_draft` itself, and inside an embedded
 *      child — where the draft check now looks, so the draft carries the
 *      child's own problem at its full path and comes back verbatim — Run
 *      refuses the key with
 *      `unknown_field` AT that key, whatever its value. `label: "Child label"`
 *      is refused exactly like `label: {"toString": null}`. Junk INSIDE the
 *      envelope (`config.kernel.profile.model`) is a value problem, which
 *      opens. The same rows show every graph the store would run has a
 *      non-empty string `id`.
 *
 *   `IDENTITY_ROWS` — two entries can share BOTH their `entry.id` and their
 *      `source.document.id` while naming different graphs. The store keeps
 *      that draft verbatim. So one surviving graph-id match after another
 *      entry was deleted proves nothing about which entry the author clicked,
 *      and a graph id may only carry a step that it NAMED when the step was
 *      taken. Run refuses the pair — `duplicate_name` at the second entry's
 *      id, and `dependency_conflict` once the entry ids are repaired — which
 *      is not permission for the editor to guess.
 *
 *   `LOOKUP_ROWS` — a node's `type` and `id` are whatever the draft holds, and
 *      both are read as table keys by the drawings. A type naming a member of
 *      `Object.prototype` is stored and refused at Run (`unknown_variant`); an
 *      ID naming one is stored and **runs**. A plain `table[key]` answers
 *      those with an inherited member, which is an object, so every guard
 *      testing for one passes.
 *
 * `REPLACEMENT_CASES` is the sequence itself, performed by the store: the
 * parent at `edit-1`, the version another editor stored at `edit-2` with the
 * pool rearranged, and the `edit_conflict` the first editor's save really
 * receives. The documents are the stored JSON as text, so the page is driven
 * by the same bytes the store held. */

export const REPLACEMENT_CAPTURE_IDENTITY = Object.freeze({
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

/* The second probe ran against the same pair; its own reading of the
   installed artefacts is kept beside the first so a drift between the
   two runs would be visible rather than averaged. */
export const LOOKUP_CAPTURE_IDENTITY = Object.freeze({
  "interpreter": "3.12.10",
  "manifest_digest": "sha256:f6daf3894dd947723ee7dc60392277896b88c4890d35373b26442a1833a28101",
  "manifest_digest_expected": "sha256:f6daf3894dd947723ee7dc60392277896b88c4890d35373b26442a1833a28101",
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

/* One mutated draft per row: what `save_draft` did with it, whether it
   came back verbatim, and the store's own verdict at Run. */
export const ENVELOPE_ROWS = Object.freeze([
  {
    "case": "parent_node_label_text",
    "question": "a stored parent node carrying a legacy `label`",
    "saved": false,
    "save_refused": {
      "code": "unknown_field",
      "path": [
        "document",
        "nodes",
        1,
        "label"
      ]
    },
    "draft_diagnostics": null,
    "round_trip": null,
    "run": null,
    "entries": null
  },
  {
    "case": "parent_node_label_unreadable",
    "question": "the same, with a label that refuses to become text",
    "saved": false,
    "save_refused": {
      "code": "unknown_field",
      "path": [
        "document",
        "nodes",
        1,
        "label"
      ]
    },
    "draft_diagnostics": null,
    "round_trip": null,
    "run": null,
    "entries": null
  },
  {
    "case": "child_node_label_unreadable",
    "question": "the review's case: an embedded child's Agent node with label {toString:null}",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [
      {
        "code": "unknown_field",
        "message": "unknown field",
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
          "label"
        ]
      }
    ],
    "round_trip": true,
    "run": {
      "ok": false,
      "code": "unknown_field",
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
        "label"
      ]
    },
    "entries": "[{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-a-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"label\": {\"toString\": null}, \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]"
  },
  {
    "case": "child_node_label_text",
    "question": "the same shape with an innocent string, so the verdict is about the key",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [
      {
        "code": "unknown_field",
        "message": "unknown field",
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
          "label"
        ]
      }
    ],
    "round_trip": true,
    "run": {
      "ok": false,
      "code": "unknown_field",
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
        "label"
      ]
    },
    "entries": "[{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-a-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"label\": \"Child label\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]"
  },
  {
    "case": "child_node_model_unreadable",
    "question": "the sibling the same drawing reads: `model`",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [
      {
        "code": "unknown_field",
        "message": "unknown field",
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
          "model"
        ]
      }
    ],
    "round_trip": true,
    "run": {
      "ok": false,
      "code": "unknown_field",
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
        "model"
      ]
    },
    "entries": "[{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-a-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"model\": {\"toString\": null}, \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]"
  },
  {
    "case": "child_node_override_unreadable",
    "question": "the other sibling: `override.model`",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [
      {
        "code": "unknown_field",
        "message": "unknown field",
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
          "override"
        ]
      }
    ],
    "round_trip": true,
    "run": {
      "ok": false,
      "code": "unknown_field",
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
        "override"
      ]
    },
    "entries": "[{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-a-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"override\": {\"model\": {\"toString\": null}}, \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]"
  },
  {
    "case": "node_toolkits_unreadable",
    "question": "what the toolkit drawing counts: `toolkits`, on a stored pool node",
    "saved": false,
    "save_refused": {
      "code": "unknown_field",
      "path": [
        "document",
        "nodes",
        5,
        "toolkits"
      ]
    },
    "draft_diagnostics": null,
    "round_trip": null,
    "run": null,
    "entries": null
  },
  {
    "case": "node_subagents_unreadable",
    "question": "what the pool drawing lists when handed a legacy node: `subagents`",
    "saved": false,
    "save_refused": {
      "code": "unknown_field",
      "path": [
        "document",
        "nodes",
        5,
        "subagents"
      ]
    },
    "draft_diagnostics": null,
    "round_trip": null,
    "run": null,
    "entries": null
  },
  {
    "case": "child_node_position",
    "question": "a drawn coordinate on the node itself",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [
      {
        "code": "unknown_field",
        "message": "unknown field",
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
          "x"
        ]
      }
    ],
    "round_trip": true,
    "run": {
      "ok": false,
      "code": "unknown_field",
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
        "x"
      ]
    },
    "entries": null
  },
  {
    "case": "child_kernel_model_unreadable",
    "question": "junk INSIDE the envelope, which the drawing never reads",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [],
    "round_trip": true,
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
        1,
        "config",
        "kernel",
        "profile",
        "model"
      ]
    },
    "entries": "[{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-a-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": {\"toString\": null}, \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]"
  },
  {
    "case": "child_document_id_missing",
    "question": "an embedded child with no id at all",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [
      {
        "code": "missing_field",
        "message": "required field is missing",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "id"
        ]
      }
    ],
    "round_trip": true,
    "run": {
      "ok": false,
      "code": "missing_field",
      "path": [
        "document",
        "nodes",
        5,
        "config",
        "subagents",
        0,
        "source",
        "document",
        "id"
      ]
    },
    "entries": null
  },
  {
    "case": "child_document_id_unreadable",
    "question": "an embedded child whose id is not text",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [
      {
        "code": "invalid_type",
        "message": "id must be a string",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "id"
        ]
      }
    ],
    "round_trip": true,
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
        "id"
      ]
    },
    "entries": null
  },
  {
    "case": "child_document_id_number",
    "question": "an embedded child whose id is a number",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [
      {
        "code": "invalid_type",
        "message": "id must be a string",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "id"
        ]
      }
    ],
    "round_trip": true,
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
        "id"
      ]
    },
    "entries": null
  },
  {
    "case": "child_document_id_empty",
    "question": "an embedded child whose id is empty",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [
      {
        "code": "invalid_value",
        "message": "id must be non-empty",
        "path": [
          "document",
          "nodes",
          5,
          "config",
          "subagents",
          0,
          "source",
          "document",
          "id"
        ]
      }
    ],
    "round_trip": true,
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
        "id"
      ]
    },
    "entries": null
  },
  {
    "case": "duplicate_entry_ids_distinct_graphs",
    "question": "two entries under one id, each a different graph",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [],
    "round_trip": true,
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
    "entries": null
  },
  {
    "case": "duplicate_entry_ids_one_graph_identical",
    "question": "two entries under one id, both naming one graph, identical",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [],
    "round_trip": true,
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
    "entries": null
  },
  {
    "case": "duplicate_entry_ids_one_graph_differing",
    "question": "two entries under one id, both naming one graph, differing",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [],
    "round_trip": true,
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
    "entries": null
  },
  {
    "case": "repaired_entry_ids_distinct_graphs",
    "question": "the repair's target state: distinct entry ids, distinct graphs",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [],
    "round_trip": true,
    "run": {
      "ok": true,
      "code": null,
      "path": null
    },
    "entries": null
  },
  {
    "case": "distinct_entry_ids_one_graph_differing",
    "question": "distinct entry ids but one graph id with two definitions",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [],
    "round_trip": true,
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
    "entries": null
  }
]);

/* What two entries may share, and what Run then says about the pair. */
export const IDENTITY_ROWS = Object.freeze([
  {
    "case": "equal_entry_and_graph_ids",
    "question": "two entries sharing entry id AND graph id, different names and prompts",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [],
    "round_trip": true,
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
    "entries": null
  },
  {
    "case": "equal_graph_ids_distinct_entry_ids",
    "question": "the same pair after the entry ids are repaired",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [],
    "round_trip": true,
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
    "entries": null
  }
]);

/* A node's own type and id, naming members of `Object.prototype`. */
export const LOOKUP_ROWS = Object.freeze([
  {
    "case": "node_type_proto",
    "question": "a child node whose type names a member of Object.prototype",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [
      {
        "code": "unknown_variant",
        "message": "unknown node type",
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
          "type"
        ]
      }
    ],
    "round_trip": true,
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
        1,
        "type"
      ]
    },
    "entries": "[{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-a-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"__proto__\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]"
  },
  {
    "case": "node_type_constructor",
    "question": "a child node whose type names a member of Object.prototype",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [
      {
        "code": "unknown_variant",
        "message": "unknown node type",
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
          "type"
        ]
      }
    ],
    "round_trip": true,
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
        1,
        "type"
      ]
    },
    "entries": null
  },
  {
    "case": "node_type_toString",
    "question": "a child node whose type names a member of Object.prototype",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [
      {
        "code": "unknown_variant",
        "message": "unknown node type",
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
          "type"
        ]
      }
    ],
    "round_trip": true,
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
        1,
        "type"
      ]
    },
    "entries": null
  },
  {
    "case": "node_type_hasOwnProperty",
    "question": "a child node whose type names a member of Object.prototype",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [
      {
        "code": "unknown_variant",
        "message": "unknown node type",
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
          "type"
        ]
      }
    ],
    "round_trip": true,
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
        1,
        "type"
      ]
    },
    "entries": null
  },
  {
    "case": "node_id_proto",
    "question": "a child node whose id names a member of Object.prototype",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [],
    "round_trip": true,
    "run": {
      "ok": true,
      "code": null,
      "path": null
    },
    "entries": "[{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-a-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"__proto__\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"__proto__\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-a-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"__proto__\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"__proto__\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"__proto__\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]"
  },
  {
    "case": "node_id_constructor",
    "question": "a child node whose id names a member of Object.prototype",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [],
    "round_trip": true,
    "run": {
      "ok": true,
      "code": null,
      "path": null
    },
    "entries": null
  },
  {
    "case": "node_id_toString",
    "question": "a child node whose id names a member of Object.prototype",
    "saved": true,
    "save_refused": null,
    "draft_diagnostics": [],
    "round_trip": true,
    "run": {
      "ok": true,
      "code": null,
      "path": null
    },
    "entries": null
  }
]);

/* The external replacement, as the store performed it. `old` is what the
   author opened, `new` is what the other editor stored at the token the
   author holds, `conflict` is the refusal the author's own save gets. */
export const REPLACEMENT_CASES = Object.freeze({
  "removed_chosen": {
    "old": "{\"archived\": false, \"description\": \"\", \"diagnostics\": [], \"document\": {\"edges\": [{\"id\": \"flow-a1\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a2\", \"kind\": \"flow\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"a2\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a3\", \"kind\": \"flow\", \"source_node_id\": \"a2\", \"source_port_id\": \"out\", \"target_node_id\": \"a3\", \"target_port_id\": \"in\"}, {\"id\": \"flow-end\", \"kind\": \"flow\", \"source_node_id\": \"a3\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"attach-pool-a-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-a\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}, {\"id\": \"attach-pool-b-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-b\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a2\", \"target_port_id\": \"attach_bot\"}], \"id\": \"ac8-removed_chosen\", \"kind\": \"agent\", \"name\": \"Identity removed_chosen\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a1\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a1\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_b\": {\"type\": \"string\"}}, \"required\": [\"root_b\"], \"type\": \"object\"}, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Authored Anthropic owner\", \"schema_version\": 1}}, \"id\": \"a2\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a2\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 2, \"output_tokens\": 777, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"unrelated.third\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"independent-unrelated-third\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a3\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a3\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"First child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-first\", \"kind\": \"agent\", \"name\": \"Child First\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}, {\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Second child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-second\", \"kind\": \"agent\", \"name\": \"Child Second\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-a\", \"type\": \"subagent_pool\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-b-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-b-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-b\", \"type\": \"subagent_pool\"}], \"schema_version\": 1}, \"draft_digest\": \"75bb7a7112edfd166eb87b7f472050fbdd20be67709b233497a3024a24c617e2\", \"edit_token\": \"edit-1-75bb7a7112edfd166eb87b7f\", \"id\": \"ac8-removed_chosen\", \"kind\": \"agent\", \"name\": \"Identity removed_chosen\", \"source_identity\": null}",
    "new": "{\"archived\": false, \"description\": \"\", \"diagnostics\": [], \"document\": {\"edges\": [{\"id\": \"flow-a1\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a2\", \"kind\": \"flow\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"a2\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a3\", \"kind\": \"flow\", \"source_node_id\": \"a2\", \"source_port_id\": \"out\", \"target_node_id\": \"a3\", \"target_port_id\": \"in\"}, {\"id\": \"flow-end\", \"kind\": \"flow\", \"source_node_id\": \"a3\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"attach-pool-a-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-a\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}, {\"id\": \"attach-pool-b-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-b\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a2\", \"target_port_id\": \"attach_bot\"}], \"id\": \"ac8-removed_chosen\", \"kind\": \"agent\", \"name\": \"Identity removed_chosen\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a1\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a1\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_b\": {\"type\": \"string\"}}, \"required\": [\"root_b\"], \"type\": \"object\"}, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Authored Anthropic owner\", \"schema_version\": 1}}, \"id\": \"a2\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a2\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 2, \"output_tokens\": 777, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"unrelated.third\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"independent-unrelated-third\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a3\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a3\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"First child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-first\", \"kind\": \"agent\", \"name\": \"Child First\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-a\", \"type\": \"subagent_pool\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-b-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-b-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-b\", \"type\": \"subagent_pool\"}], \"schema_version\": 1}, \"draft_digest\": \"4cefbddba2fd5ff076c12c9567e387a1775e70b2d9340d3a2b13ddcd9ae5d35e\", \"edit_token\": \"edit-2-4cefbddba2fd5ff076c12c95\", \"id\": \"ac8-removed_chosen\", \"kind\": \"agent\", \"name\": \"Identity removed_chosen\", \"source_identity\": null}",
    "conflict": {
      "code": "edit_conflict",
      "message": "resource changed in another editor",
      "path": [
        "expected_edit_token"
      ]
    },
    "first_diagnostics": []
  },
  "removed_other": {
    "old": "{\"archived\": false, \"description\": \"\", \"diagnostics\": [], \"document\": {\"edges\": [{\"id\": \"flow-a1\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a2\", \"kind\": \"flow\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"a2\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a3\", \"kind\": \"flow\", \"source_node_id\": \"a2\", \"source_port_id\": \"out\", \"target_node_id\": \"a3\", \"target_port_id\": \"in\"}, {\"id\": \"flow-end\", \"kind\": \"flow\", \"source_node_id\": \"a3\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"attach-pool-a-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-a\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}, {\"id\": \"attach-pool-b-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-b\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a2\", \"target_port_id\": \"attach_bot\"}], \"id\": \"ac8-removed_other\", \"kind\": \"agent\", \"name\": \"Identity removed_other\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a1\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a1\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_b\": {\"type\": \"string\"}}, \"required\": [\"root_b\"], \"type\": \"object\"}, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Authored Anthropic owner\", \"schema_version\": 1}}, \"id\": \"a2\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a2\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 2, \"output_tokens\": 777, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"unrelated.third\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"independent-unrelated-third\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a3\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a3\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"First child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-first\", \"kind\": \"agent\", \"name\": \"Child First\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}, {\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Second child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-second\", \"kind\": \"agent\", \"name\": \"Child Second\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-a\", \"type\": \"subagent_pool\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-b-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-b-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-b\", \"type\": \"subagent_pool\"}], \"schema_version\": 1}, \"draft_digest\": \"54e212f26fbdbc6372d7b1a696c42928bb3cdac2725322d4d8b69c6a9f60fc38\", \"edit_token\": \"edit-1-54e212f26fbdbc6372d7b1a6\", \"id\": \"ac8-removed_other\", \"kind\": \"agent\", \"name\": \"Identity removed_other\", \"source_identity\": null}",
    "new": "{\"archived\": false, \"description\": \"\", \"diagnostics\": [], \"document\": {\"edges\": [{\"id\": \"flow-a1\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a2\", \"kind\": \"flow\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"a2\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a3\", \"kind\": \"flow\", \"source_node_id\": \"a2\", \"source_port_id\": \"out\", \"target_node_id\": \"a3\", \"target_port_id\": \"in\"}, {\"id\": \"flow-end\", \"kind\": \"flow\", \"source_node_id\": \"a3\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"attach-pool-a-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-a\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}, {\"id\": \"attach-pool-b-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-b\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a2\", \"target_port_id\": \"attach_bot\"}], \"id\": \"ac8-removed_other\", \"kind\": \"agent\", \"name\": \"Identity removed_other\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a1\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a1\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_b\": {\"type\": \"string\"}}, \"required\": [\"root_b\"], \"type\": \"object\"}, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Authored Anthropic owner\", \"schema_version\": 1}}, \"id\": \"a2\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a2\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 2, \"output_tokens\": 777, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"unrelated.third\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"independent-unrelated-third\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a3\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a3\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Second child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-second\", \"kind\": \"agent\", \"name\": \"Child Second\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-a\", \"type\": \"subagent_pool\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-b-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-b-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-b\", \"type\": \"subagent_pool\"}], \"schema_version\": 1}, \"draft_digest\": \"773a7dabebb922c20a538664797e8168698aab0614242d29b53f9440ba400d51\", \"edit_token\": \"edit-2-773a7dabebb922c20a538664\", \"id\": \"ac8-removed_other\", \"kind\": \"agent\", \"name\": \"Identity removed_other\", \"source_identity\": null}",
    "conflict": {
      "code": "edit_conflict",
      "message": "resource changed in another editor",
      "path": [
        "expected_edit_token"
      ]
    },
    "first_diagnostics": []
  },
  "reordered": {
    "old": "{\"archived\": false, \"description\": \"\", \"diagnostics\": [], \"document\": {\"edges\": [{\"id\": \"flow-a1\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a2\", \"kind\": \"flow\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"a2\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a3\", \"kind\": \"flow\", \"source_node_id\": \"a2\", \"source_port_id\": \"out\", \"target_node_id\": \"a3\", \"target_port_id\": \"in\"}, {\"id\": \"flow-end\", \"kind\": \"flow\", \"source_node_id\": \"a3\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"attach-pool-a-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-a\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}, {\"id\": \"attach-pool-b-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-b\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a2\", \"target_port_id\": \"attach_bot\"}], \"id\": \"ac8-reordered\", \"kind\": \"agent\", \"name\": \"Identity reordered\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a1\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a1\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_b\": {\"type\": \"string\"}}, \"required\": [\"root_b\"], \"type\": \"object\"}, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Authored Anthropic owner\", \"schema_version\": 1}}, \"id\": \"a2\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a2\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 2, \"output_tokens\": 777, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"unrelated.third\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"independent-unrelated-third\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a3\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a3\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"First child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-first\", \"kind\": \"agent\", \"name\": \"Child First\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}, {\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Second child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-second\", \"kind\": \"agent\", \"name\": \"Child Second\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-a\", \"type\": \"subagent_pool\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-b-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-b-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-b\", \"type\": \"subagent_pool\"}], \"schema_version\": 1}, \"draft_digest\": \"a60d7dfdccbcce18cfcfdfa516307ec3f5d59c71bf4ab21eee44497fea64ea1a\", \"edit_token\": \"edit-1-a60d7dfdccbcce18cfcfdfa5\", \"id\": \"ac8-reordered\", \"kind\": \"agent\", \"name\": \"Identity reordered\", \"source_identity\": null}",
    "new": "{\"archived\": false, \"description\": \"\", \"diagnostics\": [], \"document\": {\"edges\": [{\"id\": \"flow-a1\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a2\", \"kind\": \"flow\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"a2\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a3\", \"kind\": \"flow\", \"source_node_id\": \"a2\", \"source_port_id\": \"out\", \"target_node_id\": \"a3\", \"target_port_id\": \"in\"}, {\"id\": \"flow-end\", \"kind\": \"flow\", \"source_node_id\": \"a3\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"attach-pool-a-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-a\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}, {\"id\": \"attach-pool-b-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-b\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a2\", \"target_port_id\": \"attach_bot\"}], \"id\": \"ac8-reordered\", \"kind\": \"agent\", \"name\": \"Identity reordered\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a1\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a1\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_b\": {\"type\": \"string\"}}, \"required\": [\"root_b\"], \"type\": \"object\"}, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Authored Anthropic owner\", \"schema_version\": 1}}, \"id\": \"a2\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a2\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 2, \"output_tokens\": 777, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"unrelated.third\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"independent-unrelated-third\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a3\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a3\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Second child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-second\", \"kind\": \"agent\", \"name\": \"Child Second\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}, {\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"First child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-first\", \"kind\": \"agent\", \"name\": \"Child First\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-a\", \"type\": \"subagent_pool\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-b-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-b-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-b\", \"type\": \"subagent_pool\"}], \"schema_version\": 1}, \"draft_digest\": \"7eaaeb1f5c27632f40438e8d9b1c35830d4a0fbf7e400bc9dd2336a86532e9fb\", \"edit_token\": \"edit-2-7eaaeb1f5c27632f40438e8d\", \"id\": \"ac8-reordered\", \"kind\": \"agent\", \"name\": \"Identity reordered\", \"source_identity\": null}",
    "conflict": {
      "code": "edit_conflict",
      "message": "resource changed in another editor",
      "path": [
        "expected_edit_token"
      ]
    },
    "first_diagnostics": []
  },
  "equal_graph_id_removed_chosen": {
    "old": "{\"archived\": false, \"description\": \"\", \"diagnostics\": [], \"document\": {\"edges\": [{\"id\": \"flow-a1\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a2\", \"kind\": \"flow\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"a2\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a3\", \"kind\": \"flow\", \"source_node_id\": \"a2\", \"source_port_id\": \"out\", \"target_node_id\": \"a3\", \"target_port_id\": \"in\"}, {\"id\": \"flow-end\", \"kind\": \"flow\", \"source_node_id\": \"a3\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"attach-pool-a-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-a\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}, {\"id\": \"attach-pool-b-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-b\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a2\", \"target_port_id\": \"attach_bot\"}], \"id\": \"ac8r3-equal-graph-id\", \"kind\": \"agent\", \"name\": \"Equal graph ids\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a1\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a1\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_b\": {\"type\": \"string\"}}, \"required\": [\"root_b\"], \"type\": \"object\"}, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Authored Anthropic owner\", \"schema_version\": 1}}, \"id\": \"a2\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a2\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 2, \"output_tokens\": 777, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"unrelated.third\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"independent-unrelated-third\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a3\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a3\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"First child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-first\", \"kind\": \"agent\", \"name\": \"Child First\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}, {\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Second child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-first\", \"kind\": \"agent\", \"name\": \"Child Second\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"A different prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-a\", \"type\": \"subagent_pool\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-b-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-b-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-b\", \"type\": \"subagent_pool\"}], \"schema_version\": 1}, \"draft_digest\": \"c04646ed419eaa65b8f3eb05cb2357d0ff30e4d96bb10e2969804c07ce183cfb\", \"edit_token\": \"edit-1-c04646ed419eaa65b8f3eb05\", \"id\": \"ac8r3-equal-graph-id\", \"kind\": \"agent\", \"name\": \"Equal graph ids\", \"source_identity\": null}",
    "new": "{\"archived\": false, \"description\": \"\", \"diagnostics\": [], \"document\": {\"edges\": [{\"id\": \"flow-a1\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a2\", \"kind\": \"flow\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"a2\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a3\", \"kind\": \"flow\", \"source_node_id\": \"a2\", \"source_port_id\": \"out\", \"target_node_id\": \"a3\", \"target_port_id\": \"in\"}, {\"id\": \"flow-end\", \"kind\": \"flow\", \"source_node_id\": \"a3\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"attach-pool-a-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-a\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}, {\"id\": \"attach-pool-b-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-b\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a2\", \"target_port_id\": \"attach_bot\"}], \"id\": \"ac8r3-equal-graph-id\", \"kind\": \"agent\", \"name\": \"Equal graph ids\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a1\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a1\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_b\": {\"type\": \"string\"}}, \"required\": [\"root_b\"], \"type\": \"object\"}, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Authored Anthropic owner\", \"schema_version\": 1}}, \"id\": \"a2\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a2\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 2, \"output_tokens\": 777, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"unrelated.third\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"independent-unrelated-third\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a3\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a3\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"First child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-first\", \"kind\": \"agent\", \"name\": \"Child First\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-a\", \"type\": \"subagent_pool\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-b-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-b-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-b\", \"type\": \"subagent_pool\"}], \"schema_version\": 1}, \"draft_digest\": \"b7d60188a477ed833efee7720c32e4003c84de4f60b96662e7a947a4ede060d4\", \"edit_token\": \"edit-2-b7d60188a477ed833efee772\", \"id\": \"ac8r3-equal-graph-id\", \"kind\": \"agent\", \"name\": \"Equal graph ids\", \"source_identity\": null}",
    "conflict": {
      "code": "edit_conflict",
      "message": "resource changed in another editor",
      "path": [
        "expected_edit_token"
      ]
    },
    "first_diagnostics": []
  },
  "pending_reference": {
    "old": "{\"archived\": false, \"description\": \"\", \"diagnostics\": [], \"document\": {\"edges\": [{\"id\": \"flow-a1\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a2\", \"kind\": \"flow\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"a2\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a3\", \"kind\": \"flow\", \"source_node_id\": \"a2\", \"source_port_id\": \"out\", \"target_node_id\": \"a3\", \"target_port_id\": \"in\"}, {\"id\": \"flow-end\", \"kind\": \"flow\", \"source_node_id\": \"a3\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"attach-pool-a-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-a\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}, {\"id\": \"attach-pool-b-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-b\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a2\", \"target_port_id\": \"attach_bot\"}], \"id\": \"ac8r3-pending-reference\", \"kind\": \"agent\", \"name\": \"Pending reference parent\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a1\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a1\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_b\": {\"type\": \"string\"}}, \"required\": [\"root_b\"], \"type\": \"object\"}, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Authored Anthropic owner\", \"schema_version\": 1}}, \"id\": \"a2\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a2\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 2, \"output_tokens\": 777, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"unrelated.third\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"independent-unrelated-third\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a3\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a3\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"First child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-first\", \"kind\": \"agent\", \"name\": \"Child First\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}, {\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Second child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"attach-inner-ref\", \"kind\": \"attach\", \"source_node_id\": \"inner-ref-pool\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"agent\", \"target_port_id\": \"attach_bot\"}], \"id\": \"child-second\", \"kind\": \"agent\", \"name\": \"Child Second\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"inner-ref-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Referenced child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"agent_id\": \"ac8r3-referenced-agent\", \"kind\": \"agent_ref\"}}]}, \"id\": \"inner-ref-pool\", \"type\": \"subagent_pool\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-a\", \"type\": \"subagent_pool\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-b-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-b-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-b\", \"type\": \"subagent_pool\"}], \"schema_version\": 1}, \"draft_digest\": \"352896ccf3b576f39e3c863ea95e347d9eccf7001bc84220cf2848b2ffcdc7af\", \"edit_token\": \"edit-1-352896ccf3b576f39e3c863e\", \"id\": \"ac8r3-pending-reference\", \"kind\": \"agent\", \"name\": \"Pending reference parent\", \"source_identity\": null}",
    "new": "{\"archived\": false, \"description\": \"\", \"diagnostics\": [], \"document\": {\"edges\": [{\"id\": \"flow-a1\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"a1\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a2\", \"kind\": \"flow\", \"source_node_id\": \"a1\", \"source_port_id\": \"out\", \"target_node_id\": \"a2\", \"target_port_id\": \"in\"}, {\"id\": \"flow-a3\", \"kind\": \"flow\", \"source_node_id\": \"a2\", \"source_port_id\": \"out\", \"target_node_id\": \"a3\", \"target_port_id\": \"in\"}, {\"id\": \"flow-end\", \"kind\": \"flow\", \"source_node_id\": \"a3\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}, {\"id\": \"attach-pool-a-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-a\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a1\", \"target_port_id\": \"attach_bot\"}, {\"id\": \"attach-pool-b-0\", \"kind\": \"attach\", \"source_node_id\": \"pool-b\", \"source_port_id\": \"attach_top\", \"target_node_id\": \"a2\", \"target_port_id\": \"attach_bot\"}], \"id\": \"ac8r3-pending-reference\", \"kind\": \"agent\", \"name\": \"Pending reference parent\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a1\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a1\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_b\": {\"type\": \"string\"}}, \"required\": [\"root_b\"], \"type\": \"object\"}, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Authored Anthropic owner\", \"schema_version\": 1}}, \"id\": \"a2\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a2\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": {\"additionalProperties\": false, \"properties\": {\"root_a\": {\"type\": \"string\"}}, \"required\": [\"root_a\"], \"type\": \"object\"}, \"max_iterations\": 2, \"output_tokens\": 777, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"unrelated.third\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"independent-unrelated-third\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Authored OpenAI owner\", \"schema_version\": 1}}, \"id\": \"a3\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"a3\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"duplicated-entry\", \"memory_policy\": \"scoped_persistent\", \"name\": \"First child\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"child-first\", \"kind\": \"agent\", \"name\": \"Child First\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-a\", \"type\": \"subagent_pool\"}, {\"config\": {\"subagents\": [{\"allowed_modes\": [\"handoff\"], \"allowed_tools\": [], \"description\": \"Child own description\", \"disabled_tools\": [\"delete\"], \"id\": \"legacy-pool-b-0\", \"memory_policy\": \"scoped_persistent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"output_mode\": \"full_trace\", \"parallel_safe\": false, \"source\": {\"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"embedded-pool-b-0\", \"kind\": \"agent\", \"name\": \"Literal child:\\nmodel: not-metadata\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"none\", \"json_schema\": null, \"max_iterations\": 6, \"output_tokens\": 1024, \"overflow\": \"compress\", \"profile\": {\"capabilities\": {\"files\": true, \"images\": true, \"json_schema\": true}, \"context_window\": 1000000, \"credential_ref\": \"independent.anthropic.owner\", \"endpoint\": \"https://api.anthropic.com\", \"id\": \"anthropic:claude-fable-5\", \"model\": \"claude-fable-5\", \"output_limit\": 128000, \"protocol\": \"anthropic\", \"provider\": \"anthropic\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"kind\": \"embedded\"}}]}, \"id\": \"pool-b\", \"type\": \"subagent_pool\"}], \"schema_version\": 1}, \"draft_digest\": \"187f89424754dfa1b8926eb308617c0c56e3d02ff7f368ca8f1523c8ad0334e1\", \"edit_token\": \"edit-2-187f89424754dfa1b8926eb3\", \"id\": \"ac8r3-pending-reference\", \"kind\": \"agent\", \"name\": \"Pending reference parent\", \"source_identity\": null}",
    "conflict": {
      "code": "edit_conflict",
      "message": "resource changed in another editor",
      "path": [
        "expected_edit_token"
      ]
    },
    "first_diagnostics": [],
    "reference": "{\"archived\": false, \"description\": \"Child own description\", \"diagnostics\": [], \"document\": {\"description\": \"Child own description\", \"edges\": [{\"id\": \"start-agent\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"agent\", \"target_port_id\": \"in\"}, {\"id\": \"agent-end\", \"kind\": \"flow\", \"source_node_id\": \"agent\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"ac8r3-referenced-agent\", \"kind\": \"agent\", \"name\": \"Referenced Agent\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"text\", \"source\": {\"kind\": \"result\", \"path\": [\"text\"]}}, {\"name\": \"images\", \"source\": {\"kind\": \"result\", \"path\": [\"images\"]}}, {\"name\": \"files\", \"source\": {\"kind\": \"result\", \"path\": [\"files\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"text\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"text\"]}}, {\"missing\": \"null\", \"name\": \"images\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"images\"]}}, {\"missing\": \"null\", \"name\": \"files\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"files\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"result\", \"path\": [\"context\"]}}]}, \"kernel\": {\"history\": \"root\", \"json_schema\": null, \"max_iterations\": 4, \"output_tokens\": 512, \"overflow\": \"error\", \"profile\": {\"capabilities\": {\"files\": false, \"images\": true, \"json_schema\": true}, \"context_window\": 1050000, \"credential_ref\": \"independent.openai.owner\", \"endpoint\": \"https://api.openai.com/v1\", \"id\": \"openai:gpt-6-luna\", \"model\": \"gpt-6-luna\", \"output_limit\": 128000, \"protocol\": \"openai-responses\", \"provider\": \"openai\"}, \"prompt\": \"Child own prompt.\", \"schema_version\": 1}}, \"id\": \"agent\", \"type\": \"agent\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"message\"]}}, {\"missing\": \"null\", \"name\": \"context\", \"value\": {\"kind\": \"ref\", \"node_id\": \"agent\", \"path\": [\"context\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}, {\"name\": \"context\", \"source\": {\"kind\": \"input\", \"path\": [\"context\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}, \"draft_digest\": \"52a7a4bb3139d3acd987062790e41bed394044bce34d5736239cd1847721d07b\", \"edit_token\": \"edit-1-52a7a4bb3139d3acd9870627\", \"id\": \"ac8r3-referenced-agent\", \"kind\": \"agent\", \"name\": \"Referenced Agent\", \"source_identity\": null}",
    "replacement_run": {
      "ok": true
    }
  }
});
