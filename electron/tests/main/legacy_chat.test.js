const { buildSkeletonCredentialQuery, resolveSkeletonCredentials } = require('../../main/services/unchain/skeleton_credentials');
const { validateLegacyChatCatalog } = require('../../shared/legacy_chat_catalog');
const payload = () => ({ threadId: 'session', owner_chat_id: 'chat', options: { recipe_name: ' Old é ' } });
const catalog = () => ({ schema: 'pupu.legacy-chat-catalog.v1', runtime_manifest_digest: 'sha256:' + 'a'.repeat(64), resources: [{ resource_id: 'legacy-one', upgraded: true }], aliases: [{ source_scope: 'user:agent_recipes', legacy_name: ' Old é ', resource_ids: ['legacy-one'] }] });
test('legacy credential discovery preserves exact name and can explicitly remain legacy', () => {
  const query = buildSkeletonCredentialQuery(payload());
  expect(query.selection).toBeNull();
  expect(query.recipe_name).toBe(' Old é ');
  expect(resolveSkeletonCredentials({ schema: 'pupu.skeleton_credential_requirements.v1', kind: 'not_skeleton' }, query)).toBeNull();
});
test('not-skeleton cannot downgrade an explicit native selection', () => {
  const p = payload(); p.options = { skeleton_selection: { schema: 'pupu.skeleton_chat_selection.v1', kind: 'resource', resource_id: 'native' } };
  expect(() => resolveSkeletonCredentials({ schema: 'pupu.skeleton_credential_requirements.v1', kind: 'not_skeleton' }, buildSkeletonCredentialQuery(p))).toThrow();
});
test('strict catalog keeps aliases detached and rejects ambiguous protocol shapes', () => {
  const source = catalog(); const answer = validateLegacyChatCatalog(source);
  expect(answer).toEqual(source); source.aliases[0].resource_ids[0] = 'changed';
  expect(answer.aliases[0].resource_ids[0]).toBe('legacy-one');
  for (const mutate of [v => v.extra = true, v => v.resources[0].upgraded = 1, v => v.aliases[0].resource_ids.push('missing'), v => v.aliases.push(v.aliases[0]), v => v.aliases[0].source_scope = 'guess']) {
    const v = catalog(); mutate(v); expect(() => validateLegacyChatCatalog(v)).toThrow();
  }
});
