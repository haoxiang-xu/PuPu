import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

import app as miso_app  # noqa: E402
from context_memory_v2_capability import (  # noqa: E402
    ContextMemoryV2CapabilityVerdict,
)
import durable_job_runtime  # noqa: E402
import route_chat  # noqa: E402
import route_catalog  # noqa: E402


class RuntimeContractHealthTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tempdir.cleanup)
        self.env_patch = mock.patch.dict(
            os.environ,
            {
                "UNCHAIN_AUTH_TOKEN": "",
                "UNCHAIN_DATA_DIR": self.tempdir.name,
            },
            clear=False,
        )
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)
        durable_job_runtime._reset_durable_jobs_runtime_for_tests()
        self.addCleanup(
            durable_job_runtime._reset_durable_jobs_runtime_for_tests
        )
        self.client = miso_app.create_app().test_client()

    def test_health_reports_release_runtime_contract_from_live_capabilities(
        self,
    ) -> None:
        response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        contract = payload["contract"]
        self.assertEqual(contract["schema"], "pupu.runtime-capabilities")
        self.assertEqual(contract["version"], 1)
        self.assertEqual(
            contract["capabilities"],
            {
                "runtime_events_v4": True,
                "execution_fencing": True,
                "durable_interactions": True,
                "exact_cancellation": True,
                "durable_jobs": {
                    "version": "D4.1",
                    "available": True,
                    "reason": "",
                },
                "automatic_wake_resume": False,
            },
        )
        self.assertEqual(contract["reasons"], {})

    def test_health_reports_runtime_event_probe_failure(self) -> None:
        with mock.patch.object(route_chat, "RuntimeEventBridge", None):
            response = self.client.get("/health")

        contract = response.get_json()["contract"]
        self.assertFalse(contract["capabilities"]["runtime_events_v4"])
        self.assertEqual(
            contract["reasons"]["runtime_events_v4"],
            "RuntimeEventBridge is unavailable",
        )

    def test_health_reports_durable_jobs_initialization_failure_reason(
        self,
    ) -> None:
        with mock.patch.object(
            durable_job_runtime,
            "get_durable_jobs_runtime",
            side_effect=PermissionError("jobs store is read-only"),
        ):
            response = self.client.get("/health")

        durable_jobs = response.get_json()["contract"]["capabilities"][
            "durable_jobs"
        ]
        self.assertEqual(
            durable_jobs,
            {
                "version": "D4.1",
                "available": False,
                "reason": (
                    "durable jobs initialization failed: jobs store is read-only"
                ),
            },
        )

    def test_health_reports_the_same_fail_closed_memory_v2_capability_gate(
        self,
    ) -> None:
        verdict = ContextMemoryV2CapabilityVerdict(
            ready=False,
            reason="unchain_runtime_protocol_manifest_missing",
            verification="failed",
            immutable=False,
            unchain_revision="diagnostic-only",
            unchain_runtime_source="/loaded/unchain/runtime_protocol.py",
        )
        with (
            mock.patch.dict(
                os.environ,
                {
                    "PUPU_FEATURE_MEMORY_V2": "all",
                    "PUPU_MEMORY_V2_MODE": "canary",
                },
                clear=False,
            ),
            mock.patch.object(
                route_catalog,
                "resolve_context_memory_v2_capability",
                return_value=verdict,
            ) as capability_probe,
        ):
            response = self.client.get("/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.get_json()["context_memory_v2"],
            {
                "runtime_protocol_ready": False,
                "runtime_protocol_reason": (
                    "unchain_runtime_protocol_manifest_missing"
                ),
                "runtime_protocol_verification": "failed",
                "runtime_protocol_immutable": False,
                "runtime_protocol_manifest": None,
                "unchain_revision": "diagnostic-only",
                "unchain_runtime_source": "/loaded/unchain/runtime_protocol.py",
            },
        )
        capability_probe.assert_called_once_with(requested_mode="canary")


if __name__ == "__main__":
    unittest.main()
