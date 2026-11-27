/* What the real host does with the request a chat sends when the composer's
 * model is not what runs it (#356, R-SEL-01 and its residual).
 *
 * Machine-written by `write_capture.py` from `no_model_probe.py` and
 * `dispatch_probe.py`, which run the installed runtime's own
 * `prepare_skeleton_chat_selection` and `unchain_adapter.stream_chat_events`
 * on the pinned pair. Do not edit by hand.
 *
 * `CAPTURED_NO_MODEL_PAYLOAD` is not composed here: it is the whole object the
 * real chat page handed to the bridge with an empty model catalog, written out
 * by `use_chat_stream.skeleton_selection.test.js` and read by the probes. So
 * the premise of the fix — that this request is one the host accepts without a
 * composer model — is the producer's own output answered by the real consumer.
 *
 * `ADMISSION_ROWS` is the whole options body through admission: as sent with
 * no model chosen, with a pill model added (which changes nothing), beside a
 * Recipe name (refused), with no selection at all (not this path's business),
 * and the second captured request whose pill names a custom provider that was
 * deleted — which the renderer used to refuse to send at all.
 *
 * `DISPATCH_ROWS` is where the same payload stops inside the adapter, under
 * two environments. Both probes ran with a disposable HOME, so the default
 * store they resolve is a throwaway. The point is which refusal arrives: the
 * native branch is taken before any chat model or recipe is resolved, so a
 * payload with `modelId: "unchain-unset"` and no `model` key stops on a
 * Skeleton or environment precondition — never on a missing model. */

export const NO_MODEL_CAPTURE_IDENTITY = Object.freeze({
  "captured_payload": "/Users/red/.codex/artifacts/pupu-356/356-fc03194f-fix-20261018/consumer/renderer-payload-no-model.json",
  "captured_payload_sha256": "5db577c2333be8be8ead0ac37754370c42e8b419722b1e9baf5e9f67d0344b19",
  "captured_stale_pill_payload": "/Users/red/.codex/artifacts/pupu-356/356-fc03194f-fix-20261018/consumer/renderer-payload-stale-pill.json",
  "captured_stale_pill_sha256": "b6b2bc95e84e68b67d6c7a92ddcf47c8763f765503c04c35c1067b1810d5967f",
  "executable": "/Users/red/.codex/artifacts/pupu-356/embedded-diagnostics-20261017/fixed-pair/install-venv/bin/python",
  "interpreter": "3.12.10",
  "manifest_digest": "sha256:f6daf3894dd947723ee7dc60392277896b88c4890d35373b26442a1833a28101",
  "manifest_digest_expected": "sha256:f6daf3894dd947723ee7dc60392277896b88c4890d35373b26442a1833a28101",
  "pair": "/Users/red/.codex/artifacts/pupu-356/embedded-diagnostics-20261017/fixed-pair",
  "selection_path": "/Users/red/Desktop/GITRepo/pupu-341/unchain_runtime/server/skeleton_chat_selection.py",
  "selection_sha256": "5a6492744d867bba6428a8467f204cdbf09fdbc2013f206417899bbb1bc758a1",
  "sidecar_sha256": "3a6d1b6383928b867bdad48aa2f909386130460e0dee1bcd52bd836455492242",
  "sidecar_sha256_expected": "3a6d1b6383928b867bdad48aa2f909386130460e0dee1bcd52bd836455492242",
  "store_path": "/Users/red/Desktop/GITRepo/pupu-341/unchain_runtime/server/skeleton_resource_store.py",
  "store_sha256": "267cfc3faa16cbda440d2ca9eafff1d73f7194dddb2ecce7d44acb7574c24611",
  "wheel_sha256": "4e3efdc0acd9563e484ad91fa392cff0eeeb22c5793313e936c643614945427b",
  "wheel_sha256_expected": "4e3efdc0acd9563e484ad91fa392cff0eeeb22c5793313e936c643614945427b"
});

/* Exactly what the chat page sent with an empty model catalog. */
export const CAPTURED_NO_MODEL_PAYLOAD = Object.freeze({
  "captured_from": "startStreamV2 bridge argument with an empty model catalog (renderer side of the IPC hop)",
  "payload": {
    "threadId": "chat-1792360335500-48038b84340cb65ed42f540f9ea96004",
    "owner_chat_id": "chat-1792360335500-48038b84340cb65ed42f540f9ea96004",
    "memory_v2_requested": true,
    "memory_agent_config": {
      "displayName": "Memory Agent",
      "additionalInstructions": "",
      "provider": "",
      "modelId": ""
    },
    "context_v2_history": [],
    "message": "run using the model already stored in the Agent",
    "history": [],
    "attachments": [],
    "options": {
      "modelId": "unchain-unset",
      "memory_enabled": true,
      "toolkits": [
        "core"
      ],
      "skeleton_selection": {
        "schema": "pupu.skeleton_chat_selection.v1",
        "kind": "resource",
        "resource_id": "research.agent:v2"
      },
      "agent_orchestration": {
        "mode": "default"
      },
      "skills": {
        "include_user_dirs": true
      },
      "system_prompt_v2": {
        "enabled": true,
        "defaults": {
          "rules": "Tool use is optional. Use tools only when they materially improve the answer. Output may be truncated, so keep answers concise and front-load the most important information."
        }
      },
      "memory_namespace": "pupu:default",
      "memory_long_term_enabled": true,
      "memory_long_term_extract_every_n_turns": 6,
      "memory_embedding_provider": "auto",
      "memory_embedding_model": "text-embedding-3-small",
      "memory_last_n_turns": 8,
      "memory_vector_top_k": 4,
      "memory_vector_min_score": null,
      "memory_long_term_vector_top_k": 4,
      "memory_long_term_vector_min_score": null,
      "memory_long_term_episode_top_k": 4,
      "memory_long_term_episode_min_score": null,
      "memory_long_term_playbook_top_k": 4,
      "memory_long_term_playbook_min_score": null
    },
    "trace_level": "minimal"
  }
});

/* And what it sent while the composer still named a custom provider
   the user had deleted (#356, R-SEL-01 residual). */
export const CAPTURED_STALE_PILL_PAYLOAD = Object.freeze({
  "captured_from": "startStreamV2 bridge argument with a deleted custom provider in the composer (renderer side of the IPC hop)",
  "payload": {
    "threadId": "chat-1792360335747-3c96c37202f3867f1127fcd6ded19ef6",
    "owner_chat_id": "chat-1792360335747-3c96c37202f3867f1127fcd6ded19ef6",
    "memory_v2_requested": true,
    "memory_agent_config": {
      "displayName": "Memory Agent",
      "additionalInstructions": "",
      "provider": "",
      "modelId": ""
    },
    "context_v2_history": [],
    "message": "use the saved Agent, ignore the obsolete pill",
    "history": [],
    "attachments": [],
    "options": {
      "modelId": "custom.removed-composer-provider:old-model",
      "memory_enabled": true,
      "toolkits": [
        "core"
      ],
      "skeleton_selection": {
        "schema": "pupu.skeleton_chat_selection.v1",
        "kind": "resource",
        "resource_id": "research.agent:v2"
      },
      "agent_orchestration": {
        "mode": "default"
      },
      "skills": {
        "include_user_dirs": true
      },
      "system_prompt_v2": {
        "enabled": true,
        "defaults": {
          "rules": "Tool use is optional. Use tools only when they materially improve the answer. Output may be truncated, so keep answers concise and front-load the most important information."
        }
      },
      "memory_namespace": "pupu:default",
      "memory_long_term_enabled": true,
      "memory_long_term_extract_every_n_turns": 6,
      "memory_embedding_provider": "auto",
      "memory_embedding_model": "text-embedding-3-small",
      "memory_last_n_turns": 8,
      "memory_vector_top_k": 4,
      "memory_vector_min_score": null,
      "memory_long_term_vector_top_k": 4,
      "memory_long_term_vector_min_score": null,
      "memory_long_term_episode_top_k": 4,
      "memory_long_term_episode_min_score": null,
      "memory_long_term_playbook_top_k": 4,
      "memory_long_term_playbook_min_score": null
    },
    "trace_level": "minimal"
  }
});

export const ADMISSION_ROWS = Object.freeze([
  {
    "case": "captured_no_model_payload",
    "question": "the whole options body the page sent with no model chosen",
    "admitted": true,
    "refused": null,
    "frozen": {
      "resource_id": "research.agent:v2",
      "definition_digest": "3646af13eac37962ac3d9676a20d7ba4cb770c77944801b481e5f746b067b46d",
      "snapshot_digest": "94044b1208a4adafe99ec2dfe4a0395e7086dbdcc57991195638331fe0b88570"
    }
  },
  {
    "case": "same_payload_with_a_pill_model",
    "question": "the same body with a pill model, to show the pill decides nothing here",
    "admitted": true,
    "refused": null,
    "frozen": {
      "resource_id": "research.agent:v2",
      "definition_digest": "3646af13eac37962ac3d9676a20d7ba4cb770c77944801b481e5f746b067b46d",
      "snapshot_digest": "94044b1208a4adafe99ec2dfe4a0395e7086dbdcc57991195638331fe0b88570"
    }
  },
  {
    "case": "no_model_beside_a_recipe_name",
    "question": "the same body with a Recipe name beside the selection",
    "admitted": false,
    "refused": {
      "code": "invalid_shape",
      "path": [
        "options",
        "skeleton_selection"
      ],
      "status": 400,
      "message": "select a Skeleton or a legacy Recipe, not both"
    },
    "frozen": null
  },
  {
    "case": "no_model_and_no_selection",
    "question": "the same body with no selection at all: not this path's business",
    "admitted": false,
    "refused": null,
    "frozen": null
  },
  {
    "case": "captured_stale_custom_pill_payload",
    "question": "the whole body sent while the composer names a deleted custom provider",
    "admitted": true,
    "refused": null,
    "frozen": {
      "resource_id": "research.agent:v2",
      "definition_digest": "3646af13eac37962ac3d9676a20d7ba4cb770c77944801b481e5f746b067b46d",
      "snapshot_digest": "94044b1208a4adafe99ec2dfe4a0395e7086dbdcc57991195638331fe0b88570"
    }
  },
  {
    "case": "stale_custom_pill_without_selection",
    "question": "the same body with no selection: the composer's own model is then all there is",
    "admitted": false,
    "refused": null,
    "frozen": null
  }
]);

/* One entry per environment: the seeded disposable store, the model
   fields the payload actually carried, and where each call stopped. */
export const DISPATCH_ROWS = Object.freeze([
  {
    "environment": "no UNCHAIN_DATA_DIR",
    "home": "/Users/red/.codex/artifacts/pupu-356/356-f47a08ae-fix-20261018/consumer/disposable-home",
    "store_root": "/Users/red/.codex/artifacts/pupu-356/356-f47a08ae-fix-20261018/consumer/disposable-home/.pupu/skeletons",
    "options_model_fields": {
      "modelId": "unchain-unset",
      "model_present": false,
      "recipe_name_present": false
    },
    "stops": [
      {
        "case": "captured_no_model_payload",
        "raised": {
          "type": "SessionExecutionGuardError",
          "code": "session_execution_guard_unavailable",
          "status": 503,
          "message": "UNCHAIN_DATA_DIR is not configured"
        },
        "events": []
      },
      {
        "case": "no_model_payload_unknown_resource",
        "raised": {
          "type": "DurableInteractionHostError",
          "code": "resource_missing",
          "status": 404,
          "message": "Skeleton resource was not found"
        },
        "events": []
      }
    ]
  },
  {
    "environment": "a disposable UNCHAIN_DATA_DIR",
    "home": "/Users/red/.codex/artifacts/pupu-356/356-f47a08ae-fix-20261018/consumer/disposable-home",
    "store_root": "/Users/red/.codex/artifacts/pupu-356/356-f47a08ae-fix-20261018/consumer/disposable-home/.pupu/skeletons",
    "options_model_fields": {
      "modelId": "unchain-unset",
      "model_present": false,
      "recipe_name_present": false
    },
    "stops": [
      {
        "case": "captured_no_model_payload",
        "raised": {
          "type": "SkeletonResourceError",
          "code": "workspace_unavailable",
          "status": null,
          "message": "Filesystem tools require an explicitly authorized workspace."
        },
        "events": []
      },
      {
        "case": "no_model_payload_unknown_resource",
        "raised": {
          "type": "DurableInteractionHostError",
          "code": "resource_missing",
          "status": 404,
          "message": "Skeleton resource was not found"
        },
        "events": []
      }
    ]
  }
]);
