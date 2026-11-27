import { act, render, screen } from "@testing-library/react";
import { getAgentsSidebarSearch, setAgentsSidebarSearch, useAgentsSidebarSearch } from "./agents_sidebar_search";

afterEach(() => act(() => setAgentsSidebarSearch("")));

test("a write reaches every reader, and a same-value write is a no-op", () => {
  let renders = 0;
  function Reader() {
    const [query] = useAgentsSidebarSearch();
    renders += 1;
    return <span data-testid="q">{query}</span>;
  }
  render(<Reader />);
  act(() => setAgentsSidebarSearch("plan"));
  expect(screen.getByTestId("q").textContent).toBe("plan");
  const after = renders;
  act(() => setAgentsSidebarSearch("plan"));
  expect(renders).toBe(after);
  act(() => setAgentsSidebarSearch((prev) => `${prev}ner`));
  expect(getAgentsSidebarSearch()).toBe("planner");
});
