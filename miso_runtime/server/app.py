import os

from flask import Flask

from routes import api_blueprint


def create_app() -> Flask:
    flask_app = Flask(__name__)
    flask_app.config["MISO_VERSION"] = os.environ.get("MISO_VERSION", "0.1.0-dev")
    flask_app.config["MISO_AUTH_TOKEN"] = os.environ.get("MISO_AUTH_TOKEN", "")
    flask_app.register_blueprint(api_blueprint)
    return flask_app
