import {
  getDefaultToolkitSelection,
  setDefaultToolkitEnabled,
} from "./default_toolkit_store";

describe("default_toolkit_store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("migrates legacy interaction toolkit ids to ask_user_toolkit", () => {
    window.localStorage.setItem(
      "default_toolkits",
      JSON.stringify({
        version: 1,
        scopes: {
          global: ["interaction_toolkit", "ask_user_toolkit"],
        },
      }),
    );

    expect(getDefaultToolkitSelection("global")).toEqual(["ask_user_toolkit"]);
  });

  test("stores ask_user_toolkit when enabling a legacy interaction toolkit id", () => {
    setDefaultToolkitEnabled("global", "interaction_toolkit", true);

    expect(getDefaultToolkitSelection("global")).toEqual(["ask_user_toolkit"]);
  });

  test("removes ask_user_toolkit when disabling a legacy interaction toolkit id", () => {
    setDefaultToolkitEnabled("global", "ask_user_toolkit", true);
    setDefaultToolkitEnabled("global", "interaction_toolkit", false);

    expect(getDefaultToolkitSelection("global")).toEqual([]);
  });
});
