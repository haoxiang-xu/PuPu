import { useMemo } from "react";

const FONT = "Menlo, Monaco, Consolas, monospace";

export function parseDiffLines(unifiedDiff) {
  if (!unifiedDiff || typeof unifiedDiff !== "string") return [];
  const rows = [];
  let oldLineNo = 0;
  let newLineNo = 0;
  const lines = unifiedDiff.split("\n");
  let sawHunk = false;
  for (const raw of lines) {
    if (raw.length === 0) continue;
    if (raw.startsWith("---") || raw.startsWith("+++")) {
      rows.push({ kind: "file-header", text: raw });
      continue;
    }
    if (raw.startsWith("@@")) {
      const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) {
        oldLineNo = parseInt(m[1], 10);
        newLineNo = parseInt(m[2], 10);
      }
      sawHunk = true;
      rows.push({ kind: "hunk", text: raw });
      continue;
    }
    if (raw.startsWith("+")) {
      rows.push({ kind: "added", text: raw, oldNo: "", newNo: newLineNo });
      newLineNo += 1;
      continue;
    }
    if (raw.startsWith("-")) {
      rows.push({ kind: "removed", text: raw, oldNo: oldLineNo, newNo: "" });
      oldLineNo += 1;
      continue;
    }
    if (raw.startsWith(" ")) {
      rows.push({
        kind: "context",
        text: raw,
        oldNo: oldLineNo,
        newNo: newLineNo,
      });
      oldLineNo += 1;
      newLineNo += 1;
      continue;
    }
  }
  if (!sawHunk) return null;
  return rows;
}

export function countPlusMinus(unifiedDiff) {
  if (!unifiedDiff) return { plus: 0, minus: 0 };
  let plus = 0;
  let minus = 0;
  for (const line of unifiedDiff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) plus += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) minus += 1;
  }
  return { plus, minus };
}

export const DiffBody = ({ unifiedDiff, isDark }) => {
  const rows = useMemo(() => parseDiffLines(unifiedDiff), [unifiedDiff]);
  if (rows === null || rows === undefined) {
    return (
      <pre
        data-testid="code-diff-fallback-pre"
        className="scrollable"
        style={{
          fontFamily: FONT,
          fontSize: 12,
          whiteSpace: "pre",
          padding: 8,
          margin: 0,
          backgroundColor: isDark ? "var(--pupu-surface)" : "var(--pupu-sidebar)",
          color: "rgba(var(--pupu-text-rgb),0.92)",
          overflowX: "auto",
          overflowY: "auto",
          maxWidth: "100%",
          minWidth: 0,
          maxHeight: 480,
          borderRadius: 6,
          boxSizing: "border-box",
        }}
      >
        {unifiedDiff || "(no changes)"}
      </pre>
    );
  }
  if (rows.length === 0) {
    return (
      <div
        style={{
          fontSize: 11.5,
          fontStyle: "italic",
          color: "var(--pupu-text-muted)",
          padding: 8,
          fontFamily: FONT,
        }}
      >
        (no changes)
      </div>
    );
  }
  return (
    <div
      className="scrollable"
      style={{
        fontFamily: FONT,
        fontSize: 12,
        lineHeight: 1.55,
        backgroundColor: isDark ? "var(--pupu-surface)" : "var(--pupu-sidebar)",
        borderRadius: 6,
        overflowX: "auto",
        overflowY: "auto",
        maxWidth: "100%",
        minWidth: 0,
        maxHeight: 480,
        boxSizing: "border-box",
      }}
    >
      {rows.map((row, idx) => {
        let bg = "transparent";
        let fg = "rgba(var(--pupu-text-rgb),0.92)";
        if (row.kind === "added") {
          bg = isDark
            ? "rgba(var(--pupu-success-rgb),0.16)"
            : "rgba(var(--pupu-success-rgb),0.14)";
        } else if (row.kind === "removed") {
          bg = isDark
            ? "rgba(var(--pupu-danger-rgb),0.16)"
            : "rgba(var(--pupu-danger-rgb),0.14)";
        } else if (row.kind === "hunk") {
          bg = isDark
            ? "rgba(var(--pupu-accent-rgb),0.18)"
            : "rgba(var(--pupu-accent-rgb),0.14)";
          fg = "var(--pupu-accent)";
        } else if (row.kind === "file-header") {
          fg = "var(--pupu-text-muted)";
        }
        return (
          <div
            key={idx}
            data-diff-kind={row.kind}
            style={{
              display: "flex",
              padding: "0 8px",
              whiteSpace: "pre",
              backgroundColor: bg,
              color: fg,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "2.5em",
                textAlign: "right",
                paddingRight: 8,
                color: "var(--pupu-text-muted)",
                userSelect: "none",
              }}
            >
              {row.oldNo ?? ""}
            </span>
            <span
              style={{
                display: "inline-block",
                width: "2.5em",
                textAlign: "right",
                paddingRight: 8,
                color: "var(--pupu-text-muted)",
                userSelect: "none",
              }}
            >
              {row.newNo ?? ""}
            </span>
            <span style={{ flex: 1 }}>{row.text}</span>
          </div>
        );
      })}
    </div>
  );
};
