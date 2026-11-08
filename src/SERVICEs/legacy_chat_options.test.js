import { legacy_chat_agent_id, legacy_chat_options } from './legacy_chat_options';
const resources = [
  { id: 'native', name: 'Native', kind: 'agent', archived: false },
  { id: 'legacy-one', name: 'Renamed', kind: 'agent', archived: false },
  { id: 'legacy-two', name: 'Before upgrade', kind: 'agent', archived: false },
];
const catalog = {
  schema: 'pupu.legacy-chat-catalog.v1', runtime_manifest_digest: 'sha256:' + 'a'.repeat(64),
  resources: [{ resource_id: 'legacy-one', upgraded: true }, { resource_id: 'legacy-two', upgraded: false }],
  aliases: [
    { source_scope: 'user:agent_recipes', legacy_name: 'Old', resource_ids: ['legacy-one'] },
    { source_scope: 'user:agent_recipes', legacy_name: 'Before', resource_ids: ['legacy-two'] },
  ],
};
test('upgraded alias appears once as native; unupgraded source stays legacy', () => {
  const answer = legacy_chat_options(resources, [{ name: 'Old' }, { name: 'Before' }, { name: 'Untouched' }], catalog);
  expect(answer.agents).toEqual([{ id: 'native', name: 'Native' }, { id: 'legacy-one', name: 'Renamed', legacyNames: ['Old'] }]);
  expect(answer.recipes).toEqual([{ label: 'Before', value: 'Before' }, { label: 'Untouched', value: 'Untouched' }]);
});
test('ambiguous names and wrong scope are never mapped by display label', () => {
  const altered = { ...catalog, aliases: [{ source_scope: 'user:subagents', legacy_name: 'Old', resource_ids: ['legacy-one'] }, { source_scope: 'user:agent_recipes', legacy_name: 'Same', resource_ids: ['legacy-one', 'legacy-two'] }] };
  const answer = legacy_chat_options(resources, [{ name: 'Old' }, { name: 'Same' }], altered);
  expect(answer.recipes).toHaveLength(2);
  expect(answer.agents[1].legacyNames).toBeUndefined();
});
test('archived upgraded alias remains an explicit unavailable selection, never Default', () => {
  const answer = legacy_chat_options(resources.filter(r => r.id !== 'legacy-one'), [{ name: 'Old' }], catalog);
  expect(answer.recipes).toEqual([{ label: 'Old (upgraded Agent unavailable)', value: 'Old' }]);
});

test('old chats project only unique upgraded aliases and never change explicit ids', () => {
  const agents = legacy_chat_options(resources, [], catalog).agents;
  expect(legacy_chat_agent_id(agents, 'Old', '')).toBe('legacy-one');
  expect(legacy_chat_agent_id(agents, 'Before', '')).toBe('');
  expect(legacy_chat_agent_id(agents, 'Old', 'native')).toBe('native');
  expect(legacy_chat_agent_id([...agents, {id:'conflict', legacyNames:['Old']}], 'Old', '')).toBe('');
  expect(legacy_chat_agent_id(agents, 'Default', '')).toBe('');
});
