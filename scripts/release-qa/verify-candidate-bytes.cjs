const fs = require('fs');
const crypto = require('crypto');
const asar = require('@electron/asar');
// This verifier is intentionally pinned to #195's already-built candidate.
// Usage: node scripts/release-qa/verify-candidate-bytes.cjs <fixed-candidate-directory>
const path = require('node:path');
if (process.argv.length !== 3) throw new Error('Usage: node verify-candidate-bytes.cjs <fixed-candidate-directory>');
const root = path.resolve(process.argv[2]);
const hash = b => 'sha256:' + crypto.createHash('sha256').update(b).digest('hex');
const files = {
  wheel: 'unchain-artifact/unchain-0.2.0-py3-none-any.whl',
  sidecar: 'sidecar/unchain-server.exe',
  packaged_sidecar: 'electron/win-unpacked/resources/unchain_runtime/dist/windows/unchain-server.exe',
  installer: 'electron/PuPu-0.1.11-windows-x64-setup.exe',
  app_asar: 'electron/win-unpacked/resources/app.asar',
  feature_snapshot: 'feature-snapshot.json'
};
const hashes = Object.fromEntries(Object.entries(files).map(([k, p]) => [k, {
  path: p,
  sha256: hash(fs.readFileSync(`${root}/${p}`))
}]));
const expected = {
  wheel: 'sha256:29d009ae7e83a71f661da19d0dea9022e8d93f7c5df6dae0e0f464f11621fb8f',
  sidecar: 'sha256:050ff10c88ff7411ed4b0483c508f97b48b483484d7349a4d26ad656c2caa1bf',
  installer: 'sha256:a0bee8efcd3874dfb3abe2fbe9b623b30b42efc77aa0fe144079b3c85708dd5a',
  app_asar: 'sha256:0d19775900c95f34c6aac39213ae5a015651158eb23e54582ab2616e64239d84',
  feature_snapshot: 'sha256:8c2bda24ef20d52af2c80b904426e37dbd23d1a1e572ecfc0b68e1a723cc2204'
};
for (const [name, expectedHash] of Object.entries(expected)) {
  if (hashes[name].sha256 !== expectedHash) throw new Error(`Frozen candidate ${name} hash mismatch`);
}
if (hashes.sidecar.sha256 !== hashes.packaged_sidecar.sha256) throw Error('sidecar changed during package');
const identity = JSON.parse(asar.extractFile(`${root}/${files.app_asar}`, 'build/unchain-artifact-identity.v1.json'));
const snapshot = JSON.parse(asar.extractFile(`${root}/${files.app_asar}`, 'build/build_feature_flags.json'));
if (identity.sidecar_sha256 !== hashes.sidecar.sha256 || identity.unchain_wheel_sha256 !== hashes.wheel.sha256) throw Error('identity mismatch');
if (JSON.stringify(snapshot) !== JSON.stringify(JSON.parse(fs.readFileSync(`${root}/feature-snapshot.json`)))) throw Error('snapshot mismatch');
const record = {
  scope: 'candidate build and unpacked startup; installer NOT executed',
  pupu_revision: '9aeb93020e2a4f7c50736520f447241c8f997d8d',
  unchain_revision: '0680312b92d6856b2271302c23b9279a6b85c546',
  ...hashes,
  identity,
  packaged_snapshot: snapshot
};
fs.writeFileSync(path.join(fs.mkdtempSync(path.join(root, "candidate-byte-check-")), "candidate-build-evidence.json"), JSON.stringify(record, null, 2));
console.log(JSON.stringify(hashes, null, 2));
