# PuPu MCP Registry Schema

Phase 5A formalizes `src/SERVICEs/mcp_toolkit_registry.json` as the curated MCP registry source of truth. External registries use the same entry shape and are normalized by the same backend validator before they can be displayed or approved.

## Files

- Schema: `src/SERVICEs/mcp_toolkit_registry.schema.json`
- Curated registry: `src/SERVICEs/mcp_toolkit_registry.json`
- Backend validator: `unchain_runtime/server/mcp_registry.py`
- Permission audit: `unchain_runtime/server/mcp_permission_audit.py`

## Entry Contract

Each entry must provide `id`, `toolkitId`, `name`, `description`, and `mcp`.

Supported generic setup fields:

- `mcp.transport = "stdio"` with `command` and optional `args`
- `mcp.transport = "http"` with HTTPS `url`, optional `runtimeTransport`, and optional `headers`
- `secrets[]` with required `key`
- `auth.oauth` recipe fields for dynamic or user-supplied OAuth app flows
- `workspace` with `required`, `placeholder`, and `binding`
- `metadata.type = "http_json"` with HTTPS `request.url`
- `policySummary` for reviewed/default-enabled/confirmation-required tool counts

Provider-specific IDs, URLs, scopes, secret keys, commands, and metadata selectors must live in JSON. Product code may only inspect generic field names.

## Validation And Review

Backend validation returns diagnostics with:

```json
{
  "code": "mcp_registry_url_invalid",
  "message": "MCP registry HTTP MCP url must use https",
  "path": "$.entries[0]",
  "entryId": "external.sample",
  "toolkitId": "mcp.external.sample",
  "severity": "error"
}
```

Permission audit returns:

- `riskLevel`: `low`, `medium`, `high`, or `critical`
- `riskScore`
- `riskFlags`
- `permissionGroups`
- `requiresAcknowledgement`
- `recipeHash`
- `approvedRecipeHash`
- `recipeDiff`

External entries with medium, high, or critical risk require explicit acknowledgement before per-entry approval is persisted.
