#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  buildReviewerEnv,
  parseCompletedReview,
  resetReviewOutputs,
} from "./ai-review-helpers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUTPUT_DIR = path.join(ROOT, ".release-qa", "local");
const REPORT_PATH = path.join(OUTPUT_DIR, "release-qa-report.json");
const CONTEXT_PATH = path.join(OUTPUT_DIR, "ai-review-context.md");
const SCHEMA_PATH = path.join(ROOT, "scripts", "release-qa", "release-review.schema.json");
const PROMPT_PATH = path.join(ROOT, "scripts", "release-qa", "release-review-prompt.md");
const CODEX_OUTPUT_PATH = path.join(OUTPUT_DIR, "codex-review.json");
const CLAUDE_OUTPUT_PATH = path.join(OUTPUT_DIR, "claude-review.json");
const COMBINED_OUTPUT_PATH = path.join(OUTPUT_DIR, "ai-review.json");
const reviewerEnv = buildReviewerEnv();

const hasFlag = (name) => process.argv.slice(2).includes(name);

const runGit = (args) =>
  spawnSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });

const git = (args) => {
  const result = runGit(args);
  return result.status === 0 ? result.stdout.trim() : "";
};

const gitRequired = (args) => {
  const result = runGit(args);
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "unknown error").trim();
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
  return result.stdout.trim();
};

const resolveBaseRef = () => {
  const requested = process.env.PUPU_QA_BASE_REF;
  const latestTag = git(["describe", "--tags", "--abbrev=0"]);
  const candidates = requested
    ? [requested]
    : [latestTag, "origin/dev", "HEAD~1"].filter(Boolean);

  for (const candidate of candidates) {
    if (git(["rev-parse", "--verify", `${candidate}^{commit}`])) {
      return candidate;
    }
  }

  throw new Error(
    requested
      ? `PUPU_QA_BASE_REF does not resolve to a commit: ${requested}`
      : "Unable to resolve an AI review base from the latest tag, origin/dev, or HEAD~1",
  );
};

const commandExists = (command) =>
  spawnSync(command, ["--version"], {
    encoding: "utf8",
    env: reviewerEnv,
  }).status === 0;

const unavailable = (reason) => ({
  status: "unavailable",
  reason,
  recommendation: "NEEDS-HUMAN-TEST",
  summary: reason,
  risks: [],
  missing_tests: [],
});

if (!fs.existsSync(REPORT_PATH)) {
  console.error("[release-qa] deterministic report missing; run npm run qa:release:deterministic first");
  process.exit(1);
}

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
resetReviewOutputs([CODEX_OUTPUT_PATH, CLAUDE_OUTPUT_PATH, COMBINED_OUTPUT_PATH]);
const baseRef = resolveBaseRef();
const report = fs.readFileSync(REPORT_PATH, "utf8");
const reportPayload = JSON.parse(report);
const diffStat = gitRequired([
  "diff",
  "--no-ext-diff",
  "--stat=120,80",
  "--find-renames",
  baseRef,
  "--",
]);
const changedPaths = gitRequired([
  "diff",
  "--no-ext-diff",
  "--name-status",
  "--find-renames",
  baseRef,
  "--",
]);
const status = gitRequired(["status", "--short"]);
const commits = gitRequired(["log", "--oneline", `${baseRef}..HEAD`]);
const head = gitRequired(["rev-parse", "HEAD"]);
if (reportPayload?.git?.sha !== head || reportPayload?.deterministic_result?.status !== "passed") {
  throw new Error(
    "Deterministic report is stale or not passing; rerun npm run qa:release:deterministic",
  );
}

const context = [
  "# PuPu release review context",
  "",
  `- Base ref: ${baseRef}`,
  `- Head: ${head}`,
  "",
  "## Deterministic QA report",
  "",
  "```json",
  report,
  "```",
  "",
  "## Worktree status",
  "",
  "```text",
  status || "clean",
  "```",
  "",
  "## Release commits",
  "",
  "```text",
  commits || "(none)",
  "```",
  "",
  "## Release diff summary",
  "",
  "```text",
  diffStat || "(no tracked diff)",
  "```",
  "",
  "## Changed paths",
  "",
  "```text",
  changedPaths || "(no tracked paths)",
  "```",
  "",
].join("\n");
fs.writeFileSync(CONTEXT_PATH, context, "utf8");

const basePrompt = fs.readFileSync(PROMPT_PATH, "utf8");
const prompt = `${basePrompt}\n\nRead ${CONTEXT_PATH} and inspect relevant repository files before deciding.`;
const reviews = {};

if (commandExists("codex")) {
  const args = [
    "exec",
    "--ignore-user-config",
    "--sandbox",
    "read-only",
    "--ephemeral",
    "--output-schema",
    SCHEMA_PATH,
    "--output-last-message",
    CODEX_OUTPUT_PATH,
    "--cd",
    ROOT,
  ];
  if (process.env.PUPU_QA_CODEX_MODEL) {
    args.push("--model", process.env.PUPU_QA_CODEX_MODEL);
  }
  args.push("-");
  const result = spawnSync("codex", args, {
    cwd: ROOT,
    input: prompt,
    encoding: "utf8",
    env: reviewerEnv,
    stdio: ["pipe", "inherit", "inherit"],
  });
  const parsed = fs.existsSync(CODEX_OUTPUT_PATH)
    ? parseCompletedReview(result, fs.readFileSync(CODEX_OUTPUT_PATH, "utf8"))
    : null;
  reviews.codex = parsed
    ? { ...parsed, status: "completed" }
    : unavailable(`codex review failed with exit ${result.status}`);
} else {
  reviews.codex = unavailable("codex CLI is not installed or authenticated");
}

if (commandExists("claude")) {
  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  const args = [
    "--print",
    "--safe-mode",
    "--disable-slash-commands",
    "--permission-mode",
    "plan",
    "--tools",
    "Read,Glob,Grep",
    "--no-session-persistence",
    "--output-format",
    "json",
    "--json-schema",
    schema,
  ];
  if (process.env.PUPU_QA_CLAUDE_MODEL) {
    args.push("--model", process.env.PUPU_QA_CLAUDE_MODEL);
  }
  args.push(prompt);
  const result = spawnSync("claude", args, {
    cwd: ROOT,
    encoding: "utf8",
    env: reviewerEnv,
    maxBuffer: 20 * 1024 * 1024,
  });
  const parsed = parseCompletedReview(result, result.stdout);
  reviews.claude = parsed
    ? { ...parsed, status: "completed" }
    : unavailable(
        `claude review failed with exit ${result.status}: ${String(result.stderr || "").slice(0, 500)}`,
      );
  fs.writeFileSync(
    CLAUDE_OUTPUT_PATH,
    `${JSON.stringify(reviews.claude, null, 2)}\n`,
    "utf8",
  );
} else {
  reviews.claude = unavailable("claude CLI is not installed or authenticated");
}

const recommendations = Object.values(reviews).map((review) => review.recommendation);
const recommendation = recommendations.includes("NO-GO")
  ? "NO-GO"
  : recommendations.every((value) => value === "GO")
    ? "GO"
    : "NEEDS-HUMAN-TEST";

const combined = {
  schema_version: 1,
  base_ref: baseRef,
  head,
  recommendation,
  reviewers: reviews,
};
fs.writeFileSync(
  COMBINED_OUTPUT_PATH,
  `${JSON.stringify(combined, null, 2)}\n`,
  "utf8",
);

console.log(`[release-qa] dual AI recommendation: ${recommendation}`);
console.log(`[release-qa] review: ${path.relative(ROOT, OUTPUT_DIR)}/ai-review.json`);

if (hasFlag("--strict") && recommendation !== "GO") {
  process.exit(1);
}
