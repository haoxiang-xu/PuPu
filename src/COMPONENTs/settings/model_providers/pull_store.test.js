import { pull_store } from "./pull_store";

describe("pull_store", () => {
  beforeEach(() => {
    pull_store.map = {};
    pull_store.refs = {};
    pull_store.listeners = new Set();
  });

  test("set and delete notify subscribers", () => {
    const listener = jest.fn();
    const unsubscribe = pull_store.subscribe(listener);

    pull_store.set("model:a", { status: "pulling" });
    expect(listener).toHaveBeenCalledWith({
      "model:a": { status: "pulling" },
    });

    pull_store.delete("model:a");
    expect(listener).toHaveBeenLastCalledWith({});

    unsubscribe();
    pull_store.set("model:b", { status: "done" });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
