import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import SkeletonSaveBar from "./skeleton_save_bar";
import {
  edited,
  empty_session,
  loaded,
  load_failed,
  loading,
  preflight_refused,
  save_refused,
  save_started,
} from "./skeleton_resource_session";
import {
  EDIT_CONFLICT_ERROR,
  PREFLIGHT_REFUSED_ERROR,
} from "./skeleton_resource_capture";

jest.mock("../../../../BUILTIN_COMPONENTs/input/button", () => {
  return function MockButton({ label, onClick, disabled }) {
    return (
      <button type="button" disabled={disabled} onClick={onClick}>
        {label}
      </button>
    );
  };
});

const doc = (tag) => ({ schema_version: 1, kind: "workflow", id: "l", name: "l", nodes: [], edges: [], description: tag });
const ready = (token = "t1") =>
  loaded(loading(empty_session(), "l"), { id: "l", document: doc("a"), edit_token: token, diagnostics: [] });

const show = (session, handlers = {}) =>
  render(<SkeletonSaveBar session={session} isDark={false} {...handlers} />);

describe("what the bar offers", () => {
  test("nothing before a resource is open", () => {
    const { container } = show(empty_session());
    expect(container).toBeEmptyDOMElement();
  });

  test("a build with no store says so instead of showing dead buttons", () => {
    show(load_failed(empty_session(), { reason: "unavailable", error: { code: "bridge_unavailable" } }));
    expect(screen.getByTestId("skeleton-store-unavailable").textContent).toMatch(/not reachable/i);
    expect(screen.queryByText("Save")).toBeNull();
  });

  test("Save is offered only for unsaved work", () => {
    show(ready());
    expect(screen.getByText("Save").closest("button")).toBeDisabled();
    expect(screen.getByTestId("skeleton-save-state").textContent).toMatch(/^Saved$/);
  });

  test("an edit enables Save and says so", () => {
    show(edited(ready(), doc("b")));
    expect(screen.getByText("Save").closest("button")).not.toBeDisabled();
    expect(screen.getByTestId("skeleton-save-state").textContent).toMatch(/unsaved/i);
  });

  test("while saving, Save cannot be pressed again", () => {
    show(save_started(edited(ready(), doc("b"))));
    expect(screen.getByText("Saving…").closest("button")).toBeDisabled();
  });

  test("the run check waits for the draft to be saved, and says why", () => {
    /* It asks the store about the stored version, which an unsaved edit is
     * not. */
    show(edited(ready(), doc("b")));
    expect(screen.getByText("Check it can run").closest("button")).toBeDisabled();
    expect(screen.getByText(/asks the saved version, so save first/i)).toBeInTheDocument();
  });
});

describe("someone else saved first", () => {
  const conflicted = save_refused(edited(ready(), doc("mine")), {
    reason: "refused",
    error: EDIT_CONFLICT_ERROR,
  });

  test("it is explained as nothing being overwritten", () => {
    show(conflicted);
    expect(screen.getByTestId("skeleton-save-conflict").textContent).toMatch(
      /nothing has been overwritten/i,
    );
  });

  test("there is no retry — only two named choices", () => {
    /* Retrying at the same token fails identically; retrying at the newer one
     * replaces their work silently. Neither is a retry. */
    show(conflicted);
    const bar = screen.getByTestId("skeleton-save-bar");
    expect(bar.textContent).not.toMatch(/retry|try again/i);
    expect(screen.getByText("Look at theirs")).toBeInTheDocument();
    expect(screen.getByText("Keep mine and replace it")).toBeInTheDocument();
  });

  test("the choice that replaces their work says that it does", () => {
    show(conflicted);
    expect(screen.getByText(/keep mine and replace it/i)).toBeInTheDocument();
  });

  test("each choice calls its own handler", () => {
    const onKeepMine = jest.fn();
    const onTakeTheirs = jest.fn();
    show(conflicted, { onKeepMine, onTakeTheirs });
    fireEvent.click(screen.getByText("Look at theirs"));
    fireEvent.click(screen.getByText("Keep mine and replace it"));
    expect(onTakeTheirs).toHaveBeenCalledTimes(1);
    expect(onKeepMine).toHaveBeenCalledTimes(1);
  });

  test("Save is withheld until the conflict is resolved", () => {
    show(conflicted);
    expect(screen.getByText("Save").closest("button")).toBeDisabled();
  });
});

describe("the run check reports what the store said", () => {
  test("a refusal names the problem without calling it the only one", () => {
    show(preflight_refused(ready(), { reason: "refused", error: PREFLIGHT_REFUSED_ERROR }));
    const state = screen.getByTestId("skeleton-preflight-state").textContent;
    expect(state).toMatch(/not ready to run/i);
    expect(state).toMatch(/one end node/i);
  });

  test("an ordinary save error is shown as an error", () => {
    show(save_refused(edited(ready(), doc("b")), {
      reason: "refused",
      error: { code: "invalid_type", message: "document must be an object" },
    }));
    expect(screen.getByTestId("skeleton-save-error").textContent).toMatch(/must be an object/i);
  });
});
