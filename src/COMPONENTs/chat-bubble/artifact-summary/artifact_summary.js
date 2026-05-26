import React from "react";
import FilesChangedCard from "./files_changed_card";
import PlanCard from "./plan_card";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const ArtifactSummary = ({ bucket, isDark }) => {
  if (!isObject(bucket) || bucket.status !== "completed") return null;
  const artifacts = Array.isArray(bucket.artifacts) ? bucket.artifacts : [];
  if (artifacts.length === 0) return null;

  const fileDiffs = artifacts.filter((a) => a?.kind === "file_diff");
  const plans = artifacts.filter((a) => a?.kind === "plan");

  return (
    <div
      data-testid="artifact-summary"
      style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}
    >
      {fileDiffs.length > 0 && (
        <FilesChangedCard artifacts={fileDiffs} isDark={isDark} />
      )}
      {plans.map((artifact) => (
        <PlanCard key={artifact.artifact_id} artifact={artifact} isDark={isDark} />
      ))}
    </div>
  );
};

export default ArtifactSummary;
