import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../CONTAINERs/config/context";
import CharacterChatBubble from "./character_chat_bubble";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => null);

const renderWithConfig = (ui) =>
  render(
    <ConfigContext.Provider
      value={{
        theme: { color: "#222", font: { fontFamily: "sans-serif" } },
        onThemeMode: "light_mode",
      }}
    >
      {ui}
    </ConfigContext.Provider>,
  );

describe("CharacterChatBubble artifact summaries", () => {
  const fileBucket = (turnId, order) => ({
    order,
    status: "completed",
    artifacts: [
      {
        artifact_id: `file_diff:${turnId}`,
        kind: "file_diff",
        snapshot: {
          files: [
            {
              path: `src/${turnId}.js`,
              operation: "edit",
              unified_diff: "@@ -1 +1 @@\n-a\n+b\n",
            },
          ],
        },
      },
    ],
  });

  test("renders an ArtifactSummary block per completed turn bucket", () => {
    renderWithConfig(
      <CharacterChatBubble
        message={{
          role: "assistant",
          status: "done",
          content: "done",
          artifactSummariesByTurnId: {
            "run-1:turn-1": fileBucket("turn-1", 1),
          },
        }}
      />,
    );
    expect(screen.getByTestId("artifact-summary")).toBeInTheDocument();
  });
});
