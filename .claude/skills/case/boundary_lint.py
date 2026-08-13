#!/usr/bin/env python3
"""Direct PuPu entry point for the vendored Quorum boundary linter."""

from tools.quorum_lint.__main__ import main


if __name__ == "__main__":
    raise SystemExit(main())
