"""Real live foreign writer, released by a task-private marker."""
import json
import os
from pathlib import Path
import socket
import sys
import time
from types import SimpleNamespace

sys.path[:0] = [str(Path(__file__).resolve().parents[1]), str(Path(__file__).resolve().parent)]
import unchain_adapter as adapter
import openai
from unchain.skeleton.tool_runtime import SkeletonToolRuntime
from test_skeleton_production_chat import Stream


def denied(*args, **kwargs):
    raise AssertionError("No network in held tool fixture")


socket.socket.connect = denied
socket.socket.connect_ex = denied
socket.create_connection = denied
options_file, interaction_id, marker_name, release_name = sys.argv[1:]
marker, release = Path(marker_name), Path(release_name)
openai.OpenAI = lambda **kwargs: SimpleNamespace(responses=SimpleNamespace(create=lambda **wire: Stream("Held tool completed")))
original = SkeletonToolRuntime.resume_interaction


def held(self, context, resolved, preparation, response):
    result = original(self, context, resolved, preparation, response)
    with marker.open("x") as output:
        output.write("actual tool finished")
        output.flush()
        os.fsync(output.fileno())
    until = time.monotonic() + 30
    while not release.exists():
        if time.monotonic() > until:
            raise AssertionError("test did not release live tool")
        time.sleep(.02)
    return result


SkeletonToolRuntime.resume_interaction = held
list(adapter.resume_chat_interaction_events(session_id="step-session", interaction_id=interaction_id,
    options=json.loads(Path(options_file).read_text()), attempt_id="step-resume", source_attempt_id="step-root"))
