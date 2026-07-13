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

const isFileDiffArtifact = (artifact) => artifact?.kind === "file_diff";

const splitFoldedTurnFileDiffs = (turnEntries) => {
  const fileDiffBucketCount = turnEntries.filter(
    ([, bucket]) =>
      isObject(bucket) &&
      Array.isArray(bucket.artifacts) &&
      bucket.artifacts.some(isFileDiffArtifact),
  ).length;
  if (fileDiffBucketCount < 2) {
    return { foldedBucket: null, remainingEntries: turnEntries };
  }

  const foldedArtifacts = [];
  const remainingEntries = [];
  let foldedOrder = null;

  turnEntries.forEach(([turnId, bucket]) => {
    if (!isObject(bucket) || !Array.isArray(bucket.artifacts)) {
      remainingEntries.push([turnId, bucket]);
      return;
    }

    const fileDiffArtifacts = bucket.artifacts.filter(isFileDiffArtifact);
    if (fileDiffArtifacts.length === 0) {
      remainingEntries.push([turnId, bucket]);
      return;
    }

    foldedArtifacts.push(...fileDiffArtifacts);
    const bucketOrder = Number(bucket.order);
    if (Number.isFinite(bucketOrder)) {
      foldedOrder =
        foldedOrder === null ? bucketOrder : Math.min(foldedOrder, bucketOrder);
    }

    const remainingArtifacts = bucket.artifacts.filter(
      (artifact) => !isFileDiffArtifact(artifact),
    );
    if (remainingArtifacts.length > 0) {
      remainingEntries.push([
        turnId,
        { ...bucket, artifacts: remainingArtifacts },
      ]);
    }
  });

  return {
    foldedBucket:
      foldedArtifacts.length > 0
        ? {
            order: foldedOrder === null ? 0 : foldedOrder,
            status: "completed",
            artifacts: foldedArtifacts,
          }
        : null,
    remainingEntries,
  };
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
  const {
    foldedBucket: foldedTurnFileDiffBucket,
    remainingEntries: remainingTurnEntries,
  } = splitFoldedTurnFileDiffs(turnEntries);
  const showFoldedTurnFileDiffs = hasCompletedArtifacts(foldedTurnFileDiffBucket);

  if (
    !showRunSummary &&
    !showFoldedTurnFileDiffs &&
    remainingTurnEntries.length === 0
  ) {
    return null;
  }

  return (
    <>
      {showRunSummary && (
        <div
          data-testid="run-artifact-summary-section"
          style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}
        >
          <ArtifactSummary
            bucket={runArtifactSummary}
            isDark={isDark}
            artifactKindRegistry={artifactKindRegistry}
          />
        </div>
      )}
      {showFoldedTurnFileDiffs && (
        <div
          data-testid="turn-file-diff-summary-section"
          style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}
        >
          <ArtifactSummary
            bucket={foldedTurnFileDiffBucket}
            isDark={isDark}
            artifactKindRegistry={artifactKindRegistry}
          />
        </div>
      )}
      {remainingTurnEntries.map(([turnId, bucket]) => (
        <div
          data-testid="turn-artifact-summary-section"
          key={turnId}
          style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}
        >
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
