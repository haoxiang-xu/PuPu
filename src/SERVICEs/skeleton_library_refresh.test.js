/* The "re-read the saved Skeleton library" announcement (#356, R-SEL-02).
 *
 * It is a notifier and nothing else: no listing, no caching, no opinion about
 * what a subscriber should do. The two things it has to guarantee are that an
 * unsubscribed listener stops hearing, and that one bad listener cannot take
 * down the writer that announced — a save must not fail because the chat page
 * threw while reacting to it.
 */
import {
  emitSkeletonLibraryRefresh,
  subscribeSkeletonLibraryRefresh,
} from "./skeleton_library_refresh";

describe("the saved-library refresh announcement", () => {
  test("a subscriber hears the payload, and stops when it unsubscribes", () => {
    const heard = [];
    const unsubscribe = subscribeSkeletonLibraryRefresh((payload) =>
      heard.push(payload),
    );
    emitSkeletonLibraryRefresh({ reason: "resource_saved", resource_id: "a" });
    unsubscribe();
    emitSkeletonLibraryRefresh({ reason: "agent_selector_opened" });
    expect(heard).toEqual([{ reason: "resource_saved", resource_id: "a" }]);
  });

  test("a listener that throws does not stop the others or the emitter", () => {
    const heard = [];
    const offBad = subscribeSkeletonLibraryRefresh(() => {
      throw new Error("a subscriber blew up");
    });
    const offGood = subscribeSkeletonLibraryRefresh(() => heard.push("heard"));
    expect(() => emitSkeletonLibraryRefresh({ reason: "x" })).not.toThrow();
    expect(heard).toEqual(["heard"]);
    offBad();
    offGood();
  });

  test("emitting with nobody listening, and subscribing nothing, are both fine", () => {
    expect(() => emitSkeletonLibraryRefresh()).not.toThrow();
    const unsubscribe = subscribeSkeletonLibraryRefresh(null);
    expect(typeof unsubscribe).toBe("function");
    expect(() => unsubscribe()).not.toThrow();
  });

  test("the same listener subscribed twice is still one listener", () => {
    /* A Set, not a list: a component that re-subscribes without unsubscribing
       must not make every save read the store twice. */
    let calls = 0;
    const listener = () => {
      calls += 1;
    };
    const first = subscribeSkeletonLibraryRefresh(listener);
    const second = subscribeSkeletonLibraryRefresh(listener);
    emitSkeletonLibraryRefresh({ reason: "once" });
    expect(calls).toBe(1);
    first();
    second();
  });
});
