#!/usr/bin/env python3
"""Verify the exact frozen Quorum reference source against PuPu's vendor copy."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path
import sys


FROZEN_SOURCE_TREE_SHA256 = "72e37a93c5e7f91fb090e1e33a914d144aa240cfe9dd3a17c23d005d7b7e41cc"
FROZEN_UPSTREAM_NORMATIVE_TREE_SHA256 = "ba173463f7f15fb8840bc02455180847ba7619b74812c1670dd14bb4eb2d5322"
FROZEN_BOUNDARY_PROTOCOL_SHA256 = "8217f8110eacf838ad0fa1d8df3ed7e1c99bb839e7d48055561288727af9762f"

# Logical paths are the upstream manifest paths. The aggregate contract is:
# find tools/__init__.py tools/quorum_lint tests/fixtures tests/test_quorum_lint.py \
#   -type f ! -path '*/__pycache__/*' -print0 | sort -z | \
#   xargs -0 shasum -a 256 | shasum -a 256
FROZEN_FILES = {
    "tests/fixtures/invalid/missing-na/case.md": "4c8897e7c050e268d0b6a5eff77ce872824a3a36d834b969f6355861d89e1fe6",
    "tests/fixtures/invalid/missing-na/proposal.md": "d636d3c7a8c02d1687192b5307910d886d94a887477fdac2f616ab003234382a",
    "tests/fixtures/invalid/parallel-record.md": "b3e4ab6708fb7b00d1a8c9e922e2f5e3c26baaf2c720a0993200227fc56fd467",
    "tests/fixtures/invalid/pending-acceptance.md": "d3f282d6af2afbee154500662b6b7f30258c29df3461ac7009f07a470365d6f9",
    "tests/fixtures/valid-case/acceptance.md": "5f3c90ccb6f27ffd5a6da9282d42040288984c39f9ae68e7683729b12a26d25f",
    "tests/fixtures/valid-case/case.md": "5d098d99e76de75a47c53932eab0044d22e1a92c27d3a0ce9c5a60f287989ff6",
    "tests/fixtures/valid-case/evidence.md": "2fcd39036a3b24c3a05777249af47f752a872dc8a8585689552a9c4f7b1d3087",
    "tests/fixtures/valid-case/proposal.md": "69b3303d3953cbfcbae0f0cacbe7f09ef5b42d9a1203d114647e47eab03f90ab",
    "tests/fixtures/valid-case/record.md": "9d35cc1089af387c9d0a8a081b61efe66ed6bc9a93ee58e904b81c870df2ec4a",
    "tests/fixtures/valid-case/ruling.md": "59db66d281eed3cf6ad8434a88efe07e3e3a14135d912c9a0c741bf84cec7064",
    "tests/test_quorum_lint.py": "280c986d926f04567a33af8e9a0bf153b8273242a1f4e5228c5cff64ee1bfc7a",
    "tools/__init__.py": "838d70c160f22d71adfcbfaebd2db6222e63f1c7461601eb5723707701259073",
    "tools/quorum_lint/__init__.py": "3c4adc2cc4302feaa4d6ed777be1d8ef97f1fac7d89200977d6df4b383779a77",
    "tools/quorum_lint/__main__.py": "e00330bdc60519bfa2122f83225026f4c73b8463657857ae62043d6d65e81d10",
    "tools/quorum_lint/lint.py": "33c3a3e59de553981eb21b92a26d944b4acabbbe687c0b44fdfa16d0f464890d",
    "tools/quorum_lint/schema.py": "57f17cec615352abdfb4994bba085e21978d0e585cb68ce241f29ba8bf70fb40",
}


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _vendor_path(skill_root: Path, logical_path: str) -> Path:
    if logical_path == "tests/test_quorum_lint.py":
        return skill_root / "boundary_lint_selftest.py"
    if logical_path.startswith("tests/fixtures/"):
        return skill_root / logical_path.removeprefix("tests/")
    return skill_root / logical_path


def _aggregate(rows: dict[str, str]) -> str:
    payload = "".join(f"{rows[path]}  {path}\n" for path in sorted(rows)).encode()
    return hashlib.sha256(payload).hexdigest()


def verify(upstream: Path | None, require_upstream: bool = False) -> list[str]:
    skill_root = Path(__file__).resolve().parent
    repo_root = skill_root.parents[2]
    errors: list[str] = []
    vendor_hashes: dict[str, str] = {}

    for logical_path, expected_hash in FROZEN_FILES.items():
        path = _vendor_path(skill_root, logical_path)
        if not path.is_file():
            errors.append(f"vendored file missing: {path}")
            continue
        actual_hash = _sha256(path)
        vendor_hashes[logical_path] = actual_hash
        if actual_hash != expected_hash:
            errors.append(f"vendored hash mismatch: {logical_path}: {actual_hash} != {expected_hash}")

    if len(vendor_hashes) == len(FROZEN_FILES):
        vendor_tree_hash = _aggregate(vendor_hashes)
        if vendor_tree_hash != FROZEN_SOURCE_TREE_SHA256:
            errors.append(
                "vendored source-tree hash mismatch: "
                f"{vendor_tree_hash} != {FROZEN_SOURCE_TREE_SHA256}"
            )

    normative = repo_root / ".claude/codex/lifecycle/boundary-contracts.md"
    if not normative.is_file():
        errors.append(f"vendored normative protocol missing: {normative}")
    elif _sha256(normative) != FROZEN_BOUNDARY_PROTOCOL_SHA256:
        errors.append(
            "vendored normative protocol hash mismatch: "
            f"{_sha256(normative)} != {FROZEN_BOUNDARY_PROTOCOL_SHA256}"
        )

    if upstream is not None and upstream.is_dir():
        upstream_hashes: dict[str, str] = {}
        for logical_path, frozen_hash in FROZEN_FILES.items():
            source = upstream / logical_path
            if not source.is_file():
                errors.append(f"upstream source missing: {source}")
                continue
            source_hash = _sha256(source)
            upstream_hashes[logical_path] = source_hash
            if source_hash != frozen_hash:
                errors.append(f"upstream source drift: {logical_path}: {source_hash} != {frozen_hash}")
            vendor_hash = vendor_hashes.get(logical_path)
            if vendor_hash is not None and source_hash != vendor_hash:
                errors.append(f"upstream/vendor mismatch: {logical_path}")
        if len(upstream_hashes) == len(FROZEN_FILES):
            upstream_tree_hash = _aggregate(upstream_hashes)
            if upstream_tree_hash != FROZEN_SOURCE_TREE_SHA256:
                errors.append(
                    "upstream source-tree hash mismatch: "
                    f"{upstream_tree_hash} != {FROZEN_SOURCE_TREE_SHA256}"
                )
        upstream_normative_files = [upstream / "README.md", *sorted(
            path for path in (upstream / "docs/quorum").rglob("*") if path.is_file()
        )]
        upstream_normative_hashes = {
            path.relative_to(upstream).as_posix(): _sha256(path)
            for path in upstream_normative_files
        }
        if len(upstream_normative_hashes) != 35:
            errors.append(
                "upstream normative manifest size mismatch: "
                f"{len(upstream_normative_hashes)} != 35"
            )
        elif _aggregate(upstream_normative_hashes) != FROZEN_UPSTREAM_NORMATIVE_TREE_SHA256:
            errors.append(
                "upstream normative source-tree hash mismatch: "
                f"{_aggregate(upstream_normative_hashes)} != "
                f"{FROZEN_UPSTREAM_NORMATIVE_TREE_SHA256}"
            )
        upstream_normative = upstream / "docs/quorum/lifecycle/boundary-contracts.md"
        if not upstream_normative.is_file():
            errors.append(f"upstream normative protocol missing: {upstream_normative}")
        elif _sha256(upstream_normative) != FROZEN_BOUNDARY_PROTOCOL_SHA256:
            errors.append("upstream normative protocol drift")
        elif normative.is_file() and normative.read_bytes() != upstream_normative.read_bytes():
            errors.append("upstream/vendor normative protocol mismatch")
    elif require_upstream:
        errors.append(f"required upstream Quorum checkout unavailable: {upstream}")

    return errors


def main() -> int:
    skill_root = Path(__file__).resolve().parent
    default_upstream = skill_root.parents[3] / "quorum"
    parser = argparse.ArgumentParser(description="Verify PuPu's frozen Quorum boundary linter vendor")
    parser.add_argument("--upstream", type=Path, default=default_upstream)
    parser.add_argument("--require-upstream", action="store_true")
    args = parser.parse_args()
    upstream = args.upstream.resolve()
    errors = verify(upstream if upstream.is_dir() else None, args.require_upstream)
    if errors:
        for error in errors:
            print(f"ERROR {error}")
        print(f"FAIL: {len(errors)} vendor verification issue(s)")
        return 1
    source_mode = "upstream+frozen-manifest" if upstream.is_dir() else "frozen-manifest"
    print(f"PASS: Quorum vendor verified ({source_mode})")
    print(f"SOURCE_TREE_SHA256={FROZEN_SOURCE_TREE_SHA256}")
    print(f"UPSTREAM_NORMATIVE_TREE_SHA256={FROZEN_UPSTREAM_NORMATIVE_TREE_SHA256}")
    print(f"BOUNDARY_PROTOCOL_SHA256={FROZEN_BOUNDARY_PROTOCOL_SHA256}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
