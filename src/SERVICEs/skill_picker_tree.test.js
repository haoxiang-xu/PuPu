import { buildSkillPickerTree } from "./skill_picker_tree";

const choice = (value, name, extra = {}) => ({
  value,
  label: `${name} · src`,
  command: { name: `/${name}`, sourceLabel: "", sourceToolkitId: "", ...extra },
});

describe("buildSkillPickerTree", () => {
  test("files skills where the slash palette files them, keyed by the picker's values", () => {
    const state = {
      folders: { notes: { id: "notes", name: "Notes", parentId: null, childFolderIds: [] },
        empty: { id: "empty", name: "Empty", parentId: null, childFolderIds: [] } },
      folderOrder: ["notes", "empty"],
      commandFolder: { "/write": "notes" },
      itemOrder: {},
    };
    const { data, root, values } = buildSkillPickerTree({
      choices: [
        { value: "stored", label: "Stored one", pinned: true },
        choice("0", "write"),
        choice("1", "read"),
        choice("2", "pdf", { sourceLabel: "doc-pack", sourceToolkitId: "doc-pack" }),
      ],
      state,
    });
    expect(root[0]).toBe("stored");
    expect(data["folder:notes"].children).toEqual(["0"]);
    expect(data["folder:empty"]).toBeUndefined();
    const pack = root.find((id) => data[id]?.kind === "folder" && data[id].label === "doc-pack");
    expect(data[pack].children).toEqual(["2"]);
    expect(data["2"].inOwnPackFolder).toBe(true);
    expect(values.sort()).toEqual(["0", "1", "2", "stored"]);
    expect(data["1"].option.value).toBe("1");
  });

  test("the same skill name from two sources: both listed", () => {
    const { values } = buildSkillPickerTree({
      choices: [choice("0", "dup"), choice("1", "dup")],
      state: { folders: {}, folderOrder: [], commandFolder: {}, itemOrder: {} },
    });
    expect(values).toEqual(["0", "1"]);
  });
});
