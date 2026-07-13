import {
  ERROR_SCENARIO_GROUPS,
  ALL_ERROR_SCENARIOS,
} from "./toast_error_scenarios";
import { subscribe, _resetForTest } from "../../../SERVICEs/toast_bus";

describe("toast error scenarios catalog", () => {
  beforeEach(() => _resetForTest());

  test("every scenario has key, group, name, source and a firing strategy", () => {
    expect(ALL_ERROR_SCENARIOS.length).toBeGreaterThanOrEqual(8);
    for (const scenario of ALL_ERROR_SCENARIOS) {
      expect(typeof scenario.key).toBe("string");
      expect(scenario.key).not.toBe("");
      expect(typeof scenario.name).toBe("string");
      expect(typeof scenario.group).toBe("string");
      expect(typeof scenario.source).toBe("string");
      expect(scenario.source).toMatch(/\.js/);
      const viaAsync = scenario.via === "useAsyncAction";
      if (viaAsync) {
        expect(typeof scenario.label).toBe("string");
        expect(typeof scenario.makeError).toBe("function");
      } else {
        expect(typeof scenario.fire).toBe("function");
      }
    }
  });

  test("scenario keys are unique", () => {
    const keys = ALL_ERROR_SCENARIOS.map((scenario) => scenario.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test("groups cover every scenario exactly once", () => {
    const grouped = ERROR_SCENARIO_GROUPS.flatMap((group) => group.scenarios);
    expect(grouped.length).toBe(ALL_ERROR_SCENARIOS.length);
  });

  test("direct scenarios emit a real error toast event on the bus", () => {
    const direct = ALL_ERROR_SCENARIOS.filter(
      (scenario) => scenario.via !== "useAsyncAction" && scenario.expectToast,
    );
    expect(direct.length).toBeGreaterThan(0);

    for (const scenario of direct) {
      const events = [];
      const unsubscribe = subscribe((event) => events.push(event));
      scenario.fire();
      unsubscribe();

      /* dedupe demos may emit twice on the bus — the host collapses them */
      expect(events.length).toBeGreaterThanOrEqual(1);
      for (const event of events) {
        expect(event).toMatchObject({
          kind: "show",
          variant: "error",
          position: "top",
          duration: Infinity,
        });
        expect(event.title).toBeTruthy();
      }
    }
  });

  test("attachment cleanup scenario reproduces the real call site verbatim", () => {
    const scenario = ALL_ERROR_SCENARIOS.find(
      (item) => item.key === "attachment_cleanup_failed",
    );
    expect(scenario).toBeTruthy();

    const events = [];
    const unsubscribe = subscribe((event) => events.push(event));
    scenario.fire();
    unsubscribe();

    expect(events[0]).toMatchObject({
      title: "Attachment storage cleanup failed",
      dedupeKey: "attachment_delete_failed",
    });
  });

  test("useAsyncAction scenarios build errors with real FrontendApiError codes", () => {
    const viaAsync = ALL_ERROR_SCENARIOS.filter(
      (scenario) => scenario.via === "useAsyncAction",
    );
    expect(viaAsync.length).toBeGreaterThan(0);

    for (const scenario of viaAsync) {
      const err = scenario.makeError();
      expect(err).toBeInstanceOf(Error);
      if (scenario.key !== "abort_silent") {
        expect(err.name).toBe("FrontendApiError");
        expect(typeof err.code).toBe("string");
      }
    }
  });

  test("abort scenario produces an AbortError that the real hook must swallow", () => {
    const scenario = ALL_ERROR_SCENARIOS.find(
      (item) => item.key === "abort_silent",
    );
    expect(scenario).toBeTruthy();
    expect(scenario.expectToast).toBe(false);
    expect(scenario.makeError().name).toBe("AbortError");
  });
});
