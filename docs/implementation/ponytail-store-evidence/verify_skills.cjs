/* Live, opt-in evidence: node docs/implementation/ponytail-store-evidence/verify_skills.cjs
 * Downloads immutable upstream archives through the real Electron downloader,
 * runs the real scanner/import orchestration, and uses fresh Python processes
 * with an isolated store. Never writes the user's PuPu data directory.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '../../..');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ponytail-skills-'));
const python = process.env.PUPU_TEST_PYTHON || 'python3';
const curation = require(path.join(root, 'src/SERVICEs/plugin_store_curation.json'));
const selected = curation.skillPacks.filter((pack) => [
  'skillpack.ponytail',
].includes(pack.id));
assert.equal(selected.length, 1);

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
    else: raise ValueError('unsupported test operation')
    print(json.dumps({'ok': True, 'result': result}))
except SkillPackError as error:
    print(json.dumps({'ok': False, 'code': error.code, 'status': error.status}))
`;
const store = (operation, payload = {}) => {
  const result = spawnSync(python, ['-c', pythonCode,
    path.join(root, 'unchain_runtime/server'), operation, path.join(scratch, 'store')], {
    cwd: root, input: JSON.stringify(payload), encoding: 'utf8', timeout: 30000,
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
const api = { unchain: {
  downloadSkillRepo: downloader.downloadSkillRepo,
  scanSkillDir: (directory) => runtime.scanSkillDir({ directory }),
  installSkillPack: (pack) => {
    const result = store('install', pack);
    assert.equal(result.ok, true, JSON.stringify(result));
    return result.result;
  },
} };
const loadEsm = (relative, overrides = {}) => {
  const filename = path.join(root, relative);
  const compiled = require('@babel/core').transformFileSync(filename, {
    babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  }).code;
  const module = new Module(filename, moduleParent);
  module.filename = filename;
  module.paths = Module._nodeModulePaths(path.dirname(filename));
  const nativeRequire = module.require.bind(module);
  module.require = (name) => Object.hasOwn(overrides, name) ? overrides[name] : nativeRequire(name);
  module._compile(compiled, filename);
  return module.exports;
};
const moduleParent = module;
const importer = loadEsm('src/SERVICEs/skill_pack_import.js');
const installer = loadEsm('src/COMPONENTs/toolkit/utils/skill_pack_store_install.js', {
  '../../../SERVICEs/api': api,
  '../../../SERVICEs/skill_pack_import': importer,
});

(async () => {
  const records = [];
  for (const entry of selected) {
    assert.ok(installer.listStoreSkillPacks().some((pack) => pack.id === entry.id));
    const pack = await installer.installStoreSkillPack(entry);
    assert.deepEqual(Object.keys(pack).sort(), [
      'degraded', 'rejected', 'skills', 'skipped', 'toolkitIcon', 'toolkitId', 'toolkitName',
    ]);
    assert.deepEqual(pack.skills.map((skill) => skill.name).sort(), entry.commandPreviews.map((preview) => preview.name).sort());
    assert.deepEqual(pack.rejected, []);
    assert.deepEqual(pack.skipped, []);
    assert.deepEqual(pack.degraded, []);
    for (const skill of pack.skills) {
      assert.deepEqual(Object.keys(skill).sort(), ['body', 'description', 'name', 'phase', 'title', 'tools']);
      assert.equal(skill.phase, 'composer');
      assert.deepEqual(skill.tools, []);
    }
    const duplicate = store('install', pack);
    assert.deepEqual(duplicate, { ok: false, code: 'skill_pack_already_installed', status: 409 });
    const coldRead = store('list').result.find((row) => row.toolkitId === entry.id);
    assert.deepEqual(coldRead.skills, pack.skills);
    assert.deepEqual(coldRead.tools, []);
    assert.deepEqual(coldRead.toolkitIcon, entry.icon);
    assert.equal(crypto.createHash('sha256').update(Buffer.from(coldRead.toolkitIcon.content, 'base64')).digest('hex'), entry.iconAttribution.sha256);
    const invalidIcon = store('install', { ...pack, toolkitId: 'skillpack.invalid-icon', toolkitIcon: { ...pack.toolkitIcon, url: 'https://example.invalid/icon' } });
    assert.deepEqual(invalidIcon, { ok: false, code: 'invalid_skill_pack', status: 400 });
    assert.equal(store('list').result.some(row => row.toolkitId === 'skillpack.invalid-icon'), false);
    assert.equal(store('delete', { toolkitId: entry.id }).ok, true);
    assert.equal(store('list').result.some((row) => row.toolkitId === entry.id), false);
    assert.equal(store('install', pack).ok, true);
    assert.deepEqual(store('list').result.find((row) => row.toolkitId === entry.id).skills, pack.skills);
    const badManifest = entry.manifest.map((file, index) => index === 0 ? { ...file, sha256: '0'.repeat(64) } : file);
    const before = fs.readdirSync(scratch).sort();
    const negative = await downloader.downloadSkillRepo({ ...entry.source, manifest: badManifest });
    assert.deepEqual(negative, { ok: false, error: 'integrity', path: entry.manifest[0].path });
    assert.deepEqual(fs.readdirSync(scratch).sort(), before);
    records.push({ id: entry.id, source: entry.source, manifest: entry.manifest,
      commands: pack.skills.map((skill) => ({ name: skill.name, bodyBytes: Buffer.byteLength(skill.body),
        bodySha256: crypto.createHash('sha256').update(skill.body).digest('hex') })),
      realDownloadScanImport: 'PASS', duplicateRejected: 'PASS', freshProcessRead: 'PASS',
      uninstallReinstall: 'PASS', badHashFailsClosed: 'PASS',
      liveModelInvocation: 'NOT_RUN', packagedSidecarQualification: 'NOT_RUN',
    });
  }
  const evidence = { checkedAt: new Date().toISOString(), candidateBase: require('node:child_process').execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    boundary: ['BC-PT-001', 'BC-PT-002'], sequence: 'SEQ-PT-001', checks: ['AC-PT-001', 'AC-PT-002'], records };
  fs.writeFileSync(path.join(__dirname, 'skills-results.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});
