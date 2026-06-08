#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any


def _write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _unavailable(out_path: Path, reason: str) -> int:
    _write_json(
        out_path,
        {
            "status": "analysis_unavailable",
            "reason": reason,
            "recommendation": "NEEDS-HUMAN-TEST",
            "summary": "Unchain advisory analysis was not run. Deterministic CI results remain authoritative.",
            "missing_manual_checks": [
                "macOS Gatekeeper/notarization",
                "Windows installer launch",
                "Linux AppImage/deb install",
                "Ollama real local-model path",
                "API-key provider smoke",
                "workspace attach with real folders",
            ],
        },
    )
    return 0


def _extract_json_object(text: str) -> dict[str, Any] | None:
    stripped = text.strip()
    if not stripped:
        return None
    try:
        parsed = json.loads(stripped)
        return parsed if isinstance(parsed, dict) else None
    except Exception:
        pass

    match = re.search(r"\{.*\}", stripped, flags=re.DOTALL)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


def _result_text(result: Any) -> str:
    output_text = getattr(result, "output_text", None)
    if isinstance(output_text, str) and output_text.strip():
        return output_text.strip()
    messages = getattr(result, "messages", None)
    if isinstance(messages, list):
        for message in reversed(messages):
            if not isinstance(message, dict):
                continue
            if message.get("role") != "assistant":
                continue
            content = message.get("content")
            if isinstance(content, str) and content.strip():
                return content.strip()
    return str(result or "").strip()


def main() -> int:
    parser = argparse.ArgumentParser(description="Run optional Unchain release QA analysis.")
    parser.add_argument("--report", required=True, help="Path to release-qa-report.json")
    parser.add_argument("--out", required=True, help="Path to write release-qa-analysis.json")
    args = parser.parse_args()

    report_path = Path(args.report)
    out_path = Path(args.out)

    provider = os.environ.get("PUPU_QA_PROVIDER", "openai").strip().lower() or "openai"
    model = os.environ.get("PUPU_QA_MODEL", "").strip()
    if not model:
        model = "gpt-4.1-mini" if provider == "openai" else "claude-haiku-4-5"

    api_key = (
        os.environ.get("PUPU_QA_API_KEY")
        or os.environ.get("UNCHAIN_API_KEY")
        or (os.environ.get("ANTHROPIC_API_KEY") if provider == "anthropic" else "")
        or (os.environ.get("OPENAI_API_KEY") if provider == "openai" else "")
        or ""
    ).strip()
    if not api_key:
        return _unavailable(out_path, "missing_api_key")

    unchain_source = os.environ.get("UNCHAIN_SOURCE_PATH", "").strip()
    if unchain_source:
        source_path = Path(unchain_source)
        candidate = source_path / "src"
        sys.path.insert(0, str(candidate if candidate.exists() else source_path))

    try:
        from unchain import Agent
    except Exception as exc:
        return _unavailable(out_path, f"unchain_import_failed: {exc}")

    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except Exception as exc:
        return _unavailable(out_path, f"report_read_failed: {exc}")

    instructions = (
        "You are PuPu's release QA analyst. Review deterministic CI evidence and return only JSON with "
        "keys: status, recommendation, summary, risks, missing_manual_checks. "
        "recommendation must be one of GO, NO-GO, NEEDS-HUMAN-TEST. "
        "Do not mark manual OS installer checks as complete unless the report has direct evidence."
    )
    prompt = (
        "Analyze this PuPu release QA report. Deterministic failures should be treated as release blockers; "
        "manual installer and local-model checks should remain explicit human follow-up when not evidenced.\n\n"
        f"{json.dumps(report, ensure_ascii=False, indent=2)}"
    )

    try:
        agent = Agent(
            name="pupu_release_qa_analyst",
            instructions=instructions,
            provider=provider,
            model=model,
            api_key=api_key,
        )
        result = agent.run(prompt, max_iterations=1)
        raw_text = _result_text(result)
    except Exception as exc:
        return _unavailable(out_path, f"unchain_run_failed: {exc}")

    parsed = _extract_json_object(raw_text)
    if parsed is None:
        parsed = {
            "status": "analysis_completed",
            "recommendation": "NEEDS-HUMAN-TEST",
            "summary": raw_text[:4000],
            "risks": [],
            "missing_manual_checks": [],
        }
    parsed.setdefault("status", "analysis_completed")
    parsed.setdefault("recommendation", "NEEDS-HUMAN-TEST")
    _write_json(out_path, parsed)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
