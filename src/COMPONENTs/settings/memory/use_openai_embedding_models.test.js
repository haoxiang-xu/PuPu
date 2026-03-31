import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { api } from "../../../SERVICEs/api";
import { subscribeModelCatalogRefresh } from "../../../SERVICEs/model_catalog_refresh";
import useOpenAIEmbeddingModels from "./use_openai_embedding_models";

jest.mock("../../../SERVICEs/api", () => ({
  api: {
    "unchain: {
      getModelCatalog: jest.fn(),
    },
  },
}));

jest.mock("../../../SERVICEs/model_catalog_refresh", () => ({
  subscribeModelCatalogRefresh: jest.fn(() => () => {}),
}));

const HookHarness = () => {
  const { models, loading, error } = useOpenAIEmbeddingModels();
  return (
    <div>
      <div data-testid="models">{models.join(",")}</div>
      <div data-testid="loading">{loading ? "true" : "false"}</div>
      <div data-testid="error">{error || ""}</div>
    </div>
  );
};

describe("useOpenAIEmbeddingModels", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("loads OpenAI embedding models from model catalog", async () => {
    api.unchain.getModelCatalog.mockResolvedValue({
      embeddingProviders: {
        openai: ["text-embedding-3-small", "text-embedding-3-large"],
      },
    });

    render(<HookHarness />);

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    expect(api.unchain.getModelCatalog).toHaveBeenCalledTimes(1);
    expect(subscribeModelCatalogRefresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("models")).toHaveTextContent(
      "text-embedding-3-small,text-embedding-3-large",
    );
    expect(screen.getByTestId("error")).toHaveTextContent("");
  });
});
