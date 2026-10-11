/* Output mapping verdicts captured from the real validator.
 *
 * Produced by running each document below through
 * `unchain.skeleton.diagnose_skeleton_draft` at 2c3f788 and keeping the
 * diagnostics whose path points into that node's `outputs`. They are frozen
 * here so the builder's own reading of the rules is checked against the
 * runtime's rather than against itself — the two are written in different
 * languages and neither can be adjusted to agree with the other by accident.
 *
 * Three of these are the cases that decide the path control's design:
 * `["0"]` is accepted, `[-1]` is not, and a Start's input side accepts an
 * empty path while refusing a named one. */

export const CAPTURED_OUTPUT_CASES = Object.freeze(
[
  {
    "label": "input side naming a declared input",
    "type": "code",
    "inputs": [
      {
        "name": "q",
        "value": {
          "kind": "literal",
          "value": "x"
        },
        "missing": "error"
      }
    ],
    "outputs": [
      {
        "name": "a",
        "source": {
          "kind": "input",
          "path": [
            "q"
          ]
        }
      }
    ],
    "diagnostics": []
  },
  {
    "label": "input side naming an undeclared input",
    "type": "code",
    "inputs": [
      {
        "name": "q",
        "value": {
          "kind": "literal",
          "value": "x"
        },
        "missing": "error"
      }
    ],
    "outputs": [
      {
        "name": "a",
        "source": {
          "kind": "input",
          "path": [
            "answer"
          ]
        }
      }
    ],
    "diagnostics": [
      {
        "code": "missing_value",
        "path": [
          "outputs",
          0,
          "source",
          "path",
          0
        ],
        "message": "output names an undeclared node input"
      }
    ]
  },
  {
    "label": "input side with an empty path",
    "type": "code",
    "inputs": [],
    "outputs": [
      {
        "name": "a",
        "source": {
          "kind": "input",
          "path": []
        }
      }
    ],
    "diagnostics": []
  },
  {
    "label": "result side with a path",
    "type": "code",
    "inputs": [],
    "outputs": [
      {
        "name": "a",
        "source": {
          "kind": "result",
          "path": [
            "message"
          ]
        }
      }
    ],
    "diagnostics": []
  },
  {
    "label": "result side reaching into a list",
    "type": "code",
    "inputs": [],
    "outputs": [
      {
        "name": "a",
        "source": {
          "kind": "result",
          "path": [
            "x",
            0
          ]
        }
      }
    ],
    "diagnostics": []
  },
  {
    "label": "two rows with the same name",
    "type": "code",
    "inputs": [],
    "outputs": [
      {
        "name": "a",
        "source": {
          "kind": "result",
          "path": []
        }
      },
      {
        "name": "a",
        "source": {
          "kind": "result",
          "path": []
        }
      }
    ],
    "diagnostics": [
      {
        "code": "duplicate_name",
        "path": [
          "outputs",
          1,
          "name"
        ],
        "message": "output name is duplicated"
      }
    ]
  },
  {
    "label": "an empty name",
    "type": "code",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "source": {
          "kind": "result",
          "path": []
        }
      }
    ],
    "diagnostics": [
      {
        "code": "invalid_value",
        "path": [
          "outputs",
          0,
          "name"
        ],
        "message": "output name is invalid"
      }
    ]
  },
  {
    "label": "a kind nobody knows",
    "type": "code",
    "inputs": [],
    "outputs": [
      {
        "name": "a",
        "source": {
          "kind": "elsewhere",
          "path": []
        }
      }
    ],
    "diagnostics": [
      {
        "code": "unknown_variant",
        "path": [
          "outputs",
          0,
          "source",
          "kind"
        ],
        "message": "output source is invalid"
      }
    ]
  },
  {
    "label": "an integer first step on the input side",
    "type": "code",
    "inputs": [
      {
        "name": "q",
        "value": {
          "kind": "literal",
          "value": "x"
        },
        "missing": "error"
      }
    ],
    "outputs": [
      {
        "name": "a",
        "source": {
          "kind": "input",
          "path": [
            0
          ]
        }
      }
    ],
    "diagnostics": [
      {
        "code": "missing_value",
        "path": [
          "outputs",
          0,
          "source",
          "path",
          0
        ],
        "message": "output names an undeclared node input"
      }
    ]
  },
  {
    "label": "a deeper step past a declared input",
    "type": "code",
    "inputs": [
      {
        "name": "q",
        "value": {
          "kind": "literal",
          "value": "x"
        },
        "missing": "error"
      }
    ],
    "outputs": [
      {
        "name": "a",
        "source": {
          "kind": "input",
          "path": [
            "q",
            "deep",
            0
          ]
        }
      }
    ],
    "diagnostics": []
  },
  {
    "label": "a negative position",
    "type": "code",
    "inputs": [],
    "outputs": [
      {
        "name": "a",
        "source": {
          "kind": "result",
          "path": [
            -1
          ]
        }
      }
    ],
    "diagnostics": [
      {
        "code": "invalid_path",
        "path": [
          "outputs",
          0,
          "source",
          "path",
          0
        ],
        "message": "path item must be a string or non-negative integer"
      }
    ]
  },
  {
    "label": "a path that is not an array",
    "type": "code",
    "inputs": [],
    "outputs": [
      {
        "name": "a",
        "source": {
          "kind": "result",
          "path": "nope"
        }
      }
    ],
    "diagnostics": [
      {
        "code": "invalid_type",
        "path": [
          "outputs",
          0,
          "source",
          "path"
        ],
        "message": "path must be an array"
      }
    ]
  },
  {
    "label": "a string that looks like a position",
    "type": "code",
    "inputs": [],
    "outputs": [
      {
        "name": "a",
        "source": {
          "kind": "result",
          "path": [
            "0"
          ]
        }
      }
    ],
    "diagnostics": []
  },
  {
    "label": "an end row on the input side",
    "type": "end",
    "inputs": [
      {
        "name": "ans",
        "value": {
          "kind": "literal",
          "value": "x"
        },
        "missing": "error"
      }
    ],
    "outputs": [
      {
        "name": "a",
        "source": {
          "kind": "input",
          "path": [
            "ans"
          ]
        }
      }
    ],
    "diagnostics": []
  },
  {
    "label": "an end row on the result side",
    "type": "end",
    "inputs": [],
    "outputs": [
      {
        "name": "a",
        "source": {
          "kind": "result",
          "path": []
        }
      }
    ],
    "diagnostics": [
      {
        "code": "invalid_value",
        "path": [
          "outputs",
          0,
          "source",
          "kind"
        ],
        "message": "end outputs may only use inputs"
      }
    ]
  },
  {
    "label": "an end row on the result side with a path",
    "type": "end",
    "inputs": [],
    "outputs": [
      {
        "name": "a",
        "source": {
          "kind": "result",
          "path": [
            "message"
          ]
        }
      }
    ],
    "diagnostics": [
      {
        "code": "invalid_value",
        "path": [
          "outputs",
          0,
          "source",
          "kind"
        ],
        "message": "end outputs may only use inputs"
      }
    ]
  },
  {
    "label": "a start row on the result side",
    "type": "start",
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
    ],
    "diagnostics": []
  },
  {
    "label": "a start row on the input side",
    "type": "start",
    "outputs": [
      {
        "name": "text",
        "source": {
          "kind": "input",
          "path": [
            "text"
          ]
        }
      }
    ],
    "diagnostics": [
      {
        "code": "missing_value",
        "path": [
          "outputs",
          0,
          "source",
          "path",
          0
        ],
        "message": "output names an undeclared node input"
      }
    ]
  },
  {
    "label": "a start row on the input side with an empty path",
    "type": "start",
    "outputs": [
      {
        "name": "text",
        "source": {
          "kind": "input",
          "path": []
        }
      }
    ],
    "diagnostics": []
  },
  {
    "label": "a branch carrying outputs at all",
    "type": "if_else",
    "inputs": [
      {
        "name": "q",
        "value": {
          "kind": "literal",
          "value": "x"
        },
        "missing": "error"
      }
    ],
    "outputs": [
      {
        "name": "a",
        "source": {
          "kind": "result",
          "path": []
        }
      }
    ],
    "diagnostics": [
      {
        "code": "unknown_field",
        "path": [
          "outputs"
        ],
        "message": "node does not support this IO section"
      }
    ]
  }
],
);
