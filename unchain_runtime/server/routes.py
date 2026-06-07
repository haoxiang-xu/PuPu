import character_defaults
import character_store
from route_auth import _is_authorized, _json_error
from route_blueprint import api_blueprint
from route_projection import _kmeans_2d_numpy
from unchain_adapter import (
    cancel_tool_confirmations,
    get_capability_catalog,
    get_default_model_capabilities,
    get_embedding_provider_catalog,
    get_model_capability_catalog,
    get_model_name,
    get_runtime_config,
    get_toolkit_catalog,
    get_toolkit_catalog_v2,
    get_toolkit_metadata,
    stream_chat,
    stream_chat_events,
    submit_tool_confirmation,
)
from mcp_toolkits import (
    check_mcp_toolkit_health,
    configure_mcp_toolkit,
    delete_mcp_toolkit,
    install_mcp_toolkit,
    list_installed_mcp_toolkits,
    reload_mcp_toolkits,
)
from mcp_oauth import (
    disconnect_mcp_oauth,
    get_mcp_oauth_status,
    handle_mcp_oauth_callback,
    start_mcp_oauth,
)
from mcp_oauth_apps import (
    configure_mcp_oauth_app,
    delete_mcp_oauth_app,
    list_mcp_oauth_apps,
)

import route_catalog  # noqa: F401
import route_chat  # noqa: F401
import route_projection  # noqa: F401
import route_characters  # noqa: F401
import route_memory  # noqa: F401
import route_recipes  # noqa: F401
import route_mcp  # noqa: F401

__all__ = [
    "api_blueprint",
    "_is_authorized",
    "_json_error",
    "_kmeans_2d_numpy",
    "cancel_tool_confirmations",
    "character_defaults",
    "character_store",
    "get_capability_catalog",
    "get_default_model_capabilities",
    "get_embedding_provider_catalog",
    "get_model_capability_catalog",
    "get_model_name",
    "get_runtime_config",
    "get_toolkit_catalog",
    "get_toolkit_catalog_v2",
    "get_toolkit_metadata",
    "check_mcp_toolkit_health",
    "configure_mcp_toolkit",
    "configure_mcp_oauth_app",
    "delete_mcp_toolkit",
    "delete_mcp_oauth_app",
    "disconnect_mcp_oauth",
    "get_mcp_oauth_status",
    "handle_mcp_oauth_callback",
    "install_mcp_toolkit",
    "list_mcp_oauth_apps",
    "list_installed_mcp_toolkits",
    "reload_mcp_toolkits",
    "start_mcp_oauth",
    "stream_chat",
    "stream_chat_events",
    "submit_tool_confirmation",
]
