import {
  validateReleaseArtifactContract,
  validateReleaseAssetManifest,
} from "./release-artifact-manifest.mjs";

export const README_DOWNLOADS_START = "<!-- release-downloads:start -->";
export const README_DOWNLOADS_END = "<!-- release-downloads:end -->";

const releaseUrl = (repository, tag, name) =>
  `https://github.com/${repository}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;

const oneAsset = (manifest, targetId, format) => {
  const matches = manifest.assets.filter((asset) =>
    asset.target_id === targetId && asset.format === format
  );
  if (matches.length !== 1) {
    throw new Error(`manifest must contain exactly one ${targetId} ${format} asset`);
  }
  return matches[0];
};

export function renderReleaseDownloadBlock({ manifest, contract, repository = "haoxiang-xu/PuPu" }) {
  validateReleaseArtifactContract(contract);
  validateReleaseAssetManifest(manifest, contract);
  if (typeof repository !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(repository)) {
    throw new Error("repository must be an owner/repository string");
  }
  const tag = manifest.release.tag;
  const macArm = oneAsset(manifest, "macos-arm64", "dmg");
  const macX64 = oneAsset(manifest, "macos-x64", "dmg");
  const windows = oneAsset(manifest, "windows-x64", "exe");
  const appImage = oneAsset(manifest, "linux-x64", "AppImage");
  const deb = oneAsset(manifest, "linux-x64", "deb");
  const link = (asset, label) => `[${label}](${releaseUrl(repository, tag, asset.name)})`;
  const button = (asset, label, badge) =>
    link(asset, `![${label}](https://img.shields.io/badge/${badge}?style=for-the-badge)`);

  return [
    README_DOWNLOADS_START,
    `**${tag}** — Choose your platform and click to download.`,
    "",
    "<a id=\"macos\"></a>",
    "",
    "### macOS",
    "",
    button(macArm, "Download for Mac — Apple Silicon", "Mac-Apple_Silicon-111827"),
    button(macX64, "Download for Mac — Intel", "Mac-Intel-64748B"),
    "",
    "**Not sure which Mac you have?** Open **Apple menu → About This Mac**. Choose **Apple Silicon** for an Apple M-series chip, or **Intel** for an Intel processor.",
    "",
    "<a id=\"windows\"></a>",
    "",
    "### Windows",
    "",
    button(windows, "Download for Windows x64", "Download-Windows_x64-0078D4"),
    "",
    "Run the installer, then launch PuPu from the Start menu.",
    "",
    "<a id=\"linux\"></a>",
    "",
    "### Linux",
    "",
    button(deb, "Download for Ubuntu / Debian x64", "Ubuntu_%2F_Debian-x64_DEB-E95420"),
    button(appImage, "Download Linux AppImage x64", "Linux-x64_AppImage-2563EB"),
    "",
    "For the `.deb`, download it first and install it with:",
    "",
    "```bash",
    `sudo apt install ./${deb.name}`,
    "```",
    "",
    README_DOWNLOADS_END,
  ].join("\n");
}

export function replaceReleaseDownloadBlock(readme, block) {
  if (typeof readme !== "string" || typeof block !== "string") {
    throw new Error("README and rendered download block must be strings");
  }
  const start = readme.indexOf(README_DOWNLOADS_START);
  const end = readme.indexOf(README_DOWNLOADS_END);
  if (start < 0 || end < 0 || end < start) {
    throw new Error("README must contain one ordered release-downloads marker pair");
  }
  if (
    readme.indexOf(README_DOWNLOADS_START, start + README_DOWNLOADS_START.length) >= 0 ||
    readme.indexOf(README_DOWNLOADS_END, end + README_DOWNLOADS_END.length) >= 0
  ) {
    throw new Error("README must contain exactly one release-downloads marker pair");
  }
  return `${readme.slice(0, start)}${block}${readme.slice(end + README_DOWNLOADS_END.length)}`;
}
