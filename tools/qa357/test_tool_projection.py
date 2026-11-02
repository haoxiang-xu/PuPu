"""Wire-to-typed-SDK projection rules, without a server or SDK import."""
import unittest
import verify_tool_protocol as verifier


class TypedProjectionControls(unittest.TestCase):
    def compare(self, wire, decoded):
        assertion = getattr(verifier, "assert_emitted", None)
        self.assertTrue(callable(assertion), "projection assertion missing")
        assertion(wire, decoded)

    def test_sdk_timestamp_float_preserves_json_numeric_value(self):
        self.compare({"response": {"created_at": 1}}, {"response": {"created_at": 1.0, "sdk_default": None}})

    def test_timestamp_change_and_bool_coercion_are_still_refused(self):
        for value in [2.0, True, "1", None]:
            with self.subTest(value=value), self.assertRaises(AssertionError):
                self.compare({"created_at": 1}, {"created_at": value})

    def test_other_numeric_fields_do_not_gain_timestamp_coercion(self):
        with self.assertRaises(AssertionError):
            self.compare({"output_tokens": 1}, {"output_tokens": 1.0})
        self.compare({"output_tokens": 1}, {"output_tokens": 1})

    def test_sdk_defaults_do_not_hide_changed_or_missing_emitted_fields(self):
        self.compare({"name": "read", "future": [None, 7]}, {"name": "read", "future": [None, 7], "sdk_default": None})
        for value in [{"name": "other", "future": [None, 7]}, {"name": "read"},
                      {"name": "read", "future": [None, True]}]:
            with self.subTest(value=value), self.assertRaises(AssertionError):
                self.compare({"name": "read", "future": [None, 7]}, value)


if __name__ == "__main__":
    unittest.main(verbosity=2)
