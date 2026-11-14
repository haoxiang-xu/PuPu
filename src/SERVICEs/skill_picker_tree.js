// A skill picker as a tree: the slash palette's own folders.
//
// Skills carry no folders or icon of their own. The slash palette already
// arranges them — the categories the person built in the skill organizer,
// plus one folder per installed pack — and draws each with the inventory
// skill icon. A picker that lists skills (the Skill Read node) shows that
// same arrangement, projected by the same `buildCommandTree`, so a skill sits
// in one place whichever list you find it in.
//
// The projection is keyed by command name (`/name`). The picker addresses its
// choices by its own values, so command nodes are re-keyed to those values;
// folder ids (`folder:…`) are left as they are. A name the projection has
// already used (the same skill name from two sources) is listed at the top
// level rather than dropped. Folders with no choice under them are left out.

import { buildCommandTree, getSkillFolderState } from "./skill_folder_storage";

/**
 * @param choices [{ value, label, command, pinned? }] — `command` is the
 *        slash-palette shape ({ name, sourceLabel, sourceToolkitId, … }).
 *        `pinned` choices (and any without a command) sit first at the top.
 * @param state   the skill folder tree; read from storage when absent.
 * @returns { data, root, values } — `values` is every choice value in
 *          all-folders-open order. Each choice node carries `option`.
 */
export function buildSkillPickerTree({ choices = [], state } = {}) {
  const valueByName = new Map();
  const pinned = [];
  const extra = [];
  const commands = [];
  const optionByValue = new Map();
  (Array.isArray(choices) ? choices : []).forEach((choice) => {
    if (!choice || typeof choice.value !== "string" || !choice.value) return;
    if (optionByValue.has(choice.value)) return;
    optionByValue.set(choice.value, choice);
    const name = choice.command && choice.command.name;
    if (choice.pinned || typeof name !== "string" || !name) pinned.push(choice.value);
    else if (valueByName.has(name)) extra.push(choice.value);
    else {
      valueByName.set(name, choice.value);
      commands.push(choice.command);
    }
  });

  const tree = buildCommandTree({ commands, state: state || getSkillFolderState() });
  const data = {};
  const node = (value, inOwnPackFolder = false) => {
    const option = optionByValue.get(value);
    data[value] = { id: value, label: option.label, type: "file", kind: "command", option };
    /* inside its own pack's folder: the folder already names the source */
    if (inOwnPackFolder) data[value].inOwnPackFolder = true;
    return value;
  };
  const remap = (ids) => {
    const out = [];
    (ids || []).forEach((id) => {
      const source = tree.data[id];
      if (!source) return;
      if (source.kind === "folder") {
        const children = remap(source.children);
        if (children.length === 0) return;
        data[id] = { ...source, children };
        out.push(id);
        return;
      }
      const value = valueByName.get(id);
      if (value !== undefined) out.push(node(value, !!source.inOwnPackFolder));
    });
    return out;
  };
  const root = [...pinned.map((v) => node(v)), ...remap(tree.root), ...extra.map((v) => node(v))];

  const values = [];
  const walk = (ids) => ids.forEach((id) => {
    const entry = data[id];
    if (!entry) return;
    if (entry.kind === "folder") walk(entry.children);
    else values.push(id);
  });
  walk(root);
  return { data, root, values };
}
