"""PEM parsing regressions exercise the public storage sanitizer without Core."""
import subprocess
import sys
import unittest
from pathlib import Path

from memory_v2_sanitizer import SanitizerError, StorageTrust, sanitize_for_storage, sanitize_text


class MemoryV2PemSanitizerTests(unittest.TestCase):
    def test_complete_blocks_are_removed_without_changing_surrounding_text(self):
        first = "-----BEGIN RSA PRIVATE KEY-----\nprivate-one\n-----END RSA PRIVATE KEY-----"
        second = "-----BEGIN CERTIFICATE-----\nprivate-two\n-----END CERTIFICATE-----"
        self.assertEqual(sanitize_text("before " + first + " between " + second + " after"),
                         "before [REDACTED] between [REDACTED] after")
        self.assertEqual(sanitize_text("-----BEGIN KEY-----\nbody\n-----END OTHER KEY-----"),
                         "[REDACTED]")

    def test_malformed_headers_do_not_hide_a_later_complete_block(self):
        malformed = "-----BEGIN invalid-----\n-----END invalid-----\n"
        valid = "-----BEGIN PRIVATE KEY-----\nbody\n-----END PRIVATE KEY-----"
        self.assertEqual(sanitize_text(malformed + valid), malformed + "[REDACTED]")
        self.assertEqual(sanitize_text("-----BEGIN PRIVATE KEY-----\nno closing marker"),
                         "-----BEGIN PRIVATE KEY-----\nno closing marker")

    def test_binary_pem_is_rejected_before_storage(self):
        raw = b"\0-----BEGIN PRIVATE KEY-----\nbody\n-----END PRIVATE KEY-----"
        with self.assertRaises(SanitizerError):
            sanitize_for_storage(raw, trust=StorageTrust.JOURNAL)

    def test_greedy_header_keeps_secret_body_inside_the_redacted_span(self):
        value = "-----BEGIN A----------END A-----\nprivate-value\n-----END A-----"
        self.assertEqual(sanitize_text(value), "[REDACTED]")
        with self.assertRaises(SanitizerError):
            sanitize_for_storage(b"\0" + value.encode(), trust=StorageTrust.JOURNAL)

    def test_same_line_headers_can_close_before_the_greedy_header_end(self):
        value = "-----BEGIN A----------END A-----"
        self.assertEqual(sanitize_text(value), "[REDACTED]")
        # A delimiter cannot simultaneously close BEGIN and open END.
        shared = "-----BEGIN A-----END A-----"
        self.assertEqual(sanitize_text(shared), shared)

    def test_repeated_unterminated_headers_finish_with_bounded_work(self):
        # Run in a child so a regression cannot hang the suite. On the former
        # backtracking regex even 4.8 KiB took seconds; these are 120 KiB each.
        code = """
from memory_v2_sanitizer import StorageTrust, sanitize_for_storage, sanitize_text
for value in ('-----BEGIN 0' * 10000, '-----BEGIN 0-----\\n' * 10000,
              '-----BEGIN ' + '-' * 120000):
    assert sanitize_text(value) == value
    result = sanitize_for_storage(b'\\0' + value.encode(), trust=StorageTrust.JOURNAL)
    assert result.data == b'\\0' + value.encode()
"""
        result = subprocess.run([sys.executable, "-c", code],
                                cwd=Path(__file__).resolve().parents[1],
                                capture_output=True, text=True, timeout=5, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
