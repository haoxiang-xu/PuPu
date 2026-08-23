import copy
import json
import unittest

from memory_v2_curator import (
    LOCKED_CORE_PROMPT,
    MAX_ADDITIONAL_INSTRUCTIONS_CHARS,
    MemoryV2Curator,
    MemoryV2CuratorError,
    sanitize_memory_agent_config,
    select_curator_model,
)


def _candidate(
    candidate_id,
    *,
    owner="chat_a",
    session="session_a",
    attempt="attempt_a",
    status="pending",
    revision=1,
    marker="candidate body",
):
    return {
        "candidate_id": candidate_id,
        "owner_chat_id": owner,
        "session_id": session,
        "attempt_id": attempt,
        "status": status,
        "revision": revision,
        "target_space_id": "space_chat_a",
        "target_path": f"notes/{candidate_id}.md",
        "kind": "markdown",
        "description": marker,
        "rationale": f"why {marker}",
        "confidence": 0.9,
        "sensitivity": "private",
        "source_event_ids": [f"event_{candidate_id}"],
        "content": f"full {marker}",
    }


class _FakeRuntime:
    def __init__(self, candidates=None):
        self.candidates = list(candidates or [])
        self.jobs = []
        self.enqueue_calls = []
        self.complete_calls = []
        self.fail_calls = []
        self.list_candidate_calls = []
        self.bindings = {}
        self.isolation_calls = []
        self.capture_quality = "complete"

    def get_capture_task_state(self, **_kwargs):
        return {"capture_quality": self.capture_quality}

    def list_candidates(self, **kwargs):
        self.list_candidate_calls.append(copy.deepcopy(kwargs))
        return {"candidates": copy.deepcopy(self.candidates)}

    def list_consolidation_jobs(self, *, owner_chat_id, limit):
        del limit
        return {
            "jobs": copy.deepcopy(
                [job for job in self.jobs if job["owner_chat_id"] == owner_chat_id]
            )
        }

    def enqueue_consolidation_job(self, **kwargs):
        self.enqueue_calls.append(copy.deepcopy(kwargs))
        job = {
            "job_id": f"job_{len(self.jobs) + 1}",
            "revision": 1,
            "status": "pending",
            "replayed": False,
            **copy.deepcopy(kwargs),
        }
        self.jobs.append(job)
        return copy.deepcopy(job)

    def enqueue_curator_job_with_candidates(self, **kwargs):
        candidate_refs = copy.deepcopy(kwargs.pop("candidate_refs"))
        job = self.enqueue_consolidation_job(**kwargs)
        bound = []
        for reference in candidate_refs:
            candidate = next(
                item
                for item in self.candidates
                if item["candidate_id"] == reference["candidate_id"]
                and item["revision"] == reference["revision"]
            )
            candidate_ref = (
                f"pupu://memory/candidate/{candidate['candidate_id']}"
                f"@{candidate['revision']}"
            )
            candidate["status"] = "queued"
            bound.append(
                {
                    "candidate_id": candidate["candidate_id"],
                    "candidate_ref": candidate_ref,
                    "candidate_revision": candidate["revision"],
                    "candidate_payload_hash": "a" * 64,
                    "revision": 1,
                    "binding_revision": 1,
                    "outcome": "queued",
                    "target_space_id": candidate["target_space_id"],
                    "target_path": candidate["target_path"],
                    "kind": candidate["kind"],
                    "description": candidate["description"],
                    "mime_type": "text/markdown",
                    "rationale": candidate["rationale"],
                    "confidence": candidate["confidence"],
                    "sensitivity": candidate["sensitivity"],
                    "source_event_ids": copy.deepcopy(
                        candidate["source_event_ids"]
                    ),
                    "source_refs": [
                        f"pupu://context/event/{event_id}"
                        for event_id in candidate["source_event_ids"]
                    ],
                    "content": {
                        "ref": candidate_ref,
                        "media_type": "text/markdown",
                        "bytes": len(candidate["content"].encode("utf-8")),
                        "sha256": "b" * 64,
                    },
                }
            )
        self.bindings[job["job_id"]] = bound
        job["candidates"] = copy.deepcopy(bound)
        self.jobs[-1]["candidates"] = copy.deepcopy(bound)
        return copy.deepcopy(job)

    def isolate_candidates_for_attempt(self, **kwargs):
        self.isolation_calls.append(copy.deepcopy(kwargs))
        isolated = 0
        for candidate in self.candidates:
            if (
                candidate["owner_chat_id"] == kwargs["owner_chat_id"]
                and candidate["session_id"] == kwargs["session_id"]
                and candidate["attempt_id"] == kwargs["attempt_id"]
                and candidate["status"] == "pending"
            ):
                candidate["status"] = "isolated"
                isolated += 1
        return {"isolated_count": isolated, "reason": kwargs["reason"]}

    def lease_last_job(self, worker_id="worker_a"):
        job = self.jobs[-1]
        job.update(
            {
                "status": "leased",
                "revision": int(job["revision"]) + 1,
                "lease_owner": worker_id,
                "lease_token": f"lease_{job['job_id']}",
            }
        )
        for binding in self.bindings.get(job["job_id"], []):
            if binding["outcome"] == "queued":
                binding["outcome"] = "processing"
                binding["revision"] += 1
                binding["binding_revision"] = binding["revision"]
        return copy.deepcopy(job)

    def list_job_candidates(self, *, owner_chat_id, job_id, outcome="", limit=100):
        del owner_chat_id, limit
        candidates = copy.deepcopy(self.bindings.get(job_id, []))
        if outcome:
            candidates = [
                candidate
                for candidate in candidates
                if candidate["outcome"] == outcome
            ]
        return {"job_id": job_id, "candidates": candidates}

    def complete_consolidation_job(self, **kwargs):
        self.complete_calls.append(copy.deepcopy(kwargs))
        job = self._job(kwargs["job_id"])
        self._assert_lease(job, kwargs)
        job["status"] = "completed"
        job["revision"] += 1
        return copy.deepcopy(job)

    def fail_consolidation_job(self, **kwargs):
        self.fail_calls.append(copy.deepcopy(kwargs))
        job = self._job(kwargs["job_id"])
        self._assert_lease(job, kwargs)
        job["status"] = "failed"
        job["revision"] += 1
        job["error_code"] = kwargs["error_code"]
        return copy.deepcopy(job)

    def _job(self, job_id):
        return next(job for job in self.jobs if job["job_id"] == job_id)

    @staticmethod
    def _assert_lease(job, kwargs):
        if job["status"] != "leased":
            raise AssertionError("job must be leased")
        if kwargs["lease_token"] != job["lease_token"]:
            raise AssertionError("lease token mismatch")
        if int(kwargs["expected_revision"]) != int(job["revision"]):
            raise AssertionError("revision mismatch")


class MemoryV2CuratorConfigTests(unittest.TestCase):
    def test_sanitize_whitelists_normalizes_and_enforces_hard_limits(self):
        sanitized = sanitize_memory_agent_config(
            {
                "displayName": "  Curator  ",
                "additionalInstructions": "line one\r\nline two\tindented",
                "provider": "  provider_a ",
                "modelId": " model_a ",
                "temperature": 0.2,
                "unknown": {"benign": True},
            }
        )
        self.assertEqual(
            sanitized,
            {
                "displayName": "Curator",
                "additionalInstructions": "line one\nline two\tindented",
                "provider": "provider_a",
                "modelId": "model_a",
            },
        )

        for credential_config in (
            {"apiKey": "do-not-store"},
            {"unknown": {"clientSecret": "do-not-store"}},
            {"unknown": {"accessToken": "do-not-store"}},
            {"credentials": {"value": "do-not-store"}},
        ):
            with self.subTest(config=credential_config):
                with self.assertRaises(MemoryV2CuratorError) as raised:
                    sanitize_memory_agent_config(credential_config)
                self.assertEqual(raised.exception.code, "credential_field_rejected")

        with self.assertRaises(MemoryV2CuratorError) as raised:
            sanitize_memory_agent_config(
                {
                    "additionalInstructions": "x"
                    * (MAX_ADDITIONAL_INSTRUCTIONS_CHARS + 1)
                }
            )
        self.assertEqual(raised.exception.code, "config_limit_exceeded")

    def test_model_selection_priority_and_same_provider_boundary(self):
        explicit = select_curator_model(
            config={"provider": "user_provider", "modelId": "user_model"},
            provider_default={"provider": "default_provider", "modelId": "default_model"},
            chat_provider="chat_provider",
            chat_model_id="chat_model",
        )
        self.assertEqual(explicit["source"], "user_explicit")
        self.assertEqual((explicit["provider"], explicit["model_id"]), ("user_provider", "user_model"))

        provider_default = select_curator_model(
            config={"provider": "provider_a"},
            provider_default={"provider": "provider_a", "modelId": "default_model"},
            chat_provider="provider_a",
            chat_model_id="chat_model",
        )
        self.assertEqual(provider_default["source"], "provider_default")
        self.assertEqual(provider_default["model_id"], "default_model")

        unavailable = select_curator_model(
            config={"provider": "provider_a"},
            provider_default={"provider": "provider_b", "modelId": "default_model"},
            chat_provider="provider_b",
            chat_model_id="chat_model",
        )
        self.assertEqual(unavailable["status"], "Pending")
        self.assertEqual(unavailable["reason"], "explicit_provider_model_unavailable")

        same_provider_chat = select_curator_model(
            config={},
            provider_default={"provider": "provider_a"},
            chat_provider="provider_a",
            chat_model_id="chat_model",
        )
        self.assertEqual(same_provider_chat["source"], "chat_same_provider_fallback")

        cross_provider_chat = select_curator_model(
            config={},
            provider_default={"provider": "provider_a"},
            chat_provider="provider_b",
            chat_model_id="chat_model",
        )
        self.assertEqual(cross_provider_chat["status"], "Pending")
        self.assertEqual(cross_provider_chat["reason"], "provider_default_model_unavailable")

        chat_only = select_curator_model(
            config={},
            chat_provider="provider_b",
            chat_model_id="chat_model",
        )
        self.assertEqual(chat_only["source"], "chat_model_fallback")

        invalid_explicit = select_curator_model(config={"modelId": "model_without_provider"})
        self.assertEqual(invalid_explicit["status"], "Failed")
        self.assertEqual(invalid_explicit["reason"], "explicit_model_requires_provider")


class MemoryV2CuratorEnqueueTests(unittest.TestCase):
    def test_no_candidates_and_noncomplete_runs_create_no_job_or_model(self):
        factory_calls = []

        def forbidden_factory(**kwargs):
            factory_calls.append(kwargs)
            raise AssertionError("model must not be created")

        runtime = _FakeRuntime()
        curator = MemoryV2Curator(runtime, agent_factory=forbidden_factory)
        common = {
            "owner_chat_id": "chat_a",
            "session_id": "session_a",
            "attempt_id": "attempt_a",
            "run_id": "run_a",
            "memory_agent_config": {"apiKey": "ignored because there are no candidates"},
            "chat_provider": "provider_a",
            "chat_model_id": "model_a",
        }

        no_candidates = curator.enqueue_for_completed_root_run(
            **common,
            run_status="complete",
        )
        self.assertEqual(no_candidates["status"], "NoOp")

        for run_status, capture_outcome, is_root_run in (
            ("failed", "complete", True),
            ("cancelled", "complete", True),
            ("complete", "partial", True),
            ("complete", "complete", False),
        ):
            with self.subTest(
                run_status=run_status,
                capture_outcome=capture_outcome,
                is_root_run=is_root_run,
            ):
                result = curator.enqueue_for_completed_root_run(
                    **common,
                    run_status=run_status,
                    capture_outcome=capture_outcome,
                    is_root_run=is_root_run,
                )
                self.assertEqual(result["status"], "Isolated")

        self.assertEqual(runtime.jobs, [])
        self.assertEqual(runtime.enqueue_calls, [])
        self.assertEqual(factory_calls, [])

    def test_exact_scope_metadata_only_payload_and_idempotent_enqueue(self):
        marker = "PLAINTEXT_CANDIDATE_BODY_MUST_NOT_ENTER_JOB"
        runtime = _FakeRuntime(
            [
                _candidate("candidate_b", revision=7, marker=marker),
                _candidate("candidate_a", revision=3, marker=marker),
                _candidate("other_owner", owner="chat_b", marker=marker),
                _candidate("other_session", session="session_b", marker=marker),
                _candidate("other_attempt", attempt="attempt_b", marker=marker),
                _candidate("already_done", status="accepted", marker=marker),
            ]
        )
        curator = MemoryV2Curator(runtime)
        config = {
            "displayName": "Curator",
            "additionalInstructions": "Organize conservatively.",
            "provider": "provider_a",
            "modelId": "model_a",
        }
        kwargs = {
            "owner_chat_id": "chat_a",
            "session_id": "session_a",
            "attempt_id": "attempt_a",
            "run_id": "run_a",
            "run_status": "complete",
            "memory_agent_config": config,
        }

        first = curator.enqueue_for_completed_root_run(**kwargs)
        second = curator.enqueue_for_completed_root_run(**kwargs)

        self.assertEqual(first["status"], "Enqueued")
        self.assertEqual(first["candidate_count"], 2)
        self.assertEqual(second["status"], "Enqueued")
        self.assertTrue(second["replayed"])
        self.assertEqual(second["candidate_count"], 2)
        self.assertEqual(second["model"], first["model"])
        self.assertEqual(len(runtime.enqueue_calls), 1)
        payload = runtime.jobs[0]["payload"]
        self.assertEqual(
            set(payload),
            {"trigger", "candidates", "model", "config_fingerprint"},
        )
        self.assertEqual(
            payload["candidates"],
            [
                {
                    "candidate_id": "candidate_a",
                    "revision": 3,
                    "candidate_ref": "pupu://memory/candidate/candidate_a@3",
                },
                {
                    "candidate_id": "candidate_b",
                    "revision": 7,
                    "candidate_ref": "pupu://memory/candidate/candidate_b@7",
                },
            ],
        )
        self.assertEqual(
            payload["trigger"],
            {"kind": "completed_root_run", "run_id": "run_a"},
        )
        serialized_payload = json.dumps(payload, ensure_ascii=False)
        self.assertNotIn(marker, serialized_payload)
        self.assertNotIn("Organize conservatively", serialized_payload)
        self.assertNotIn("Curator", serialized_payload)

    def test_unavailable_same_provider_model_returns_pending_without_job(self):
        runtime = _FakeRuntime([_candidate("candidate_a")])
        curator = MemoryV2Curator(runtime)
        result = curator.enqueue_for_completed_root_run(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
            run_id="run_a",
            run_status="complete",
            memory_agent_config={"provider": "provider_a"},
            provider_default={"provider": "provider_b", "modelId": "model_b"},
            chat_provider="provider_b",
            chat_model_id="chat_model_b",
        )
        self.assertEqual(result["status"], "Pending")
        self.assertEqual(result["reason"], "explicit_provider_model_unavailable")
        self.assertEqual(runtime.enqueue_calls, [])


class MemoryV2CuratorRunTests(unittest.TestCase):
    CONFIG = {
        "displayName": "Memory Gardener",
        "additionalInstructions": "Use clear names.\nStay conservative.",
        "provider": "provider_a",
        "modelId": "model_a",
    }

    def _enqueue_and_lease(self, runtime):
        enqueue_curator = MemoryV2Curator(runtime)
        result = enqueue_curator.enqueue_for_completed_root_run(
            owner_chat_id="chat_a",
            session_id="session_a",
            attempt_id="attempt_a",
            run_id="run_a",
            run_status="complete",
            memory_agent_config=self.CONFIG,
        )
        self.assertEqual(result["status"], "Enqueued")
        return runtime.lease_last_job()

    def test_run_uses_only_curator_toolkit_audits_and_deduplicates_callback(self):
        runtime = _FakeRuntime([_candidate("candidate_a", revision=4)])
        claimed = self._enqueue_and_lease(runtime)
        factory_calls = []
        toolkit_calls = []
        model_requests = []
        callback_events = []
        toolkit = object()

        def toolkit_factory(*args, **kwargs):
            toolkit_calls.append((args, copy.deepcopy(kwargs)))
            return toolkit

        class FakeAgent:
            def run(self, request):
                model_requests.append(copy.deepcopy(request))
                return {
                    "status": "organized",
                    "proposal_count": 2,
                    "consumed_tokens": 37,
                    "cost": 0,
                    "hidden_reasoning": "must never be returned",
                }

        def agent_factory(**kwargs):
            factory_calls.append(kwargs)
            return FakeAgent()

        curator = MemoryV2Curator(
            runtime,
            agent_factory=agent_factory,
            event_callback=callback_events.append,
            toolkit_factory=toolkit_factory,
            clock_ms=lambda: 1000,
        )
        result = curator.run_job(
            job=claimed,
            memory_agent_config=self.CONFIG,
            worker_id="worker_a",
        )

        self.assertEqual(result["status"], "Completed")
        self.assertEqual(result["proposal_count"], 2)
        self.assertEqual(result["token_usage"], 37)
        self.assertEqual(result["cost"], 0)
        self.assertEqual(len(factory_calls), 1)
        self.assertIs(factory_calls[0]["toolkit"], toolkit)
        self.assertTrue(factory_calls[0]["system_prompt"].startswith(LOCKED_CORE_PROMPT))
        self.assertIn("Use clear names.\nStay conservative.", factory_calls[0]["system_prompt"])
        self.assertIn("Never write long-term memory", factory_calls[0]["system_prompt"])
        self.assertEqual(factory_calls[0]["provider"], "provider_a")
        self.assertEqual(factory_calls[0]["model_id"], "model_a")
        self.assertEqual(len(toolkit_calls), 1)
        toolkit_args, toolkit_kwargs = toolkit_calls[0]
        self.assertIs(toolkit_args[0], runtime)
        self.assertEqual(toolkit_args[1:5], ("chat_a", "session_a", "attempt_a", "run_a"))
        self.assertEqual(
            toolkit_kwargs,
            {
                "curator": True,
                "namespace": "user:local",
                "consolidation_job_id": claimed["job_id"],
                "consolidation_candidate_refs": [
                    "pupu://memory/candidate/candidate_a@4"
                ],
                "consolidation_source_refs": [
                    "pupu://context/event/event_candidate_a"
                ],
            },
        )
        self.assertEqual(len(model_requests), 1)
        self.assertEqual(model_requests[0]["candidates"][0]["candidate_id"], "candidate_a")
        self.assertEqual(
            model_requests[0]["candidates"][0]["source_refs"],
            ["pupu://context/event/event_candidate_a"],
        )
        candidate_content = model_requests[0]["candidates"][0]["content"]
        self.assertEqual(
            candidate_content["ref"],
            "pupu://memory/candidate/candidate_a@4",
        )
        self.assertNotIn("full candidate body", json.dumps(model_requests[0]))
        self.assertEqual(
            [event["type"] for event in result["audit"]],
            ["memory.curator.started", "memory.curator.completed"],
        )
        self.assertEqual(callback_events, result["audit"])
        self.assertNotIn("hidden_reasoning", json.dumps(result))
        self.assertEqual(result["audit"][-1]["token_usage"], 37)
        self.assertEqual(result["audit"][-1]["cost"], 0)
        self.assertEqual(len(runtime.complete_calls), 1)

        repeated = curator.run_job(
            job=claimed,
            memory_agent_config=self.CONFIG,
            worker_id="worker_a",
        )
        self.assertEqual(repeated["status"], "AlreadyCompleted")
        self.assertEqual(len(factory_calls), 1)
        self.assertEqual(len(toolkit_calls), 1)
        self.assertEqual(len(model_requests), 1)
        self.assertEqual(len(runtime.complete_calls), 1)

    def test_leased_job_from_partial_source_is_terminally_isolated_without_model(self):
        runtime = _FakeRuntime([_candidate("candidate_a")])
        claimed = self._enqueue_and_lease(runtime)
        runtime.capture_quality = "partial"
        factory_calls = []
        curator = MemoryV2Curator(
            runtime,
            agent_factory=lambda **kwargs: factory_calls.append(kwargs),
            toolkit_factory=lambda *args, **kwargs: object(),
        )
        result = curator.run_job(
            job=claimed,
            memory_agent_config=self.CONFIG,
            worker_id="worker_a",
        )
        self.assertEqual(result["status"], "Isolated")
        self.assertEqual(result["reason"], "source_capture_partial")
        self.assertEqual(factory_calls, [])
        self.assertEqual(len(runtime.fail_calls), 1)
        self.assertEqual(runtime.fail_calls[0]["error_code"], "source_capture_partial")
        self.assertFalse(result["audit"][0]["model_invoked"])

    def test_process_recursion_guard_prevents_nested_model_call(self):
        runtime = _FakeRuntime([_candidate("candidate_a")])
        claimed = self._enqueue_and_lease(runtime)
        factory_calls = []
        nested_results = []
        holder = {}
        config = self.CONFIG

        class RecursiveAgent:
            def run(self, request):
                del request
                nested_results.append(
                    holder["curator"].run_job(
                        job=claimed,
                        memory_agent_config=config,
                        worker_id="worker_a",
                    )
                )
                return {"status": "done", "proposal_count": 0}

        def agent_factory(**kwargs):
            factory_calls.append(kwargs)
            return RecursiveAgent()

        curator = MemoryV2Curator(
            runtime,
            agent_factory=agent_factory,
            toolkit_factory=lambda *args, **kwargs: object(),
        )
        holder["curator"] = curator
        result = curator.run_job(
            job=claimed,
            memory_agent_config=self.CONFIG,
            worker_id="worker_a",
        )

        self.assertEqual(result["status"], "Completed")
        self.assertEqual(len(factory_calls), 1)
        self.assertEqual(nested_results[0]["status"], "Failed")
        self.assertEqual(nested_results[0]["reason"], "recursion_guard")

    def test_failure_is_terminal_and_audit_omits_exception_message(self):
        runtime = _FakeRuntime([_candidate("candidate_a")])
        claimed = self._enqueue_and_lease(runtime)
        callback_events = []

        class FailingAgent:
            def run(self, request):
                del request
                raise RuntimeError("SECRET_PRIVATE_REASONING_MUST_NOT_ESCAPE")

        curator = MemoryV2Curator(
            runtime,
            agent_factory=lambda **kwargs: FailingAgent(),
            event_callback=callback_events.append,
            toolkit_factory=lambda *args, **kwargs: object(),
            clock_ms=lambda: 1000,
        )
        result = curator.run_job(
            job=claimed,
            memory_agent_config=self.CONFIG,
            worker_id="worker_a",
        )

        self.assertEqual(result["status"], "Failed")
        self.assertEqual(result["reason"], "runtimeerror")
        self.assertEqual(len(runtime.fail_calls), 1)
        self.assertEqual(runtime.fail_calls[0]["error_code"], "runtimeerror")
        self.assertEqual(
            [event["type"] for event in result["audit"]],
            ["memory.curator.started", "memory.curator.failed"],
        )
        self.assertEqual(callback_events, result["audit"])
        self.assertNotIn("SECRET_PRIVATE_REASONING", json.dumps(result))
        self.assertNotIn("SECRET_PRIVATE_REASONING", json.dumps(callback_events))

    def test_missing_ephemeral_config_terminally_fails_fingerprint_without_model(self):
        runtime = _FakeRuntime([_candidate("candidate_a")])
        claimed = self._enqueue_and_lease(runtime)
        factory_calls = []
        curator = MemoryV2Curator(
            runtime,
            agent_factory=lambda **kwargs: factory_calls.append(kwargs),
            toolkit_factory=lambda *args, **kwargs: object(),
        )

        result = curator.run_job(
            job=claimed,
            memory_agent_config={},
            worker_id="worker_a",
        )

        self.assertEqual(result["status"], "Failed")
        self.assertEqual(result["reason"], "config_fingerprint_mismatch")
        self.assertEqual(factory_calls, [])
        self.assertEqual(len(runtime.fail_calls), 1)
        self.assertEqual(
            runtime.fail_calls[0]["error_code"],
            "config_fingerprint_mismatch",
        )
        serialized = json.dumps(result, ensure_ascii=False)
        self.assertNotIn(self.CONFIG["additionalInstructions"], serialized)
        self.assertFalse(result["audit"][0]["model_invoked"])


if __name__ == "__main__":
    unittest.main()
