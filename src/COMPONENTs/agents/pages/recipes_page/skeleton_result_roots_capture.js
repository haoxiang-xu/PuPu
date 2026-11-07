/* What each producer's result really holds, captured from the runtime.
 *
 * `admitted_sets` are the key sets the runtime's own admission checks compare
 * against — a result that is not exactly that shape is refused before any
 * mapping runs — read out of `durable_execution.py`, `tool_runtime.py` and
 * `kernel_runtime.py` at 2c3f788. `map_controls` are real `map_outputs` calls
 * against those shapes.
 *
 * Two of these settle design questions rather than just confirming a list.
 * A Skill Read's `_skeleton_skill` exists on the raw result and is stripped
 * before publication, so mapping it returns `missing_value` and it must not be
 * offered. And an empty path exports the whole object including an empty one,
 * which is why the whole value had to become a selectable choice rather than
 * an unreachable state. */

export const CAPTURED_RESULT_ROOTS = Object.freeze(
{
  "admitted_sets": {
    "agent": [
      "context",
      "message"
    ],
    "skill_read_public": [
      "content",
      "name"
    ],
    "skill_read_raw": [
      "_skeleton_skill",
      "content",
      "name"
    ],
    "tool_call": [
      "error",
      "ok",
      "result"
    ],
    "kernel_emits": [
      "context",
      "message"
    ]
  },
  "map_controls": [
    {
      "label": "agent message",
      "path": [
        "message"
      ],
      "exported": true,
      "value_type": "str"
    },
    {
      "label": "agent context",
      "path": [
        "context"
      ],
      "exported": true,
      "value_type": "dict"
    },
    {
      "label": "agent typo",
      "path": [
        "typo"
      ],
      "exported": false,
      "code": "missing_value",
      "path_reported": [
        "mappings",
        0,
        "source",
        "path"
      ]
    },
    {
      "label": "agent whole",
      "path": [],
      "exported": true,
      "value_type": "dict"
    },
    {
      "label": "tool result",
      "path": [
        "result"
      ],
      "exported": true,
      "value_type": "dict"
    },
    {
      "label": "tool ok",
      "path": [
        "ok"
      ],
      "exported": true,
      "value_type": "bool"
    },
    {
      "label": "tool error",
      "path": [
        "error"
      ],
      "exported": true,
      "value_type": "NoneType"
    },
    {
      "label": "tool typo",
      "path": [
        "typo"
      ],
      "exported": false,
      "code": "missing_value",
      "path_reported": [
        "mappings",
        0,
        "source",
        "path"
      ]
    },
    {
      "label": "skill content",
      "path": [
        "content"
      ],
      "exported": true,
      "value_type": "str"
    },
    {
      "label": "skill name",
      "path": [
        "name"
      ],
      "exported": true,
      "value_type": "str"
    },
    {
      "label": "skill stripped metadata",
      "path": [
        "_skeleton_skill"
      ],
      "exported": false,
      "code": "missing_value",
      "path_reported": [
        "mappings",
        0,
        "source",
        "path"
      ]
    },
    {
      "label": "agent position where a field belongs",
      "path": [
        0
      ],
      "exported": false,
      "code": "missing_value",
      "path_reported": [
        "mappings",
        0,
        "source",
        "path"
      ]
    },
    {
      "label": "whole inputs",
      "path": [],
      "exported": true,
      "value": {
        "q": 1
      }
    },
    {
      "label": "whole empty inputs",
      "path": [],
      "exported": true,
      "value": {}
    }
  ]
},
);
