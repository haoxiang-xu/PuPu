"""System prompt for context window optimizer summary generation."""

SUMMARY_SYSTEM_PROMPT = (
    "Summarize the following conversation concisely. "
    "Focus on: decisions made, files modified, current task state, "
    "and any pending action items. "
    "Do NOT include greetings, filler, or tool call details. "
    "Output plain text only, no markdown headers."
)
