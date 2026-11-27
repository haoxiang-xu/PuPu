import { skeleton_agent_options } from './skeleton_chat_selection';
import { invokeSkeletonBridge } from './skeleton_resource_errors';

// Independent renderer consumer; preserve exact alias bytes and explicit ids.
const fail = () => { throw Object.assign(new Error('Invalid legacy chat catalog'), { code: 'legacy_chat_protocol_error', path: [], status: null }); };
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const closed = (v, keys) => object(v) && Reflect.ownKeys(v).length === keys.length && keys.every(k => Object.prototype.hasOwnProperty.call(v, k));
const identity = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(v);
export const validate_legacy_chat_catalog = value => {
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

export const read_legacy_chat_catalog = async (assertBridgeMethod, withTimeout) => {
  const method = assertBridgeMethod('unchainAPI', 'getLegacyChatCatalog');
  return validate_legacy_chat_catalog(await withTimeout(() => invokeSkeletonBridge(() => method()),
    15000, 'legacy_chat_catalog_timeout', 'Legacy chat catalog request timed out'));
};

export const legacy_chat_options = (resources, recipes, input) => {
  const catalog = validate_legacy_chat_catalog(input);
  const migrated = new Map(catalog.resources.map(row => [row.resource_id, row.upgraded]));
  const agents = skeleton_agent_options(resources).filter(row => !migrated.has(row.id) || migrated.get(row.id));
  const byId = new Map(agents.map(row => [row.id, row]));
  const upgraded = new Map();
  for (const alias of catalog.aliases) {
    if (alias.source_scope !== 'user:agent_recipes' || alias.resource_ids.length !== 1 || !migrated.get(alias.resource_ids[0])) continue;
    const id = alias.resource_ids[0]; upgraded.set(alias.legacy_name, id);
    const option = byId.get(id);
    if (option) option.legacyNames = [...(option.legacyNames || []), alias.legacy_name];
  }
  return { agents, recipes: (Array.isArray(recipes) ? recipes : []).flatMap(row => {
    if (typeof row?.name !== 'string' || !row.name) return [];
    const id = upgraded.get(row.name);
    if (id && byId.has(id)) return [];
    return [{ label: id ? `${row.name} (upgraded Agent unavailable)` : row.name, value: row.name }];
  }) };
};

export const legacy_chat_agent_id = (agents, legacyName, selectedId) => {
  if (selectedId) return selectedId;
  if (!legacyName || legacyName === 'Default') return '';
  const matches = agents.filter(row => Array.isArray(row.legacyNames) && row.legacyNames.includes(legacyName));
  return matches.length === 1 ? matches[0].id : '';
};
