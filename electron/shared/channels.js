const CHANNELS = Object.freeze({
  APP: Object.freeze({
    GET_VERSION: "app:get-version",
  }),
  UPDATE: Object.freeze({
    GET_STATE: "update:get-state",
    CHECK_AND_DOWNLOAD: "update:check-and-download",
    INSTALL_NOW: "update:install-now",
    STATE_CHANGED: "update:state-changed",
  }),
  OLLAMA: Object.freeze({
    GET_STATUS: "ollama-get-status",
    LIST_INSTALLED_MODELS: "ollama:list-installed-models",
    RESTART: "ollama-restart",
    INSTALL: "ollama:install",
    INSTALL_PROGRESS: "ollama:install-progress",
    LIBRARY_SEARCH: "ollama:library-search",
  }),
  MISO: Object.freeze({
    GET_STATUS: "miso:get-status",
    GET_MODEL_CATALOG: "miso:get-model-catalog",
    GET_TOOLKIT_CATALOG: "miso:get-toolkit-catalog",
    TOOL_CONFIRMATION: "miso:tool-confirmation",
    SET_CHROME_TERMINAL_OPEN: "miso:set-chrome-terminal-open",
    PICK_WORKSPACE_ROOT: "miso:pick-workspace-root",
    VALIDATE_WORKSPACE_ROOT: "miso:validate-workspace-root",
    OPEN_RUNTIME_FOLDER: "miso:open-runtime-folder",
    GET_RUNTIME_DIR_SIZE: "miso:get-runtime-dir-size",
    DELETE_RUNTIME_ENTRY: "miso:delete-runtime-entry",
    CLEAR_RUNTIME_DIR: "miso:clear-runtime-dir",
    GET_MEMORY_SIZE: "miso:get-memory-size",
    GET_MEMORY_PROJECTION: "miso:get-memory-projection",
    GET_LONG_TERM_MEMORY_PROJECTION: "miso:get-long-term-memory-projection",
    REPLACE_SESSION_MEMORY: "miso:replace-session-memory",
    STREAM_START: "miso:stream:start",
    STREAM_START_V2: "miso:stream:start-v2",
    STREAM_CANCEL: "miso:stream:cancel",
    STREAM_EVENT: "miso:stream:event",
    RUNTIME_LOG: "miso:runtime-log",
  }),
  THEME: Object.freeze({
    SET_BACKGROUND_COLOR: "theme-set-background-color",
    SET_MODE: "theme-set-mode",
  }),
  WINDOW_STATE: Object.freeze({
    HANDLE_ACTION: "window-state-event-handler",
    LISTENER_EVENT: "window-state-event-listener",
  }),
});

module.exports = {
  CHANNELS,
};
