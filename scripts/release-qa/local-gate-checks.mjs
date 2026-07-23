import path from "node:path";

export const buildLocalGateChecks = ({
  root,
  python,
  pythonPath = "",
  version,
}) => [
  {
    name: "diff whitespace integrity",
    command: "git diff --check",
    cwd: root,
  },
  {
    name: "frontend tests",
    command: "npm run test:frontend -- --passWithNoTests",
    cwd: root,
    env: { CI: "true" },
  },
  {
    name: "electron tests",
    command: "npm run test:electron",
    cwd: root,
  },
  {
    name: "python backend tests",
    command: `${python} -m pytest tests/ -q --tb=short`,
    cwd: path.join(root, "unchain_runtime", "server"),
    env: pythonPath ? { PYTHONPATH: pythonPath } : {},
  },
  {
    name: "MCP registry validation",
    command: "npm run validate:mcp",
    cwd: root,
  },
  {
    name: "web production build",
    command: "npm run build",
    cwd: root,
    env: { CI: "true", PUPU_BUILD_VERSION: version },
  },
  {
    name: "release QA script tests",
    command: "npm run test:release-qa:unit",
    cwd: root,
  },
  {
    name: "long-run harness tests",
    command: "npm run test:long-run-harness",
    cwd: root,
  },
  {
    name: "third-party notice script tests",
    command: "npm run test:notices",
    cwd: root,
  },
  {
    name: "Playwright Electron release smoke",
    command: "npm run test:e2e",
    cwd: root,
    env: {
      PUPU_E2E_RELEASE: "1",
      PUPU_E2E_PORT: "2917",
      PUPU_E2E_WEB_URL: "http://127.0.0.1:2917/#",
      PUPU_DETERMINISTIC_SOAK: "0",
      PUPU_LIVE_LONG_RUN: "0",
      PUPU_LIVE_CELL_ID: "",
    },
  },
];
