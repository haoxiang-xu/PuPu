import React, { useContext, useMemo, useState } from "react";
import { DiffBody, countPlusMinus } from "../../diff/diff_body";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import Icon from "../../../BUILTIN_COMPONENTs/icon/icon";
import ArtifactKindIcon from "./artifact_kind_icon";

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const EXPAND_TRANSITION = "transform 0.22s cubic-bezier(0.32,1,0.32,1)";

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

const usePalette = (isDark) => {
  const ctx = useContext(ConfigContext);
  const theme = isObject(ctx) ? ctx.theme : null;
  const primary =
    (theme && typeof theme.color === "string" && theme.color) ||
    (isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.85)");
  const secondary = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
  const cardBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
  const chipBg = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  const hoverBg = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
  return { primary, secondary, cardBg, chipBg, hoverBg };
};

const DisclosureArrow = ({ open, color, size = 14 }) => (
  <Icon
    src="arrow_right"
    color={color}
    style={{
      width: size,
      height: size,
      opacity: 0.4,
      flexShrink: 0,
      transition: EXPAND_TRANSITION,
      transform: open ? "rotate(90deg)" : "rotate(0deg)",
    }}
  />
);

const FilesChangedCard = ({ artifacts, isDark, kindMeta }) => {
  const [expanded, setExpanded] = useState(false);
  const [hover, setHover] = useState(false);
  const { primary, secondary, cardBg, hoverBg } = usePalette(isDark);
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
  const displayName =
    (typeof kindMeta?.displayName === "string" && kindMeta.displayName) ||
    "Files changed";

  return (
    <div
      data-testid="files-changed-card"
      style={{
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        boxSizing: "border-box",
        backgroundColor: cardBg,
        borderRadius: 10,
        color: primary,
        overflow: "hidden",
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
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          padding: "12px 16px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 12,
          minWidth: 0,
          fontSize: 13,
          backgroundColor: hover ? hoverBg : "transparent",
          transition: "background-color 0.15s ease",
        }}
      >
        <ArtifactKindIcon
          icon={kindMeta?.icon || { type: "builtin", name: "file_edit" }}
          color={primary}
        />
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ fontWeight: 500, lineHeight: 1.2 }}>{displayName}</span>
          <span
            style={{
              fontSize: 11.5,
              color: secondary,
              lineHeight: 1.3,
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {files.length} {files.length === 1 ? "file" : "files"}
          </span>
        </div>
        <span
          style={{
            marginLeft: "auto",
            color: secondary,
            fontSize: 12,
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          +{totals.plus} −{totals.minus}
          {partialTotals ? " shown" : ""}
        </span>
        <DisclosureArrow open={expanded} color={primary} />
      </div>
      {expanded && (
        <div
          data-testid="files-changed-card-body"
          style={{ minWidth: 0, maxWidth: "100%" }}
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
  const [hover, setHover] = useState(false);
  const { primary, secondary, chipBg, hoverBg } = usePalette(isDark);

  const fallbackChip = file.binary
    ? "Binary file"
    : file.truncated && file.totalLines !== null && file.displayedLines !== null
      ? `Truncated · ${file.displayedLines}/${file.totalLines} lines`
      : null;

  return (
    <div style={{ color: primary, minWidth: 0, maxWidth: "100%" }}>
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
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          padding: "8px 16px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
          maxWidth: "100%",
          boxSizing: "border-box",
          fontSize: 12.5,
          cursor: "pointer",
          backgroundColor: hover ? hoverBg : "transparent",
          transition: "background-color 0.15s ease",
        }}
      >
        <span
          style={{
            flex: "1 1 auto",
            minWidth: 0,
            overflowWrap: "anywhere",
          }}
        >
          {file.path}
        </span>
        {file.operation && (
          <span
            style={{
              textTransform: "uppercase",
              fontSize: 10,
              padding: "1px 6px",
              borderRadius: 3,
              backgroundColor: chipBg,
              color: secondary,
              flexShrink: 0,
              whiteSpace: "nowrap",
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
              backgroundColor: chipBg,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {fallbackChip}
          </span>
        )}
        <span
          style={{
            marginLeft: "auto",
            color: secondary,
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          +{file.additions} −{file.deletions}
          {file.truncated && !file.statsFromBackend ? " shown" : ""}
        </span>
        <DisclosureArrow open={expanded} color={primary} size={12} />
      </div>
      {expanded && !file.binary && (
        <div
          style={{
            padding: "12px 16px 16px 16px",
            minWidth: 0,
            maxWidth: "100%",
            boxSizing: "border-box",
          }}
        >
          {file.unifiedDiff ? (
            <DiffBody unifiedDiff={file.unifiedDiff} isDark={isDark} />
          ) : file.truncated && file.totalLines !== null && file.displayedLines !== null ? (
            <div
              style={{
                fontSize: 11.5,
                fontStyle: "italic",
                color: secondary,
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
