/* QA-only unsigned package smoke. Reuse the canonical wheel; never publish. */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve('candidate');
const output = path.resolve('test-results/platform');
fs.mkdirSync(output, { recursive: true });
const env = { ...process.env, PUPU_BUILD_VERSION: require(path.join(root, 'package.json')).version,
  CSC_IDENTITY_AUTO_DISCOVERY: 'false', UNCHAIN_ARTIFACT_PATH: path.resolve('artifact/unchain-0.2.0-py3-none-any.whl'),
  UNCHAIN_ARTIFACT_EVIDENCE_PATH: path.resolve('artifact/unchain-artifact.json'), UNCHAIN_PYTHON_BIN: process.env.QA_PYTHON,
  UNCHAIN_BUILD_VENV: path.join(process.env.RUNNER_TEMP, '356-platform-build-venv'),
  UNCHAIN_TARGET_ARCH: process.env.QA_ARCH === 'x64' ? 'x86_64' : process.env.QA_ARCH,
  PUPU_BUILD_FEATURE_SNAPSHOT_PATH: path.join(output, 'build-feature-flags.json') };
fs.writeFileSync(env.PUPU_BUILD_FEATURE_SNAPSHOT_PATH, JSON.stringify({ enable_user_access_to_agents: true,
  enable_user_access_to_characters: false, enable_custom_model_providers: true, enable_computer_use: false }));
const commands = [];
function run(command, args) {
  const record = { command, args, started: new Date().toISOString() }; commands.push(record);
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', shell: false });
  record.finished = new Date().toISOString(); record.exit = result.status;
  fs.writeFileSync(path.join(output, 'build-commands.json'), JSON.stringify(commands, null, 2));
  if (result.error || result.status !== 0) throw result.error || Error(`platform build exited ${result.status}`);
}
const node = process.execPath;
const target = process.env.QA_RUNTIME_TARGET;
if (!['darwin-arm64', 'darwin-x64', 'win32-x64'].includes(target)) throw Error('undeclared package target');
run(node, ['scripts/prepare-build-version.cjs']);
run(node, ['scripts/prepare-mcp-runtime.cjs', '--target', target]);
if (process.platform === 'win32') {
  run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'unchain_runtime/scripts/build_unchain_server.ps1', 'windows']);
} else if (process.platform === 'darwin') {
  run('/bin/bash', ['unchain_runtime/scripts/build_unchain_server.sh', 'macos']);
} else throw Error('platform smoke must use the declared native OS');
run(node, ['scripts/build-web.cjs']);
run(node, ['scripts/generate-third-party-notices.cjs']);
const builder = ['node_modules/electron-builder/cli.js', process.platform === 'win32' ? '--win' : '--mac', 'dir',
  `--${process.env.QA_ARCH}`, '--publish', 'never', ...(process.platform === 'win32'
    ? ['--config.win.signAndEditExecutable=false'] : ['--config.mac.identity=null'])];
run(node, builder);
function walk(directory, result = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, result);
    else if (entry.isFile()) result.push(full);
  }
  return result;
}
const candidates = walk(path.join(root, 'dist')).filter(file =>
  file.includes(`${path.sep}Resources${path.sep}unchain_runtime${path.sep}`) ||
  file.includes(`${path.sep}resources${path.sep}unchain_runtime${path.sep}`))
  .filter(file => path.basename(file) === (process.platform === 'win32' ? 'unchain-server.exe' : 'unchain-server'));
if (candidates.length !== 1) throw Error(`ambiguous packaged sidecar: ${candidates}`);
const binary = candidates[0];
const resources = binary.slice(0, binary.indexOf(`${path.sep}unchain_runtime${path.sep}`));
const python = path.join(resources, 'mcp_runtime', 'python', ...(process.platform === 'win32' ? ['python.exe'] : ['bin', 'python3.12']));
if (!fs.statSync(python).isFile()) throw Error('packaged Python is missing');
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
fs.writeFileSync(path.join(output, 'package.json'), JSON.stringify({ binary, resources, python,
  binary_sha256: hash(binary), python_sha256: hash(python), platform: process.platform,
  architecture: process.arch, target, candidate: process.env.QA_CANDIDATE,
  wheel_sha256: hash(env.UNCHAIN_ARTIFACT_PATH), manifest: process.env.QA_MANIFEST,
  signed: false, published: false, Main_started: false }, null, 2));
