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

/* a skill the way plugin_skill_sync registers one: it names its plugin, so
   the projection derives a folder for it */
const registerSkill = (name, toolkit = "acme", label = "Acme Tools") =>
  registerCommand({
    name,
    description: `${name} does a thing`,
    availability: (ctx) => ctx.phase === "composer",
    source: `plugin:${toolkit}`,
    sourceLabel: label,
    sourceToolkitId: toolkit,
  });

const userFolder = (id, name) => ({
  id,
  name,
  parentId: null,
  childFolderIds: [],
  expanded: true,
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

describe("SkillOrganizerModal — one tree, one small window", () => {
  test("is a title, a caption with the count, and the tree — nothing else", () => {
    renderModal();

    expect(screen.getByText("Organize skills")).toBeInTheDocument();
    expect(screen.getByText("Palette · 2 commands")).toBeInTheDocument();
    // each command appears exactly once: there is no second column
    expect(screen.getAllByText("/polish")).toHaveLength(1);
    expect(screen.getAllByText("/review")).toHaveLength(1);
    // and no footer / done button
    expect(screen.queryByText("Done")).toBeNull();
  });

  test("a plugin's folder is marked as the plugin's and has no menu", () => {
    renderModal();

    const folder = screen.getByText("Acme Tools");
    expect(folder).toBeInTheDocument();
    expect(screen.getAllByText("Plugin").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Category options")).toBeNull();

    // right-click on it offers nothing either
    fireEvent.contextMenu(folder);
    expect(screen.queryByText("Rename")).toBeNull();
    expect(screen.queryByText("Delete category")).toBeNull();
  });

  test("the user's category carries the ⋯ menu with rename and delete", () => {
    setSkillFolderState({
      folders: { f1: userFolder("f1", "Writing") },
      commandFolder: { "/polish": "f1" },
      folderOrder: ["f1"],
      itemOrder: {},
    });
    renderModal();

    const menuButton = screen.getByLabelText("Category options");
    fireEvent.click(menuButton);

    expect(screen.getByText("Rename")).toBeInTheDocument();
    expect(screen.getByText("Delete category")).toBeInTheDocument();
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

  test("renaming through the menu persists", () => {
    setSkillFolderState({
      folders: { f1: userFolder("f1", "Writing") },
      commandFolder: {},
      folderOrder: ["f1"],
      itemOrder: {},
    });
    renderModal();

    fireEvent.click(screen.getByLabelText("Category options"));
    fireEvent.click(screen.getByText("Rename"));

    const input = screen.getByDisplayValue("Writing");
    fireEvent.change(input, { target: { value: "Prose" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(getSkillFolderState().folders.f1.name).toBe("Prose");
  });

  test("deleting a category returns its commands to the plugin's folder", () => {
    setSkillFolderState({
      folders: { f1: userFolder("f1", "Writing") },
      commandFolder: { "/polish": "f1" },
      folderOrder: ["f1"],
      itemOrder: {},
    });
    renderModal();

    fireEvent.click(screen.getByLabelText("Category options"));
    fireEvent.click(screen.getByText("Delete category"));

    expect(getSkillFolderState().folders.f1).toBeUndefined();
    expect(getSkillFolderState().commandFolder["/polish"]).toBeUndefined();
    expect(screen.queryByText("Writing")).not.toBeInTheDocument();
    // back under Acme Tools, not loose
    expect(screen.getByText("/polish")).toBeInTheDocument();
  });

  test("right-click still opens the same menu on a user category", () => {
    setSkillFolderState({
      folders: { f1: userFolder("f1", "Writing") },
      commandFolder: {},
      folderOrder: ["f1"],
      itemOrder: {},
    });
    renderModal();

    fireEvent.contextMenu(screen.getByText("Writing"));
    expect(screen.getByText("Rename")).toBeInTheDocument();
  });

  test("streaming-only builtins are organizable even though the composer hides them", () => {
    registerCommand({
      name: "/btw",
      description: "interject",
      availability: (ctx) => ctx.phase === "streaming",
      source: "interject",
    });
    renderModal();

    expect(screen.getByText("/btw")).toBeInTheDocument();
    expect(screen.getByText("Palette · 3 commands")).toBeInTheDocument();
  });

  test("with nothing registered it says so instead of showing an empty tree", () => {
    _clearCommandsForTest();
    renderModal();

    expect(
      screen.getByText(/No commands yet/),
    ).toBeInTheDocument();
  });

  test("closed renders nothing", () => {
    renderModal({ open: false });
    expect(screen.queryByText("Organize skills")).not.toBeInTheDocument();
  });

  test("the close control is there and calls back", () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
