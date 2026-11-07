/* What an Agent's output schema really admits, asked of the runtime.
 *
 * An earlier round read a schema's direct `properties` and treated that list
 * as the whole of what the result could hold. The runtime's subset is wider:
 * `validate_output_schema` admits `$ref` into `$defs` and `anyOf`
 * alternatives, and `reject_effective_root_reservations`
 * (`kernel_output.py:269-297`) treats exactly that expansion as the result's
 * own root. A field declared only through one of those exported fine and the
 * editor called it nonexistent.
 *
 * `closed` is the half worth reading carefully, because it is the only thing
 * that licenses saying a name cannot exist. It is not reasoned about here. It
 * is probed: one undeclared name is added to an otherwise valid output and
 * offered to the real `parse_kernel_output`. If it comes back, the schema is
 * open and no list drawn from it is the whole truth. `notes` records the one
 * case that is easy to get wrong by reasoning — a bounded root does refuse the
 * name its own adjacent `$ref` declares, because Draft 2020-12 bounds an
 * object against the `properties` beside the bound, not against what an
 * in-place applicator adds.
 *
 * `exports` is taken over one valid output per branch the schema allows, so
 * an `anyOf` alternative the first sample does not take is exercised too — a
 * field is only offered here because some admitted output really published
 * it.
 *
 * Captured from the fixed installed `unchain==0.2.0`
 * (`df33867b3737569fa4a5272b6fdd735fa76a6ec92343517d06e278b9c537c178`) through
 * `validate_output_schema` → `parse_kernel_output` → `map_outputs`, the same
 * order durable publication uses. Nothing was rebuilt. */

export const CAPTURED_RESULT_SCHEMAS = Object.freeze(
{
  "cases": [
    {
      "accepts_undeclared": true,
      "closed": false,
      "exports": [
        {
          "exported": true,
          "root": "context",
          "value_type": "dict"
        },
        {
          "exported": true,
          "root": "label",
          "value_type": "str"
        },
        {
          "exported": true,
          "root": "message",
          "value_type": "str"
        },
        {
          "exported": true,
          "root": "score",
          "value_type": "int"
        }
      ],
      "label": "direct properties, unbounded",
      "parsed_keys": [
        "label",
        "score"
      ],
      "schema": {
        "properties": {
          "label": {
            "type": "string"
          },
          "score": {
            "type": "number"
          }
        },
        "type": "object"
      },
      "schema_admitted": true
    },
    {
      "accepts_undeclared": false,
      "closed": true,
      "exports": [
        {
          "exported": true,
          "root": "answer",
          "value_type": "str"
        },
        {
          "exported": true,
          "root": "context",
          "value_type": "dict"
        },
        {
          "exported": true,
          "root": "message",
          "value_type": "str"
        }
      ],
      "label": "direct properties, additionalProperties false",
      "parsed_keys": [
        "answer"
      ],
      "schema": {
        "additionalProperties": false,
        "properties": {
          "answer": {
            "type": "string"
          }
        },
        "type": "object"
      },
      "schema_admitted": true
    },
    {
      "accepts_undeclared": true,
      "closed": false,
      "exports": [
        {
          "exported": true,
          "root": "answer",
          "value_type": "str"
        },
        {
          "exported": true,
          "root": "context",
          "value_type": "dict"
        },
        {
          "exported": true,
          "root": "message",
          "value_type": "str"
        }
      ],
      "label": "direct properties, additionalProperties true",
      "parsed_keys": [
        "answer"
      ],
      "schema": {
        "additionalProperties": true,
        "properties": {
          "answer": {
            "type": "string"
          }
        },
        "type": "object"
      },
      "schema_admitted": true
    },
    {
      "accepts_undeclared": true,
      "closed": false,
      "exports": [
        {
          "exported": true,
          "root": "context",
          "value_type": "dict"
        },
        {
          "exported": true,
          "root": "message",
          "value_type": "str"
        },
        {
          "exported": true,
          "root": "score",
          "value_type": "int"
        }
      ],
      "label": "root $ref into $defs, unbounded target",
      "parsed_keys": [
        "score"
      ],
      "schema": {
        "$defs": {
          "Payload": {
            "properties": {
              "score": {
                "type": "number"
              }
            },
            "type": "object"
          }
        },
        "$ref": "#/$defs/Payload",
        "type": "object"
      },
      "schema_admitted": true
    },
    {
      "accepts_undeclared": false,
      "closed": true,
      "exports": [
        {
          "exported": true,
          "root": "context",
          "value_type": "dict"
        },
        {
          "exported": true,
          "root": "message",
          "value_type": "str"
        },
        {
          "exported": true,
          "root": "score",
          "value_type": "int"
        }
      ],
      "label": "root $ref into $defs, bounded target",
      "parsed_keys": [
        "score"
      ],
      "schema": {
        "$defs": {
          "Payload": {
            "additionalProperties": false,
            "properties": {
              "score": {
                "type": "number"
              }
            },
            "type": "object"
          }
        },
        "$ref": "#/$defs/Payload",
        "type": "object"
      },
      "schema_admitted": true
    },
    {
      "accepts_undeclared": true,
      "closed": false,
      "exports": [
        {
          "exported": true,
          "root": "context",
          "value_type": "dict"
        },
        {
          "exported": true,
          "root": "message",
          "value_type": "str"
        },
        {
          "exported": true,
          "root": "score",
          "value_type": "int"
        },
        {
          "exported": true,
          "root": "label",
          "value_type": "str"
        }
      ],
      "label": "anyOf alternatives, both unbounded",
      "parsed_keys": [
        "score"
      ],
      "schema": {
        "anyOf": [
          {
            "properties": {
              "score": {
                "type": "number"
              }
            },
            "type": "object"
          },
          {
            "properties": {
              "label": {
                "type": "string"
              }
            },
            "type": "object"
          }
        ],
        "type": "object"
      },
      "schema_admitted": true
    },
    {
      "accepts_undeclared": false,
      "closed": true,
      "exports": [
        {
          "exported": true,
          "root": "context",
          "value_type": "dict"
        },
        {
          "exported": true,
          "root": "message",
          "value_type": "str"
        },
        {
          "exported": true,
          "root": "score",
          "value_type": "int"
        },
        {
          "exported": true,
          "root": "label",
          "value_type": "str"
        }
      ],
      "label": "anyOf alternatives, both bounded",
      "parsed_keys": [
        "score"
      ],
      "schema": {
        "anyOf": [
          {
            "additionalProperties": false,
            "properties": {
              "score": {
                "type": "number"
              }
            },
            "type": "object"
          },
          {
            "additionalProperties": false,
            "properties": {
              "label": {
                "type": "string"
              }
            },
            "type": "object"
          }
        ],
        "type": "object"
      },
      "schema_admitted": true
    },
    {
      "accepts_undeclared": true,
      "closed": false,
      "exports": [
        {
          "exported": true,
          "root": "context",
          "value_type": "dict"
        },
        {
          "exported": true,
          "root": "label",
          "value_type": "str"
        },
        {
          "exported": true,
          "root": "message",
          "value_type": "str"
        },
        {
          "exported": true,
          "root": "score",
          "value_type": "int"
        }
      ],
      "label": "anyOf alternatives, one bounded one not",
      "parsed_keys": [
        "label"
      ],
      "schema": {
        "anyOf": [
          {
            "additionalProperties": false,
            "properties": {
              "score": {
                "type": "number"
              }
            },
            "type": "object"
          },
          {
            "properties": {
              "label": {
                "type": "string"
              }
            },
            "type": "object"
          }
        ],
        "type": "object"
      },
      "schema_admitted": true
    },
    {
      "accepts_undeclared": true,
      "closed": false,
      "exports": [
        {
          "exported": true,
          "root": "",
          "value_type": "str"
        },
        {
          "exported": true,
          "root": "context",
          "value_type": "dict"
        },
        {
          "exported": true,
          "root": "message",
          "value_type": "str"
        }
      ],
      "label": "a property whose name is the empty string",
      "parsed_keys": [
        ""
      ],
      "schema": {
        "properties": {
          "": {
            "type": "string"
          }
        },
        "type": "object"
      },
      "schema_admitted": true
    },
    {
      "accepts_undeclared": false,
      "closed": true,
      "exports": [
        {
          "exported": true,
          "root": "",
          "value_type": "str"
        },
        {
          "exported": true,
          "root": "context",
          "value_type": "dict"
        },
        {
          "exported": true,
          "root": "message",
          "value_type": "str"
        }
      ],
      "label": "an empty name, bounded",
      "parsed_keys": [
        ""
      ],
      "schema": {
        "additionalProperties": false,
        "properties": {
          "": {
            "type": "string"
          }
        },
        "type": "object"
      },
      "schema_admitted": true
    },
    {
      "accepts_undeclared": false,
      "closed": true,
      "exports": [
        {
          "exported": true,
          "root": "a",
          "value_type": "str"
        },
        {
          "exported": true,
          "root": "context",
          "value_type": "dict"
        },
        {
          "exported": true,
          "root": "message",
          "value_type": "str"
        }
      ],
      "label": "bounded root beside a $ref that declares another name",
      "parsed_keys": [
        "a"
      ],
      "schema": {
        "$defs": {
          "Other": {
            "properties": {
              "b": {
                "type": "string"
              }
            },
            "type": "object"
          }
        },
        "$ref": "#/$defs/Other",
        "additionalProperties": false,
        "properties": {
          "a": {
            "type": "string"
          }
        },
        "type": "object"
      },
      "schema_admitted": true
    },
    {
      "accepts_undeclared": true,
      "closed": false,
      "exports": [
        {
          "exported": true,
          "root": "context",
          "value_type": "dict"
        },
        {
          "exported": true,
          "root": "message",
          "value_type": "str"
        },
        {
          "exported": true,
          "root": "outer",
          "value_type": "dict"
        }
      ],
      "label": "a nested object declares names that are not roots",
      "parsed_keys": [
        "outer"
      ],
      "schema": {
        "properties": {
          "outer": {
            "properties": {
              "inner": {
                "type": "string"
              }
            },
            "type": "object"
          }
        },
        "type": "object"
      },
      "schema_admitted": true
    },
    {
      "accepts_undeclared": true,
      "closed": false,
      "exports": [
        {
          "exported": true,
          "root": "answer",
          "value_type": "str"
        },
        {
          "exported": true,
          "root": "context",
          "value_type": "dict"
        },
        {
          "exported": true,
          "root": "message",
          "value_type": "str"
        }
      ],
      "label": "$defs that nothing references",
      "parsed_keys": [
        "answer"
      ],
      "schema": {
        "$defs": {
          "Unused": {
            "properties": {
              "ghost": {
                "type": "string"
              }
            },
            "type": "object"
          }
        },
        "properties": {
          "answer": {
            "type": "string"
          }
        },
        "type": "object"
      },
      "schema_admitted": true
    },
    {
      "accepts_undeclared": false,
      "closed": true,
      "exports": [
        {
          "exported": true,
          "root": "context",
          "value_type": "dict"
        },
        {
          "exported": true,
          "root": "deep",
          "value_type": "str"
        },
        {
          "exported": true,
          "root": "message",
          "value_type": "str"
        }
      ],
      "label": "a $ref chain two deep",
      "parsed_keys": [
        "deep"
      ],
      "schema": {
        "$defs": {
          "One": {
            "$ref": "#/$defs/Two",
            "type": "object"
          },
          "Two": {
            "additionalProperties": false,
            "properties": {
              "deep": {
                "type": "string"
              }
            },
            "type": "object"
          }
        },
        "$ref": "#/$defs/One",
        "type": "object"
      },
      "schema_admitted": true
    }
  ],
  "notes": [
    {
      "accepted": false,
      "code": "output_invalid",
      "label": "bounded root accepts the $ref's own name"
    }
  ]
}
,);
