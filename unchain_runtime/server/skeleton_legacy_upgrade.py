"""The legacy Agent definition's closed field sets.

The converter in ``skeleton_legacy_upgrade_save`` refuses any stored field
outside these sets rather than dropping it unseen.
"""

from __future__ import annotations


_LEGACY_NODE_FIELDS = {
    "start": {"kind", "deletable", "outputs", "x", "y"},
    "end": {"kind", "deletable", "outputs_schema", "x", "y"},
    "agent": {"kind", "deletable", "override", "outputs", "x", "y"},
    "toolkit_pool": {"kind", "deletable", "toolkits", "merge_with_user_selected", "x", "y"},
    "subagent_pool": {"kind", "deletable", "subagents", "x", "y"},
}
_LEGACY_RECIPE_FIELDS = {
    "name", "description", "model", "max_iterations", "merge_with_user_selected",
    "subagent_profile", "agent", "toolkits", "subagent_pool", "nodes", "edges",
}
