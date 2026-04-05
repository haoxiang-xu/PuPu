"""Prompt module system configuration — ordering, headers, merge strategies."""

from typing import Dict

PROMPT_MODULE_ORDER = (
    "identity",
    "personality",
    "capability",
    "rules",
    "workflow",
    "delegation",
    "style",
    "output_format",
    "context",
    "constraints",
    "fallback",
)

PROMPT_MODULE_HEADERS = {
    "identity": None,            # no header — first line IS the identity
    "personality": "Personality",
    "capability": "Capabilities",
    "rules": "Rules",
    "workflow": "Workflow",
    "delegation": "Delegation",
    "style": "Style",
    "output_format": "Output Format",
    "context": "Context",
    "constraints": "Constraints",
    "fallback": "Fallback",
}

PROMPT_MODULE_MERGE: Dict[str, str] = {
    "identity": "replace",
    "personality": "replace",
    "capability": "replace",
    "rules": "prepend",          # builtin first, then user, then agent
    "workflow": "replace",
    "delegation": "replace",
    "style": "replace",
    "output_format": "replace",
    "context": "replace",
    "constraints": "append",     # agent + user concatenated
    "fallback": "replace",
}

# Backward-compat: V2 section keys map 1:1 to module keys
V2_TO_MODULE_KEY = {
    "personality": "personality",
    "rules": "rules",
    "style": "style",
    "output_format": "output_format",
    "context": "context",
    "constraints": "constraints",
}

# Legacy aliases kept for backward compat with V2 frontend
SECTION_ALIASES = {
    "personally": "personality",
}
