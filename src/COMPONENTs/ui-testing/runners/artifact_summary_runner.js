import { useContext, useMemo, useState } from "react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import ArtifactSummary from "../../chat-bubble/artifact-summary/artifact_summary";

/* ── sample diff payloads ─────────────────────────────────────────── */

const SMALL_EDIT_DIFF =
  "--- a/src/auth.js\n" +
  "+++ b/src/auth.js\n" +
  "@@ -10,7 +10,12 @@\n" +
  " function authenticate(req) {\n" +
  "-  const token = req.cookies.session;\n" +
  "+  const token = req.headers.authorization?.replace(/^Bearer /, \"\");\n" +
  "+  if (!token) {\n" +
  "+    return { ok: false, reason: \"missing_token\" };\n" +
  "+  }\n" +
  "   return verify(token);\n" +
  " }\n";

const ROUTER_DIFF =
  "--- a/src/router.js\n" +
  "+++ b/src/router.js\n" +
  "@@ -42,3 +42,6 @@\n" +
  " router.get(\"/health\", health);\n" +
  "+router.use(authenticate);\n" +
  "+router.get(\"/me\", me);\n" +
  "+router.post(\"/logout\", logout);\n";

const NEW_TEST_DIFF =
  "--- a/dev/null\n" +
  "+++ b/src/auth.test.js\n" +
  "@@ -0,0 +1,8 @@\n" +
  "+import { authenticate } from \"./auth\";\n" +
  "+\n" +
  "+test(\"rejects missing token\", () => {\n" +
  "+  const result = authenticate({ headers: {} });\n" +
  "+  expect(result.ok).toBe(false);\n" +
  "+});\n";

function buildTruncatedDiff() {
  const lines = ["--- a/big.js", "+++ b/big.js", "@@ -1,200 +1,200 @@"];
  for (let i = 0; i < 100; i += 1) {
    lines.push(`-line ${i}`);
    lines.push(`+LINE ${i}`);
  }
  return lines.join("\n") + "\n";
}

/* ── sample plan markdown ─────────────────────────────────────────── */

const PLAN_MARKDOWN_SHORT =
  "# Auth refactor\n\n" +
  "## Goals\n\n" +
  "- Remove cookie-based session storage\n" +
  "- Move to Authorization header (Bearer)\n" +
  "- Add OIDC adapter as a follow-up\n\n" +
  "## Steps\n\n" +
  "1. Update `authenticate(req)` to read from headers\n" +
  "2. Add 401 fallback for missing tokens\n" +
  "3. Wire `/me` and `/logout` routes\n";

const PLAN_MARKDOWN_TRUNCATED =
  "# Migration plan\n\n" +
  "This is the truncated preview. The full plan continues for many more sections.\n\n" +
  "## Phase 0 — preparation\n\n" +
  "- Inventory existing call sites\n" +
  "- Capture baseline metrics\n";

/* ── scenario catalogue ───────────────────────────────────────────── */

const scenarioBucket = (artifacts) => ({
  order: 1,
  status: "completed",
  artifacts,
});

const fileDiffArtifact = ({
  id,
  path,
  operation = "edit",
  unifiedDiff,
  additions,
  deletions,
  truncated = false,
  totalLines = null,
  displayedLines = null,
  binary = false,
}) => ({
  artifact_id: `file_diff:${id}`,
  kind: "file_diff",
  snapshot: {
    files: [
      {
        path,
        operation,
        unified_diff: unifiedDiff,
        ...(additions !== undefined ? { additions } : {}),
        ...(deletions !== undefined ? { deletions } : {}),
        ...(truncated ? { truncated: true } : {}),
        ...(totalLines !== null ? { total_lines: totalLines } : {}),
        ...(displayedLines !== null ? { displayed_lines: displayedLines } : {}),
        ...(binary ? { binary: true } : {}),
      },
    ],
  },
});

const planArtifact = ({
  id = "p1",
  title,
  status = "draft",
  revision = 1,
  markdown,
  truncated = false,
  totalLines = null,
  displayedLines = null,
  sourcePath,
}) => ({
  artifact_id: `plan:${id}`,
  kind: "plan",
  title,
  revision,
  snapshot: {
    plan_id: id,
    status,
    revision,
    title,
    markdown,
    ...(truncated ? { truncated: true } : {}),
    ...(totalLines !== null ? { total_lines: totalLines } : {}),
    ...(displayedLines !== null ? { displayed_lines: displayedLines } : {}),
  },
  ...(sourcePath
    ? {
        source: {
          path: sourcePath,
          relative_path: sourcePath.replace(/^.*\/workspace\//, ""),
        },
      }
    : {}),
});

const SCENARIOS = [
  /* ── file_diff scenarios ── */
  {
    key: "diff_single",
    label: "Diff — single edit",
    buckets: [
      scenarioBucket([
        fileDiffArtifact({
          id: "c1",
          path: "src/auth.js",
          unifiedDiff: SMALL_EDIT_DIFF,
          additions: 4,
          deletions: 1,
        }),
      ]),
    ],
  },
  {
    key: "diff_multi",
    label: "Diff — 3 files",
    buckets: [
      scenarioBucket([
        fileDiffArtifact({
          id: "c1",
          path: "src/auth.js",
          unifiedDiff: SMALL_EDIT_DIFF,
          additions: 4,
          deletions: 1,
        }),
        fileDiffArtifact({
          id: "c2",
          path: "src/router.js",
          unifiedDiff: ROUTER_DIFF,
          additions: 3,
          deletions: 0,
        }),
        fileDiffArtifact({
          id: "c3",
          path: "src/auth.test.js",
          operation: "create",
          unifiedDiff: NEW_TEST_DIFF,
          additions: 6,
          deletions: 0,
        }),
      ]),
    ],
  },
  {
    key: "diff_truncated",
    label: "Diff — truncated 200/400",
    buckets: [
      scenarioBucket([
        fileDiffArtifact({
          id: "c1",
          path: "big.js",
          unifiedDiff: buildTruncatedDiff(),
          additions: 100,
          deletions: 100,
          truncated: true,
          totalLines: 400,
          displayedLines: 200,
        }),
      ]),
    ],
  },
  {
    key: "diff_truncated_zero",
    label: "Diff — truncated 0/1000 (empty)",
    buckets: [
      scenarioBucket([
        fileDiffArtifact({
          id: "c1",
          path: "huge.json",
          unifiedDiff: "",
          truncated: true,
          totalLines: 1000,
          displayedLines: 0,
        }),
      ]),
    ],
  },
  {
    key: "diff_binary",
    label: "Diff — binary file",
    buckets: [
      scenarioBucket([
        fileDiffArtifact({
          id: "c1",
          path: "assets/logo.png",
          unifiedDiff: "",
          binary: true,
        }),
      ]),
    ],
  },
  {
    key: "diff_partial_shown",
    label: "Diff — partial stats (shown)",
    buckets: [
      scenarioBucket([
        fileDiffArtifact({
          id: "c1",
          path: "big.js",
          unifiedDiff: buildTruncatedDiff(),
          truncated: true,
          totalLines: 400,
          displayedLines: 200,
          // no additions/deletions → frontend computes from displayed diff → "shown"
        }),
      ]),
    ],
  },
  {
    key: "diff_backend_stats",
    label: "Diff — truncated, backend stats (no shown)",
    buckets: [
      scenarioBucket([
        fileDiffArtifact({
          id: "c1",
          path: "big.js",
          unifiedDiff: buildTruncatedDiff(),
          additions: 250,
          deletions: 250,
          truncated: true,
          totalLines: 400,
          displayedLines: 200,
        }),
      ]),
    ],
  },

  /* ── plan scenarios ── */
  {
    key: "plan_draft",
    label: "Plan — draft",
    buckets: [
      scenarioBucket([
        planArtifact({
          title: "Auth refactor",
          status: "draft",
          markdown: PLAN_MARKDOWN_SHORT,
          sourcePath: "/workspace/plans/auth_refactor.md",
        }),
      ]),
    ],
  },
  {
    key: "plan_finalized",
    label: "Plan — finalized",
    buckets: [
      scenarioBucket([
        planArtifact({
          title: "Auth refactor",
          status: "finalized",
          markdown: PLAN_MARKDOWN_SHORT,
          revision: 3,
          sourcePath: "/workspace/plans/auth_refactor.md",
        }),
      ]),
    ],
  },
  {
    key: "plan_truncated",
    label: "Plan — truncated 400/960",
    buckets: [
      scenarioBucket([
        planArtifact({
          title: "Migration plan",
          status: "draft",
          markdown: PLAN_MARKDOWN_TRUNCATED,
          truncated: true,
          totalLines: 960,
          displayedLines: 400,
          sourcePath: "/workspace/plans/migration.md",
        }),
      ]),
    ],
  },
  {
    key: "plan_truncated_zero",
    label: "Plan — truncated 0/960 (empty)",
    buckets: [
      scenarioBucket([
        planArtifact({
          title: "Massive plan",
          status: "draft",
          markdown: "",
          truncated: true,
          totalLines: 960,
          displayedLines: 0,
          sourcePath: "/workspace/plans/big.md",
        }),
      ]),
    ],
  },

  /* ── mixed / multi-turn ── */
  {
    key: "mixed",
    label: "Mixed — diff + plan",
    buckets: [
      scenarioBucket([
        fileDiffArtifact({
          id: "c1",
          path: "src/auth.js",
          unifiedDiff: SMALL_EDIT_DIFF,
          additions: 4,
          deletions: 1,
        }),
        planArtifact({
          title: "Auth refactor",
          status: "draft",
          markdown: PLAN_MARKDOWN_SHORT,
          sourcePath: "/workspace/plans/auth_refactor.md",
        }),
      ]),
    ],
  },
  {
    key: "multi_turn",
    label: "Multi-turn — 2 buckets stacked",
    buckets: [
      {
        order: 1,
        status: "completed",
        artifacts: [
          fileDiffArtifact({
            id: "t1",
            path: "src/auth.js",
            unifiedDiff: SMALL_EDIT_DIFF,
            additions: 4,
            deletions: 1,
          }),
        ],
      },
      {
        order: 2,
        status: "completed",
        artifacts: [
          fileDiffArtifact({
            id: "t2",
            path: "src/router.js",
            unifiedDiff: ROUTER_DIFF,
            additions: 3,
            deletions: 0,
          }),
          planArtifact({
            title: "Auth refactor",
            status: "draft",
            markdown: PLAN_MARKDOWN_SHORT,
            sourcePath: "/workspace/plans/auth_refactor.md",
          }),
        ],
      },
    ],
  },

  /* ── edge: pending / empty (should render nothing) ── */
  {
    key: "pending",
    label: "Pending bucket (renders nothing)",
    buckets: [
      {
        order: 1,
        status: "pending",
        artifacts: [
          fileDiffArtifact({
            id: "c1",
            path: "src/auth.js",
            unifiedDiff: SMALL_EDIT_DIFF,
          }),
        ],
      },
    ],
  },
];

/* ═══════════════════════════════════════════════════════════════════
   ArtifactSummaryRunner
   ═══════════════════════════════════════════════════════════════════ */
const ArtifactSummaryRunner = () => {
  const { onThemeMode } = useContext(ConfigContext);
  const isDark = onThemeMode === "dark_mode";

  const [selectedKey, setSelectedKey] = useState(SCENARIOS[0].key);

  const scenario = useMemo(
    () => SCENARIOS.find((s) => s.key === selectedKey) || SCENARIOS[0],
    [selectedKey],
  );

  const mutedLabel = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)";
  const sectionHeader = isDark
    ? "rgba(255,255,255,0.28)"
    : "rgba(0,0,0,0.28)";

  return (
    <div
      className="scrollable"
      data-sb-edge="16"
      data-sb-wall="2"
      style={{
        position: "absolute",
        inset: 0,
        overflowY: "auto",
        padding: "48px 40px 40px 232px",
        color: isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.8)",
        fontFamily: "Jost, sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 11,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: sectionHeader,
          marginBottom: 8,
        }}
      >
        Scenario
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginBottom: 18,
        }}
      >
        {SCENARIOS.map((s) => {
          const active = s.key === selectedKey;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setSelectedKey(s.key)}
              style={{
                appearance: "none",
                border: `1px solid ${
                  active
                    ? isDark
                      ? "rgba(255,255,255,0.35)"
                      : "rgba(0,0,0,0.4)"
                    : isDark
                      ? "rgba(255,255,255,0.12)"
                      : "rgba(0,0,0,0.12)"
                }`,
                background: active
                  ? isDark
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.06)"
                  : "transparent",
                color: active
                  ? isDark
                    ? "rgba(255,255,255,0.9)"
                    : "rgba(0,0,0,0.85)"
                  : mutedLabel,
                padding: "5px 10px",
                borderRadius: 6,
                fontSize: 11.5,
                fontFamily: "Menlo, Monaco, Consolas, monospace",
                cursor: "pointer",
              }}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <div
        style={{
          fontSize: 11,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: sectionHeader,
          marginBottom: 8,
        }}
      >
        ArtifactSummary
      </div>
      <div style={{ maxWidth: 720, marginBottom: 18 }}>
        {scenario.buckets.map((bucket, idx) => (
          <ArtifactSummary
            key={`${scenario.key}:${idx}`}
            bucket={bucket}
            isDark={isDark}
          />
        ))}
      </div>

      <div
        style={{
          fontSize: 11,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: sectionHeader,
          marginBottom: 8,
        }}
      >
        Bucket payload
      </div>
      <div style={{ position: "relative" }}>
        <pre
          className="scrollable"
          data-sb-edge="6"
          data-sb-wall="6"
          style={{
            fontFamily: "Menlo, Monaco, Consolas, monospace",
            fontSize: 11.5,
            padding: 10,
            borderRadius: 6,
            background: isDark
              ? "rgba(255,255,255,0.04)"
              : "rgba(0,0,0,0.04)",
            color: isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.75)",
            margin: 0,
            overflowX: "auto",
            overflowY: "hidden",
          }}
        >
          {JSON.stringify(scenario.buckets, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default ArtifactSummaryRunner;
