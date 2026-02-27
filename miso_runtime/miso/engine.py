import time
from typing import Dict, Iterable, List


class MisoEngine:
    def __init__(self, model_name: str = "miso-local-dev") -> None:
        self.model_name = model_name

    def _build_response(
        self,
        *,
        message: str,
        history: List[Dict[str, str]],
        options: Dict[str, float],
    ) -> str:
        prior_turn_count = len(history)
        temperature = options.get("temperature", 0.2)
        max_tokens = int(options.get("maxTokens", 512))

        return (
            f"[{self.model_name}] Received your message.\n\n"
            f"Echo: {message}\n\n"
            f"Context turns: {prior_turn_count}\n"
            f"temperature={temperature}, max_tokens={max_tokens}\n\n"
            "This is a local development implementation of Miso streaming output. "
            "Replace miso_runtime/miso/engine.py with your real Miso integration."
        )

    def stream_reply(
        self,
        *,
        message: str,
        history: List[Dict[str, str]],
        options: Dict[str, float],
    ) -> Iterable[str]:
        reply = self._build_response(message=message, history=history, options=options)
        tokens = reply.split(" ")
        token_count = len(tokens)

        for index, token in enumerate(tokens):
            suffix = "" if index == token_count - 1 else " "
            yield f"{token}{suffix}"
            time.sleep(0.02)
