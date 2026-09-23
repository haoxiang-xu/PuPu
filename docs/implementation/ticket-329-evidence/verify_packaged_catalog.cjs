/* Verify the exact catalog bytes compiled into this clone's packaged app. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');

const root = path.resolve(__dirname, '../../..');
const appPath = path.resolve(process.argv[2] || path.join(root, 'dist/mac-arm64/PuPu.app'));
const archive = path.join(appPath, 'Contents/Resources/app.asar');
const entry = require(path.join(root, 'src/SERVICEs/plugin_store_curation.json'))
  .skillPacks.find((row) => row.id === 'skillpack.humanizer');
const listings = require(path.join(root, 'src/SERVICEs/plugin_listing_records.json'));
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

assert.ok(entry);
assert.deepEqual(listings.filter((row) => row.toolkitId === entry.id), [{
  toolkitId: entry.id, source: 'skillpack',
  sourceRepo: 'https://github.com/blader/humanizer', listing: 'officially_curated',
}]);
assert.equal(entry.manifest[0].sha256, 'e8269e236bed06ed0fe4824c274112e54950b0cb46b0bafe5e1576ef7c9f93d5');
assert.deepEqual(entry.subset, ['humanizer'], 'Store row directory name');
assert.equal(hash(Buffer.from(entry.source.licenseNotice)), '4ac4810254ab36d45419141aeb8e69bf50652cfafe5b2dab947d06d44e5cbf96');

const matches = asar.listPackage(archive)
  .filter((name) => name.startsWith('/build/static/js/') && name.endsWith('.js'))
  .map((name) => name.slice(1))
  .filter((name) => asar.extractFile(archive, name).includes(Buffer.from(entry.id)));
assert.equal(matches.length, 1, 'exactly one compiled chunk contains Humanizer');
const chunkPath = matches[0];
const packaged = asar.extractFile(archive, chunkPath);
const sourceBuild = fs.readFileSync(path.join(root, chunkPath));
assert.equal(hash(packaged), hash(sourceBuild), 'packaged chunk equals rebuilt web bundle');
const compiled = packaged.toString('utf8');
for (const value of [entry.id, entry.source.repo, entry.source.sha, entry.manifest[0].sha256]) {
  assert.ok(compiled.includes(value), `missing packaged value ${value}`);
}
assert.ok(compiled.includes('"subset":["humanizer"]'), 'packaged Store row shows /humanizer');
// Webpack serializes the imported JSON string before putting it in the JS chunk.
const escapedNotice = JSON.stringify(entry.source.licenseNotice).slice(1, -1).replaceAll('\\', '\\\\');
assert.ok(compiled.includes(escapedNotice), 'complete MIT notice in packaged catalog');

const result = {
  schema: 'pupu.ticket-329.packaged-catalog.v1',
  appPath, asarSha256: `sha256:${hash(fs.readFileSync(archive))}`,
  chunkPath, chunkSha256: `sha256:${hash(packaged)}`,
  humanizerId: entry.id, sourceSha: entry.source.sha,
  manifestSha256: entry.manifest[0].sha256,
  licenseNoticeSha256: hash(Buffer.from(entry.source.licenseNotice)),
  packagedChunkMatchesBuild: true, fullLicenseNoticePresent: true,
};
const outputPath = path.join(__dirname, 'packaged-catalog.json');
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
