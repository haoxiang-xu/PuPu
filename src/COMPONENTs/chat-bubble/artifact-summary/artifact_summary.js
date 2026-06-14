import React from "react";
import FilesChangedCard from "./files_changed_card";
import GenericArtifactCard from "./generic_artifact_card";
import PlanCard from "./plan_card";
import {
  getArtifactKindMetadata,
  useArtifactKindRegistry,
} from "./artifact_kind_registry";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const shouldReplaceArtifact = (existing, incoming) => {
  const existingRevision = Number(existing?.revision);
  const incomingRevision = Number(incoming?.revision);
  if (Number.isFinite(existingRevision) && Number.isFinite(incomingRevision)) {
    return incomingRevision >= existingRevision;
  }
  return true;
};

const dedupeArtifactsById = (artifacts) => {
  const result = [];
  const indexById = new Map();

  artifacts.forEach((artifact) => {
    const artifactId =
      typeof artifact?.artifact_id === "string" && artifact.artifact_id.trim()
        ? artifact.artifact_id.trim()
        : "";
    if (!artifactId) {
      result.push(artifact);
      return;
    }

    const existingIndex = indexById.get(artifactId);
    if (existingIndex === undefined) {
      indexById.set(artifactId, result.length);
      result.push(artifact);
      return;
    }

    if (shouldReplaceArtifact(result[existingIndex], artifact)) {
      result[existingIndex] = artifact;
    }
  });

  return result;
};

const ArtifactSummary = ({ bucket, isDark, artifactKindRegistry }) => {
  const loadedRegistry = useArtifactKindRegistry({
    enabled: !artifactKindRegistry,
  });
  const registry = artifactKindRegistry || loadedRegistry;
  if (!isObject(bucket) || bucket.status !== "completed") return null;
  const artifacts = Array.isArray(bucket.artifacts)
    ? dedupeArtifactsById(bucket.artifacts)
    : [];
  if (artifacts.length === 0) return null;

  const fileDiffs = artifacts.filter(
    (a) => a?.kind === "file_diff" || a?.kind === "workspace_change_set",
  );
  const plans = artifacts.filter((a) => a?.kind === "plan");
  const genericArtifacts = artifacts.filter(
    (a) =>
      a?.kind !== "file_diff" &&
      a?.kind !== "workspace_change_set" &&
      a?.kind !== "plan",
  );

  return (
    <div
      data-testid="artifact-summary"
      style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}
    >
      {fileDiffs.length > 0 && (
        <FilesChangedCard
          artifacts={fileDiffs}
          isDark={isDark}
          kindMeta={
            getArtifactKindMetadata(
              registry,
              fileDiffs[0]?.kind === "workspace_change_set"
                ? "workspace_change_set"
                : "file_diff",
            )
          }
        />
      )}
      {plans.map((artifact) => (
        <PlanCard
          key={artifact.artifact_id}
          artifact={artifact}
          isDark={isDark}
          kindMeta={getArtifactKindMetadata(registry, "plan")}
        />
      ))}
      {genericArtifacts.map((artifact) => (
        <GenericArtifactCard
          key={artifact.artifact_id || `${artifact.kind}:${artifact.title}`}
          artifact={artifact}
          isDark={isDark}
          kindMeta={getArtifactKindMetadata(registry, artifact.kind)}
        />
      ))}
    </div>
  );
};

export default ArtifactSummary;
