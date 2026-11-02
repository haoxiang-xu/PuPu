"""Match the hosted -I -B script import without starting a server."""
from pathlib import Path
import subprocess
import sys
import unittest


class IsolatedImportControl(unittest.TestCase):
    def test_fixture_loads_by_absolute_path_with_isolated_python(self):
        fixture = Path(__file__).with_name("tool_fixture.py").resolve()
        program = ("import importlib.util;"
                   f"s=importlib.util.spec_from_file_location('isolated_tool',{str(fixture)!r});"
                   "m=importlib.util.module_from_spec(s);s.loader.exec_module(m);"
                   "assert callable(m.serve_tools);print('isolated-import-ok')")
        result = subprocess.run([sys.executable, "-I", "-B", "-c", program],
                                capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), "isolated-import-ok")


if __name__ == "__main__":
    unittest.main(verbosity=2)
