"""Classify a mid-run user message into an interject channel.

Model-based, deliberately tiny: one no-tools single-iteration call on the
provider's cheap tier. Any failure degrades to "clarify" (never guess).
"""
from __future__ import annotations

from typing import Any, Callable

_VALID = ("btw", "fyi", "queue", "clarify")

CLASSIFIER_SYSTEM_PROMPT = (
    "An AI agent is currently working on a task. The user just sent a new "
    "message mid-run. Classify the user's intent into exactly one word:\n"
    "- btw: a side question to answer now (about progress, reasons, or "
    "anything conversational) that does not change the task\n"
    "- fyi: extra information or a requirement change that affects the "
    "CURRENT task\n"
    "- queue: a NEW follow-up request to queue up for AFTER the current task "
    "finishes\n"
    "- clarify: genuinely ambiguous between the above\n"
    "Reply with one word only: btw, fyi, queue or clarify."
)


def _default_run_classifier(options: dict[str, Any]) -> Callable[[list[dict]], str]:
    def run(messages: list[dict]) -> str:
        import unchain_adapter as adapter

        # C1/C9: route the classifier through the same cfg-aware constructor as
        # the main chat link. For a custom-provider run this parses the snapshot
        # options' custom_provider, builds the model_io_factory, resolves the
        # key cfg-aware and skips the downgrade — so the classifier hits the
        # user's base_url, not api.openai.com / the official Anthropic endpoint.
        agent = adapter.build_interject_agent(options or {}, name="interject_router")
        result = agent.run(messages, max_iterations=1)
        from unchain.kernel.lifecycle_events import last_assistant_text
        return last_assistant_text(result.messages)
    return run


def classify_interject(
    text: str,
    digest_summary: str,
    options: dict[str, Any],
    *,
    run_agent: Callable[[list[dict]], str] | None = None,
) -> str:
    messages = [
        {"role": "system", "content": CLASSIFIER_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Current run progress:\n{digest_summary or '(just started)'}\n\n"
                f"User message:\n{text}"
            ),
        },
    ]
    runner = run_agent or _default_run_classifier(options)
    try:
        raw = (runner(messages) or "").strip().lower()
    except Exception:
        return "clarify"
    for label in _VALID:
        if raw == label or raw.startswith(label):
            return label
    return "clarify"
