const CHANNELS = Object.freeze({
  APP: Object.freeze({
    GET_VERSION: "app:get-version",
  }),
  CHAT_STORAGE: Object.freeze({
    BOOTSTRAP_READ: "chat-storage:bootstrap-read",
    READ_MESSAGES: "chat-storage:read-messages",
    APPLY_OPS: "chat-storage:apply-ops",
    APPLY_OPS_SYNC: "chat-storage:apply-ops-sync",
    WRITE: "chat-storage:write",
  }),
  SETTINGS_STORAGE: Object.freeze({
    BOOTSTRAP_READ: "settings-storage:bootstrap-read",
    MIGRATE_LEGACY: "settings-storage:migrate-legacy",
    SET_NAMESPACE: "settings-storage:set-namespace",
    DELETE_NAMESPACE: "settings-storage:delete-namespace",
    // Phase 2 — token_usage structured store (plan §3.2 / §4.2)
    TOKEN_USAGE_APPEND: "settings-storage:token-usage-append",
    TOKEN_USAGE_QUERY: "settings-storage:token-usage-query",
    TOKEN_USAGE_CLEAR: "settings-storage:token-usage-clear",
    TOKEN_USAGE_MIGRATE_LEGACY: "settings-storage:token-usage-migrate-legacy",
    // Phase 2 — toolkit preference structured stores (plan §3.3)
    DEFAULT_TOOLKITS_READ_ALL: "settings-storage:default-toolkits-read-all",
    DEFAULT_TOOLKITS_REPLACE_SCOPE:
      "settings-storage:default-toolkits-replace-scope",
    DEFAULT_TOOLKITS_MIGRATE_LEGACY:
      "settings-storage:default-toolkits-migrate-legacy",
    TOOLKIT_AUTO_APPROVE_READ_ALL:
      "settings-storage:toolkit-auto-approve-read-all",
    TOOLKIT_AUTO_APPROVE_REPLACE_ALL:
      "settings-storage:toolkit-auto-approve-replace-all",
    TOOLKIT_AUTO_APPROVE_MIGRATE_LEGACY:
      "settings-storage:toolkit-auto-approve-migrate-legacy",
    // Phase 2 — computer use preference KV store (plan §3.4)
    COMPUTER_USE_PREFS_READ_ALL: "settings-storage:computer-use-read-all",
    COMPUTER_USE_PREFS_SET_KEY: "settings-storage:computer-use-set-key",
    COMPUTER_USE_PREFS_CLEAR_KEY: "settings-storage:computer-use-clear-key",
    COMPUTER_USE_PREFS_MIGRATE_LEGACY:
      "settings-storage:computer-use-migrate-legacy",
    // Phase 3 — custom MCP icon asset store (plan §3.6). Icons live on disk
    // under userData/assets/mcp-icons; SQL (asset_metadata) holds only the
    // metadata, and the renderer reads content on demand through these.
    MCP_ICON_GET: "settings-storage:mcp-icon-get",
    MCP_ICON_SET: "settings-storage:mcp-icon-set",
    MCP_ICON_DELETE: "settings-storage:mcp-icon-delete",
    MCP_ICON_LIST_OWNERS: "settings-storage:mcp-icon-list-owners",
    MCP_ICON_MIGRATE_LEGACY: "settings-storage:mcp-icon-migrate-legacy",
    // Phase 4 (S7) — provider secret migration trigger (plan §3.7 / §11B).
    // The ONLY inbound channel that carries plaintext provider secrets: the
    // renderer hands its own legacy localStorage keys to the main process to be
    // encrypted into provider_credentials. Write-direction only — no read
    // channel for stored secrets ever exists (gate 7 red line #8). The handler
    // returns a status object only (never a secret value or ciphertext).
    MIGRATE_PROVIDER_CREDENTIALS:
      "settings-storage:migrate-provider-credentials",
    // Steady-state provider credential mutations. Both are invoke/handle
    // channels with an explicit durability ack. SET is write-direction only
    // and may carry plaintext; DELETE carries identity only. No credential
    // read channel is exposed to the renderer.
    SET_PROVIDER_CREDENTIAL: "settings-storage:set-provider-credential",
    DELETE_PROVIDER_CREDENTIAL: "settings-storage:delete-provider-credential",
    // Phase 5 — reset settings (plan §6-Phase5). A single SQL transaction that
    // clears the non-sensitive settings + preference tables (settings /
    // default_toolkits / toolkit_auto_approve / tool_auto_approve /
    // computer_use_preferences) so every store reads back its DEFAULT_*.
    // NEVER touches provider_credentials (API keys), token_usage_records,
    // asset_metadata (MCP icons) or the meta migration state. Returns a status
    // object with cleared row counts only — never a value or a secret.
    RESET_SETTINGS: "settings-storage:reset-settings",
    // Phase 5 — read-only settings.db metadata for the Local Storage page's
    // "SQLite Settings database" category. Returns { sizeBytes, tables:
    // [{ name, rows }] } — metadata ONLY, never a stored value or secret.
    DB_STATS: "settings-storage:db-stats",
    // Quit durability handshake. Main asks the renderer to close admission
    // and drain every settings FIFO before Electron starts renderer unload.
    // The result is control metadata only: { requestId, ok, errorCode? }.
    QUIT_DRAIN_REQUEST: "settings-storage:quit-drain-request",
    QUIT_DRAIN_RESULT: "settings-storage:quit-drain-result",
    QUIT_DRAIN_ABORT: "settings-storage:quit-drain-abort",
  }),
  MEMORY_VAULT: Object.freeze({
    // Memory V2 P0 vault control plane. Storage / opaque handle / descriptor /
    // grant ONLY. DEPOSIT is the single channel that may carry plaintext and
    // only in the renderer → main direction (immediate safeStorage
    // encryption). There is deliberately NO read/resolve/decrypt channel —
    // stored secrets never travel back over IPC in any form (security
    // sign-off condition; sink resolution is a deferred, separately-reviewed
    // phase). Every mutation carries an operationId and is idempotent.
    DEPOSIT: "memory-vault:deposit",
    LIST_DESCRIPTORS: "memory-vault:list-descriptors",
    DELETE: "memory-vault:delete",
    GRANT: "memory-vault:grant",
    REVOKE: "memory-vault:revoke",
    GET_STATUS: "memory-vault:get-status",
  }),
  CONTEXT_V2: Object.freeze({
    // Memory / Context V2 P0 control plane. A SEPARATE namespace from UNCHAIN
    // on purpose: the unchain bridge is already an oversized, high-blast-radius
    // surface, and Context V2 needs a small, individually auditable set of
    // explicitly authenticated operations rather than N more methods bolted
    // onto it.
    //
    // Hard boundary conditions for this namespace (mirrored in the main
    // handlers, the preload bridge and the parity tests):
    //   * NO generic method/path/url/fetch channel — every capability the
    //     renderer has is one named channel with a fixed Flask route.
    //   * The unchain auth token, the sidecar port and any filesystem path
    //     never cross these channels in either direction.
    //   * Internal-only Flask surface (event append/bootstrap, job
    //     claim/heartbeat/complete/fail, arbitrary long-term namespaces,
    //     space/entry mutation) is deliberately NOT represented here.
    //   * The promotion target namespace is server-bound and is never accepted
    //     from the renderer.
    //   * CHAT DELETION IS NOT A RENDERER CAPABILITY. There is deliberately no
    //     delete-chat channel: a renderer-driven delete could destroy one
    //     store's context while the other stores kept theirs. Deletion is
    //     initiated by the chat store and completed by the main-process
    //     deletion outbox, which drives unchainService.deleteContextV2Chat
    //     internally and survives a restart. Re-adding a channel here would
    //     reintroduce the partial-delete window and needs a fresh security
    //     review, not a one-line edit.
    GET_STATUS: "context-v2:get-status",
    LIST_EVENTS: "context-v2:list-events",
    READ_CONTENT: "context-v2:read-content",
    GET_SESSION_HEAD: "context-v2:get-session-head",
    REBASE_SESSION: "context-v2:rebase-session",
    LIST_SPACES: "context-v2:list-spaces",
    GET_TREE: "context-v2:get-tree",
    LIST_ENTRIES: "context-v2:list-entries",
    SEARCH_ENTRIES: "context-v2:search-entries",
    LIST_CANDIDATES: "context-v2:list-candidates",
    LIST_JOBS: "context-v2:list-jobs",
    LIST_PROMOTIONS: "context-v2:list-promotions",
    DECIDE_CANDIDATE: "context-v2:decide-candidate",
    CREATE_PROMOTION: "context-v2:create-promotion",
    DECIDE_PROMOTION: "context-v2:decide-promotion",
    // schema-v4 candidate-review triad. A review is the human-visible diff a
    // curator job PROPOSES; the renderer may read the queue, read one review,
    // and decide it (apply/reject) — nothing else.
    //
    // Deliberately absent from this triad, for the same reasons the rest of the
    // namespace is bounded:
    //   * review CREATION (propose_job_candidate_review) is a curator-job
    //     product, not a renderer capability — the renderer may not manufacture
    //     a diff for itself to approve,
    //   * the job LEASE the proposal rides on (claim/heartbeat/complete/fail)
    //     stays main/worker-internal,
    //   * review content bodies are read through the existing READ_CONTENT
    //     ref grammar, not a second content channel.
    LIST_CANDIDATE_REVIEWS: "context-v2:list-candidate-reviews",
    GET_CANDIDATE_REVIEW: "context-v2:get-candidate-review",
    DECIDE_CANDIDATE_REVIEW: "context-v2:decide-candidate-review",
  }),
  UPDATE: Object.freeze({
    GET_STATE: "update:get-state",
    CHECK_AND_DOWNLOAD: "update:check-and-download",
    INSTALL_NOW: "update:install-now",
    STATE_CHANGED: "update:state-changed",
    GET_AUTO_UPDATE: "update:get-auto-update",
    SET_AUTO_UPDATE: "update:set-auto-update",
  }),
  OLLAMA: Object.freeze({
    GET_STATUS: "ollama-get-status",
    LIST_INSTALLED_MODELS: "ollama:list-installed-models",
    RESTART: "ollama-restart",
    INSTALL: "ollama:install",
    INSTALL_PROGRESS: "ollama:install-progress",
    LIBRARY_SEARCH: "ollama:library-search",
  }),
  UNCHAIN: Object.freeze({
    GET_STATUS: "unchain:get-status",
    GET_COMPUTER_USE_STATUS: "unchain:get-computer-use-status",
    SET_COMPUTER_USE_ENABLED: "unchain:set-computer-use-enabled",
    SET_COMPUTER_USE_LOCAL_BETA_ENABLED:
      "unchain:set-computer-use-local-beta-enabled",
    PROBE_COMPUTER_USE_MODEL: "unchain:probe-computer-use-model",
    OPEN_COMPUTER_USE_PRIVACY_SETTINGS:
      "unchain:open-computer-use-privacy-settings",
    GET_MODEL_CATALOG: "unchain:get-model-catalog",
    GET_TOOLKIT_CATALOG: "unchain:get-toolkit-catalog",
    LIST_TOOL_MODAL_CATALOG: "unchain:list-tool-modal-catalog",
    GET_TOOLKIT_DETAIL: "unchain:get-toolkit-detail",
    LIST_MCP_TOOLKITS: "unchain:list-mcp-toolkits",
    INSTALL_MCP_TOOLKIT: "unchain:install-mcp-toolkit",
    DELETE_MCP_TOOLKIT: "unchain:delete-mcp-toolkit",
    RELOAD_MCP_TOOLKITS: "unchain:reload-mcp-toolkits",
    CHECK_MCP_TOOLKIT_HEALTH: "unchain:check-mcp-toolkit-health",
    CONFIGURE_MCP_TOOLKIT: "unchain:configure-mcp-toolkit",
    START_MCP_OAUTH: "unchain:start-mcp-oauth",
    CANCEL_MCP_OAUTH: "unchain:cancel-mcp-oauth",
    GET_MCP_OAUTH_STATUS: "unchain:get-mcp-oauth-status",
    DISCONNECT_MCP_OAUTH: "unchain:disconnect-mcp-oauth",
    LIST_MCP_OAUTH_APPS: "unchain:list-mcp-oauth-apps",
    CONFIGURE_MCP_OAUTH_APP: "unchain:configure-mcp-oauth-app",
    DELETE_MCP_OAUTH_APP: "unchain:delete-mcp-oauth-app",
    LIST_MCP_STORE_METADATA: "unchain:list-mcp-store-metadata",
    RELOAD_MCP_STORE_METADATA: "unchain:reload-mcp-store-metadata",
    LIST_MCP_STORE_ENTRIES: "unchain:list-mcp-store-entries",
    LIST_MCP_STORE_REGISTRIES: "unchain:list-mcp-store-registries",
    IMPORT_MCP_STORE_REGISTRY: "unchain:import-mcp-store-registry",
    VALIDATE_MCP_STORE_REGISTRY: "unchain:validate-mcp-store-registry",
    REFRESH_MCP_STORE_REGISTRY: "unchain:refresh-mcp-store-registry",
    DELETE_MCP_STORE_REGISTRY: "unchain:delete-mcp-store-registry",
    APPROVE_MCP_STORE_ENTRY: "unchain:approve-mcp-store-entry",
    REVOKE_MCP_STORE_ENTRY_APPROVAL: "unchain:revoke-mcp-store-entry-approval",
    TOOL_CONFIRMATION: "unchain:tool-confirmation",
    PENDING_INTERACTION: "unchain:pending-interaction",
    INTERJECT: "unchain:interject",
    CANCEL_EXECUTION: "unchain:execution:cancel",
    SET_CHROME_TERMINAL_OPEN: "unchain:set-chrome-terminal-open",
    SYNC_BUILD_FEATURE_FLAGS_SNAPSHOT: "unchain:sync-build-feature-flags-snapshot",
    PICK_WORKSPACE_ROOT: "unchain:pick-workspace-root",
    VALIDATE_WORKSPACE_ROOT: "unchain:validate-workspace-root",
    OPEN_RUNTIME_FOLDER: "unchain:open-runtime-folder",
    GET_RUNTIME_DIR_SIZE: "unchain:get-runtime-dir-size",
    DELETE_RUNTIME_ENTRY: "unchain:delete-runtime-entry",
    CLEAR_RUNTIME_DIR: "unchain:clear-runtime-dir",
    GET_MEMORY_SIZE: "unchain:get-memory-size",
    GET_CHARACTER_STORAGE_SIZE: "unchain:get-character-storage-size",
    DELETE_CHARACTER_STORAGE_ENTRY: "unchain:delete-character-storage-entry",
    GET_MEMORY_PROJECTION: "unchain:get-memory-projection",
    GET_LONG_TERM_MEMORY_PROJECTION: "unchain:get-long-term-memory-projection",
    REPLACE_SESSION_MEMORY: "unchain:replace-session-memory",
    GET_SESSION_MEMORY_EXPORT: "unchain:get-session-memory-export",
    LIST_SEED_CHARACTERS: "unchain:list-seed-characters",
    LIST_CHARACTERS: "unchain:list-characters",
    GET_CHARACTER: "unchain:get-character",
    SAVE_CHARACTER: "unchain:save-character",
    DELETE_CHARACTER: "unchain:delete-character",
    LIST_RECIPES: "unchain:list-recipes",
    GET_RECIPE: "unchain:get-recipe",
    SAVE_RECIPE: "unchain:save-recipe",
    DELETE_RECIPE: "unchain:delete-recipe",
    LIST_SUBAGENT_REFS: "unchain:list-subagent-refs",
    PREVIEW_CHARACTER_DECISION: "unchain:preview-character-decision",
    BUILD_CHARACTER_AGENT_CONFIG: "unchain:build-character-agent-config",
    EXPORT_CHARACTER: "unchain:export-character",
    IMPORT_CHARACTER: "unchain:import-character",
    SHOW_SAVE_DIALOG: "unchain:show-save-dialog",
    SHOW_OPEN_DIALOG: "unchain:show-open-dialog",
    VALIDATE_API_KEY: "unchain:validate-api-key",
    TEST_CUSTOM_PROVIDER: "unchain:test-custom-provider",
    WRITE_FILE: "unchain:write-file",
    READ_FILE: "unchain:read-file",
    SCAN_SKILL_DIR: "unchain:scan-skill-dir",
    DOWNLOAD_SKILL_REPO: "unchain:download-skill-repo",
    INSTALL_SKILL_PACK: "unchain:install-skill-pack",
    DELETE_SKILL_PACK: "unchain:delete-skill-pack",
    STREAM_START: "unchain:stream:start",
    STREAM_START_V2: "unchain:stream:start-v2",
    STREAM_START_V4: "unchain:stream:start-v4",
    STREAM_ATTACH_V4: "unchain:stream:attach-v4",
    STREAM_DETACH: "unchain:stream:detach",
    STREAM_CANCEL: "unchain:stream:cancel",
    STREAM_EVENT: "unchain:stream:event",
    RUNTIME_LOG: "unchain:runtime-log",
  }),
  THEME: Object.freeze({
    SET_BACKGROUND_COLOR: "theme-set-background-color",
    SET_MODE: "theme-set-mode",
  }),
  WINDOW_STATE: Object.freeze({
    HANDLE_ACTION: "window-state-event-handler",
    LISTENER_EVENT: "window-state-event-listener",
  }),
  SCREENSHOT: Object.freeze({
    CAPTURE: "screenshot:capture",
    CHECK_AVAILABILITY: "screenshot:check-availability",
  }),
  TEST_BRIDGE: Object.freeze({
    INVOKE: "test-bridge:invoke",
    RESULT: "test-bridge:result",
    LOG: "test-bridge:log",
    EVENT: "test-bridge:event",
    READY: "test-bridge:ready",
  }),
});

module.exports = {
  CHANNELS,
};
