/* Opt-in data-boundary evidence; all state is isolated in a temporary folder. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { spawnSync, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-283-catalog-'));
const ids = ['dev.microsoft-learn', 'productivity.brave-search', 'productivity.tavily', 'productivity.firecrawl'];
const registry = require(path.join(root, 'src/SERVICEs/mcp_toolkit_registry.json'));
const load = (relative, overrides) => {
  const filename = path.join(root, relative);
  const compiled = require('@babel/core').transformFileSync(filename, {
    babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const original = loaded.require.bind(loaded);
  loaded.require = name => Object.hasOwn(overrides, name) ? overrides[name] : original(name);
  loaded._compile(compiled, filename);
  return loaded.exports;
};
const forbidden = () => { throw new Error('Unexpected application side effect'); };
const store = load('src/SERVICEs/mcp_toolkit_store.js', {
  './custom_mcp_icon_store': { getCustomMcpIcon: forbidden },
  '../BUILTIN_COMPONENTs/icon/icon_manifest': { LogoSVGs: {}, UISVGs: {} },
});
const install = load('src/SERVICEs/mcp_install.js', {
  './api': { unchain: { installMcpToolkit: forbidden } },
  './bridges/unchain_bridge': { runtimeBridge: {} },
  '../COMPONENTs/settings/runtime': { readWorkspaceRoot: forbidden, writeWorkspaceRoot: forbidden },
  './default_toolkit_store': { setDefaultToolkitEnabled: forbidden },
  './toolkit_catalog_refresh': { emitToolkitCatalogRefresh: forbidden },
  './custom_mcp_icon_store': { setCustomMcpIcon: forbidden, removeCustomMcpIcon: forbidden },
});
(async () => {
  try {
    const baseline = JSON.parse(execFileSync('git', ['show', '65811ee3d7bb62cc86f27c681764d7de0bfeef48:src/SERVICEs/mcp_toolkit_registry.json'], { cwd: root }));
    assert.deepEqual(registry.entries.filter(entry => !ids.includes(entry.id)), baseline.entries);
    assert.equal(registry.dependencyCutoff, baseline.dependencyCutoff);
    const frontend = [];
    for (const id of ids) {
      const entry = store.getMcpStoreEntry(id);
      assert.ok(entry);
      assert.equal(install.entryInstallState(entry, new Set()), 'needs_review');
      assert.equal(install.isEntryInstallable(entry), false);
      await assert.rejects(install.installMcpEntry(entry), { code: 'unsupported_mcp_entry' });
      frontend.push({ id, toolkitId: entry.toolkitId, mcp: entry.mcp, secrets: entry.secrets });
    }
    const pythonCode = `
import json, sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import mcp_registry, mcp_toolkits
assert mcp_registry.registry_path().resolve() == Path(sys.argv[3]).resolve()
rows = json.load(sys.stdin)
records = []
def forbidden(**kwargs):
    raise AssertionError('MCP process must not be created for an unreviewed row')
for row in rows:
    entry = mcp_registry.registry_entry(row['id'])
    assert entry['toolkit_id'] == row['toolkitId']
    assert entry['mcp']['transport'] == row['mcp']['transport']
    if entry['mcp']['transport'] == 'stdio':
        assert entry['mcp']['command'] == row['mcp']['command']
        assert entry['mcp']['args'] == row['mcp']['args']
    else:
        assert entry['mcp']['url'] == row['mcp']['url']
        assert entry['mcp']['runtime_transport'] == row['mcp']['runtime_transport']
    assert entry['secrets'] == row['secrets']
    try:
        mcp_toolkits.install_mcp_toolkit(row['id'], data_dir=sys.argv[2], toolkit_factory=forbidden)
    except mcp_toolkits.McpToolkitError as error:
        assert error.code == 'mcp_entry_not_available' and error.status == 403
    else:
        raise AssertionError('Unreviewed recipe was admitted')
    records.append({'id': row['id'], 'normalization': 'PASS', 'frontendAdmission': 'BLOCKED', 'backendAdmission': 'BLOCKED_403'})
assert not list(Path(sys.argv[2]).rglob('*')), 'Admission rejection persisted state'
print(json.dumps(records))
`;
    const python = process.env.PUPU_TEST_PYTHON || 'python3';
    const checked = spawnSync(python, ['-c', pythonCode, path.join(root, 'unchain_runtime/server'), scratch,
      path.join(root, 'src/SERVICEs/mcp_toolkit_registry.json')], {
      cwd: root, input: JSON.stringify(frontend), encoding: 'utf8', timeout: 30000,
    });
    assert.equal(checked.status, 0, checked.stderr);
    const result = { checkedAt: new Date().toISOString(), boundary: 'BC-283-001',
      checks: ['AC-283-001', 'AC-283-002'], result: 'PASS',
      preexistingEntriesAndCutoff: 'UNCHANGED', noProcessOrPersistenceOnRejection: 'PASS',
      records: JSON.parse(checked.stdout) };
    fs.writeFileSync(path.join(__dirname, 'catalog-results.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result));
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
