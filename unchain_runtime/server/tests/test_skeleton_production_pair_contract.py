"""Cold production imports require the actually loaded paired runtime feature."""
from copy import deepcopy
import pytest
from skeleton_runtime_capability import (require_skeleton_runtime, validate_skeleton_runtime_manifest,
    SkeletonRuntimeCompatibilityError)
from test_skeleton_runtime_capability import _signed


def test_baseline_without_production_ports_is_rejected_before_host_dispatch():
    manifest = deepcopy(require_skeleton_runtime())
    protocol = next(row for row in manifest["protocols"] if row["id"] == "skeleton_execution")
    protocol["features"] = [feature for feature in protocol["features"] if feature != "production_host_bindings_v1"]
    manifest = _signed(manifest)
    with pytest.raises(SkeletonRuntimeCompatibilityError, match="required Skeleton"):
        validate_skeleton_runtime_manifest(manifest)
