import React from "react";
import ArtifactSummary from "./artifact_summary";

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const hasCompletedArtifacts = (bucket) =>
  isObject(bucket) &&
  bucket.status === "completed" &&
  Array.isArray(bucket.artifacts) &&
  bucket.artifacts.length > 0;

const sortedTurnBuckets = (artifactSummariesByTurnId) => {
  if (!isObject(artifactSummariesByTurnId)) {
    return [];
  }
  return Object.entries(artifactSummariesByTurnId).sort(
    ([, a], [, b]) => (a?.order || 0) - (b?.order || 0),
  );
};

const artifactIdOf = (artifact) =>
  typeof artifact?.artifact_id === "string" && artifact.artifact_id.trim()
    ? artifact.artifact_id.trim()
    : "";

const buildCoveredTurnArtifactFilter = (runArtifactSummary) => {
  const runArtifacts = Array.isArray(runArtifactSummary?.artifacts)
    ? runArtifactSummary.artifacts
    : [];
  const runPlanIds = new Set(
    runArtifacts
      .filter((artifact) => artifact?.kind === "plan")
      .map(artifactIdOf)
      .filter(Boolean),
  );
  const hasWorkspaceChangeSet = runArtifacts.some(
    (artifact) => artifact?.kind === "workspace_change_set",
  );

  return (artifact) => {
    if (hasWorkspaceChangeSet && artifact?.kind === "file_diff") {
      return false;
    }
    if (artifact?.kind === "plan" && runPlanIds.has(artifactIdOf(artifact))) {
      return false;
    }
    return true;
  };
};

const filterCoveredTurnBucket = (bucket, shouldKeepArtifact) => {
  if (!isObject(bucket) || !Array.isArray(bucket.artifacts)) {
    return bucket;
  }
  const artifacts = bucket.artifacts.filter(shouldKeepArtifact);
  if (artifacts.length === bucket.artifacts.length) {
    return bucket;
  }
  return { ...bucket, artifacts };
};

const ArtifactSummarySections = ({
  runArtifactSummary,
  artifactSummariesByTurnId,
  isDark,
  artifactKindRegistry,
}) => {
  const showRunSummary = hasCompletedArtifacts(runArtifactSummary);
  const shouldKeepTurnArtifact = showRunSummary
    ? buildCoveredTurnArtifactFilter(runArtifactSummary)
    : () => true;
  const turnEntries = sortedTurnBuckets(artifactSummariesByTurnId)
    .map(([turnId, bucket]) => [
      turnId,
      filterCoveredTurnBucket(bucket, shouldKeepTurnArtifact),
    ])
    .filter(([, bucket]) => hasCompletedArtifacts(bucket));
  if (!showRunSummary && turnEntries.length === 0) {
    return null;
  }

  return (
    <>
      {showRunSummary && (
        <div data-testid="run-artifact-summary-section">
          <ArtifactSummary
            bucket={runArtifactSummary}
            isDark={isDark}
            artifactKindRegistry={artifactKindRegistry}
          />
        </div>
      )}
      {turnEntries.map(([turnId, bucket]) => (
        <div data-testid="turn-artifact-summary-section" key={turnId}>
          <ArtifactSummary
            bucket={bucket}
            isDark={isDark}
            artifactKindRegistry={artifactKindRegistry}
          />
        </div>
      ))}
    </>
  );
};

export default ArtifactSummarySections;
