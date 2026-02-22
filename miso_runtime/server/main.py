import os
import signal
import sys
import threading
import time

from app import create_app
from server_thread import ThreadedFlaskServer


def _read_port() -> int:
    raw_port = os.environ.get("MISO_PORT", "5879")
    try:
        port = int(raw_port)
        if port < 1 or port > 65535:
            raise ValueError("port out of range")
        return port
    except Exception as port_error:
        raise ValueError(f"Invalid MISO_PORT value: {raw_port}") from port_error


def main() -> int:
    host = os.environ.get("MISO_HOST", "127.0.0.1")
    port = _read_port()

    app = create_app()
    server = ThreadedFlaskServer(app, host=host, port=port)

    shutdown_event = threading.Event()

    def request_shutdown(signum, _frame) -> None:
        print(f"[miso] received signal {signum}, shutting down", flush=True)
        shutdown_event.set()

    signal.signal(signal.SIGINT, request_shutdown)
    signal.signal(signal.SIGTERM, request_shutdown)

    try:
        server.start()
        print(f"[miso] listening on http://{host}:{port}", flush=True)
        while not shutdown_event.is_set():
            time.sleep(0.2)
    except KeyboardInterrupt:
        shutdown_event.set()
    finally:
        server.stop()
        print("[miso] server stopped", flush=True)

    return 0


if __name__ == "__main__":
    sys.exit(main())
