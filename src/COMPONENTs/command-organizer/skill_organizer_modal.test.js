import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import SkillOrganizerModal from "./skill_organizer_modal";
import {
  registerCommand,
  _clearCommandsForTest,
} from "../../SERVICEs/command_registry";
import {
  getSkillFolderState,
  resetSkillFolderStorageForTests,
  setSkillFolderState,
} from "../../SERVICEs/skill_folder_storage";
import { ConfigContext, LocaleContext } from "../../CONTAINERs/config/context";

jest.mock("../../BUILTIN_COMPONENTs/icon/icon", () => () => (
  <span data-testid="icon" />
));

const renderModal = (props = {}) =>
  render(
    <LocaleContext.Provider value={{ locale: "en", setLocale: () => {} }}>
      <ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
        <SkillOrganizerModal open onClose={() => {}} {...props} />
      </ConfigContext.Provider>
    </LocaleContext.Provider>,
  );

const registerSkill = (name) =>
  registerCommand({
    name,
    description: `${name} does a thing`,
    availability: (ctx) => ctx.phase === "composer",
    source: "plugin:test",
  });

beforeEach(() => {
  window.localStorage.clear();
  resetSkillFolderStorageForTests();
  _clearCommandsForTest();
  registerSkill("/polish");
  registerSkill("/review");
});

afterEach(() => {
  _clearCommandsForTest();
  window.localStorage.clear();
});

describe("SkillOrganizerModal", () => {
  test("opens onto the real palette with every command unfiled", () => {
    renderModal();

    expect(screen.getByText("Organize Skills")).toBeInTheDocument();
    // each command appears twice: once in the unfiled column, once in the
    // preview's root — the tray and the result are two views of one set
    expect(screen.getAllByText("/polish")).toHaveLength(2);
    expect(screen.getByText(/2 commands · 0 categories · 2 unfiled/)).toBeInTheDocument();
  });

  test("streaming-only builtins are organizable even though the composer hides them", () => {
    registerCommand({
      name: "/btw",
      description: "interject",
      availability: (ctx) => ctx.phase === "streaming",
      source: "interject",
    });
    renderModal();

    expect(screen.getAllByText("/btw").length).toBeGreaterThan(0);
  });

  test("creating a category drops straight into naming it, and the name persists", () => {
    renderModal();

    fireEvent.click(screen.getByText("New category"));

    const input = screen.getByDisplayValue("New Category");
    fireEvent.change(input, { target: { value: "Daily writing" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByText("Daily writing")).toBeInTheDocument();
    const stored = Object.values(getSkillFolderState().folders);
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Daily writing");
  });

  test("an empty name leaves the category's previous name alone", () => {
    renderModal();
    fireEvent.click(screen.getByText("New category"));

    const input = screen.getByDisplayValue("New Category");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(Object.values(getSkillFolderState().folders)[0].name).toBe(
      "New Category",
    );
  });

  test("a stored arrangement renders as categories with their commands inside", () => {
    setSkillFolderState({
      folders: {
        f1: {
          id: "f1",
          name: "Writing",
          parentId: null,
          childFolderIds: [],
          expanded: true,
        },
      },
      commandFolder: { "/polish": "f1" },
      folderOrder: ["f1"],
      itemOrder: { __root__: ["folder:f1", "/review"], f1: ["/polish"] },
    });

    renderModal();

    expect(screen.getByText("Writing")).toBeInTheDocument();
    // /polish is filed now, so it leaves the unfiled tray and appears once
    expect(screen.getAllByText("/polish")).toHaveLength(1);
    expect(screen.getAllByText("/review")).toHaveLength(2);
    expect(screen.getByText(/2 commands · 1 categories · 1 unfiled/)).toBeInTheDocument();
  });

  test("deleting a category returns its commands to unfiled", () => {
    setSkillFolderState({
      folders: {
        f1: {
          id: "f1",
          name: "Writing",
          parentId: null,
          childFolderIds: [],
          expanded: true,
        },
      },
      commandFolder: { "/polish": "f1" },
      folderOrder: ["f1"],
      itemOrder: {},
    });
    renderModal();

    fireEvent.contextMenu(screen.getByText("Writing"));
    fireEvent.click(screen.getByText("Delete category"));

    expect(getSkillFolderState().folders.f1).toBeUndefined();
    expect(getSkillFolderState().commandFolder["/polish"]).toBeUndefined();
    expect(screen.queryByText("Writing")).not.toBeInTheDocument();
  });

  test("renaming through the context menu persists", () => {
    setSkillFolderState({
      folders: {
        f1: {
          id: "f1",
          name: "Writing",
          parentId: null,
          childFolderIds: [],
          expanded: true,
        },
      },
      commandFolder: {},
      folderOrder: ["f1"],
      itemOrder: {},
    });
    renderModal();

    fireEvent.contextMenu(screen.getByText("Writing"));
    fireEvent.click(screen.getByText("Rename"));

    const input = screen.getByDisplayValue("Writing");
    fireEvent.change(input, { target: { value: "Prose" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(getSkillFolderState().folders.f1.name).toBe("Prose");
  });

  test("closed renders nothing", () => {
    renderModal({ open: false });
    expect(screen.queryByText("Organize Skills")).not.toBeInTheDocument();
  });
});
