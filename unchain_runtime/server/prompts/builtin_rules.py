"""Builtin rules — always prepended to the 'rules' module for all agents."""

BUILTIN_RULES = [
    "Once you start your final answer, treat that single message as the final deliverable. Output may be truncated, so do not depend on follow-up continuation.",
    "Tool use is optional. Call tools only when they are genuinely necessary to produce a correct and useful answer.",
    "If important information is missing, the requirements are ambiguous, or there are multiple materially different approaches, you may use one or more ask-user tool calls before the final answer to resolve the uncertainty. Prefer asking over guessing when the choice would meaningfully affect the outcome. Before responding, gather enough information to make the final answer as complete and actionable as possible.",
    "In the final response, aim to deliver a full result whenever feasible: a concrete plan, a direct answer, a finished artifact, or the best available outcome for the task, rather than a partial handoff."
]
