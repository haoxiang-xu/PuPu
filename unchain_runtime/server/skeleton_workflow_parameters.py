"""Optional Workflow signature contract; legacy resources keep the baseline."""
from skeleton_runtime_capability import SkeletonRuntimeCompatibilityError


def require_workflow_parameters(document):
    if type(document) is not dict or "input_schema" not in document:
        return
    # Read the actual producer through the independent strict Host parser.
    from skeleton_runtime_capability import require_skeleton_runtime
    manifest = require_skeleton_runtime()
    protocol = next(row for row in manifest["protocols"] if row["id"] == "skeleton_execution")
    if protocol["minor"] < 11 or "workflow_parameters_v1" not in protocol["features"]:
        raise SkeletonRuntimeCompatibilityError("workflow_parameters_runtime_incompatible",
            "Workflow parameters require skeleton_execution 1.11 and workflow_parameters_v1.")
