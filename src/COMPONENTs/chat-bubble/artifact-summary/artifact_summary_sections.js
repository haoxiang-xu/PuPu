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

const ArtifactSummarySections = ({
  runArtifactSummary,
  artifactSummariesByTurnId,
  isDark,
}) => {
  const showRunSummary = hasCompletedArtifacts(runArtifactSummary);
  const turnEntries = sortedTurnBuckets(artifactSummariesByTurnId).filter(
    ([, bucket]) => hasCompletedArtifacts(bucket),
  );
  if (!showRunSummary && turnEntries.length === 0) {
    return null;
  }

  return (
    <>
      {showRunSummary && (
        <div data-testid="run-artifact-summary-section">
          <ArtifactSummary bucket={runArtifactSummary} isDark={isDark} />
        </div>
      )}
      {turnEntries.map(([turnId, bucket]) => (
        <div data-testid="turn-artifact-summary-section" key={turnId}>
          <ArtifactSummary bucket={bucket} isDark={isDark} />
        </div>
      ))}
    </>
  );
};

export default ArtifactSummarySections;
