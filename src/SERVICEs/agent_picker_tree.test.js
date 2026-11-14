import { buildAgentPickerTree } from "./agent_picker_tree";

const placement = {
  folders: {
    work: { id: "work", name: "Work", parentId: null, childFolderIds: ["deep"] },
    deep: { id: "deep", name: "Deep", parentId: "work", childFolderIds: [] },
    flows: { id: "flows", name: "Only workflows", parentId: null, childFolderIds: [] },
  },
  folderOrder: ["flows", "work"],
  resourceFolder: { b: "work", c: "deep", w: "flows", gone: "nope" },
  resourceOrder: { __root__: ["folder:work", "a"], work: ["b", "folder:deep"] },
};

const choices = [
  { value: "__default__", label: "Default", pinned: true },
  { value: "skeleton:a", label: "A", resourceId: "a" },
  { value: "skeleton:b", label: "B", resourceId: "b" },
  { value: "skeleton:c", label: "C", resourceId: "c" },
  { value: "skeleton:gone", label: "Gone folder", resourceId: "gone" },
  { value: "legacy:Old", label: "Old" },
];

describe("buildAgentPickerTree", () => {
  test("arranges Agents in the Agents page's folders and order", () => {
    const { data, root, values } = buildAgentPickerTree({ choices, placement });
    expect(root).toEqual(["__default__", "folder:work", "skeleton:a", "skeleton:gone", "legacy:Old"]);
    expect(data["folder:work"].children).toEqual(["skeleton:b", "folder:deep"]);
    expect(data["folder:deep"].children).toEqual(["skeleton:c"]);
    expect(values).toEqual([
      "__default__", "skeleton:b", "skeleton:c", "skeleton:a", "skeleton:gone", "legacy:Old",
    ]);
    expect(data["skeleton:b"]).toMatchObject({ kind: "agent", option: choices[2] });
  });

  test("a folder with nothing pickable in it is not drawn", () => {
    const { data } = buildAgentPickerTree({ choices, placement });
    expect(data["folder:flows"]).toBeUndefined();
  });

  test("with no folders it is the flat list, default first", () => {
    const { root, data } = buildAgentPickerTree({
      choices,
      placement: { folders: {}, folderOrder: [], resourceFolder: {}, resourceOrder: {} },
    });
    expect(root).toEqual(choices.map((c) => c.value));
    expect(Object.values(data).every((n) => n.kind === "agent")).toBe(true);
  });
});
