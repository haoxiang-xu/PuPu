/* Live, opt-in evidence for ticket #289 (BC-289-002 / SEQ-289-001 / AC-289-002):
 *   node docs/implementation/ticket-289-evidence/verify_skill.cjs
 * Downloads the immutable upstream archive through the real Electron
 * downloader, runs the real scanner/import orchestration, and drives fresh
 * Python processes against an isolated skill-pack store and the pinned
 * Unchain wheel's inventory. Never writes the user's PuPu data directory.
 * Adapted from ticket-283-evidence/verify_skills.cjs.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const { spawnSync, execSync } = require('node:child_process');
const crypto = require('node:crypto');

const PACK_ID = 'skillpack.doc-coauthoring';
const root = path.resolve(__dirname, '../../..');
const python = process.env.PUPU_TEST_PYTHON || 'python3';
const wheel = path.resolve(process.env.PUPU_TEST_UNCHAIN_WHEEL || '');
const wheelEvidence = path.resolve(process.env.PUPU_TEST_UNCHAIN_ARTIFACT_EVIDENCE || '');
assert.ok(process.env.PUPU_TEST_UNCHAIN_WHEEL, 'PUPU_TEST_UNCHAIN_WHEEL is required');
assert.ok(process.env.PUPU_TEST_UNCHAIN_ARTIFACT_EVIDENCE, 'PUPU_TEST_UNCHAIN_ARTIFACT_EVIDENCE is required');
const artifact = JSON.parse(fs.readFileSync(wheelEvidence, 'utf8'));
const wheelSha = crypto.createHash('sha256').update(fs.readFileSync(wheel)).digest('hex');
assert.equal(artifact.schema, 'pupu.release.unchain-artifact.v1');
assert.equal(artifact.artifact.sha256, `sha256:${wheelSha}`);
assert.match(artifact.runtime_manifest.manifest_digest, /^sha256:[0-9a-f]{64}$/);
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-289-skill-'));
const curation = require(path.join(root, 'src/SERVICEs/plugin_store_curation.json'));
const entry = curation.skillPacks.find((pack) => pack.id === PACK_ID);
assert.ok(entry, `${PACK_ID} missing from curation`);
assert.equal(entry.manifest.length, 1);
assert.equal(entry.source.repo, 'anthropics/skills');
assert.equal(entry.source.sha, '34040c9c568585f6929bedeaad110ad08f079624');
assert.equal(entry.source.license, 'License not specified for this skill');
assert.deepEqual(entry.subset, ['skills/doc-coauthoring']);
assert.deepEqual(entry.manifest, [{
  path: 'skills/doc-coauthoring/SKILL.md',
  sha256: '2e47d78846faeea4a56e9809c52700087a15a2155a3f293a3efbaded81398ef4',
}]);
assert.match(entry.review.licenseBasis, /exact license is not specified upstream/);
assert.match(entry.blurb, /does not bundle the skill body; it downloads from upstream/);
assert.match(entry.blurb, /license for this specific skill is not specified upstream/);
assert.match(entry.blurbZh, /不捆绑技能正文；安装时才从上游下载/);
assert.match(entry.blurbZh, /未注明此技能的具体许可证/);

const pythonCode = `
import json, sys
sys.path.insert(0, sys.argv[1])
from skill_packs import install_skill_pack, list_installed_skill_packs, delete_skill_pack, SkillPackError
op, directory = sys.argv[2:4]
payload = json.load(sys.stdin)
try:
    if op == 'install': result = install_skill_pack(payload, data_dir=directory)
    elif op == 'list': result = list_installed_skill_packs(data_dir=directory)
    elif op == 'delete': result = delete_skill_pack(payload['toolkitId'], data_dir=directory)
    elif op == 'inventory':
        import importlib.metadata
        import unchain
        from skills_inventory import resolve_skill_inventory, inventory_payload
        inventory = resolve_skill_inventory(
            workspace_root=None, include_user_dirs=False,
            selected_toolkit_ids=(), rows_by_toolkit={}, data_dir=directory,
        )
        distribution = importlib.metadata.distribution('unchain')
        result = {
            'payload': inventory_payload(inventory),
            'runtime': {
                'python': sys.executable,
                'unchainModule': unchain.__file__,
                'unchainVersion': distribution.version,
                'directUrl': distribution.read_text('direct_url.json'),
            },
        }
    else: raise ValueError('unsupported test operation')
    print(json.dumps({'ok': True, 'result': result}))
except SkillPackError as error:
    print(json.dumps({'ok': False, 'code': error.code, 'status': error.status}))
`;
const store = (operation, payload = {}) => {
  const result = spawnSync(python, ['-c', pythonCode,
    path.join(root, 'unchain_runtime/server'), operation, path.join(scratch, 'store')], {
    cwd: root, input: JSON.stringify(payload), encoding: 'utf8', timeout: 30000,
    env: { ...process.env, PYTHONPATH: wheel },
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

const { createRuntimeService } = require(path.join(root, 'electron/main/services/runtime/service.js'));
const runtime = createRuntimeService({
  app: { getPath: () => scratch, getAppPath: () => root }, fs, path,
  dialog: {}, shell: {}, getMainWindow: () => null,
});
const { createSkillRepoDownloader } = require(path.join(root, 'electron/main/services/runtime/skill_repo_download.js'));
const downloader = createSkillRepoDownloader({ getTempDir: () => scratch });
let downloadedDir = null;
const api = { unchain: {
  downloadSkillRepo: async (args) => {
    const result = await downloader.downloadSkillRepo(args);
    if (result && result.ok) downloadedDir = result.dir;
    return result;
  },
  scanSkillDir: (directory) => runtime.scanSkillDir({ directory }),
  installSkillPack: (pack) => {
    const result = store('install', pack);
    assert.equal(result.ok, true, JSON.stringify(result));
    return result.result;
  },
} };
const moduleParent = module;
const loadEsm = (relative, overrides = {}) => {
  const filename = path.join(root, relative);
  const compiled = require('@babel/core').transformFileSync(filename, {
    babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const mod = new Module(filename, moduleParent);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = mod.require.bind(mod);
  mod.require = (name) => Object.hasOwn(overrides, name) ? overrides[name] : nativeRequire(name);
  mod._compile(compiled, filename);
  return mod.exports;
};
const importer = loadEsm('src/SERVICEs/skill_pack_import.js');
const installer = loadEsm('src/COMPONENTs/toolkit/utils/skill_pack_store_install.js', {
  '../../../SERVICEs/api': api,
  '../../../SERVICEs/skill_pack_import': importer,
});

(async () => {
  assert.ok(installer.listStoreSkillPacks().some((pack) => pack.id === entry.id), 'gate must list the entry');
  const pack = await installer.installStoreSkillPack(entry);
  assert.deepEqual(Object.keys(pack).sort(), [
    'degraded', 'rejected', 'skills', 'skipped', 'toolkitId', 'toolkitName', 'warnings',
  ]);
  assert.equal(pack.toolkitId, entry.id);
  assert.deepEqual(pack.skills.map((skill) => skill.name), entry.commandPreviews.map((preview) => preview.name));
  assert.deepEqual(pack.rejected, []);
  assert.deepEqual(pack.skipped, []);
  assert.deepEqual(pack.degraded, []);
  assert.deepEqual(pack.warnings, []);
  assert.equal(pack.skills.length, 1);
  const skill = pack.skills[0];
  assert.deepEqual(Object.keys(skill).sort(), [
    'aliases', 'body', 'description', 'metadata', 'modelInvocable', 'name',
    'phase', 'title', 'tools', 'userInvocable',
  ]);
  assert.equal(skill.phase, 'composer');
  assert.deepEqual(skill.tools, []);
  assert.deepEqual(skill.aliases, []);
  assert.deepEqual(skill.metadata, {});
  assert.equal(skill.modelInvocable, true);
  assert.equal(skill.userInvocable, true);

  // The downloaded file must be byte-identical to the pinned manifest hash, and
  // the imported body must be that file's content minus the YAML frontmatter.
  const downloadedFile = path.join(downloadedDir, entry.manifest[0].path);
  const rawBytes = fs.readFileSync(downloadedFile);
  const rawSha = crypto.createHash('sha256').update(rawBytes).digest('hex');
  assert.equal(rawSha, entry.manifest[0].sha256, 'downloaded bytes must match manifest');
  const rawText = rawBytes.toString('utf8');
  const fmEnd = rawText.indexOf('\n---', 4);
  const expectedBody = rawText.slice(rawText.indexOf('\n', fmEnd + 1) + 1).trim();
  assert.equal(skill.body, expectedBody, 'imported body must be the frontmatter-stripped upstream file');

  const duplicate = store('install', pack);
  assert.deepEqual(duplicate, { ok: false, code: 'skill_pack_already_installed', status: 409 });
  const coldRead = store('list').result.find((row) => row.toolkitId === entry.id);
  assert.deepEqual(Object.keys(coldRead).sort(), [
    'installedAt', 'skillCount', 'skills', 'source', 'sourceLabel', 'status',
    'toolCount', 'toolkitDescription', 'toolkitIcon', 'toolkitId',
    'toolkitName', 'tools',
  ]);
  assert.equal(coldRead.source, 'skillpack');
  assert.equal(coldRead.skillCount, 1);
  assert.deepEqual(coldRead.tools, []);
  const storedSkill = coldRead.skills[0];
  assert.deepEqual(Object.keys(storedSkill).sort(), [
    'aliases', 'body', 'degraded', 'description', 'metadata',
    'model_invocable', 'name', 'phase', 'title', 'tools', 'user_invocable',
  ]);
  assert.equal(storedSkill.name, skill.name);
  assert.equal(storedSkill.body, skill.body);
  assert.deepEqual(storedSkill.aliases, skill.aliases);
  assert.deepEqual(storedSkill.metadata, skill.metadata);
  assert.deepEqual(storedSkill.degraded, []);
  assert.equal(storedSkill.model_invocable, skill.modelInvocable);
  assert.equal(storedSkill.user_invocable, skill.userInvocable);
  const inventoryResult = store('inventory').result;
  assert.ok(inventoryResult.runtime.unchainModule.startsWith(`${wheel}/unchain/`),
    'inventory must use the pinned wheel, not a sibling source checkout');
  const inventory = inventoryResult.payload;
  assert.deepEqual(Object.keys(inventory).sort(), ['diagnostics', 'revision', 'schema', 'skills']);
  assert.equal(inventory.schema, 'pupu.skill_inventory.v1');
  assert.match(inventory.revision, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(inventory.diagnostics, []);
  assert.equal(inventory.skills.length, 1);
  const inventorySkill = inventory.skills[0];
  assert.deepEqual(Object.keys(inventorySkill).sort(), [
    'aliases', 'description', 'id', 'model_invocable', 'name', 'reserved',
    'source', 'source_id', 'user_invocable',
  ]);
  assert.equal(inventorySkill.name, skill.name);
  assert.equal(inventorySkill.description, skill.description);
  assert.equal(inventorySkill.source, 'skillpack');
  assert.equal(inventorySkill.source_id, entry.id);
  assert.deepEqual(inventorySkill.aliases, []);
  assert.equal(inventorySkill.model_invocable, true);
  assert.equal(inventorySkill.user_invocable, true);
  assert.equal(inventorySkill.reserved, false);
  assert.ok(inventorySkill.id, 'inventory identity is required');

  // Use PuPu's real agent assembly and the pinned wheel with only ModelIO
  // scripted. The child reads this isolated store; no profile or provider.
  const activation = spawnSync(python, [
    path.join(__dirname, 'verify_activation.py'), path.join(root, 'unchain_runtime/server'),
    path.join(scratch, 'store'), crypto.createHash('sha256').update(skill.body).digest('hex'),
  ], {
    cwd: root, encoding: 'utf8', timeout: 60000,
    env: { ...process.env, PYTHONPATH: wheel },
  });
  assert.equal(activation.status, 0, activation.stderr);
  const activationResult = JSON.parse(activation.stdout);
  assert.equal(activationResult.status, 'PASS');
  assert.equal(activationResult.identity, inventorySkill.id);

  // Feed the real inventory row to the renderer's command registry projection.
  const loggerStub = { createLogger: () => ({ debug() {}, warn() {}, info() {} }) };
  const registry = loadEsm('src/SERVICEs/command_registry.js', {
    './console_logger': loggerStub,
  });
  const sync = loadEsm('src/SERVICEs/plugin_skill_sync.js', {
    './api': { api: {} },
    './console_logger': loggerStub,
    './mcp_toolkit_store': { isKnownBuiltinIcon: () => false },
    './command_registry': registry,
    './toolkit_id_aliases': loadEsm('src/SERVICEs/toolkit_id_aliases.js'),
    './toolkit_catalog_refresh': { subscribeToolkitCatalogRefresh: () => () => {} },
    './skill_inventory_store': { applySkillInventory: () => true },
    '../COMPONENTs/settings/runtime': { readWorkspaceRoot: () => '' },
    './settings_repository': { readNamespace: () => ({}), subscribeSettings: () => () => {} },
    './chat_storage/chat_storage_store': { getChatsStore: () => ({}), subscribeChatsStore: () => () => {} },
  });
  sync.syncSkillInventory(inventory);
  const command = registry.getCommand('/doc-coauthoring');
  assert.equal(command.source, 'skill-inventory');
  assert.equal(command.sourceToolkitId, entry.id);
  assert.equal(command.expandsTo, '');
  assert.equal(store('delete', { toolkitId: entry.id }).ok, true);
  assert.equal(store('list').result.some((row) => row.toolkitId === entry.id), false);
  const afterDeleteInventory = store('inventory').result.payload;
  assert.deepEqual(afterDeleteInventory.skills, []);
  sync.syncSkillInventory(afterDeleteInventory);
  assert.equal(registry.getCommand('/doc-coauthoring'), null);
  assert.equal(store('install', pack).ok, true);
  assert.deepEqual(store('list').result.find((row) => row.toolkitId === entry.id).skills, coldRead.skills);
  assert.deepEqual(store('inventory').result.payload.skills, inventory.skills);

  const badManifest = entry.manifest.map((file) => ({ ...file, sha256: '0'.repeat(64) }));
  const before = fs.readdirSync(scratch).sort();
  const negative = await downloader.downloadSkillRepo({ ...entry.source, manifest: badManifest });
  assert.deepEqual(negative, { ok: false, error: 'integrity', path: entry.manifest[0].path });
  assert.deepEqual(fs.readdirSync(scratch).sort(), before);

  const evidence = {
    checkedAt: new Date().toISOString(),
    candidateBase: execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim(),
    boundary: 'BC-289-002', sequence: 'SEQ-289-001', checks: ['AC-289-002'],
    activationBoundary: 'BC-289-003', activationCoverage: 'scripted-wiring-only',
    record: {
      id: entry.id, source: entry.source, manifest: entry.manifest,
      downloadedFileSha256: rawSha, downloadedFileBytes: rawBytes.length,
      command: { name: skill.name, bodyBytes: Buffer.byteLength(skill.body),
        bodySha256: crypto.createHash('sha256').update(skill.body).digest('hex') },
      storedSkillKeys: Object.keys(storedSkill).sort(),
      inventory: { revision: inventory.revision, skill: inventorySkill },
      scriptedAgentActivation: activationResult,
      runtime: {
        ...inventoryResult.runtime,
        wheelSha256: `sha256:${wheelSha}`,
        manifestDigest: artifact.runtime_manifest.manifest_digest,
        sourceRevision: artifact.source.revision,
      },
      realDownloadScanImport: 'PASS', bodyEqualsUpstreamMinusFrontmatter: 'PASS',
      duplicateRejected: 'PASS', freshProcessRead: 'PASS', inventoryIdentity: 'PASS',
      uninstallReinstall: 'PASS', uninstallClearsMenuAndInventory: 'PASS',
      badHashFailsClosed: 'PASS', liveModelInvocationCurrentPath: 'NOT_RUN',
      packagedPairQualification: 'NOT_RUN',
    },
  };
  fs.writeFileSync(path.join(__dirname, 'skill-results.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});
