const TOPOLOGY_SCHEMA = "pupu.release-qa-report-topology.v1";
const MODES = Object.freeze([
  "lite",
  "release",
  "release-candidate",
  "windows-active-qualification",
]);

const isObject = (value) =>
  value != null && typeof value === "object" && !Array.isArray(value);

const hasExactKeys = (value, expected) =>
  isObject(value) &&
  Object.keys(value).length === expected.length &&
  expected.every((key) => Object.prototype.hasOwnProperty.call(value, key));

export function expectedReportPlatformsForMode(manifest, mode) {
  if (!hasExactKeys(manifest, ["modes", "schema"]) || manifest.schema !== TOPOLOGY_SCHEMA) {
    throw new Error("release QA report topology has an invalid schema");
  }
  if (!hasExactKeys(manifest.modes, MODES)) {
    throw new Error("release QA report topology has an invalid mode set");
  }
  if (!MODES.includes(mode)) {
    throw new Error(`release QA mode is unsupported: ${mode || "(missing)"}`);
  }
  const modeDefinition = manifest.modes[mode];
  if (!hasExactKeys(modeDefinition, ["required_reports"])) {
    throw new Error(`release QA mode ${mode} has an invalid definition`);
  }
  const requiredReports = modeDefinition.required_reports;
  if (!Array.isArray(requiredReports) || requiredReports.length === 0) {
    throw new Error(`release QA mode ${mode} has no required reports`);
  }
  const platforms = requiredReports.map((entry) => {
    if (!hasExactKeys(entry, ["platform"]) || typeof entry.platform !== "string" || !entry.platform) {
      throw new Error(`release QA mode ${mode} has an invalid report entry`);
    }
    return entry.platform;
  });
  if (new Set(platforms).size !== platforms.length) {
    throw new Error(`release QA mode ${mode} repeats a required report`);
  }
  return Object.freeze(platforms);
}
