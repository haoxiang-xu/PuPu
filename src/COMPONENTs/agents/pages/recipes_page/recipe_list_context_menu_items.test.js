import { buildRecipeListContextMenuItems } from "./recipe_list_context_menu_items";

describe("buildRecipeListContextMenuItems", () => {
  test("uses the generic add icon for new agents", () => {
    expect(buildRecipeListContextMenuItems({ node: null })[0]).toMatchObject({
      icon: "add",
      label: "New Agent",
    });

    expect(
      buildRecipeListContextMenuItems({
        node: { id: "folder:f_team", kind: "folder", name: "Team" },
      })[0],
    ).toMatchObject({
      icon: "add",
      label: "New Agent",
    });
  });
});
