/* Every schema the field rows can compose, with the real validator's verdict.
 *
 * This is the editor's safety property, and the only one worth having: what the
 * rows produce, the runtime accepts. It covers each field type alone, required
 * and not, described and not, open and closed; each bound the subset has at
 * zero and at a round number, and both bounds together; a list of each item
 * type; several fields mixed; and no fields at all. It also covers the names a
 * careless editor mangles — the empty name, a name holding a dot, a slash, a
 * tilde, a space, a non-ASCII name — because `validate_output_schema` reserves
 * only `message` and `context` and the rest are an author's to use.
 *
 * It also covers the two root-level values the rows carry without showing
 * one of them — the declared dialect and a description of the output as a
 * whole — and a negative and a fractional `minimum`, which the subset admits
 * there and refuses on the four length and count bounds.
 *
 * Composed by `schema_from_fields` and then offered to the fixed installed
 * `unchain==0.2.0`
 * (`df33867b3737569fa4a5272b6fdd735fa76a6ec92343517d06e278b9c537c178`).
 * Nothing was rebuilt. A refusal here would mean the rows can build something
 * that cannot be saved, which is the defect the mirror was just corrected for,
 * one layer up. */

export const CAPTURED_FIELD_SCHEMAS = Object.freeze(
[
 {
  "label": "one string field",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "string"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "one string field, required",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "string"
    }
   },
   "required": [
    "a"
   ]
  },
  "accepted": true
 },
 {
  "label": "one string field, closed",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "string"
    }
   },
   "additionalProperties": false
  },
  "accepted": true
 },
 {
  "label": "one string field, described",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "string",
     "description": "what it holds"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "one number field",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "number"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "one number field, required",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "number"
    }
   },
   "required": [
    "a"
   ]
  },
  "accepted": true
 },
 {
  "label": "one number field, closed",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "number"
    }
   },
   "additionalProperties": false
  },
  "accepted": true
 },
 {
  "label": "one number field, described",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "number",
     "description": "what it holds"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "one integer field",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "integer"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "one integer field, required",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "integer"
    }
   },
   "required": [
    "a"
   ]
  },
  "accepted": true
 },
 {
  "label": "one integer field, closed",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "integer"
    }
   },
   "additionalProperties": false
  },
  "accepted": true
 },
 {
  "label": "one integer field, described",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "integer",
     "description": "what it holds"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "one boolean field",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "boolean"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "one boolean field, required",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "boolean"
    }
   },
   "required": [
    "a"
   ]
  },
  "accepted": true
 },
 {
  "label": "one boolean field, closed",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "boolean"
    }
   },
   "additionalProperties": false
  },
  "accepted": true
 },
 {
  "label": "one boolean field, described",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "boolean",
     "description": "what it holds"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "one array field",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "array",
     "items": {
      "type": "string"
     }
    }
   }
  },
  "accepted": true
 },
 {
  "label": "one array field, required",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "array",
     "items": {
      "type": "string"
     }
    }
   },
   "required": [
    "a"
   ]
  },
  "accepted": true
 },
 {
  "label": "one array field, closed",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "array",
     "items": {
      "type": "string"
     }
    }
   },
   "additionalProperties": false
  },
  "accepted": true
 },
 {
  "label": "one array field, described",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "array",
     "description": "what it holds",
     "items": {
      "type": "string"
     }
    }
   }
  },
  "accepted": true
 },
 {
  "label": "one null field",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "null"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "one null field, required",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "null"
    }
   },
   "required": [
    "a"
   ]
  },
  "accepted": true
 },
 {
  "label": "one null field, closed",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "null"
    }
   },
   "additionalProperties": false
  },
  "accepted": true
 },
 {
  "label": "one null field, described",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "null",
     "description": "what it holds"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "string with minLength at 0",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "string",
     "minLength": 0
    }
   }
  },
  "accepted": true
 },
 {
  "label": "string with minLength at 7",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "string",
     "minLength": 7
    }
   }
  },
  "accepted": true
 },
 {
  "label": "string with maxLength at 0",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "string",
     "maxLength": 0
    }
   }
  },
  "accepted": true
 },
 {
  "label": "string with maxLength at 7",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "string",
     "maxLength": 7
    }
   }
  },
  "accepted": true
 },
 {
  "label": "string with both bounds",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "string",
     "minLength": 1,
     "maxLength": 9
    }
   }
  },
  "accepted": true
 },
 {
  "label": "number with minimum at 0",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "number",
     "minimum": 0
    }
   }
  },
  "accepted": true
 },
 {
  "label": "number with minimum at 7",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "number",
     "minimum": 7
    }
   }
  },
  "accepted": true
 },
 {
  "label": "number with maximum at 0",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "number",
     "maximum": 0
    }
   }
  },
  "accepted": true
 },
 {
  "label": "number with maximum at 7",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "number",
     "maximum": 7
    }
   }
  },
  "accepted": true
 },
 {
  "label": "number with both bounds",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "number",
     "minimum": 1,
     "maximum": 9
    }
   }
  },
  "accepted": true
 },
 {
  "label": "integer with minimum at 0",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "integer",
     "minimum": 0
    }
   }
  },
  "accepted": true
 },
 {
  "label": "integer with minimum at 7",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "integer",
     "minimum": 7
    }
   }
  },
  "accepted": true
 },
 {
  "label": "integer with maximum at 0",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "integer",
     "maximum": 0
    }
   }
  },
  "accepted": true
 },
 {
  "label": "integer with maximum at 7",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "integer",
     "maximum": 7
    }
   }
  },
  "accepted": true
 },
 {
  "label": "integer with both bounds",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "integer",
     "minimum": 1,
     "maximum": 9
    }
   }
  },
  "accepted": true
 },
 {
  "label": "array with minItems at 0",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "array",
     "items": {
      "type": "string"
     },
     "minItems": 0
    }
   }
  },
  "accepted": true
 },
 {
  "label": "array with minItems at 7",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "array",
     "items": {
      "type": "string"
     },
     "minItems": 7
    }
   }
  },
  "accepted": true
 },
 {
  "label": "array with maxItems at 0",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "array",
     "items": {
      "type": "string"
     },
     "maxItems": 0
    }
   }
  },
  "accepted": true
 },
 {
  "label": "array with maxItems at 7",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "array",
     "items": {
      "type": "string"
     },
     "maxItems": 7
    }
   }
  },
  "accepted": true
 },
 {
  "label": "array with both bounds",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "array",
     "items": {
      "type": "string"
     },
     "minItems": 1,
     "maxItems": 9
    }
   }
  },
  "accepted": true
 },
 {
  "label": "a number with a negative minimum",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "number",
     "minimum": -5
    }
   }
  },
  "accepted": true
 },
 {
  "label": "a number with a fractional bound",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "number",
     "minimum": 0.5,
     "maximum": 1.5
    }
   }
  },
  "accepted": true
 },
 {
  "label": "a list of string",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "array",
     "items": {
      "type": "string"
     }
    }
   }
  },
  "accepted": true
 },
 {
  "label": "a list of number",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "array",
     "items": {
      "type": "number"
     }
    }
   }
  },
  "accepted": true
 },
 {
  "label": "a list of integer",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "array",
     "items": {
      "type": "integer"
     }
    }
   }
  },
  "accepted": true
 },
 {
  "label": "a list of boolean",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "array",
     "items": {
      "type": "boolean"
     }
    }
   }
  },
  "accepted": true
 },
 {
  "label": "a list of null",
  "doc": {
   "type": "object",
   "properties": {
    "a": {
     "type": "array",
     "items": {
      "type": "null"
     }
    }
   }
  },
  "accepted": true
 },
 {
  "label": "an empty name",
  "doc": {
   "type": "object",
   "properties": {
    "": {
     "type": "string"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "a name with a dot",
  "doc": {
   "type": "object",
   "properties": {
    "a.b": {
     "type": "string"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "a name with a slash",
  "doc": {
   "type": "object",
   "properties": {
    "a/b": {
     "type": "string"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "a name with a tilde",
  "doc": {
   "type": "object",
   "properties": {
    "a~b": {
     "type": "string"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "a unicode name",
  "doc": {
   "type": "object",
   "properties": {
    "\u8f93\u51fa": {
     "type": "string"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "a name with a space",
  "doc": {
   "type": "object",
   "properties": {
    "two words": {
     "type": "string"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "several fields of mixed types and requirements",
  "doc": {
   "type": "object",
   "properties": {
    "answer": {
     "type": "string",
     "description": "the reply"
    },
    "score": {
     "type": "number",
     "minimum": 0,
     "maximum": 1
    },
    "tags": {
     "type": "array",
     "items": {
      "type": "string"
     },
     "maxItems": 5
    },
    "ok": {
     "type": "boolean"
    }
   },
   "required": [
    "answer",
    "ok"
   ],
   "additionalProperties": false
  },
  "accepted": true
 },
 {
  "label": "no fields at all",
  "doc": {
   "type": "object",
   "properties": {}
  },
  "accepted": true
 },
 {
  "label": "no fields at all, closed",
  "doc": {
   "type": "object",
   "properties": {},
   "additionalProperties": false
  },
  "accepted": true
 },
 {
  "label": "carrying the declared dialect",
  "doc": {
   "$schema": "https://json-schema.org/draft/2020-12/schema",
   "type": "object",
   "properties": {
    "a": {
     "type": "string"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "carrying a description of the whole output",
  "doc": {
   "type": "object",
   "description": "the classification and why",
   "properties": {
    "a": {
     "type": "string"
    }
   }
  },
  "accepted": true
 },
 {
  "label": "carrying both",
  "doc": {
   "$schema": "https://json-schema.org/draft/2020-12/schema",
   "type": "object",
   "description": "both at once",
   "properties": {
    "a": {
     "type": "string"
    }
   },
   "additionalProperties": false
  },
  "accepted": true
 },
 {
  "label": "carrying a dialect with no fields",
  "doc": {
   "$schema": "https://json-schema.org/draft/2020-12/schema",
   "type": "object",
   "properties": {}
  },
  "accepted": true
 }
]
,);
