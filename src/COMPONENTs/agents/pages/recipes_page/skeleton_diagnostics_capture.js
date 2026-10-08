/* Real output from the Skeleton resource store, captured 2026-10-07.
 *
 * One schema-valid draft that is wrong in four different ways at once, so the
 * routing is exercised against shapes the runtime actually produces rather
 * than shapes invented here:
 *
 *   end_count       the graph                       ["document","nodes"]
 *   flow_output_required  a node                    ["document","nodes",1]
 *   unknown_field   a binding row's field           [... ,"inputs",0,"default"]
 *   invalid_value   inside a binding row's value    [... ,"inputs",1,"value","values"]
 *
 * The store saved this document unchanged and `save_draft` returned the same
 * four diagnostics, which is what lets an incomplete draft be saved at all.
 * Before the runtime's CP17 repair the last two came back empty. */

export const CAPTURED_DRAFT = {
  "schema_version": 1,
  "kind": "workflow",
  "id": "r",
  "name": "R",
  "nodes": [
    {
      "id": "start",
      "type": "start",
      "config": {
        "execution": {
          "outputs": [
            {
              "name": "text",
              "source": {
                "kind": "result",
                "path": [
                  "text"
                ]
              }
            }
          ]
        }
      }
    },
    {
      "id": "a1",
      "type": "code",
      "config": {
        "execution": {
          "inputs": [
            {
              "name": "t",
              "value": {
                "kind": "ref",
                "node_id": "start",
                "path": [
                  "text"
                ]
              },
              "missing": "null",
              "default": 1
            },
            {
              "name": "u",
              "value": {
                "kind": "first_present",
                "values": "not-an-array"
              },
              "missing": "error"
            }
          ],
          "outputs": [
            {
              "name": "x",
              "source": {
                "kind": "result",
                "path": [
                  "x"
                ]
              }
            }
          ]
        },
        "code": {}
      }
    }
  ],
  "edges": [
    {
      "id": "e1",
      "kind": "flow",
      "source_node_id": "start",
      "source_port_id": "out",
      "target_node_id": "a1",
      "target_port_id": "in"
    }
  ]
};

export const CAPTURED_DIAGNOSTICS = [
  {
    "code": "end_count",
    "path": [
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
      1
    ],
    "message": "execution node requires flow output"
  },
  {
    "code": "unknown_field",
    "path": [
      "document",
      "nodes",
      1,
      "config",
      "execution",
      "inputs",
      0,
      "default"
    ],
    "message": "default is only allowed for default policy"
  },
  {
    "code": "invalid_value",
    "path": [
      "document",
      "nodes",
      1,
      "config",
      "execution",
      "inputs",
      1,
      "value",
      "values"
    ],
    "message": "first_present requires at least two values"
  }
];
