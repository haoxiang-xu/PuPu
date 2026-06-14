import {
  buildArtifactKindRegistry,
  getArtifactKindMetadata,
} from "./artifact_kind_registry";

describe("artifact kind registry", () => {
  test("starts with compatibility defaults for old backends", () => {
    const registry = buildArtifactKindRegistry(undefined);

    expect(registry.file_diff.displayName).toBe("Files changed");
    expect(registry.plan.displayName).toBe("Plan");
    expect(registry.markdown.fallbackRenderer).toBe("markdown");
  });

  test("merges root artifactKinds metadata from the toolkit catalog", () => {
    const registry = buildArtifactKindRegistry({
      artifactKinds: [
        {
          kind: "benchmark_report",
          displayName: "Benchmark",
          fallbackRenderer: "markdown",
          icon: { type: "builtin", name: "bar_chart" },
        },
      ],
    });

    expect(registry.benchmark_report).toMatchObject({
      kind: "benchmark_report",
      displayName: "Benchmark",
      fallbackRenderer: "markdown",
      icon: { type: "builtin", name: "bar_chart" },
    });
  });

  test("merges toolkit-level artifactKinds metadata", () => {
    const registry = buildArtifactKindRegistry({
      toolkits: [
        {
          toolkitId: "bench",
          artifactKinds: [
            {
              kind: "benchmark_report",
              displayName: "Benchmark",
              fallbackRenderer: "markdown",
              icon: { type: "builtin", name: "bar_chart" },
            },
          ],
        },
      ],
    });

    expect(getArtifactKindMetadata(registry, "benchmark_report")).toMatchObject({
      displayName: "Benchmark",
      toolkitId: "bench",
    });
  });

  test("built-in compatibility defaults keep precedence over toolkit overrides", () => {
    const registry = buildArtifactKindRegistry({
      toolkits: [
        {
          toolkitId: "custom",
          artifactKinds: [
            {
              kind: "file_diff",
              displayName: "Custom files",
              fallbackRenderer: "markdown",
              icon: { type: "builtin", name: "bar_chart" },
            },
          ],
        },
      ],
    });

    expect(registry.file_diff.displayName).toBe("Files changed");
    expect(registry.file_diff.icon.name).toBe("file_edit");
  });
});
