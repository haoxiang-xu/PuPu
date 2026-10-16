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
     entry carries a prompt, so converting it means building an Agent — and
     the store refuses to build one without a Kernel the caller chose
     (`legacy_profile_required`). The Kernel is the one configured on this
     Agent's Agent node, and these two tests are about the whole page handing
     it over: the panel's statements and the runtime's own verdicts are
     covered in `subagent_pool_section` and `legacy_conversion`. */
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
    edges: [],
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

  test("the write carries the model chosen on the Agent node", async () => {
    await open_pool(legacy_agent());
    expect(
      screen.getByTestId("subagent-pool-legacy-kernel-chosen").textContent,
    ).toMatch(/on openai:gpt-4\.1/);

    api.unchain.convertSkeletonLegacyPools = jest.fn().mockResolvedValue(
      result({ document: legacy_agent(), edit_token: "edit-2" }),
    );
    await act(async () => {
      fireEvent.click(screen.getByText("Convert to Agent entries"));
    });
    expect(api.unchain.convertSkeletonLegacyPools).toHaveBeenCalledWith(
      "life",
      "edit-1",
      /* The entry's own prompt replaces the first field and the second is
         this Agent's contract, not the subagent's. */
      { ...KERNEL, prompt: "", json_schema: null },
    );
  });

  test("and the check that it can run carries it as configured", async () => {
    await open_pool(legacy_agent());
    api.unchain.preflightSkeletonResource = jest
      .fn()
      .mockResolvedValue({ ok: true, definition_digest: "sha256:abc" });
    await act(async () => {
      fireEvent.click(screen.getByText("Check it can run"));
    });
    /* Not projected here: preflight materialises this Agent out of its own
       legacy data, so its Kernel goes over as the author configured it. */
    expect(api.unchain.preflightSkeletonResource).toHaveBeenCalledWith("life", KERNEL);
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
