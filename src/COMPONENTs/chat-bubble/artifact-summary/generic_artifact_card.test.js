import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import GenericArtifactCard from "./generic_artifact_card";

jest.mock("../../../BUILTIN_COMPONENTs/icon/icon", () => ({
  __esModule: true,
  default: ({ src }) => <span data-testid={`icon-${src}`} />,
}));

jest.mock("./artifact_kind_icon", () => ({
  __esModule: true,
  default: () => <span data-testid="artifact-kind-icon" />,
}));

const artifact = (snapshot, overrides = {}) => ({
  artifact_id: "artifact:1",
  kind: "benchmark_report",
  title: "Benchmark artifact",
  summary: "Benchmark summary",
  snapshot,
  ...overrides,
});

describe("GenericArtifactCard", () => {
  test("renders markdown fallback content when expanded", () => {
    render(
      <GenericArtifactCard
        artifact={artifact({ markdown: "p95: **18ms**" })}
        kindMeta={{ displayName: "Benchmark", fallbackRenderer: "markdown" }}
        isDark={false}
      />,
    );

    expect(screen.getByText("Benchmark")).toBeInTheDocument();
    expect(screen.getByText("Benchmark artifact")).toBeInTheDocument();
    expect(screen.queryByText(/18ms/)).toBeNull();

    fireEvent.click(screen.getByTestId("generic-artifact-card-header"));
    expect(screen.getByText(/18ms/)).toBeInTheDocument();
  });

  test("renders table fallback content when expanded", () => {
    render(
      <GenericArtifactCard
        artifact={artifact({
          columns: ["case", "status"],
          rows: [{ case: "startup", status: "pass" }],
        })}
        kindMeta={{ displayName: "Results", fallbackRenderer: "table" }}
        isDark={false}
      />,
    );

    fireEvent.click(screen.getByTestId("generic-artifact-card-header"));
    expect(screen.getByText("case")).toBeInTheDocument();
    expect(screen.getByText("startup")).toBeInTheDocument();
  });

  test("renders kv fallback content when expanded", () => {
    render(
      <GenericArtifactCard
        artifact={artifact({ pairs: { branch: "dev", count: 2 } })}
        kindMeta={{ displayName: "Metadata", fallbackRenderer: "kv" }}
        isDark={false}
      />,
    );

    fireEvent.click(screen.getByTestId("generic-artifact-card-header"));
    expect(screen.getByText("branch")).toBeInTheDocument();
    expect(screen.getByText("dev")).toBeInTheDocument();
  });

  test("uses json fallback when renderer cannot be inferred", () => {
    render(
      <GenericArtifactCard
        artifact={artifact({ metric: 42 })}
        kindMeta={{ displayName: "Unknown", fallbackRenderer: "unknown" }}
        isDark={false}
      />,
    );

    fireEvent.click(screen.getByTestId("generic-artifact-card-header"));
    expect(screen.getByText(/"metric": 42/)).toBeInTheDocument();
  });
});
