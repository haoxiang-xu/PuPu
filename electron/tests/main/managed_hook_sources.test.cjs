const capture = require('../../../src/SERVICEs/managed_hook_source_capture.json');
const { buildManagedCodeRequest, validateManagedCodeReply } = require('../../main/services/unchain/managed_code_transport');
const clone = value => JSON.parse(JSON.stringify(value));
const owned = capture.cases.find(row => row.name === 'owned-hook');

test.each(capture.cases.map(row => [row.name, row]))('real Store %s source aggregate passes Main unchanged', (_name, row) => {
  expect(validateManagedCodeReply('code_get', row.imported)).toBe(row.imported);
});

test.each(capture.cases.map(row => [row.name, row]))('real Store %s complete save goes through the existing route', (_name, row) => {
  const body = clone(row.request); body.expected_edit_token = row.saved.resource.edit_token;
  expect(buildManagedCodeRequest('code_save', body)).toEqual({ method: 'POST', path: '/skeleton_resources/v2', body });
});

test.each(['reference', 'wrong-container', 'string-index', 'object-list', 'wrong-member', 'forged-text'])('owned Hook path still rejects %s', mode => {
  const value = clone(owned.imported), path = value.sources_manifest.entries[0].node_path;
  const node = value.resource.document.nodes[path[1]], entry = node.config.hooks[path[4]];
  if (mode === 'reference') entry.workflow.kind = 'reference';
  if (mode === 'wrong-container') node.type = 'toolkit_pool';
  if (mode === 'string-index') path[4] = String(path[4]);
  if (mode === 'object-list') node.config.hooks = { 0: entry };
  if (mode === 'wrong-member') path[5] = 'source';
  if (mode === 'forged-text') value.contents[0].text += '# altered';
  expect(() => validateManagedCodeReply('code_get', value)).toThrow(expect.objectContaining({ code: 'managed_source_protocol_error' }));
});
