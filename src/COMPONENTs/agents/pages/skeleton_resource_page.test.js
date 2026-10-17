import React from "react";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
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

describe("typing after choosing to take theirs, in the page", () => {
  test("the rows added after the choice are still there, and still unsaved", async () => {
    /* Two rows, unsaved → the reply lands → it used to be zero rows, "Saved". */
    let release;
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValueOnce(result({ document: doc(), edit_token: "t1" }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        release = () => resolve(result({
          document: { ...doc(), nodes: [doc().nodes[0], {
            id: "end", type: "end",
            config: { execution: { inputs: [], outputs: [] } },
          }] },
          edit_token: "t9",
        }));
      }));
    api.unchain.saveSkeletonResource = jest
      .fn()
      .mockResolvedValue({ error: EDIT_CONFLICT_ERROR });

    show();
    await waitFor(() => expect(screen.getByTestId("skeleton-node-end")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("skeleton-node-end"));
    /* One row to start with, then a second, then save into a conflict. */
    fireEvent.click(screen.getByText("+ Add input"));
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    expect(screen.getByTestId("skeleton-save-conflict")).toBeInTheDocument();

    act(() => {
      fireEvent.click(screen.getByText("Look at theirs"));
    });
    /* Keeps adding while the re-read is in flight. */
    fireEvent.click(screen.getByText("+ Add input"));
    const rowsBefore = screen.getAllByTestId(/^binding-row-\d+$/).length;

    await act(async () => {
      release();
      await Promise.resolve();
    });

    expect(screen.getAllByTestId(/^binding-row-\d+$/)).toHaveLength(rowsBefore);
    expect(screen.getByTestId("skeleton-save-state").textContent).toMatch(/unsaved/i);
  });

  test("it says why nothing was replaced, instead of looking like a dead button", async () => {
    let release;
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValueOnce(result({ document: doc(), edit_token: "t1" }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        release = () => resolve(result({ document: doc("theirs"), edit_token: "t9" }));
      }));
    api.unchain.saveSkeletonResource = jest.fn().mockResolvedValue({ error: EDIT_CONFLICT_ERROR });

    show();
    await waitFor(() => expect(screen.getByTestId("skeleton-node-end")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("skeleton-node-end"));
    fireEvent.click(screen.getByText("+ Add input"));
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    act(() => {
      fireEvent.click(screen.getByText("Look at theirs"));
    });
    fireEvent.click(screen.getByText("+ Add input"));
    await act(async () => {
      release();
      await Promise.resolve();
    });

    expect(screen.getByTestId("skeleton-save-conflict").textContent).toMatch(
      /changed this draft after choosing/i,
    );
    expect(screen.getByText("Look at theirs")).toBeInTheDocument();
  });
});

describe("editing an output on the real page", () => {
  const open_end = async () => {
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValue(result({ document: doc(), edit_token: "t1" }));
    api.unchain.saveSkeletonResource = jest
      .fn()
      .mockImplementation(async ({ document }) =>
        result({ document, edit_token: "t2" }),
      );
    show();
    await waitFor(() =>
      expect(screen.getByTestId("skeleton-node-end")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("skeleton-node-end"));
  };

  test("the End has an outputs section and it starts empty", async () => {
    await open_end();
    expect(screen.getByTestId("skeleton-output-variables")).toBeInTheDocument();
    expect(screen.queryByTestId("output-row-0")).not.toBeInTheDocument();
  });

  test("adding one marks the draft unsaved", async () => {
    await open_end();
    fireEvent.click(screen.getByText("+ Add output"));
    expect(screen.getByTestId("output-row-0")).toBeInTheDocument();
    expect(screen.getByTestId("skeleton-save-state").textContent).toMatch(/unsaved/i);
  });

  test("it is seeded on the only side an End has, pointing at a real input", async () => {
    /* The document's End declares one input, `payload`, and an End can only
       export what it was given. */
    await open_end();
    fireEvent.click(screen.getByText("+ Add output"));
    /* Scoped to the row: an input row's name box carries the same placeholder,
       and both are on screen at once. */
    fireEvent.change(
      within(screen.getByTestId("output-row-0")).getByPlaceholderText("name"),
      { target: { value: "answer" } },
    );
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    const sent = api.unchain.saveSkeletonResource.mock.calls[0][0].document;
    expect(sent.nodes[1].config.execution.outputs).toEqual([
      { name: "answer", source: { kind: "input", path: ["payload"] } },
    ]);
  });

  test("the saved document keeps the closed envelope and node shapes", async () => {
    await open_end();
    fireEvent.click(screen.getByText("+ Add output"));
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    const sent = api.unchain.saveSkeletonResource.mock.calls[0][0].document;
    expect(Object.keys(sent).sort()).toEqual(
      ["edges", "id", "kind", "name", "nodes", "schema_version"].sort(),
    );
    expect(Object.keys(sent.nodes[1]).sort()).toEqual(["config", "id", "type"]);
    expect(Object.keys(sent.nodes[1].config.execution).sort()).toEqual([
      "inputs",
      "outputs",
    ]);
  });

  test("editing an output does not disturb the node's inputs", async () => {
    await open_end();
    fireEvent.click(screen.getByText("+ Add output"));
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    const sent = api.unchain.saveSkeletonResource.mock.calls[0][0].document;
    expect(sent.nodes[1].config.execution.inputs).toEqual(
      doc().nodes[1].config.execution.inputs,
    );
    expect(sent.nodes[0]).toEqual(doc().nodes[0]);
  });

  test("a Start's output is editable too, on its result side", async () => {
    await open_end();
    fireEvent.click(screen.getByTestId("skeleton-node-start"));
    expect(screen.getByTestId("output-row-0")).toBeInTheDocument();
    expect(screen.getByTestId("output-row-0-fixed-kind").textContent).toMatch(
      /what the run was called with/i,
    );
  });

  test("an output the author removes is gone from what is sent", async () => {
    await open_end();
    fireEvent.click(screen.getByTestId("skeleton-node-start"));
    fireEvent.click(screen.getByLabelText("Remove text"));
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    const sent = api.unchain.saveSkeletonResource.mock.calls[0][0].document;
    expect(sent.nodes[0].config.execution.outputs).toEqual([]);
  });
});

describe("the whole-value and result-root choices on the real page", () => {
  const open_end = async () => {
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValue(result({ document: doc(), edit_token: "t1" }));
    api.unchain.saveSkeletonResource = jest
      .fn()
      .mockImplementation(async ({ document }) => result({ document, edit_token: "t2" }));
    show();
    await waitFor(() =>
      expect(screen.getByTestId("skeleton-node-end")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("skeleton-node-end"));
  };

  test("a saved empty input path is not shown as nothing chosen", async () => {
    /* The real store accepts `path: []` with no diagnostics, and it means
       export the whole resolved input object. */
    const whole = doc();
    whole.nodes[1].config.execution.outputs = [
      { name: "all", source: { kind: "input", path: [] } },
    ];
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValue(result({ document: whole, edit_token: "t1" }));
    show();
    await waitFor(() =>
      expect(screen.getByTestId("skeleton-node-end")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("skeleton-node-end"));
    expect(screen.getByTestId("output-row-0")).toBeInTheDocument();
    expect(screen.getByTestId("output-row-0").textContent).toMatch(
      /Everything it was given/i,
    );
    expect(screen.queryByTestId("output-row-0-problem-0")).not.toBeInTheDocument();
  });

  test("a hostile saved path renders the panel instead of taking it down", async () => {
    /* The store keeps `[{toString: null}]`; composing it into a message threw
       and the whole page went with it. */
    const hostile = doc();
    hostile.nodes[1].config.execution.outputs = [
      { name: "a", source: { kind: "input", path: [{ toString: null }] } },
    ];
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValue(result({ document: hostile, edit_token: "t1" }));
    show();
    await waitFor(() =>
      expect(screen.getByTestId("skeleton-node-end")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("skeleton-node-end"));
    expect(screen.getByTestId("output-row-0-unreadable")).toBeInTheDocument();
    expect(screen.getByTestId("skeleton-save-state")).toBeInTheDocument();
  });

  const open_with_output = async (source) => {
    const loaded = doc();
    loaded.nodes[1].config.execution.outputs = [{ name: "a", source }];
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValue(result({ document: loaded, edit_token: "t1" }));
    show();
    await waitFor(() =>
      expect(screen.getByTestId("skeleton-node-end")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId("skeleton-node-end"));
  };

  test("a named first step offers deeper steps", async () => {
    await open_with_output({ kind: "input", path: ["payload"] });
    expect(screen.getByText(/Go deeper/)).toBeInTheDocument();
  });

  test("the whole object has no deeper steps to offer", async () => {
    /* There is no inside to reach into, and offering one produced a first
       segment that named no input. */
    await open_with_output({ kind: "input", path: [] });
    expect(screen.queryByText(/Go deeper/)).not.toBeInTheDocument();
  });

  test("a result naming a field the producer does not have is said on the row", async () => {
    await open_end();
    fireEvent.click(screen.getByTestId("skeleton-node-start"));
    /* A Start's result is the caller's, so nothing is claimed about it. */
    expect(screen.getByTestId("output-row-0-result-unknown")).toBeInTheDocument();
    expect(screen.queryByTestId("output-row-0-problem-0")).not.toBeInTheDocument();
  });

  test("a saved output keeps the whole-object path exactly as it was", async () => {
    await open_with_output({ kind: "input", path: [] });
    api.unchain.saveSkeletonResource = jest
      .fn()
      .mockImplementation(async ({ document }) => result({ document, edit_token: "t2" }));
    within(screen.getByTestId("output-row-0")).getByPlaceholderText("name");
    fireEvent.change(
      within(screen.getByTestId("output-row-0")).getByPlaceholderText("name"),
      { target: { value: "all" } },
    );
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    const sent = api.unchain.saveSkeletonResource.mock.calls[0][0].document;
    expect(sent.nodes[1].config.execution.outputs).toEqual([
      { name: "all", source: { kind: "input", path: [] } },
    ]);
  });
});


describe("taking their version, with something unstored on screen", () => {
  /* The whole chain, because every link in it can be dropped silently: the
     session counts a replacement, the page hands the count to the panel, the
     panel hands it to the sections, and the boxes hold their text against it.
     A section test cannot see a missing prop; this can.

     Driven the way it was reported: a reservation the model refuses, a save
     the store answers with 409, and then "Look at theirs". */
  const PROFILE = {
    id: "openai:gpt-6-sol",
    provider: "openai",
    model: "gpt-6-sol",
    protocol: "openai-responses",
    endpoint: "https://api.openai.com/v1",
    credential_ref: "openai",
    context_window: 1050000,
    output_limit: 128000,
    capabilities: { json_schema: true, images: true, files: false },
  };

  const agent_doc = (prompt = "Answer.") => ({
    schema_version: 1,
    kind: "agent",
    id: "life",
    name: "life",
    nodes: [
      {
        id: "brain",
        type: "agent",
        config: {
          execution: { inputs: [], outputs: [] },
          kernel: {
            schema_version: 1,
            profile: PROFILE,
            prompt,
            max_iterations: 12,
            output_tokens: 4096,
            history: "root",
            overflow: "error",
            json_schema: null,
          },
        },
      },
    ],
    edges: [],
  });

  const reservation = () =>
    within(screen.getByTestId("recipe-detail-panel-body")).getAllByPlaceholderText("—")[1];

  /* The regression the save-echo count caused, driven the way it was found.
     The box is cleared while the author's own Save is still in flight; the
     echo lands; and the next digit must replace what is in the box rather
     than be appended to a number the reply put back under the caret. */
  test("a save's own reply does not refill a box being typed in", async () => {
    let settle = null;
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValue(result({ document: agent_doc(), edit_token: "t1" }));
    api.unchain.saveSkeletonResource = jest.fn(
      () =>
        new Promise((resolve) => {
          settle = resolve;
        }),
    );
    api.unchain.listSkeletonKernelProfiles = jest
      .fn()
      .mockResolvedValue({ profiles: [PROFILE], unavailable: [] });

    show();
    await waitFor(() =>
      expect(screen.getByTestId("skeleton-node-brain")).toBeInTheDocument(),
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("skeleton-node-brain"));
    });

    fireEvent.change(screen.getByPlaceholderText("what this Agent is for"), {
      target: { value: "Mine." },
    });
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });

    /* Cleared while that request is still out. Nothing was stored: an empty
       box is not a number, and the box says so. */
    fireEvent.change(reservation(), { target: { value: "" } });
    expect(reservation().value).toBe("");
    expect(
      screen.getByTestId("kernel-reservation-refused").textContent,
    ).toMatch(/still holds 4096/);

    /* The author's own save lands, with the document it stored. */
    await act(async () => {
      settle(
        result({
          document: agent_doc("Mine."),
          edit_token: "t2",
        }),
      );
    });
    expect(screen.getByTestId("skeleton-save-state").textContent).toMatch(/^Saved$/);
    expect(reservation().value).toBe("");

    /* The next digit, typed the way a keystroke arrives: appended to whatever
       the box actually holds. */
    const box = reservation();
    fireEvent.change(box, { target: { value: `${box.value}5` } });
    expect(reservation().value).toBe("5");

    api.unchain.saveSkeletonResource = jest
      .fn()
      .mockResolvedValue(result({ document: agent_doc("Mine."), edit_token: "t3" }));
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    const sent = api.unchain.saveSkeletonResource.mock.calls[0][0];
    expect(sent.document.nodes[0].config.kernel.output_tokens).toBe(5);
  });

  test("the refused number is gone, and the stored one is on screen", async () => {
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValueOnce(result({ document: agent_doc(), edit_token: "t1" }))
      .mockResolvedValue(result({ document: agent_doc("Theirs."), edit_token: "t9" }));
    api.unchain.saveSkeletonResource = jest
      .fn()
      .mockResolvedValue({ error: EDIT_CONFLICT_ERROR });
    api.unchain.listSkeletonKernelProfiles = jest
      .fn()
      .mockResolvedValue({ profiles: [PROFILE], unavailable: [] });

    show();
    await waitFor(() =>
      expect(screen.getByTestId("skeleton-node-brain")).toBeInTheDocument(),
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("skeleton-node-brain"));
    });

    /* Something to save, so the store is asked at all. */
    fireEvent.change(
      screen.getByPlaceholderText("what this Agent is for"),
      { target: { value: "Mine." } },
    );
    /* And something the model refuses, which is never stored. */
    fireEvent.change(reservation(), { target: { value: "999999" } });
    expect(
      screen.getByTestId("kernel-reservation-refused").textContent,
    ).toMatch(/still holds 4096/);

    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    expect(screen.getByTestId("skeleton-save-conflict")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText("Look at theirs"));
    });
    await waitFor(() =>
      expect(screen.queryByTestId("skeleton-save-conflict")).not.toBeInTheDocument(),
    );

    expect(screen.getByTestId("skeleton-save-state").textContent).toMatch(/^Saved$/);
    expect(screen.getByPlaceholderText("what this Agent is for").value).toBe("Theirs.");
    expect(reservation().value).toBe("4096");
    expect(screen.queryByTestId("kernel-reservation-refused")).toBeNull();
  });
});

describe("a legacy inline subagent, converted on the real page", () => {
  /* Acceptance 7 for the entries that have no Agent to reference. An inline
     entry carries a prompt, so converting it means building an Agent — on the
     model configured on the Agent node its pool is attached to, which the
     store reads out of the document itself. These tests are about the whole
     page asking for that write and making no model decision of its own: the
     panel's statements and the runtime's own verdicts are covered in
     `subagent_pool_section` and `legacy_conversion`. */
  const KERNEL = {
    schema_version: 1,
    profile: {
      id: "openai:gpt-4.1",
      provider: "openai",
      model: "gpt-4.1",
      protocol: "openai-responses",
      endpoint: "https://api.openai.com/v1",
      credential_ref: "openai",
      context_window: 128000,
      output_limit: 4096,
      capabilities: { json_schema: true, images: true, files: true },
    },
    prompt: "Review it.",
    max_iterations: 6,
    output_tokens: 2048,
    history: "root",
    overflow: "error",
    json_schema: { type: "object", properties: { a: { type: "string" } }, required: ["a"], additionalProperties: false },
  };

  const legacy_agent = (over = {}) => ({
    schema_version: 1,
    kind: "agent",
    id: "life",
    name: "Reviewer",
    nodes: [
      { id: "start", type: "start", config: { legacy_source: { format: "recipe" } } },
      {
        id: "a1",
        type: "agent",
        config: {
          legacy_recipe: { name: "Reviewer", model: "openai:gpt-4.1" },
          prompt: { kind: "text", text: "Review it." },
          ...(over.kernel === null ? {} : { kernel: over.kernel || KERNEL }),
        },
      },
      {
        id: "pool",
        type: "subagent_pool",
        config: {
          legacy_fields: {
            subagents: [
              {
                kind: "inline",
                name: "Shortener",
                prompt_format: "skeleton",
                template: { prompt: "Be brief.", model: over.declared === undefined ? "openai:gpt-4.1" : over.declared },
              },
            ],
          },
        },
      },
      { id: "end", type: "end", config: {} },
    ],
    edges: [
      {
        id: "pool-a1",
        kind: "attach",
        source_node_id: "pool",
        source_port_id: "attach_top",
        target_node_id: "a1",
        target_port_id: "attach_bot",
      },
    ],
  });

  const open_pool = async (document) => {
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: [] });
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValue(result({ document, edit_token: "edit-1" }));
    show();
    await waitFor(() => expect(screen.getByTestId("skeleton-node-pool")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("skeleton-node-pool"));
    await act(async () => {});
  };

  test("the write names the model its pool is attached to, and sends none", async () => {
    await open_pool(legacy_agent());
    expect(
      screen.getByTestId("subagent-pool-legacy-kernel-chosen").textContent,
    ).toMatch(/on openai:gpt-4\.1, the model configured on the Agent node this pool is attached to \(a1\)/);

    api.unchain.convertSkeletonLegacyPools = jest.fn().mockResolvedValue(
      result({ document: legacy_agent(), edit_token: "edit-2" }),
    );
    await act(async () => {
      fireEvent.click(screen.getByText("Convert to Agent entries"));
    });
    /* The store resolves it from the attachment and clears the prompt and
       output schema the child does not inherit; the page decides neither. */
    expect(api.unchain.convertSkeletonLegacyPools).toHaveBeenCalledWith(
      "life",
      "edit-1",
      null,
    );
  });

  test("and the check that it can run sends none either", async () => {
    await open_pool(legacy_agent());
    api.unchain.preflightSkeletonResource = jest
      .fn()
      .mockResolvedValue({ ok: true, definition_digest: "sha256:abc" });
    await act(async () => {
      fireEvent.click(screen.getByText("Check it can run"));
    });
    /* This Agent's node carries its own Kernel and its pool is attached to
       that node, so the check is answerable out of the document alone. */
    expect(api.unchain.preflightSkeletonResource).toHaveBeenCalledWith("life", null);
    expect(screen.getByTestId("skeleton-preflight-state").textContent).toMatch(
      /Ready to run/,
    );
  });

  test("an entry declaring another model is refused before anything is written", async () => {
    await open_pool(legacy_agent({ declared: "anthropic:claude-x" }));
    api.unchain.convertSkeletonLegacyPools = jest.fn();
    expect(
      screen.getByTestId("subagent-pool-legacy-needs-kernel").textContent,
    ).toMatch(/Shortener declares anthropic:claude-x/);
    expect(screen.queryByText("Convert to Agent entries")).not.toBeInTheDocument();
    expect(api.unchain.convertSkeletonLegacyPools).not.toHaveBeenCalled();
  });
});

describe("drilling into a subagent's own graph", () => {
  /* Acceptance 8. A subagent is a complete Agent graph, so its contents are
     edited on the canvas with a breadcrumb back — and the two kinds of entry
     differ in exactly one way that matters here: what Save writes.
     Measured on the real store (`skeleton_drill_capture`): editing an embedded
     child and saving the PARENT stores the child's change verbatim and creates
     no resource, while saving a referenced child leaves the parent's document
     and token untouched. */

  const entry = (over) => ({
    id: "ref",
    name: "Summarizer",
    description: "",
    source: { kind: "agent_ref", agent_id: "sum" },
    allowed_modes: ["delegate"],
    output_mode: "summary",
    memory_policy: "ephemeral",
    parallel_safe: true,
    allowed_tools: null,
    disabled_tools: [],
    ...over,
  });

  const child_doc = (id, name) => ({
    schema_version: 1,
    kind: "agent",
    id,
    name,
    nodes: [
      { id: `${id}-start`, type: "start", config: { execution: { outputs: [] } } },
      { id: `${id}-end`, type: "end", config: { execution: { inputs: [], outputs: [] } } },
    ],
    edges: [flow(`${id}-e1`, `${id}-start`, `${id}-end`)],
  });

  const embedded_entry = (over) =>
    entry({
      id: "emb",
      name: "Shortener",
      source: { kind: "embedded", document: child_doc("inner", "Shortener") },
      ...over,
    });

  /* A modern pool: its entries name Agents, so no Kernel is involved here —
     that is acceptance 7's subject, and this one is navigation. */
  const parent_doc = (subagents = [entry(), embedded_entry()]) => ({
    schema_version: 1,
    kind: "agent",
    id: "life",
    name: "Reviewer",
    nodes: [
      { id: "start", type: "start", config: { execution: { outputs: [] } } },
      { id: "a1", type: "agent", config: { execution: { inputs: [], outputs: [] } } },
      { id: "pool", type: "subagent_pool", config: { subagents } },
      { id: "end", type: "end", config: { execution: { inputs: [], outputs: [] } } },
    ],
    edges: [
      flow("e1", "start", "a1"),
      flow("e2", "a1", "end"),
      {
        id: "attach", kind: "attach", source_node_id: "pool",
        source_port_id: "attach_top", target_node_id: "a1",
        target_port_id: "attach_bot",
      },
    ],
  });

  const library = [{ id: "sum", name: "Summarizer", kind: "agent", archived: false }];

  const open_parent = async ({
    document = parent_doc(),
    child = result({ id: "sum", kind: "agent", name: "Summarizer", document: child_doc("sum", "Summarizer"), edit_token: "sum-1" }),
    diagnostics = [],
    resources = library,
    onDrilledChange,
  } = {}) => {
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources });
    api.unchain.getSkeletonResource = jest.fn((id) =>
      id === "sum"
        ? Promise.resolve(child)
        : Promise.resolve(result({ kind: "agent", name: "Reviewer", document, edit_token: "edit-1", diagnostics })),
    );
    render(
      <ConfigContext.Provider value={cfg}>
        <SkeletonResourcePage resourceId="life" onDrilledChange={onDrilledChange} />
      </ConfigContext.Provider>,
    );
    await waitFor(() => expect(screen.getByTestId("skeleton-node-pool")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("skeleton-node-pool"));
    await act(async () => {});
  };

  const crumbs = () =>
    screen
      .getByTestId("skeleton-drill-crumbs")
      .textContent.split("›")
      .map((part) => part.trim())
      .join(" › ");

  test("a pool row opens the referenced Agent's own graph, read by identity first", async () => {
    await open_parent();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Open Summarizer"));
    });
    /* Read through the ordinary interface, by the id the entry names. */
    expect(api.unchain.getSkeletonResource).toHaveBeenCalledWith("sum");
    /* The child's nodes are there and the parent's are gone. */
    expect(screen.getByTestId("skeleton-node-sum-end")).toBeInTheDocument();
    expect(screen.queryByTestId("skeleton-node-pool")).toBeNull();
  });

  test("the breadcrumb names the graph it came from, the step, and the graph on screen", async () => {
    await open_parent();
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Open Summarizer"));
    });
    expect(crumbs()).toBe("Reviewer › Subagent Pool › Summarizer");
    /* A referenced Agent is its own resource: Save writes it, so there is no
       caption saying otherwise. */
    expect(screen.queryByTestId("skeleton-drill-save-target")).toBeNull();
    expect(screen.queryByTestId("skeleton-drill-unchecked")).toBeNull();
    /* Only the graph left behind is navigable. */
    expect(screen.getByLabelText("Back to Reviewer")).toBeInTheDocument();
    expect(screen.queryByLabelText("Back to Summarizer")).toBeNull();
  });

  test("coming back restores the parent's unsaved work and saves nothing", async () => {
    await open_parent();
    api.unchain.saveSkeletonResource = jest.fn();
    /* An edit to the parent, left unsaved. */
    fireEvent.click(screen.getByTestId("skeleton-node-end"));
    fireEvent.click(screen.getByText("+ Add input"));
    expect(screen.getByTestId("skeleton-save-state").textContent).toMatch(/unsaved/i);

    fireEvent.click(screen.getByTestId("skeleton-node-pool"));
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Open Summarizer"));
    });
    const reads = api.unchain.getSkeletonResource.mock.calls.length;
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Back to Reviewer"));
    });

    /* Restored from memory, not re-read — re-reading would discard edits the
       author never asked to discard. */
    expect(api.unchain.getSkeletonResource.mock.calls.length).toBe(reads);
    expect(screen.getByTestId("skeleton-node-pool")).toBeInTheDocument();
    expect(screen.getByTestId("skeleton-save-state").textContent).toMatch(/unsaved/i);
    /* The selection comes back with it. */
    fireEvent.click(screen.getByTestId("skeleton-node-end"));
    expect(screen.getByTestId("binding-row-0")).toBeInTheDocument();
    expect(screen.queryByTestId("binding-row-1")).toBeNull();
    expect(api.unchain.saveSkeletonResource).not.toHaveBeenCalled();
    expect(screen.queryByTestId("skeleton-drill-breadcrumb")).toBeNull();
  });

  test("a read that fails names the Agent and leaves the author on the parent", async () => {
    await open_parent({ child: { error: { code: "resource_missing", message: "referenced Agent was not found" } } });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Open Summarizer"));
    });
    expect(screen.getByTestId("skeleton-drill-notice").textContent).toMatch(
      /The Agent sum could not be opened — referenced Agent was not found/,
    );
    expect(screen.getByTestId("skeleton-node-pool")).toBeInTheDocument();
    expect(screen.queryByTestId("skeleton-drill-breadcrumb")).toBeNull();
  });

  test("a reference that turns out to be a Workflow is refused by the same gate the picker uses", async () => {
    await open_parent({
      child: result({ id: "sum", kind: "workflow", name: "Summarizer", document: child_doc("sum", "Summarizer"), edit_token: "sum-1" }),
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Open Summarizer"));
    });
    expect(screen.getByTestId("skeleton-drill-notice").textContent).toMatch(
      /This is a Workflow\. A Subagent Pool holds Agents\./,
    );
    expect(screen.getByTestId("skeleton-node-pool")).toBeInTheDocument();
  });

  test("saving while drilled into a reference writes that Agent, at its own token", async () => {
    await open_parent();
    api.unchain.saveSkeletonResource = jest
      .fn()
      .mockResolvedValue(result({ id: "sum", kind: "agent", document: child_doc("sum", "Summarizer"), edit_token: "sum-2" }));
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Open Summarizer"));
    });
    fireEvent.click(screen.getByTestId("skeleton-node-sum-end"));
    fireEvent.click(screen.getByText("+ Add input"));
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    const payload = api.unchain.saveSkeletonResource.mock.calls[0][0];
    expect(payload.expected_edit_token).toBe("sum-1");
    expect(payload.document.id).toBe("sum");
    expect(payload.document.nodes.find((n) => n.id === "sum-end").config.execution.inputs).toHaveLength(1);
  });

  test("an embedded graph opens in place, and saving writes the parent that owns it", async () => {
    await open_parent();
    api.unchain.saveSkeletonResource = jest
      .fn()
      .mockResolvedValue(result({ kind: "agent", document: parent_doc(), edit_token: "edit-2" }));
    fireEvent.click(screen.getByLabelText("Open Shortener"));
    await act(async () => {});
    /* No read at all: the graph was already in the parent's document. */
    expect(api.unchain.getSkeletonResource).toHaveBeenCalledTimes(1);
    expect(crumbs()).toBe("Reviewer › Subagent Pool › Shortener");
    expect(screen.getByTestId("skeleton-drill-save-target").textContent).toBe(
      "Save writes Reviewer, which owns this embedded graph.",
    );
    /* And it says why nothing is reported here, so an empty diagnostics area
       is not read as "nothing is wrong". */
    expect(screen.getByTestId("skeleton-drill-unchecked").textContent).toMatch(
      /does not look inside an embedded graph/,
    );

    fireEvent.click(screen.getByTestId("skeleton-node-inner-end"));
    fireEvent.click(screen.getByText("+ Add input"));
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    const payload = api.unchain.saveSkeletonResource.mock.calls[0][0];
    expect(payload.expected_edit_token).toBe("edit-1");
    expect(payload.document.id).toBe("life");
    /* The child's edit went back where the store keeps it. */
    const stored_child = payload.document.nodes
      .find((node) => node.id === "pool")
      .config.subagents[1].source.document;
    expect(stored_child.nodes.find((n) => n.id === "inner-end").config.execution.inputs).toHaveLength(1);
    /* And nothing else in the parent moved. */
    expect(payload.document.nodes.find((n) => n.id === "pool").config.subagents[0]).toEqual(entry());
  });

  test("the parent's own problems are not shown on an embedded graph's nodes", async () => {
    /* Measured: the draft check says nothing about an embedded child, and the
       parent's own faults are reported at `document.nodes[1]…` — which in this
       view is the child's own node. */
    await open_parent({
      diagnostics: [
        {
          code: "unknown_field",
          message: "default is only allowed for default policy",
          path: ["document", "nodes", 1, "config", "execution", "inputs", 0, "default"],
        },
      ],
    });
    fireEvent.click(screen.getByTestId("skeleton-node-a1"));
    expect(screen.getByTestId("skeleton-diagnostics-notice")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("skeleton-node-pool"));
    fireEvent.click(screen.getByLabelText("Open Shortener"));
    await act(async () => {});
    fireEvent.click(screen.getByTestId("skeleton-node-inner-end"));
    expect(screen.queryByTestId("skeleton-diagnostics-notice")).toBeNull();
    expect(screen.queryByTestId("skeleton-elsewhere-notice")).toBeNull();
  });

  test("Escape goes up one level, and does not reach the modal behind it", async () => {
    const outer = jest.fn();
    window.addEventListener("keydown", outer);
    await open_parent();
    fireEvent.click(screen.getByLabelText("Open Shortener"));
    await act(async () => {});
    expect(screen.getByTestId("skeleton-drill-breadcrumb")).toBeInTheDocument();
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(screen.queryByTestId("skeleton-drill-breadcrumb")).toBeNull();
    expect(screen.getByTestId("skeleton-node-pool")).toBeInTheDocument();
    /* The Agents modal closes on Escape from its own window listener; while a
       drill was open this one belonged to the drill. */
    expect(outer).not.toHaveBeenCalled();
    window.removeEventListener("keydown", outer);
  });

  test("with no drill open it passes through untouched", async () => {
    const outer = jest.fn();
    window.addEventListener("keydown", outer);
    await open_parent();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(outer).toHaveBeenCalled();
    window.removeEventListener("keydown", outer);
  });

  test("and it is not taken while a field has the caret", async () => {
    await open_parent();
    fireEvent.click(screen.getByLabelText("Open Shortener"));
    await act(async () => {});
    const field = window.document.createElement("input");
    window.document.body.appendChild(field);
    field.focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByTestId("skeleton-drill-breadcrumb")).toBeInTheDocument();
    field.remove();
  });

  test("a nested embedded graph keeps every level navigable", async () => {
    const inner = child_doc("deep", "Deepest");
    const middle = child_doc("inner", "Shortener");
    middle.nodes.push({
      id: "inner-pool",
      type: "subagent_pool",
      config: { subagents: [entry({ id: "deep", name: "Deepest", source: { kind: "embedded", document: inner } })] },
    });
    middle.edges.push({
      id: "inner-attach", kind: "attach", source_node_id: "inner-pool",
      source_port_id: "attach_top", target_node_id: "inner-end",
      target_port_id: "attach_bot",
    });
    await open_parent({
      document: parent_doc([embedded_entry({ source: { kind: "embedded", document: middle } })]),
    });
    fireEvent.click(screen.getByLabelText("Open Shortener"));
    await act(async () => {});
    fireEvent.click(screen.getByTestId("skeleton-node-inner-pool"));
    fireEvent.click(screen.getByLabelText("Open Deepest"));
    await act(async () => {});
    expect(crumbs()).toBe(
      "Reviewer › Subagent Pool › Shortener › Subagent Pool › Deepest",
    );
    /* Back to the middle one, not all the way out. */
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Back to Shortener"));
    });
    expect(crumbs()).toBe("Reviewer › Subagent Pool › Shortener");
    expect(screen.getByTestId("skeleton-node-inner-pool")).toBeInTheDocument();
  });

  test("an entry whose source the store refuses offers nothing to open", async () => {
    await open_parent({ document: parent_doc([entry({ source: { kind: "graph" } })]) });
    expect(screen.queryByLabelText("Open Summarizer")).toBeNull();
  });

  test("a save still in flight is not a moment to open a subagent", async () => {
    await open_parent();
    let land = null;
    api.unchain.saveSkeletonResource = jest.fn(
      () => new Promise((resolve) => { land = resolve; }),
    );
    fireEvent.click(screen.getByTestId("skeleton-node-end"));
    fireEvent.click(screen.getByText("+ Add input"));
    fireEvent.click(screen.getByText("Save").closest("button"));
    fireEvent.click(screen.getByTestId("skeleton-node-pool"));
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Open Summarizer"));
    });
    expect(screen.getByTestId("skeleton-drill-notice").textContent).toMatch(
      /has not landed yet/,
    );
    expect(screen.queryByTestId("skeleton-drill-breadcrumb")).toBeNull();
    await act(async () => {
      land(result({ kind: "agent", document: parent_doc(), edit_token: "edit-2" }));
    });
  });

  test("the page says when a drill is open, so the resource list can collapse", async () => {
    const onDrilledChange = jest.fn();
    await open_parent({ onDrilledChange });
    expect(onDrilledChange).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByLabelText("Open Shortener"));
    await act(async () => {});
    expect(onDrilledChange).toHaveBeenLastCalledWith(true);
    await act(async () => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(onDrilledChange).toHaveBeenLastCalledWith(false);
  });

  test("taking the other editor's version closes a graph it no longer holds", async () => {
    await open_parent();
    fireEvent.click(screen.getByLabelText("Open Shortener"));
    await act(async () => {});
    expect(screen.getByTestId("skeleton-node-inner-end")).toBeInTheDocument();

    /* A conflict, resolved by taking theirs — and theirs does not have that
       entry at all. */
    api.unchain.saveSkeletonResource = jest
      .fn()
      .mockResolvedValue({ error: { code: "edit_conflict", message: "stale token" } });
    fireEvent.click(screen.getByTestId("skeleton-node-inner-end"));
    fireEvent.click(screen.getByText("+ Add input"));
    await act(async () => {
      fireEvent.click(screen.getByText("Save").closest("button"));
    });
    api.unchain.getSkeletonResource = jest
      .fn()
      .mockResolvedValue(result({ kind: "agent", document: parent_doc([entry()]), edit_token: "edit-9" }));
    await act(async () => {
      fireEvent.click(screen.getByText("Look at theirs").closest("button"));
    });
    expect(screen.getByTestId("skeleton-drill-notice").textContent).toMatch(
      /no longer in this pool, so it was closed/,
    );
    expect(screen.getByTestId("skeleton-node-pool")).toBeInTheDocument();
    expect(screen.queryByTestId("skeleton-drill-breadcrumb")).toBeNull();
  });

  /* ── A read that answered too late ────────────────────────────────────────
   *
   * Opening a referenced Agent is a read, and the author keeps working while
   * it is in flight. Reproduced on the real page in the acceptance-8 review:
   * the answer replaced whatever was on screen when it arrived, and a frame
   * taken while a save was pending came back with a save nothing could
   * answer — a disabled "Saving…" that never cleared, with the write long
   * since stored. */

  const held = (child_promise) => {
    let land = null;
    const pending = new Promise((resolve) => { land = resolve; });
    api.unchain.getSkeletonResource = jest.fn((id) =>
      id === "sum"
        ? pending
        : Promise.resolve(
            result({ kind: "agent", name: "Reviewer", document: parent_doc(), edit_token: "edit-1" }),
          ),
    );
    return () => land(child_promise);
  };

  test("a read for the graph the author left does not replace the one they moved to", async () => {
    const elsewhere = parent_doc([entry()]);
    elsewhere.id = "other";
    elsewhere.name = "Other";
    elsewhere.nodes.push({
      id: "elsewhere",
      type: "agent",
      config: { execution: { inputs: [], outputs: [] } },
    });
    api.unchain.listSkeletonResources = jest.fn().mockResolvedValue({ resources: library });
    let land = null;
    api.unchain.getSkeletonResource = jest.fn((id) => {
      if (id === "sum") return new Promise((resolve) => { land = resolve; });
      if (id === "other") {
        return Promise.resolve(
          result({ id: "other", kind: "agent", name: "Other", document: elsewhere, edit_token: "other-1" }),
        );
      }
      return Promise.resolve(
        result({ kind: "agent", name: "Reviewer", document: parent_doc(), edit_token: "edit-1" }),
      );
    });
    const page = (resourceId) => (
      <ConfigContext.Provider value={cfg}>
        <SkeletonResourcePage resourceId={resourceId} />
      </ConfigContext.Provider>
    );
    const view = render(page("life"));
    await waitFor(() => expect(screen.getByTestId("skeleton-node-pool")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("skeleton-node-pool"));
    await act(async () => {});
    fireEvent.click(screen.getByLabelText("Open Summarizer"));

    /* The author opens another Agent while that read is in flight, and edits
       it. */
    view.rerender(page("other"));
    await waitFor(() => expect(screen.getByTestId("skeleton-node-elsewhere")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("skeleton-node-end"));
    fireEvent.click(screen.getByText("+ Add input"));
    expect(screen.getByTestId("skeleton-save-state").textContent).toMatch(/unsaved/i);

    await act(async () => {
      land(result({ id: "sum", kind: "agent", name: "Summarizer", document: child_doc("sum", "Summarizer"), edit_token: "sum-1" }));
    });

    /* Still the Agent they moved to, still unsaved, and no breadcrumb saying
       they are somewhere they never went. */
    expect(screen.getByTestId("skeleton-node-elsewhere")).toBeInTheDocument();
    expect(screen.queryByTestId("skeleton-node-sum-end")).toBeNull();
    expect(screen.getByTestId("skeleton-save-state").textContent).toMatch(/unsaved/i);
    expect(screen.queryByTestId("skeleton-drill-breadcrumb")).toBeNull();
    expect(screen.queryByTestId("skeleton-drill-notice")).toBeNull();
  });

  test("a save started while a read is in flight keeps the author where the save is", async () => {
    await open_parent();
    const land_read = held(
      result({ id: "sum", kind: "agent", name: "Summarizer", document: child_doc("sum", "Summarizer"), edit_token: "sum-1" }),
    );
    let land_save = null;
    api.unchain.saveSkeletonResource = jest.fn(
      () => new Promise((resolve) => { land_save = resolve; }),
    );
    fireEvent.click(screen.getByTestId("skeleton-node-end"));
    fireEvent.click(screen.getByText("+ Add input"));
    fireEvent.click(screen.getByTestId("skeleton-node-pool"));
    /* Open, then Save before the read lands: the limit on the button cannot
       see this one, because nothing was being written when it was clicked. */
    fireEvent.click(screen.getByLabelText("Open Summarizer"));
    fireEvent.click(screen.getByText("Save").closest("button"));
    await act(async () => {
      land_read();
    });

    expect(screen.queryByTestId("skeleton-drill-breadcrumb")).toBeNull();
    expect(screen.getByTestId("skeleton-drill-notice").textContent).toMatch(
      /has not landed yet/,
    );
    expect(screen.getByTestId("skeleton-node-pool")).toBeInTheDocument();

    /* The save it was refused for settles on the graph it was made about, and
       the page is not left waiting for it for ever. */
    await act(async () => {
      land_save(result({ kind: "agent", document: parent_doc(), edit_token: "edit-2" }));
    });
    expect(screen.queryByRole("button", { name: "Saving…" })).toBeNull();
    expect(screen.getByTestId("skeleton-save-state").textContent).toMatch(/^Saved$/);
    /* And the line saying the save had not landed goes with it: it would
       otherwise sit under a bar saying Saved. */
    expect(screen.queryByTestId("skeleton-drill-notice")).toBeNull();

    /* And opening it now works, because nothing is in flight. */
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Open Summarizer"));
    });
    expect(screen.getByTestId("skeleton-drill-breadcrumb")).toBeInTheDocument();
  });

  test("a second opening wins, and the first read's answer is not drawn over it", async () => {
    await open_parent();
    const land_read = held(
      result({ id: "sum", kind: "agent", name: "Summarizer", document: child_doc("sum", "Summarizer"), edit_token: "sum-1" }),
    );
    fireEvent.click(screen.getByLabelText("Open Summarizer"));
    /* The author changes their mind and opens the embedded one instead, which
       needs no read at all. */
    fireEvent.click(screen.getByLabelText("Open Shortener"));
    await act(async () => {
      land_read();
    });
    expect(crumbs()).toBe("Reviewer › Subagent Pool › Shortener");
    expect(screen.getByTestId("skeleton-node-inner-end")).toBeInTheDocument();
    expect(screen.queryByTestId("skeleton-node-sum-end")).toBeNull();
    /* Nothing is said about the graph they decided against — the notice would
       be read as a problem with the graph they are now in. */
    expect(screen.queryByTestId("skeleton-drill-notice")).toBeNull();
  });
});
