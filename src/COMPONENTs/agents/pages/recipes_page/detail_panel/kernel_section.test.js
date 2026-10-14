import React from "react";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import KernelSection, { unbound_references } from "./kernel_section";
import { node_kernel } from "../skeleton_document";
import { kernel_problems } from "../kernel_config";
import { kernel_profiles } from "../skeleton_resources";

/* The facade has its own suite; here it is the one seam, so the section can be
   shown a catalog, an unreachable runtime and a refusal without a bridge. */
jest.mock("../skeleton_resources", () => ({
  is_unavailable: (result) =>
    Boolean(result) && result.ok === false && result.reason === "unavailable",
  kernel_profiles: jest.fn(),
}));

jest.mock("../../../../../BUILTIN_COMPONENTs/select/select", () => {
  return function MockSelect({ options, value, set_value, placeholder }) {
    return (
      <select
        data-testid="select"
        data-placeholder={placeholder || ""}
        data-value={value == null ? "" : String(value)}
        value={value || ""}
        onChange={(event) => set_value(event.target.value)}
      >
        <option value="">{placeholder || ""}</option>
        {(options || []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  };
});

jest.mock("../../../../../BUILTIN_COMPONENTs/input/input", () => {
  return function MockInput({ value, set_value, placeholder }) {
    return (
      <input
        placeholder={placeholder}
        value={value}
        onChange={(event) => set_value(event.target.value)}
      />
    );
  };
});

jest.mock("../../../../../BUILTIN_COMPONENTs/input/textfield", () => {
  return function MockTextField({ value, set_value, placeholder }) {
    return (
      <textarea
        placeholder={placeholder}
        value={value}
        onChange={(event) => set_value(event.target.value)}
      />
    );
  };
});

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

const PLAIN = {
  ...PROFILE,
  id: "anthropic:claude-sonnet-4",
  provider: "anthropic",
  model: "claude-sonnet-4",
  protocol: "anthropic",
  endpoint: "https://api.anthropic.com",
  credential_ref: "anthropic",
  context_window: 200000,
  output_limit: 16384,
  capabilities: { json_schema: false, images: true, files: true },
};

const KERNEL = {
  schema_version: 1,
  profile: PROFILE,
  prompt: "Answer the question.",
  max_iterations: 12,
  output_tokens: 4096,
  history: "root",
  overflow: "error",
  json_schema: null,
};

/* Three Selects live in this section, so each is reached through its own
   container rather than by being the first one found. */
const model_picker = () =>
  within(screen.getByTestId("kernel-model")).getByTestId("select");
const prompt_box = () => screen.getByPlaceholderText("what this Agent is for");

const node = (config, id = "k") => ({ id, type: "agent", config });
const doc = (item) => ({
  schema_version: 1,
  kind: "agent",
  id: "d",
  name: "D",
  nodes: [item],
  edges: [],
});

const bare = (bindings = []) =>
  node({ execution: { inputs: bindings, outputs: [] } });
const configured = (over = {}, bindings = []) =>
  node({
    execution: { inputs: bindings, outputs: [] },
    kernel: { ...KERNEL, ...over },
  });

function offering(profiles, unavailable = []) {
  kernel_profiles.mockResolvedValue({
    ok: true,
    data: { profiles, unavailable },
  });
}

async function show(item) {
  const onChange = jest.fn();
  let view = null;
  await act(async () => {
    view = render(
      <KernelSection
        document={doc(item)}
        node={item}
        isDark={false}
        onChange={onChange}
      />,
    );
  });
  return { onChange, view };
}

/* The kernel the section would have written, read back out of the document it
   handed over — so every assertion is about the document, never about the
   component's own idea of it. */
const written = (onChange, call = 0) =>
  node_kernel(onChange.mock.calls[call][0].nodes[0]);

beforeEach(() => {
  kernel_profiles.mockReset();
  offering([PROFILE, PLAIN]);
});

describe("an Agent with no model yet", () => {
  test("says the draft saves and the run does not", async () => {
    /* The measured fact: nothing before Run refuses an Agent with no kernel.
       If this section merely disabled something, the author would meet that
       refusal for the first time at the first run. */
    await show(bare());
    const said = screen.getByTestId("kernel-absent").textContent;
    expect(said).toMatch(/no model yet/i);
    expect(said).toMatch(/saves without one/i);
    expect(said).toMatch(/refused the moment it runs/i);
  });

  test("picking a model writes a kernel the runtime accepts", async () => {
    const { onChange } = await show(bare());
    fireEvent.change(model_picker(), {
      target: { value: "openai:gpt-6-sol" },
    });
    const kernel = written(onChange);
    expect(kernel_problems(kernel)).toEqual([]);
    expect(kernel.profile).toEqual(PROFILE);
    expect(kernel.prompt).toBe("");
    expect(kernel.json_schema).toBeNull();
  });

  test("the profile is carried exactly as the producer gave it", async () => {
    /* Not rebuilt field by field: the endpoint and the credential reference
       are what the run resolves against, and one character of difference
       there turns an official endpoint into one that needs its own binding. */
    const { onChange } = await show(bare());
    fireEvent.change(model_picker(), {
      target: { value: "openai:gpt-6-sol" },
    });
    expect(written(onChange).profile).toBe(PROFILE);
  });

  test("nothing is written until a model is picked", async () => {
    const { onChange } = await show(bare());
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("when the runtime cannot be reached", () => {
  test("it says so rather than looking like a build with no models", async () => {
    kernel_profiles.mockResolvedValue({ ok: false, reason: "unavailable", error: {} });
    await show(bare());
    expect(
      screen.getByTestId("kernel-catalog-unavailable").textContent,
    ).toMatch(/cannot reach/i);
  });

  test("a stored model is still shown, and still editable", async () => {
    kernel_profiles.mockResolvedValue({ ok: false, reason: "unavailable", error: {} });
    const { onChange } = await show(configured());
    expect(screen.getByTestId("kernel-profile-facts").textContent).toMatch(
      /api\.openai\.com/,
    );
    fireEvent.change(prompt_box(), { target: { value: "Changed." } });
    expect(written(onChange).prompt).toBe("Changed.");
  });

  test("a rejected read does not leave it reading forever", async () => {
    kernel_profiles.mockRejectedValue(new Error("boom"));
    await show(bare());
    expect(screen.getByTestId("kernel-catalog-unavailable")).toBeInTheDocument();
  });
});

describe("a model this build no longer offers", () => {
  test("stays on screen, named as not offered", async () => {
    offering([PLAIN]);
    await show(configured());
    const options = [...model_picker().options].map((o) => o.textContent);
    expect(options.join(" ")).toMatch(/not offered by this build/i);
    expect(model_picker().getAttribute("data-value")).toBe("openai:gpt-6-sol");
  });

  test("and is not quietly replaced by the first one that is", async () => {
    offering([PLAIN]);
    const { onChange } = await show(configured());
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("why a model is not in the list", () => {
  test("the reasons are said, not left as an absence", async () => {
    offering([PROFILE], [
      { id: "openai:gpt-5", provider: "openai", model: "gpt-5", reason: "output_limit_unknown" },
    ]);
    await show(bare());
    const said = screen.getByTestId("kernel-catalog-reasons").textContent;
    expect(said).toMatch(/openai:gpt-5/);
    expect(said).toMatch(/no output limit/i);
    expect(said).toMatch(/not because it was forgotten/i);
  });

  test("a reason this build does not recognise is still shown", async () => {
    offering([PROFILE], [{ id: "x:y", reason: "something_new" }]);
    await show(bare());
    expect(screen.getByTestId("kernel-catalog-reasons").textContent).toMatch(
      /something_new/,
    );
  });

  test("a build that can offer nothing says that too", async () => {
    offering([], []);
    await show(bare());
    expect(screen.getByTestId("kernel-catalog-empty")).toBeInTheDocument();
  });
});

describe("the reply reservation", () => {
  const box = () => screen.getAllByPlaceholderText("—")[1];

  test("is bounded by this model's own output limit", async () => {
    await show(configured());
    expect(screen.getByText(/at most 128000/i)).toBeInTheDocument();
  });

  test("a number above the limit is not stored, and the stored one is named", async () => {
    const { onChange } = await show(configured());
    fireEvent.change(box(), { target: { value: "999999" } });
    expect(onChange).not.toHaveBeenCalled();
    const said = screen.getByTestId("kernel-reservation-refused").textContent;
    expect(said).toMatch(/from 1 to 128000/);
    expect(said).toMatch(/still holds 4096/);
  });

  test("a number being typed is left exactly as typed", async () => {
    /* The schema editor's lesson: a box that redraws what it parsed deletes
       the character under the cursor. `2` on the way to `2048` is a whole
       number, so it stores; `2.` is not, and must still be visible. */
    const { onChange } = await show(configured());
    fireEvent.change(box(), { target: { value: "2." } });
    expect(box().value).toBe("2.");
    expect(onChange).not.toHaveBeenCalled();
  });

  test("an emptied box is not a stored state", async () => {
    const { onChange } = await show(configured());
    fireEvent.change(box(), { target: { value: "" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("kernel-reservation-refused")).toBeInTheDocument();
  });

  test("a number inside the limit is stored", async () => {
    const { onChange } = await show(configured());
    fireEvent.change(box(), { target: { value: "8192" } });
    expect(written(onChange).output_tokens).toBe(8192);
    expect(kernel_problems(written(onChange))).toEqual([]);
  });

  test("turns are bounded by nothing but being a whole number", async () => {
    const { onChange } = await show(configured());
    fireEvent.change(screen.getAllByPlaceholderText("—")[0], {
      target: { value: "40" },
    });
    expect(written(onChange).max_iterations).toBe(40);
  });

  test("zero turns is refused, because the runtime refuses it", async () => {
    const { onChange } = await show(configured());
    fireEvent.change(screen.getAllByPlaceholderText("—")[0], {
      target: { value: "0" },
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("kernel-iterations-refused")).toBeInTheDocument();
  });
});

describe("changing the model", () => {
  test("brings a reservation the new model cannot produce down to its limit", async () => {
    const { onChange } = await show(configured({ output_tokens: 100000 }));
    fireEvent.change(model_picker(), {
      target: { value: "anthropic:claude-sonnet-4" },
    });
    const kernel = written(onChange);
    expect(kernel.output_tokens).toBe(16384);
    expect(kernel_problems(kernel)).toEqual([]);
  });

  test("drops a schema the new model cannot be asked for", async () => {
    const schema = {
      type: "object",
      properties: { answer: { type: "string" } },
      required: ["answer"],
      additionalProperties: false,
    };
    const { onChange } = await show(configured({ json_schema: schema }));
    fireEvent.change(model_picker(), {
      target: { value: "anthropic:claude-sonnet-4" },
    });
    expect(written(onChange).json_schema).toBeNull();
    expect(kernel_problems(written(onChange))).toEqual([]);
  });

  test("keeps the prompt and the turns, which are not the model's", async () => {
    const { onChange } = await show(configured({ max_iterations: 3 }));
    fireEvent.change(model_picker(), {
      target: { value: "anthropic:claude-sonnet-4" },
    });
    expect(written(onChange).prompt).toBe("Answer the question.");
    expect(written(onChange).max_iterations).toBe(3);
  });
});

describe("what the prompt may refer to", () => {
  const bindings = [{ name: "question", value: { node_id: "start", path: [] }, missing: "error" }];

  test("the inputs are named in the syntax the runtime substitutes", async () => {
    await show(configured({}, bindings));
    expect(screen.getByTestId("kernel-prompt-references").textContent).toMatch(
      /\{\{#input\.question#\}\}/,
    );
  });

  test("a node with no inputs says so rather than naming none", async () => {
    await show(configured());
    expect(screen.getByTestId("kernel-prompt-references").textContent).toMatch(
      /binds no input yet/i,
    );
  });

  test("a reference to something unbound is reported as a hole", async () => {
    /* `_render_prompt` replaces an unknown name with the empty string, which
       is exactly what acceptance 4 forbids a missing value from doing. The
       runtime accepts the document, so this is a warning and not a refusal —
       but it is said. */
    await show(configured({ prompt: "Summarise {{#input.missing#}} please." }, bindings));
    expect(screen.getByTestId("kernel-prompt-unbound").textContent).toMatch(
      /replaced with nothing at all/i,
    );
  });

  test("a bound reference is not reported", async () => {
    await show(configured({ prompt: "Summarise {{#input.question#}}." }, bindings));
    expect(screen.queryByTestId("kernel-prompt-unbound")).not.toBeInTheDocument();
  });

  test("the legacy chip syntax is not mistaken for a reference", async () => {
    /* `{{#start.message#}}` is what this repo's chip editor writes, and the
       Kernel does not substitute it at all — it would reach the model
       verbatim. It is not an unbound input, so it is not reported as one;
       naming it would be inventing a rule the runtime does not have. */
    await show(configured({ prompt: "Summarise {{#start.message#}}." }, bindings));
    expect(screen.queryByTestId("kernel-prompt-unbound")).not.toBeInTheDocument();
  });

  test("the reference reader takes the names and nothing else", () => {
    expect(unbound_references("{{#input.a#}} {{#input.b#}}", [{ name: "a" }])).toEqual(["b"]);
    expect(unbound_references("{{#input.a#}}", [{ name: "a" }])).toEqual([]);
    expect(unbound_references("plain text", [])).toEqual([]);
    expect(unbound_references(null, [])).toEqual([]);
    /* A binding whose name is not a string binds nothing, and an unreadable
       binding list is not a reason to crash the panel that would explain it. */
    expect(unbound_references("{{#input.a#}}", [{ name: 7 }, null, "x"])).toEqual(["a"]);
  });
});

describe("a stored kernel the runtime would refuse", () => {
  test("every problem is listed with the path the store would use", async () => {
    await show(configured({ history: "session", overflow: "whenever" }));
    const said = screen.getByTestId("kernel-problems").textContent;
    expect(said).toMatch(/config\.kernel\.history/);
    expect(said).toMatch(/config\.kernel\.overflow/);
  });

  test("a provider contradicting its protocol is reported, though Run accepts it", async () => {
    /* Measured: it passes the format check, the draft diagnostics, the
       execution gate and Run's own preparation. It fails when the Kernel
       binds its adapter, mid-run. */
    await show(configured({ profile: { ...PROFILE, protocol: "anthropic" } }));
    expect(screen.getByTestId("kernel-problems").textContent).toMatch(
      /would fail on its first turn/i,
    );
  });

  test("an unreadable number is named rather than crashing the panel", async () => {
    /* The box shows nothing, because what is stored is not text — and the
       problem beside it says which key and why, which is the part that tells
       the author something. A box that rendered "[object Object]" would be
       the panel inventing an edit. */
    await show(configured({ max_iterations: { many: true } }));
    expect(screen.getByTestId("kernel-problems").textContent).toMatch(
      /config\.kernel\.max_iterations/,
    );
    expect(screen.getAllByPlaceholderText("—")[0].value).toBe("");
  });
});
