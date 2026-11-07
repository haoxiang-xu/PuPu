/* What the real selection consumer does with what the real chat page sends.
 *
 * Machine-written by `write_capture.py` from `selection_probe.py`, which runs
 * the installed runtime's own `prepare_skeleton_chat_selection` against a real
 * `SkeletonResourceStore` on the pinned pair. Do not edit by hand.
 *
 * `CAPTURED_RENDERER_PAYLOAD` is not composed here: it is the object the chat
 * page handed to the bridge in `use_chat_stream.skeleton_selection.test.js`,
 * written out by that suite and read by the probe. So the first row below is
 * the producer's own output admitted by the strict consumer, not a hand-made
 * lookalike of it.
 *
 * `SELECTION_ROWS` holds the shape and the resource cases: the three-field
 * object, a fourth key, a missing key, another schema, a projected preflight
 * result, an id that is not canonical, a Recipe name sent beside it, a
 * Workflow, an archived record, a resource that does not exist, and an Agent
 * whose preflight refuses.
 *
 * `ID_ROWS` is the id spelling asked of the server one candidate at a time, so
 * the renderer's own reader can be compared against it in both directions
 * rather than trusted to resemble it. A shape-valid id that no resource has is
 * refused as `resource_missing` — which is what makes it evidence that the
 * SPELLING passed. */

export const SELECTION_CAPTURE_IDENTITY = Object.freeze({
  "captured_payload": "/Users/red/.codex/artifacts/pupu-356/341-chat-selection-20261018/renderer-payload.json",
  "captured_payload_sha256": "f11376ac09d381a0ffad748d8ad0c325af0f0a393a5e06bd0cd5a24b73048ac9",
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

/* Exactly what the chat page sent, as that suite captured it. */
export const CAPTURED_RENDERER_PAYLOAD = Object.freeze({
  "captured_from": "startStreamV2 bridge argument (renderer side of the IPC hop)",
  "memory_v2_requested": true,
  "options": {
    "recipe_name_present": false,
    "skeleton_selection": {
      "kind": "resource",
      "resource_id": "research.agent:v2",
      "schema": "pupu.skeleton_chat_selection.v1"
    }
  },
  "owner_chat_id": "chat-1792345210660-099f0f5079e419655a121096d8e6265b"
});

export const SELECTION_ROWS = Object.freeze([
  {
    "case": "renderer_payload",
    "question": "the object the real chat page sent",
    "options": {
      "skeleton_selection": {
        "kind": "resource",
        "resource_id": "research.agent:v2",
        "schema": "pupu.skeleton_chat_selection.v1"
      }
    },
    "admitted": true,
    "refused": null,
    "frozen": {
      "definition_digest": "3646af13eac37962ac3d9676a20d7ba4cb770c77944801b481e5f746b067b46d",
      "edit_token_present": true,
      "resource_id": "research.agent:v2",
      "snapshot_digest": "94044b1208a4adafe99ec2dfe4a0395e7086dbdcc57991195638331fe0b88570"
    }
  },
  {
    "case": "renderer_payload_twice",
    "question": "the same selection used a second time, as a second message would",
    "options": {
      "skeleton_selection": {
        "kind": "resource",
        "resource_id": "research.agent:v2",
        "schema": "pupu.skeleton_chat_selection.v1"
      }
    },
    "admitted": true,
    "refused": null,
    "frozen": {
      "definition_digest": "3646af13eac37962ac3d9676a20d7ba4cb770c77944801b481e5f746b067b46d",
      "edit_token_present": true,
      "resource_id": "research.agent:v2",
      "snapshot_digest": "94044b1208a4adafe99ec2dfe4a0395e7086dbdcc57991195638331fe0b88570"
    }
  },
  {
    "case": "extra_field",
    "question": "a fourth key beside the three",
    "options": {
      "skeleton_selection": {
        "kind": "resource",
        "name": "Research Agent",
        "resource_id": "research.agent:v2",
        "schema": "pupu.skeleton_chat_selection.v1"
      }
    },
    "admitted": false,
    "refused": {
      "code": "unknown_field",
      "message": "Skeleton selection contains an unknown field",
      "path": [
        "options",
        "skeleton_selection"
      ],
      "status": 400
    },
    "frozen": null
  },
  {
    "case": "missing_field",
    "question": "the id left out",
    "options": {
      "skeleton_selection": {
        "kind": "resource",
        "schema": "pupu.skeleton_chat_selection.v1"
      }
    },
    "admitted": false,
    "refused": {
      "code": "invalid_shape",
      "message": "Skeleton selection is missing required fields",
      "path": [
        "options",
        "skeleton_selection"
      ],
      "status": 400
    },
    "frozen": null
  },
  {
    "case": "other_schema",
    "question": "another schema string",
    "options": {
      "skeleton_selection": {
        "kind": "resource",
        "resource_id": "research.agent:v2",
        "schema": "pupu.skeleton_chat_selection.v2"
      }
    },
    "admitted": false,
    "refused": {
      "code": "unsupported_version",
      "message": "unsupported Skeleton chat selection schema",
      "path": [
        "options",
        "skeleton_selection",
        "schema"
      ],
      "status": 400
    },
    "frozen": null
  },
  {
    "case": "projected_preflight",
    "question": "the nine-field preflight result sent instead of an id",
    "options": {
      "skeleton_selection": {
        "definition_digest": "0000000000000000000000000000000000000000000000000000000000000000",
        "document": {},
        "kind": "resource",
        "resource_id": "research.agent:v2",
        "schema": "pupu.skeleton_chat_selection.v1"
      }
    },
    "admitted": false,
    "refused": {
      "code": "unknown_field",
      "message": "Skeleton selection contains an unknown field",
      "path": [
        "options",
        "skeleton_selection"
      ],
      "status": 400
    },
    "frozen": null
  },
  {
    "case": "untrimmed_id",
    "question": "an id with a trailing space",
    "options": {
      "skeleton_selection": {
        "kind": "resource",
        "resource_id": "research.agent:v2 ",
        "schema": "pupu.skeleton_chat_selection.v1"
      }
    },
    "admitted": false,
    "refused": {
      "code": "invalid_value",
      "message": "selection identity must be non-empty and canonical",
      "path": [
        "options",
        "skeleton_selection",
        "resource_id"
      ],
      "status": 400
    },
    "frozen": null
  },
  {
    "case": "id_outside_charset",
    "question": "an id with a character the server refuses",
    "options": {
      "skeleton_selection": {
        "kind": "resource",
        "resource_id": "research agent",
        "schema": "pupu.skeleton_chat_selection.v1"
      }
    },
    "admitted": false,
    "refused": {
      "code": "invalid_value",
      "message": "resource id must use URL-safe identifier characters",
      "path": [
        "options",
        "skeleton_selection",
        "resource_id"
      ],
      "status": 400
    },
    "frozen": null
  },
  {
    "case": "empty_id",
    "question": "an empty id",
    "options": {
      "skeleton_selection": {
        "kind": "resource",
        "resource_id": "",
        "schema": "pupu.skeleton_chat_selection.v1"
      }
    },
    "admitted": false,
    "refused": {
      "code": "invalid_value",
      "message": "selection identity must be non-empty and canonical",
      "path": [
        "options",
        "skeleton_selection",
        "resource_id"
      ],
      "status": 400
    },
    "frozen": null
  },
  {
    "case": "legacy_name_beside_it",
    "question": "a Recipe name sent alongside",
    "options": {
      "recipe_name": "Research Agent",
      "skeleton_selection": {
        "kind": "resource",
        "resource_id": "research.agent:v2",
        "schema": "pupu.skeleton_chat_selection.v1"
      }
    },
    "admitted": false,
    "refused": {
      "code": "invalid_shape",
      "message": "select a Skeleton or a legacy Recipe, not both",
      "path": [
        "options",
        "skeleton_selection"
      ],
      "status": 400
    },
    "frozen": null
  },
  {
    "case": "empty_legacy_name_beside_it",
    "question": "an EMPTY Recipe name alongside, which the renderer omits entirely",
    "options": {
      "recipe_name": "",
      "skeleton_selection": {
        "kind": "resource",
        "resource_id": "research.agent:v2",
        "schema": "pupu.skeleton_chat_selection.v1"
      }
    },
    "admitted": true,
    "refused": null,
    "frozen": {
      "definition_digest": "3646af13eac37962ac3d9676a20d7ba4cb770c77944801b481e5f746b067b46d",
      "edit_token_present": true,
      "resource_id": "research.agent:v2",
      "snapshot_digest": "94044b1208a4adafe99ec2dfe4a0395e7086dbdcc57991195638331fe0b88570"
    }
  },
  {
    "case": "workflow_kind",
    "question": "a Workflow addressed as a chat Agent",
    "options": {
      "skeleton_selection": {
        "kind": "resource",
        "resource_id": "wf-1",
        "schema": "pupu.skeleton_chat_selection.v1"
      }
    },
    "admitted": false,
    "refused": {
      "code": "wrong_kind",
      "message": "ordinary chat requires an Agent resource",
      "path": [
        "resource_id"
      ],
      "status": 400
    },
    "frozen": null
  },
  {
    "case": "archived_resource",
    "question": "an archived Agent",
    "options": {
      "skeleton_selection": {
        "kind": "resource",
        "resource_id": "retired-agent",
        "schema": "pupu.skeleton_chat_selection.v1"
      }
    },
    "admitted": false,
    "refused": {
      "code": "resource_archived",
      "message": "archived resource cannot start a new execution",
      "path": [
        "resource_id"
      ],
      "status": 409
    },
    "frozen": null
  },
  {
    "case": "missing_resource",
    "question": "an id no resource has",
    "options": {
      "skeleton_selection": {
        "kind": "resource",
        "resource_id": "nobody-at-all",
        "schema": "pupu.skeleton_chat_selection.v1"
      }
    },
    "admitted": false,
    "refused": {
      "code": "resource_missing",
      "message": "Skeleton resource was not found",
      "path": [
        "resource_id"
      ],
      "status": 404
    },
    "frozen": null
  },
  {
    "case": "preflight_refuses",
    "question": "an Agent whose preflight refuses",
    "options": {
      "skeleton_selection": {
        "kind": "resource",
        "resource_id": "broken-agent",
        "schema": "pupu.skeleton_chat_selection.v1"
      }
    },
    "admitted": false,
    "refused": {
      "code": "end_count",
      "message": "graph requires exactly one end node",
      "path": [
        "document",
        "nodes"
      ],
      "status": 400
    },
    "frozen": null
  },
  {
    "case": "no_selection_key",
    "question": "an ordinary chat, no key at all",
    "options": {
      "recipe_name": "Research Agent"
    },
    "admitted": false,
    "refused": null,
    "frozen": null
  },
  {
    "case": "default_only",
    "question": "an ordinary chat with no selection and no Recipe",
    "options": {},
    "admitted": false,
    "refused": null,
    "frozen": null
  }
]);

/* One row per candidate id: what the server said about that exact
   string. `refused: null` means it was admitted outright. */
export const ID_ROWS = Object.freeze([
  {
    "id": "research.agent:v2",
    "refused": null
  },
  {
    "id": "a",
    "refused": {
      "code": "resource_missing",
      "path": [
        "resource_id"
      ]
    }
  },
  {
    "id": "A",
    "refused": {
      "code": "resource_missing",
      "path": [
        "resource_id"
      ]
    }
  },
  {
    "id": "0",
    "refused": {
      "code": "resource_missing",
      "path": [
        "resource_id"
      ]
    }
  },
  {
    "id": "a.b",
    "refused": {
      "code": "resource_missing",
      "path": [
        "resource_id"
      ]
    }
  },
  {
    "id": "a_b",
    "refused": {
      "code": "resource_missing",
      "path": [
        "resource_id"
      ]
    }
  },
  {
    "id": "a:b",
    "refused": {
      "code": "resource_missing",
      "path": [
        "resource_id"
      ]
    }
  },
  {
    "id": "a-b",
    "refused": {
      "code": "resource_missing",
      "path": [
        "resource_id"
      ]
    }
  },
  {
    "id": "A1.b_c:d-e",
    "refused": {
      "code": "resource_missing",
      "path": [
        "resource_id"
      ]
    }
  },
  {
    "id": "_a",
    "refused": {
      "code": "invalid_value",
      "path": [
        "options",
        "skeleton_selection",
        "resource_id"
      ]
    }
  },
  {
    "id": ".a",
    "refused": {
      "code": "invalid_value",
      "path": [
        "options",
        "skeleton_selection",
        "resource_id"
      ]
    }
  },
  {
    "id": "-a",
    "refused": {
      "code": "invalid_value",
      "path": [
        "options",
        "skeleton_selection",
        "resource_id"
      ]
    }
  },
  {
    "id": ":a",
    "refused": {
      "code": "invalid_value",
      "path": [
        "options",
        "skeleton_selection",
        "resource_id"
      ]
    }
  },
  {
    "id": "a/b",
    "refused": {
      "code": "invalid_value",
      "path": [
        "options",
        "skeleton_selection",
        "resource_id"
      ]
    }
  },
  {
    "id": "a b",
    "refused": {
      "code": "invalid_value",
      "path": [
        "options",
        "skeleton_selection",
        "resource_id"
      ]
    }
  },
  {
    "id": " a",
    "refused": {
      "code": "invalid_value",
      "path": [
        "options",
        "skeleton_selection",
        "resource_id"
      ]
    }
  },
  {
    "id": "a ",
    "refused": {
      "code": "invalid_value",
      "path": [
        "options",
        "skeleton_selection",
        "resource_id"
      ]
    }
  },
  {
    "id": "a\tb",
    "refused": {
      "code": "invalid_value",
      "path": [
        "options",
        "skeleton_selection",
        "resource_id"
      ]
    }
  },
  {
    "id": "a\nb",
    "refused": {
      "code": "invalid_value",
      "path": [
        "options",
        "skeleton_selection",
        "resource_id"
      ]
    }
  },
  {
    "id": "",
    "refused": {
      "code": "invalid_value",
      "path": [
        "options",
        "skeleton_selection",
        "resource_id"
      ]
    }
  },
  {
    "id": "ä",
    "refused": {
      "code": "invalid_value",
      "path": [
        "options",
        "skeleton_selection",
        "resource_id"
      ]
    }
  },
  {
    "id": "a​b",
    "refused": {
      "code": "invalid_value",
      "path": [
        "options",
        "skeleton_selection",
        "resource_id"
      ]
    }
  },
  {
    "id": "__proto__",
    "refused": {
      "code": "invalid_value",
      "path": [
        "options",
        "skeleton_selection",
        "resource_id"
      ]
    }
  },
  {
    "id": "constructor",
    "refused": {
      "code": "resource_missing",
      "path": [
        "resource_id"
      ]
    }
  },
  {
    "id": "prototype",
    "refused": {
      "code": "resource_missing",
      "path": [
        "resource_id"
      ]
    }
  },
  {
    "id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "refused": {
      "code": "resource_missing",
      "path": [
        "resource_id"
      ]
    }
  },
  {
    "id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "refused": {
      "code": "invalid_value",
      "path": [
        "options",
        "skeleton_selection",
        "resource_id"
      ]
    }
  },
  {
    "id": "99999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999",
    "refused": {
      "code": "resource_missing",
      "path": [
        "resource_id"
      ]
    }
  },
  {
    "id": "legacy-132613d90b9bfa97c0545330",
    "refused": {
      "code": "resource_missing",
      "path": [
        "resource_id"
      ]
    }
  }
]);
