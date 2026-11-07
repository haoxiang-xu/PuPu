"""Fresh-process observer: no model factory or tool construction is allowed."""
import json
from pathlib import Path
import socket
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import unchain_adapter as adapter
import openai
import durable_interaction_host as interactions
from skeleton_production_state import load_launch


def denied(*args, **kwargs):
    raise AssertionError("Cold observation cannot dispatch or construct a capability")


socket.socket.connect = denied
socket.socket.connect_ex = denied
socket.create_connection = denied
openai.OpenAI = denied
adapter._build_selected_toolkits = denied
result = interactions.get_pending_interaction("step-session")
record = load_launch("step-session", "step-root").store.load()
print(json.dumps({"pid": __import__("os").getpid(), "pending": result["status"],
    "status": record.state["status"], "error": record.state["error"], "revision": record.revision}))
