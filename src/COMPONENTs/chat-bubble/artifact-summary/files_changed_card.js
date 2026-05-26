import React, { useMemo, useState } from "react";
import { DiffBody, countPlusMinus } from "../../diff/diff_body";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const readUnifiedDiff = (file) => {
  if (!isObject(file)) return "";
  if (typeof file.unified_diff === "string") return file.unified_diff;
  if (typeof file.unifiedDiff === "string") return file.unifiedDiff;
  return "";
};

const readOperation = (file) => {
  if (!isObject(file)) return "";
  const op =
    (typeof file.operation === "string" && file.operation) ||
    (typeof file.sub_operation === "string" && file.sub_operation) ||
    "";
  return op;
};

const normalizeFile = (file) => {
  if (!isObject(file)) return null;
  const unifiedDiff = readUnifiedDiff(file);
  const fallback = countPlusMinus(unifiedDiff);
  const hasBackendAdditions = Number.isFinite(Number(file.additions));
  const hasBackendDeletions = Number.isFinite(Number(file.deletions));
  const additions = hasBackendAdditions ? Number(file.additions) : fallback.plus;
  const deletions = hasBackendDeletions ? Number(file.deletions) : fallback.minus;
  const statsFromBackend = hasBackendAdditions && hasBackendDeletions;
  return {
    path: typeof file.path === "string" ? file.path : "",
    operation: readOperation(file),
    unifiedDiff,
    additions,
    deletions,
    statsFromBackend,
    truncated: Boolean(file.truncated),
    totalLines: Number.isFinite(Number(file.total_lines))
      ? Number(file.total_lines)
      : null,
    displayedLines: Number.isFinite(Number(file.displayed_lines))
      ? Number(file.displayed_lines)
      : null,
    binary: Boolean(file.binary),
  };
};

const looksLikeFile = (snapshot) =>
  isObject(snapshot) &&
  (typeof snapshot.unified_diff === "string" ||
    typeof snapshot.unifiedDiff === "string" ||
    typeof snapshot.path === "string");

const collectFiles = (artifacts) => {
  const out = [];
  for (const artifact of artifacts || []) {
    if (!isObject(artifact)) continue;
    const snapshot = isObject(artifact.snapshot) ? artifact.snapshot : {};
    // Two valid snapshot shapes per spec §4.3:
    //  (a) snapshot.files: [{ path, unified_diff, ... }, ...]
    //  (b) snapshot itself is a single-file payload with path / unified_diff
    const files = Array.isArray(snapshot.files)
      ? snapshot.files
      : looksLikeFile(snapshot)
        ? [snapshot]
        : [];
    for (const file of files) {
      const normalized = normalizeFile(file);
      if (normalized) out.push(normalized);
    }
  }
  return out;
};

const FilesChangedCard = ({ artifacts, isDark }) => {
  const [expanded, setExpanded] = useState(false);
  const files = useMemo(() => collectFiles(artifacts), [artifacts]);
  const totals = useMemo(
    () =>
      files.reduce(
        (acc, f) => ({
          plus: acc.plus + f.additions,
          minus: acc.minus + f.deletions,
        }),
        { plus: 0, minus: 0 },
      ),
    [files],
  );
  const partialTotals = useMemo(
    () => files.some((f) => f.truncated && !f.statsFromBackend),
    [files],
  );
  if (files.length === 0) return null;
  const border = isDark ? "#6e7681" : "#8c959f";
  const secondary = isDark ? "#8c959f" : "#656d76";

  return (
    <div
      data-testid="files-changed-card"
      style={{
        border: `1px solid ${border}`,
        borderRadius: 8,
        backgroundColor: "transparent",
      }}
    >
      <div
        data-testid="files-changed-card-header"
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        style={{
          padding: "8px 12px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
        }}
      >
        <span aria-hidden>{expanded ? "▾" : "▸"}</span>
        <span>Files changed · {files.length}</span>
        <span style={{ marginLeft: "auto", color: secondary }}>
          +{totals.plus} −{totals.minus}
          {partialTotals ? " shown" : ""}
        </span>
      </div>
      {expanded && (
        <div
          data-testid="files-changed-card-body"
        >
          {files.map((file, idx) => (
            <FileRow key={`${file.path}:${idx}`} file={file} isDark={isDark} />
          ))}
        </div>
      )}
    </div>
  );
};

const FileRow = ({ file, isDark }) => {
  const [expanded, setExpanded] = useState(false);
  const secondary = isDark ? "#8c959f" : "#656d76";
  const border = isDark ? "#6e7681" : "#8c959f";

  const fallbackChip = file.binary
    ? "Binary file"
    : file.truncated && file.totalLines !== null && file.displayedLines !== null
      ? `Truncated · ${file.displayedLines}/${file.totalLines} lines`
      : null;

  return (
    <div style={{ borderTop: `1px solid ${border}` }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded((v) => !v);
          }
        }}
        style={{
          padding: "6px 12px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        <span aria-hidden>{expanded ? "▾" : "▸"}</span>
        <span>{file.path}</span>
        {file.operation && (
          <span
            style={{
              textTransform: "uppercase",
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 3,
              backgroundColor: isDark ? "#2d2d2d" : "#eaeef2",
              color: secondary,
            }}
          >
            {file.operation}
          </span>
        )}
        {fallbackChip && (
          <span
            style={{
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 3,
              color: secondary,
              backgroundColor: isDark ? "#2d2d2d" : "#eaeef2",
            }}
          >
            {fallbackChip}
          </span>
        )}
        <span style={{ marginLeft: "auto", color: secondary }}>
          +{file.additions} −{file.deletions}
          {file.truncated && !file.statsFromBackend ? " shown" : ""}
        </span>
      </div>
      {expanded && !file.binary && (
        <div style={{ padding: "0 12px 8px 12px" }}>
          {file.unifiedDiff ? (
            <DiffBody unifiedDiff={file.unifiedDiff} isDark={isDark} />
          ) : file.truncated && file.totalLines !== null && file.displayedLines !== null ? (
            <div
              style={{
                fontSize: 11.5,
                fontStyle: "italic",
                color: isDark ? "#8c959f" : "#656d76",
                padding: 8,
              }}
            >
              Diff truncated · {file.displayedLines}/{file.totalLines} lines displayed
            </div>
          ) : (
            <DiffBody unifiedDiff={file.unifiedDiff} isDark={isDark} />
          )}
        </div>
      )}
    </div>
  );
};

export default FilesChangedCard;
