import sys
import threading
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[1]
if str(SERVER_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVER_ROOT))

# Ensure unchain is on path by importing unchain_adapter first
import unchain_adapter  # noqa: F401

from interaction_channels import (  # noqa: E402
    InterjectChannels,
    get_interject_channels,
    register_interject_channels,
    release_interject_channels,
)


def test_register_get_release_lifecycle():
    ch = register_interject_channels("thread-1", "do the task")
    assert isinstance(ch, InterjectChannels)
    assert ch.original_task == "do the task"
    assert get_interject_channels("thread-1") is ch
    assert get_interject_channels("thread-unknown") is None
    release_interject_channels("thread-1")
    assert get_interject_channels("thread-1") is None
    release_interject_channels("thread-1")  # idempotent


def test_reregister_overwrites_and_stale_release_is_noop():
    old = register_interject_channels("thread-2", "task A")
    new = register_interject_channels("thread-2", "task B")
    assert get_interject_channels("thread-2") is new
    release_interject_channels("thread-2", old)   # stale handle: must NOT delete new
    assert get_interject_channels("thread-2") is new
    release_interject_channels("thread-2", new)
    assert get_interject_channels("thread-2") is None


def test_channels_have_working_fyi_and_digest():
    ch = register_interject_channels("thread-3", "t")
    mid = ch.fyi.post("hello")
    assert ch.fyi.pending_count() == 1 and mid
    ch.digest({"type": "iteration_started", "iteration": 0})
    assert "iteration" in ch.digest.summary()
    release_interject_channels("thread-3")


def test_options_snapshot_defaults_to_empty_and_is_copied():
    ch = register_interject_channels("thread-4", "t")
    assert ch.options == {}
    release_interject_channels("thread-4")

    source = {"modelId": "gpt-5", "provider": "openai"}
    ch2 = register_interject_channels("thread-5", "t", options=source)
    assert ch2.options == source
    source["modelId"] = "mutated"  # must be a shallow copy, not the same dict
    assert ch2.options["modelId"] == "gpt-5"
    release_interject_channels("thread-5")


def test_thread_safety_smoke():
    def worker(i):
        register_interject_channels(f"t-{i}", "x")
        get_interject_channels(f"t-{i}")
        release_interject_channels(f"t-{i}")
    threads = [threading.Thread(target=worker, args=(i,)) for i in range(30)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    for i in range(30):
        assert get_interject_channels(f"t-{i}") is None
