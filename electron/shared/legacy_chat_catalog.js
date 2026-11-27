// Read-only, versioned Store identities for the chat picker. Never match names.
const fail = () => { throw Object.assign(new Error('Invalid legacy chat catalog'), { code: 'legacy_chat_protocol_error', path: [], status: null }); };
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const closed = (v, keys) => object(v) && Reflect.ownKeys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k));
const identity = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(v);
const validateLegacyChatCatalog = value => {
  if (!closed(value, ['schema', 'runtime_manifest_digest', 'resources', 'aliases']) || value.schema !== 'pupu.legacy-chat-catalog.v1' ||
      typeof value.runtime_manifest_digest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(value.runtime_manifest_digest) ||
      !Array.isArray(value.resources) || !Array.isArray(value.aliases)) fail();
  const resources = new Set(), aliases = new Set();
  for (const row of value.resources) {
    if (!closed(row, ['resource_id', 'upgraded']) || !identity(row.resource_id) || typeof row.upgraded !== 'boolean' || resources.has(row.resource_id)) fail();
    resources.add(row.resource_id);
  }
  for (const row of value.aliases) {
    if (!closed(row, ['source_scope', 'legacy_name', 'resource_ids']) || !['user:agent_recipes', 'user:subagents'].includes(row.source_scope) ||
        typeof row.legacy_name !== 'string' || !row.legacy_name || !Array.isArray(row.resource_ids) || !row.resource_ids.length ||
        row.resource_ids.some(id => !resources.has(id)) || new Set(row.resource_ids).size !== row.resource_ids.length) fail();
    const key = JSON.stringify([row.source_scope, row.legacy_name]); if (aliases.has(key)) fail(); aliases.add(key);
  }
  return JSON.parse(JSON.stringify(value));
};
module.exports = { validateLegacyChatCatalog };
