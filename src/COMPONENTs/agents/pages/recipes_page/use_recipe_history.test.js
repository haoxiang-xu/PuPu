import { renderHook, act } from "@testing-library/react";
import useRecipeHistory from "./use_recipe_history";

const r = (n) => ({ name: "x", nodes: [{ id: "n", v: n }], edges: [] });

describe("useRecipeHistory", () => {
  test("setRecipeSilent updates present without history", () => {
    const { result } = renderHook(() => useRecipeHistory("x"));
    act(() => result.current.setRecipeSilent(r(1)));
    expect(result.current.recipe).toEqual(r(1));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  test("setRecipe pushes previous present onto past, clears future", async () => {
    const { result } = renderHook(() => useRecipeHistory("x"));
    act(() => result.current.setRecipeSilent(r(1)));
    await act(async () => {
      result.current.setRecipe(r(2));
      await Promise.resolve();
    });
    expect(result.current.recipe).toEqual(r(2));
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  test("undo restores previous present, redo restores it again", async () => {
    const { result } = renderHook(() => useRecipeHistory("x"));
    act(() => result.current.setRecipeSilent(r(1)));
    await act(async () => {
      result.current.setRecipe(r(2));
      await Promise.resolve();
    });
    act(() => result.current.undo());
    expect(result.current.recipe).toEqual(r(1));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.redo());
    expect(result.current.recipe).toEqual(r(2));
  });

  test("two setRecipe calls in the same microtask produce one past entry", async () => {
    const { result } = renderHook(() => useRecipeHistory("x"));
    act(() => result.current.setRecipeSilent(r(1)));
    await act(async () => {
      result.current.setRecipe(r(2));
      result.current.setRecipe(r(3));
      await Promise.resolve();
    });
    expect(result.current.recipe).toEqual(r(3));
    act(() => result.current.undo());
    expect(result.current.recipe).toEqual(r(1));
    expect(result.current.canUndo).toBe(false);
  });

  test("past is capped at 50 entries", async () => {
    const { result } = renderHook(() => useRecipeHistory("x"));
    act(() => result.current.setRecipeSilent(r(0)));
    for (let i = 1; i <= 51; i += 1) {
      // each iteration is its own microtask boundary
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        result.current.setRecipe(r(i));
        await Promise.resolve();
      });
    }
    let undos = 0;
    while (result.current.canUndo) {
      // eslint-disable-next-line no-loop-func
      act(() => result.current.undo());
      undos += 1;
      if (undos > 60) throw new Error("runaway undo");
    }
    expect(undos).toBe(50);
    expect(result.current.recipe).toEqual(r(1));
  });

  test("changing activeName resets history and present", async () => {
    const { result, rerender } = renderHook(
      ({ name }) => useRecipeHistory(name),
      { initialProps: { name: "a" } },
    );
    act(() => result.current.setRecipeSilent(r(1)));
    await act(async () => {
      result.current.setRecipe(r(2));
      await Promise.resolve();
    });
    expect(result.current.canUndo).toBe(true);
    rerender({ name: "b" });
    expect(result.current.recipe).toBe(null);
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  test("setRecipe clears future stack", async () => {
    const { result } = renderHook(() => useRecipeHistory("x"));
    act(() => result.current.setRecipeSilent(r(1)));
    await act(async () => {
      result.current.setRecipe(r(2));
      await Promise.resolve();
    });
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);
    await act(async () => {
      result.current.setRecipe(r(3));
      await Promise.resolve();
    });
    expect(result.current.canRedo).toBe(false);
  });
});
