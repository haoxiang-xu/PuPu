/* A node id is data, and these graphs prove it: they save, they pass, they RUN.
 *
 * Machine-written by `write_capture.py` from `nodeid_probe.py`, which runs
 * `SkeletonResourceStore` and the installed runtime's own `prepare_workflow` +
 * `run_workflow` against the wheel of the fixed pair, with no handlers, no
 * model and no provider. Do not edit by hand.
 *
 * Each row is a whole pure Workflow — Start → End, the End reading the Start
 * BY NODE ID — whose Start is named `start`, `__proto__`, `constructor` or
 * `toString`. Every one of them is saved, read back byte for byte, passes the
 * store's own preflight, and executes with the same input to the same output,
 * completing both of its nodes. As far as the envelope is concerned those are
 * ordinary non-empty strings, and the runtime addresses nodes by them without
 * noticing.
 *
 * So nothing is wrong with the graph, and the editor may not pretend there is:
 * what breaks is a drawing that uses a node id as a property name on a plain
 * object — it reads an inherited member instead of its own entry, and writing
 * one sets a prototype instead of storing anything. Measured on the real
 * FlowEditor: `map[edge.source_node_id].add is not a function`, and a drag
 * that vanished from the layout service.
 *
 * `document` is the stored JSON as text, so the drawing is driven by the same
 * bytes the store held and the runtime ran. */

export const NODE_ID_CAPTURE_IDENTITY = Object.freeze({
  "execution_path": "/Users/red/.codex/artifacts/pupu-356/legacy-child-boundary-20261016/fixed-pair/install-venv/lib/python3.12/site-packages/unchain/skeleton/execution.py",
  "execution_sha256": "4189ca8d547e79a69d871a71b0d18d92ced60904a27051c64f65499f5f34f7cc",
  "interpreter": "3.12.10",
  "manifest_digest": "sha256:f6daf3894dd947723ee7dc60392277896b88c4890d35373b26442a1833a28101",
  "manifest_digest_expected": "sha256:f6daf3894dd947723ee7dc60392277896b88c4890d35373b26442a1833a28101",
  "no_handlers": true,
  "schema_sha256": "41633fb9b081cd34786731442840d59ed4d5d1e6a5d111a56f50381d685b4caf",
  "sidecar_sha256": "7b53b048a05011060f428aae81db8aa4ecaf7e23df0a5ab94d5d7aff3e28f5b5",
  "sidecar_sha256_expected": "7b53b048a05011060f428aae81db8aa4ecaf7e23df0a5ab94d5d7aff3e28f5b5",
  "store_path": "/Users/red/Desktop/GITRepo/pupu-341/unchain_runtime/server/skeleton_resource_store.py",
  "store_sha256": "9e8c7b6fee34c4599dd8be9eb1caf817785cd071b3fbf1f4fd3c50d4626d0f99",
  "wheel_sha256": "ea7ee78194bbf715ca8200e5a4b8ef494e7dc1fcf5a8c48bb75d4e47789984b0",
  "wheel_sha256_expected": "ea7ee78194bbf715ca8200e5a4b8ef494e7dc1fcf5a8c48bb75d4e47789984b0"
});

/* One stored, preflighted and executed Workflow per row. `execution` is
   the installed runtime's own answer, including which nodes it completed. */
export const NODE_ID_ROWS = Object.freeze([
  {
    "case": "constructor",
    "start_id": "constructor",
    "resource_id": "nodeid-constructor",
    "edit_token": "edit-1-6eee930dbf066ee04f8a6583",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [],
    "preflight": {
      "definition_digest": "6eee930dbf066ee04f8a6583481b7a0b774c5eb78a47d7b5dcabb956ae2c8eb7",
      "dependencies": [],
      "diagnostics": [],
      "document": {
        "edges": [
          {
            "id": "start-end",
            "kind": "flow",
            "source_node_id": "constructor",
            "source_port_id": "out",
            "target_node_id": "end",
            "target_port_id": "in"
          }
        ],
        "id": "nodeid-constructor",
        "kind": "workflow",
        "name": "Valid node id constructor",
        "nodes": [
          {
            "config": {
              "execution": {
                "outputs": [
                  {
                    "name": "message",
                    "source": {
                      "kind": "result",
                      "path": [
                        "message"
                      ]
                    }
                  }
                ]
              }
            },
            "id": "constructor",
            "type": "start"
          },
          {
            "config": {
              "execution": {
                "inputs": [
                  {
                    "missing": "error",
                    "name": "message",
                    "value": {
                      "kind": "ref",
                      "node_id": "constructor",
                      "path": [
                        "message"
                      ]
                    }
                  }
                ],
                "outputs": [
                  {
                    "name": "message",
                    "source": {
                      "kind": "input",
                      "path": [
                        "message"
                      ]
                    }
                  }
                ]
              }
            },
            "id": "end",
            "type": "end"
          }
        ],
        "schema_version": 1
      },
      "edit_token": "edit-1-6eee930dbf066ee04f8a6583",
      "id": "nodeid-constructor",
      "kind": "workflow",
      "ok": true,
      "subagents": []
    },
    "execution": {
      "completed_nodes": [
        "constructor",
        "end"
      ],
      "input": {
        "message": "Same valid input"
      },
      "outputs": {
        "message": "Same valid input"
      },
      "selected_edges": [
        "start-end"
      ]
    },
    "document": "{\"edges\": [{\"id\": \"start-end\", \"kind\": \"flow\", \"source_node_id\": \"constructor\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"nodeid-constructor\", \"kind\": \"workflow\", \"name\": \"Valid node id constructor\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"constructor\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"constructor\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}"
  },
  {
    "case": "normal",
    "start_id": "start",
    "resource_id": "nodeid-normal",
    "edit_token": "edit-1-c6446d78788e273dd8a1b3e2",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [],
    "preflight": {
      "definition_digest": "c6446d78788e273dd8a1b3e2c0d503460a5a560afa669be0c7458f3c9833c3ee",
      "dependencies": [],
      "diagnostics": [],
      "document": {
        "edges": [
          {
            "id": "start-end",
            "kind": "flow",
            "source_node_id": "start",
            "source_port_id": "out",
            "target_node_id": "end",
            "target_port_id": "in"
          }
        ],
        "id": "nodeid-normal",
        "kind": "workflow",
        "name": "Valid node id normal",
        "nodes": [
          {
            "config": {
              "execution": {
                "outputs": [
                  {
                    "name": "message",
                    "source": {
                      "kind": "result",
                      "path": [
                        "message"
                      ]
                    }
                  }
                ]
              }
            },
            "id": "start",
            "type": "start"
          },
          {
            "config": {
              "execution": {
                "inputs": [
                  {
                    "missing": "error",
                    "name": "message",
                    "value": {
                      "kind": "ref",
                      "node_id": "start",
                      "path": [
                        "message"
                      ]
                    }
                  }
                ],
                "outputs": [
                  {
                    "name": "message",
                    "source": {
                      "kind": "input",
                      "path": [
                        "message"
                      ]
                    }
                  }
                ]
              }
            },
            "id": "end",
            "type": "end"
          }
        ],
        "schema_version": 1
      },
      "edit_token": "edit-1-c6446d78788e273dd8a1b3e2",
      "id": "nodeid-normal",
      "kind": "workflow",
      "ok": true,
      "subagents": []
    },
    "execution": {
      "completed_nodes": [
        "start",
        "end"
      ],
      "input": {
        "message": "Same valid input"
      },
      "outputs": {
        "message": "Same valid input"
      },
      "selected_edges": [
        "start-end"
      ]
    },
    "document": "{\"edges\": [{\"id\": \"start-end\", \"kind\": \"flow\", \"source_node_id\": \"start\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"nodeid-normal\", \"kind\": \"workflow\", \"name\": \"Valid node id normal\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"start\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"start\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}"
  },
  {
    "case": "proto",
    "start_id": "__proto__",
    "resource_id": "nodeid-proto",
    "edit_token": "edit-1-19762a38a5726a26c83c269c",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [],
    "preflight": {
      "definition_digest": "19762a38a5726a26c83c269cd93afaa0a1ed9d226efdaddbd3cec3fdde45201c",
      "dependencies": [],
      "diagnostics": [],
      "document": {
        "edges": [
          {
            "id": "start-end",
            "kind": "flow",
            "source_node_id": "__proto__",
            "source_port_id": "out",
            "target_node_id": "end",
            "target_port_id": "in"
          }
        ],
        "id": "nodeid-proto",
        "kind": "workflow",
        "name": "Valid node id proto",
        "nodes": [
          {
            "config": {
              "execution": {
                "outputs": [
                  {
                    "name": "message",
                    "source": {
                      "kind": "result",
                      "path": [
                        "message"
                      ]
                    }
                  }
                ]
              }
            },
            "id": "__proto__",
            "type": "start"
          },
          {
            "config": {
              "execution": {
                "inputs": [
                  {
                    "missing": "error",
                    "name": "message",
                    "value": {
                      "kind": "ref",
                      "node_id": "__proto__",
                      "path": [
                        "message"
                      ]
                    }
                  }
                ],
                "outputs": [
                  {
                    "name": "message",
                    "source": {
                      "kind": "input",
                      "path": [
                        "message"
                      ]
                    }
                  }
                ]
              }
            },
            "id": "end",
            "type": "end"
          }
        ],
        "schema_version": 1
      },
      "edit_token": "edit-1-19762a38a5726a26c83c269c",
      "id": "nodeid-proto",
      "kind": "workflow",
      "ok": true,
      "subagents": []
    },
    "execution": {
      "completed_nodes": [
        "__proto__",
        "end"
      ],
      "input": {
        "message": "Same valid input"
      },
      "outputs": {
        "message": "Same valid input"
      },
      "selected_edges": [
        "start-end"
      ]
    },
    "document": "{\"edges\": [{\"id\": \"start-end\", \"kind\": \"flow\", \"source_node_id\": \"__proto__\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"nodeid-proto\", \"kind\": \"workflow\", \"name\": \"Valid node id proto\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"__proto__\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"__proto__\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}"
  },
  {
    "case": "to_string",
    "start_id": "toString",
    "resource_id": "nodeid-to_string",
    "edit_token": "edit-1-5b9f4bc398ecabfebd57f290",
    "saved": true,
    "round_trip": true,
    "draft_diagnostics": [],
    "preflight": {
      "definition_digest": "5b9f4bc398ecabfebd57f2903d37fcf99a61af28921be12e59762c4e50713d23",
      "dependencies": [],
      "diagnostics": [],
      "document": {
        "edges": [
          {
            "id": "start-end",
            "kind": "flow",
            "source_node_id": "toString",
            "source_port_id": "out",
            "target_node_id": "end",
            "target_port_id": "in"
          }
        ],
        "id": "nodeid-to_string",
        "kind": "workflow",
        "name": "Valid node id to_string",
        "nodes": [
          {
            "config": {
              "execution": {
                "outputs": [
                  {
                    "name": "message",
                    "source": {
                      "kind": "result",
                      "path": [
                        "message"
                      ]
                    }
                  }
                ]
              }
            },
            "id": "toString",
            "type": "start"
          },
          {
            "config": {
              "execution": {
                "inputs": [
                  {
                    "missing": "error",
                    "name": "message",
                    "value": {
                      "kind": "ref",
                      "node_id": "toString",
                      "path": [
                        "message"
                      ]
                    }
                  }
                ],
                "outputs": [
                  {
                    "name": "message",
                    "source": {
                      "kind": "input",
                      "path": [
                        "message"
                      ]
                    }
                  }
                ]
              }
            },
            "id": "end",
            "type": "end"
          }
        ],
        "schema_version": 1
      },
      "edit_token": "edit-1-5b9f4bc398ecabfebd57f290",
      "id": "nodeid-to_string",
      "kind": "workflow",
      "ok": true,
      "subagents": []
    },
    "execution": {
      "completed_nodes": [
        "toString",
        "end"
      ],
      "input": {
        "message": "Same valid input"
      },
      "outputs": {
        "message": "Same valid input"
      },
      "selected_edges": [
        "start-end"
      ]
    },
    "document": "{\"edges\": [{\"id\": \"start-end\", \"kind\": \"flow\", \"source_node_id\": \"toString\", \"source_port_id\": \"out\", \"target_node_id\": \"end\", \"target_port_id\": \"in\"}], \"id\": \"nodeid-to_string\", \"kind\": \"workflow\", \"name\": \"Valid node id to_string\", \"nodes\": [{\"config\": {\"execution\": {\"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"result\", \"path\": [\"message\"]}}]}}, \"id\": \"toString\", \"type\": \"start\"}, {\"config\": {\"execution\": {\"inputs\": [{\"missing\": \"error\", \"name\": \"message\", \"value\": {\"kind\": \"ref\", \"node_id\": \"toString\", \"path\": [\"message\"]}}], \"outputs\": [{\"name\": \"message\", \"source\": {\"kind\": \"input\", \"path\": [\"message\"]}}]}}, \"id\": \"end\", \"type\": \"end\"}], \"schema_version\": 1}"
  }
]);
