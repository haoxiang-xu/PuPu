"""Disposable real resume process, killed after Core's effect, before sealing.

This is a fixture, not a fake execution result. The real official handler runs
first; a fsynced marker identifies the exact interruption point. Network and
the SDK request method are both denied even if a regression reaches the model.
"""
import json
import os
from pathlib import Path
import signal
import socket
import sys
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import unchain_adapter as adapter
import openai
from unchain.skeleton.tool_runtime import SkeletonToolRuntime


def denied(*args, **kwargs):
    raise AssertionError("No network or provider request in interrupted tool fixture")


socket.socket.connect = denied
socket.socket.connect_ex = denied
socket.create_connection = denied
openai.OpenAI = lambda **kwargs: SimpleNamespace(responses=SimpleNamespace(create=denied))
options_file, interaction_id, marker = sys.argv[1:]
original = SkeletonToolRuntime.resume_interaction


def interrupt_after_effect(self, context, resolved, preparation, response):
    result = original(self, context, resolved, preparation, response)
    with open(marker, "x") as output:
        json.dump({"node": context.node_id, "graph": context.graph_id,
                   "effect": Path(resolved["path"]).read_text()}, output)
        output.flush()
        os.fsync(output.fileno())
    os.kill(os.getpid(), signal.SIGKILL)
    raise AssertionError("SIGKILL returned")


SkeletonToolRuntime.resume_interaction = interrupt_after_effect
list(adapter.resume_chat_interaction_events(session_id="step-session", interaction_id=interaction_id,
    options=json.loads(Path(options_file).read_text()), attempt_id="step-resume", source_attempt_id="step-root"))
raise AssertionError("interrupted resume returned without the effect")
