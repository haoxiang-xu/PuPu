import React from "react";
import { render, screen } from "@testing-library/react";
import { ConfigContext } from "../../../../../CONTAINERs/config/context";
import { WorkflowOutput } from "./test_result";

jest.mock("../../../../../BUILTIN_COMPONENTs/icon/icon", () => function TestIcon() { return null; });

test("every output row starts its value on one line, measured from the longest name", () => {
  render(<ConfigContext.Provider value={{ theme: {}, onThemeMode: "light_mode" }}>
    <WorkflowOutput isDark={false} output={{ chars: 11, language: "en", sentences: 1, top_terms: ["hello", "world"] }} />
  </ConfigContext.Provider>);
  const grids = ["chars", "language", "sentences", "top_terms"].map((name) => screen.getByTestId(`test-workflow-output-${name}`).firstChild);
  /* Each row is its own grid: an `auto` name column sized itself per row. */
  const template = grids[0].style.gridTemplateColumns;
  expect(template).toMatch(/^\d+px minmax\(0, 1fr\)$/);
  grids.forEach((grid) => {
    expect(grid.style.gridTemplateColumns).toBe(template);
    /* The name and the value share their first baseline. */
    [...grid.children].forEach((cell) => expect(cell.style.alignSelf).toBe("baseline"));
  });
});
