import fs from "node:fs";

const REVIEW_ENV_KEYS = [
  "PATH",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "USER",
  "USERNAME",
  "LOGNAME",
  "SHELL",
  "TMPDIR",
  "TMP",
  "TEMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TERM",
  "COLORTERM",
  "NO_COLOR",
  "FORCE_COLOR",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
  "NODE_EXTRA_CA_CERTS",
];
const REVIEW_RECOMMENDATIONS = new Set(["GO", "NO-GO", "NEEDS-HUMAN-TEST"]);
const REVIEW_SEVERITIES = new Set(["critical", "high", "medium", "low"]);

const extractJson = (text) => {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed?.structured_output) return parsed.structured_output;
    if (typeof parsed?.result === "string") return extractJson(parsed.result);
    return parsed;
  } catch (_) {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch (_) {
      return null;
    }
  }
};

const hasOnlyKeys = (value, allowed) =>
  Object.keys(value).every((key) => allowed.has(key));

export const isValidReview = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (!hasOnlyKeys(value, new Set(["recommendation", "summary", "risks", "missing_tests"]))) {
    return false;
  }
  if (!REVIEW_RECOMMENDATIONS.has(value.recommendation)) return false;
  if (typeof value.summary !== "string") return false;
  if (!Array.isArray(value.missing_tests) || !value.missing_tests.every((item) => typeof item === "string")) {
    return false;
  }
  if (!Array.isArray(value.risks)) return false;
  return value.risks.every((risk) =>
    risk &&
    typeof risk === "object" &&
    !Array.isArray(risk) &&
    hasOnlyKeys(risk, new Set(["severity", "title", "evidence", "recommendation"])) &&
    REVIEW_SEVERITIES.has(risk.severity) &&
    typeof risk.title === "string" &&
    typeof risk.evidence === "string" &&
    typeof risk.recommendation === "string"
  );
};

export const parseReview = (text) => {
  const parsed = extractJson(text);
  return isValidReview(parsed) ? parsed : null;
};

export const parseCompletedReview = (result, text) =>
  result?.status === 0 && !result?.error ? parseReview(text) : null;

export const buildReviewerEnv = (source = process.env) =>
  Object.fromEntries(
    REVIEW_ENV_KEYS
      .filter((key) => source[key] != null)
      .map((key) => [key, source[key]]),
  );

export const resetReviewOutputs = (paths) => {
  for (const outputPath of paths) fs.rmSync(outputPath, { force: true });
};
