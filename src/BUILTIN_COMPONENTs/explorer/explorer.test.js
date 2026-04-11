import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import Explorer from "./explorer";
import { ConfigContext } from "../../CONTAINERs/config/context";

jest.mock("../icon/icon", () => () => <span data-testid="icon" />);
jest.mock("../spinner/arc_spinner", () => () => <span data-testid="spinner" />);
jest.mock("../class/animated_children", () => ({ children }) => children);

const renderExplorer = (props = {}) =>
  render(
    <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
      <Explorer
        draggable
        style={{ width: 240 }}
        data={{
          character_chat: {
            label: "Nico",
            chatKind: "character",
            characterName: "Nico",
            characterAvatar: {
              url: "http://127.0.0.1:5879/characters/nico/avatar",
            },
          },
        }}
        root={["character_chat"]}
        {...props}
      />
    </ConfigContext.Provider>,
  );

describe("Explorer", () => {
  test("shows character avatars in the drag ghost for character chats", async () => {
    renderExplorer();

    fireEvent.mouseDown(screen.getByText("Nico"), {
      button: 0,
      clientX: 32,
      clientY: 20,
    });
    fireEvent.mouseMove(document, {
      clientX: 48,
      clientY: 36,
    });

    expect(await screen.findByAltText("Nico avatar")).toBeInTheDocument();

    fireEvent.mouseUp(document);
  });

  test("does not start dragging from inputs inside custom rows", () => {
    renderExplorer({
      data: {
        renaming_chat: {
          label: "Rename ghost",
          component: () => (
            <div data-explorer-drag-disabled="true">
              <input aria-label="Rename value" defaultValue="Nico" />
            </div>
          ),
        },
      },
      root: ["renaming_chat"],
    });

    const input = screen.getByLabelText("Rename value");
    fireEvent.mouseDown(input, {
      button: 0,
      clientX: 32,
      clientY: 20,
    });
    fireEvent.mouseMove(document, {
      clientX: 72,
      clientY: 20,
    });

    expect(screen.queryByText("Rename ghost")).not.toBeInTheDocument();
    expect(document.body.style.userSelect).toBe("");
  });
});
