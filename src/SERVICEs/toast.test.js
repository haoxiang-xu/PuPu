import { toast } from "./toast";
import { subscribe, _resetForTest } from "./toast_bus";

describe("toast service", () => {
  beforeEach(() => _resetForTest());

  test("reportError emits a contextual top error toast", () => {
    const events = [];
    subscribe((event) => events.push(event));

    const id = toast.reportError(new Error("Disk full"), {
      title: "Save failed",
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "show",
      id,
      type: "error",
      variant: "error",
      title: "Save failed",
      message: "Save failed",
      description: "Disk full",
      position: "top",
      duration: Infinity,
      important: true,
      dedupeKey: "error:Save failed:Disk full",
    });
  });

  test("all variants default to the unified top pile", () => {
    const events = [];
    subscribe((event) => events.push(event));

    toast.success("saved");
    toast.info("heads up");
    toast.warning("careful");
    toast.message("plain");
    toast.loading("busy");

    expect(events.map((event) => event.position)).toEqual([
      "top",
      "top",
      "top",
      "top",
      "top",
    ]);
  });

  test("explicit position option still wins over the default", () => {
    const events = [];
    subscribe((event) => events.push(event));

    toast.success("saved", { position: "bottom-right" });

    expect(events[0].position).toBe("bottom-right");
  });

  test("promise settle keeps the toast in the top pile", async () => {
    const events = [];
    subscribe((event) => events.push(event));

    await toast.promise(Promise.resolve("ok"), {
      loading: "Working",
      success: "Done",
    });
    await Promise.resolve();

    const update = events.find((event) => event.kind === "update");
    expect(update).toBeTruthy();
    expect(update.position).toBe("top");
  });

  test("reportError can use the error message as the title", () => {
    const events = [];
    subscribe((event) => events.push(event));

    toast.reportError("Network unavailable");

    expect(events[0]).toMatchObject({
      type: "error",
      title: "Network unavailable",
      description: undefined,
      position: "top",
      duration: Infinity,
    });
  });
});
