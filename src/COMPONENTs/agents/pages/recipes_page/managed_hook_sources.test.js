import capture from '../../../../SERVICEs/managed_hook_source_capture.json';
import { admit_resource_aggregate, code_node_at, managed_rows, owned_code_nodes, referenced_shas, save_edit } from './managed_code_sources';
const clone = value => JSON.parse(JSON.stringify(value));
const owned = capture.cases.find(row => row.name === 'owned-hook');

test.each(capture.cases.map(row => [row.name, row]))('real Store %s sources admit and save without omission', (_name, row) => {
  const value = row.imported, admitted = admit_resource_aggregate(value);
  expect(admitted.ok).toBe(true);
  expect(owned_code_nodes(value.resource.document).map(item => item.node_path)).toEqual(value.sources_manifest.entries.map(item => item.node_path));
  const edit = save_edit(value.resource.document, value.resource.edit_token, admitted.sources);
  expect(edit.ok).toBe(true);
  expect(edit.edit.managed_sources).toEqual(value.sources_manifest.entries.map(item => ({ node_path: item.node_path, text: admitted.sources[item.sha256] })));
  expect(edit.edit.document).toBe(value.resource.document);
});

test('owned Hook sources stay reachable while disabled and while held by undo', () => {
  const document = clone(owned.imported.resource.document), manifest = owned.imported.sources_manifest.entries;
  document.nodes[manifest[0].node_path[1]].config.hooks[0].enabled = false;
  expect([...referenced_shas([document])]).toEqual(manifest.map(row => row.sha256));
  const sources = Object.fromEntries(owned.imported.contents.map(row => [row.sha256, row.text]));
  expect(managed_rows(document, sources).rows).toEqual(manifest.map(row => ({ node_path: row.node_path, text: sources[row.sha256] })));
});

test('two embedded Agents with the same Code id have distinct owned addresses', () => {
  const value = capture.cases.find(row => row.name === 'nested').imported;
  const addresses = owned_code_nodes(value.resource.document).map(row => row.node_path);
  expect(addresses).toHaveLength(2);
  expect(addresses[0]).not.toEqual(addresses[1]);
  expect(addresses.map(path => code_node_at(value.resource.document, path).id)).toEqual(['step', 'step']);
});

test.each(['reference', 'wrong-container', 'string-index', 'object-list', 'wrong-member'])('renderer still rejects non-owned Hook path: %s', mode => {
  const value = clone(owned.imported), path = value.sources_manifest.entries[0].node_path;
  const node = value.resource.document.nodes[path[1]], entry = node.config.hooks[path[4]];
  if (mode === 'reference') entry.workflow.kind = 'reference';
  if (mode === 'wrong-container') node.type = 'toolkit_pool';
  if (mode === 'string-index') path[4] = String(path[4]);
  if (mode === 'object-list') node.config.hooks = { 0: entry };
  if (mode === 'wrong-member') path[5] = 'source';
  expect(code_node_at(value.resource.document, path)).toBeNull();
  expect(admit_resource_aggregate(value).ok).toBe(false);
});

test('missing Hook source text prevents Save rather than sending an incomplete set', () => {
  const value = owned.imported;
  expect(managed_rows(value.resource.document, {}).ok).toBe(false);
});
