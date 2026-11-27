import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";

import Tooltip from "./tooltip";

/* A Run button that becomes Stop once it is pressed. Keyed, the focused
   element is unmounted and focus goes to the body without a blur event. */
function RunStop({ focusVisibleOnly = false }) {
  const [running, setRunning] = useState(false);
  return (
    <Tooltip trigger={["focus"]} focus_visible_only={focusVisibleOnly} open_delay={0} close_delay={0}
      tooltip_component={<span data-testid="hint">{running ? "Stop" : "Run"}</span>}>
      {running
        ? <button key="stop" type="button" onClick={() => setRunning(false)}>Stop</button>
        : <button key="run" type="button" onClick={() => setRunning(true)}>Run</button>}
    </Tooltip>
  );
}

test("a hint opened by focus closes when its focused control is swapped out", () => {
  render(<RunStop />);
  const run = screen.getByRole("button", { name: "Run" });
  act(() => { run.focus(); });
  expect(screen.getByTestId("hint")).toHaveTextContent("Run");
  fireEvent.click(run);
  expect(document.activeElement).toBe(document.body);
  expect(screen.queryByTestId("hint")).toBeNull();
});

test("focus_visible_only leaves a pointer-focused button to the hover", () => {
  render(<RunStop focusVisibleOnly />);
  const run = screen.getByRole("button", { name: "Run" });
  const matches = jest.spyOn(run, "matches").mockImplementation((selector) => selector !== ":focus-visible");
  act(() => { run.focus(); });
  expect(screen.queryByTestId("hint")).toBeNull();
  matches.mockRestore();
});

test("focus_visible_only still opens for keyboard focus", () => {
  render(<RunStop focusVisibleOnly />);
  const run = screen.getByRole("button", { name: "Run" });
  jest.spyOn(run, "matches").mockImplementation((selector) => selector === ":focus-visible");
  act(() => { run.focus(); });
  expect(screen.getByTestId("hint")).toHaveTextContent("Run");
});
