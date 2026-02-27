import threading
from typing import Optional

from werkzeug.serving import make_server


class ThreadedFlaskServer:
    def __init__(self, app, host: str, port: int) -> None:
        self._app = app
        self._host = host
        self._port = port
        self._server = None
        self._thread: Optional[threading.Thread] = None
        self._started = threading.Event()

    def _run_server(self) -> None:
        if self._server is None:
            return
        self._started.set()
        self._server.serve_forever()

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return

        self._server = make_server(self._host, self._port, self._app, threaded=True)
        self._thread = threading.Thread(
            target=self._run_server,
            name="miso-flask-thread",
            daemon=True,
        )
        self._thread.start()
        self._started.wait(timeout=2)

    def stop(self) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()

        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5)

        self._thread = None
        self._server = None
        self._started.clear()
