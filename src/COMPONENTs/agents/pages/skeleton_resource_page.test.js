import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ConfigContext } from "../../../CONTAINERs/config/context";
import SkeletonResourcePage from "./skeleton_resource_page";
import { api } from "../../../SERVICEs/api";
import {
  EDIT_CONFLICT_ERROR,
  PREFLIGHT_REFUSED_ERROR,
  RESOURCE_RESULT_KEYS,
} from "./recipes_page/skeleton_resource_capture";

jest.mock("../../../SERVICEs/api", () => ({ api: { unchain: {} } }));

const cfg = { theme: {}, onThemeMode: "light_mode" };

const result = (overrides) => {
  const base = {};
  RESOURCE_RESULT_KEYS.forEach((key) => {
    base[key] = key === "diagnostics" ? [] : null;
  });
  return { ...base, id: "life", kind: "workflow", name: "life", ...overrides };
};

const flow = (id, a, b) => ({
  id, kind: "flow", source_node_id: a, source_port_id: "out",
  target_node_id: b, target_port_id: "in",
});

const doc = (bindingName = "payload") => ({
  schema_version: 1,
  kind: "workflow",
  id: "life",
  name: "life",
  nodes: [
    { id: "start", type: "start", config: { execution: {
      outputs: [{ name: "text", source: { kind: "result", path: ["text"] } }] } } },
    { id: "end", type: "end", config: { execution: {
      inputs: [{ name: bindingName,
                 value: { kind: "ref", node_id: "start", path: ["text"] },
                 missing: "error" }],
      outputs: [] } } },
  ],
  edges: [flow("e1", "start", "end")],
});

const show = () =>
  render(
    <ConfigContext.Provider value={cfg}>
      <SkeletonResourcePage resourceId="life" />
    </ConfigContext.Provider>,
  );

beforeEach(() => {
  Object.keys(api.unchain).forEach((key) => delete api.unchain[key]);
});

describe("opening a resource through the real facade", () => {
  test("it asks the store by the method the bridge exposes", async () => {
    api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(result({ document: doc(), edit_token: "t1" }));
    show();
    await waitFor(() => expect(screen.getByTestId("skeleton-node-list")).toBeInTheDocument());
    expect(api.unchain.getSkeletonResource).toHaveBeenCalledWith("life");
  });

  test("its nodes are listed, and one opens the detail panel", async () => {
    api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(result({ document: doc(), edit_token: "t1" }));
    show();
    await waitFor(() => expect(screen.getByTestId("skeleton-node-end")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("skeleton-node-end"));
    expect(screen.getByText("Input Variables")).toBeInTheDocument();
  });

  test("a store that cannot be reached says so instead of looking empty", async () => {
    show();
    await waitFor(() =>
      expect(screen.getByTestId("skeleton-store-unavailable")).toBeInTheDocument(),
    );
  });

  test("a refused open is reported", async () => {
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValue({ error: { code: "not_found", message: "no such resource" } });
    show();
    await waitFor(() =>
      expect(screen.getByTestId("skeleton-load-failed").textContent).toMatch(/no such resource/i),
    );
  });
});

describe("edit and save at the token it was opened at", () => {
  const open = async () => {
    api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(result({ document: doc(), edit_token: "t1" }));
    api.unchain.saveSkeletonResource = jest
      .fn()
      .mockResolvedValue(result({ document: doc("renamed"), edit_token: "t2" }));
    show();
    await waitFor(() => expect(screen.getByTestId("skeleton-node-end")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("skeleton-node-end"));
  };

  test("adding an input marks it unsaved and enables Save", async () => {
    await open();
    expect(screen.getByTestId("skeleton-save-state").textContent).toMatch(/^Saved$/);
    fireEvent.click(screen.getByText("+ Add input"));
    expect(screen.getByTestId("skeleton-save-state").textContent).toMatch(/unsaved/i);
  });

  test("Save sends the edited document at the token it was opened at", async () => {
    await open();
    fireEvent.click(screen.getByText("+ Add input"));
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    const payload = api.unchain.saveSkeletonResource.mock.calls[0][0];
    expect(payload.expected_edit_token).toBe("t1");
    /* And the edit really reached the document that was sent. */
    const end = payload.document.nodes.find((n) => n.id === "end");
    expect(end.config.execution.inputs).toHaveLength(2);
    await waitFor(() =>
      expect(screen.getByTestId("skeleton-save-state").textContent).toMatch(/^Saved$/),
    );
  });
});

describe("another editor got there first", () => {
  test("the conflict is offered as two named choices, and nothing retries", async () => {
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValueOnce(result({ document: doc(), edit_token: "t1" }))
      .mockResolvedValue(result({ document: doc("theirs"), edit_token: "t9" }));
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({ error: EDIT_CONFLICT_ERROR });

    show();
    await waitFor(() => expect(screen.getByTestId("skeleton-node-end")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("skeleton-node-end"));
    fireEvent.click(screen.getByText("+ Add input"));
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });

    expect(screen.getByTestId("skeleton-save-conflict")).toBeInTheDocument();
    expect(api.unchain.saveSkeletonResource).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByText("Look at theirs"));
    });
    await waitFor(() =>
      expect(screen.queryByTestId("skeleton-save-conflict")).not.toBeInTheDocument(),
    );
  });
});

describe("the run check, in the page", () => {
  test("an edit after the check was asked for discards the answer", async () => {
    /* The interleaving, through the real page rather than the reducer: the
     * answer describes the saved version, and by the time it lands the author
     * is looking at something else. */
    let release;
    api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(result({ document: doc(), edit_token: "t1" }));
    api.unchain.preflightSkeletonResource = jest
      .fn()
      .mockImplementation(() => new Promise((resolve) => {
        release = () => resolve({ ok: true, definition_digest: "sha256:A" });
      }));

    show();
    await waitFor(() => expect(screen.getByTestId("skeleton-node-end")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("skeleton-node-end"));

    act(() => {
      fireEvent.click(screen.getByText("Check it can run").closest("button"));
    });
    fireEvent.click(screen.getByText("+ Add input"));

    await act(async () => {
      release();
      await Promise.resolve();
    });

    expect(screen.queryByTestId("skeleton-preflight-state")).toBeNull();
    expect(screen.getByTestId("skeleton-save-state").textContent).toMatch(/unsaved/i);
  });

  test("an answer with nothing changed is shown", async () => {
    api.unchain.getSkeletonResource = jest.fn().mockResolvedValue(result({ document: doc(), edit_token: "t1" }));
    api.unchain.preflightSkeletonResource = jest
      .fn()
      .mockResolvedValue({ error: PREFLIGHT_REFUSED_ERROR });
    show();
    await waitFor(() => expect(screen.getByTestId("skeleton-node-end")).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByText("Check it can run").closest("button"));
    });
    expect(screen.getByTestId("skeleton-preflight-state").textContent).toMatch(/not ready to run/i);
  });
});
