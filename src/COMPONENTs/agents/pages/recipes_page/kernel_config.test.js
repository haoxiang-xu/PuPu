import {
  CAPTURED_KERNEL_ADMISSION,
  CAPTURED_KERNEL_REACHABILITY,
} from "./kernel_config_capture";
import { CAPTURED_KERNEL_CATALOG } from "./kernel_profile_catalog_capture";
import {
  DEFAULT_MAX_ITERATIONS,
  kernel_admission_problems,
  KERNEL_PROTOCOLS,
  NATIVE_PROTOCOL_BY_PROVIDER,
  PROVIDER_PROTOCOL_CONFLICT,
  kernel_problems,
  kernel_is_configured,
  new_kernel_config,
  reservation_ceiling,
  with_kernel_profile,
} from "./kernel_config";

/* The one case JSON cannot carry across: Python's reader distinguishes `1.0`
   from `1` and refuses it, `JSON.parse` does not. Declared in
   `kernel_config.js`; named here so it is skipped on purpose and not by
   coincidence. */
const UNREACHABLE_IN_JS = ["schema_version is a float"];

const where_of = (path) =>
  path
    .reduce(
      (text, step) =>
        typeof step === "number" ? `${text}[${step}]` : `${text}.${step}`,
      "",
    )
    .replace(/^\./, "");

describe("the Kernel Loop configuration, against the real validator", () => {
  /* `kernel_admission_problems` and not `kernel_problems`: the capture is
     `validate_kernel_config`'s own answers, and the panel's verdict carries
     one more rule than the validator has. Checking the wrong one of the two
     here would mean excusing four cases by name — and a mirror with excused
     cases is no longer evidence about anything. */
  const cases = CAPTURED_KERNEL_ADMISSION.filter(
    (entry) => !UNREACHABLE_IN_JS.includes(entry.label),
  );

  test("the capture is the enumerated case set, not a sample", () => {
    expect(CAPTURED_KERNEL_ADMISSION.length).toBe(139);
    expect(cases.filter((entry) => entry.accepted).length).toBeGreaterThan(15);
  });

  cases
    .filter((entry) => entry.accepted)
    .forEach((entry) => {
      test(`accepted: ${entry.label}`, () => {
        expect(kernel_admission_problems(entry.kernel)).toEqual([]);
      });
    });

  cases
    .filter((entry) => !entry.accepted)
    .forEach((entry) => {
      test(`refused: ${entry.label}`, () => {
        const problems = kernel_admission_problems(entry.kernel);
        expect(problems.length).toBeGreaterThan(0);
        /* The runtime stops at its first problem while the mirror reports
           every one it can see, so the check is that the runtime's verdict is
           among them — same code, same path. */
        expect(
          problems.map((item) => `${item.code} @ ${item.where}`),
        ).toContain(`${entry.code} @ ${where_of(entry.path)}`);
      });
    });

  test("every case the mirror refuses, the runtime refuses too", () => {
    const disagreed = cases.filter(
      (entry) => entry.accepted && kernel_admission_problems(entry.kernel).length > 0,
    );
    expect(disagreed.map((entry) => entry.label)).toEqual([]);
  });
});

describe("which boundary refuses an unconfigured Kernel", () => {
  const row = (label) =>
    CAPTURED_KERNEL_REACHABILITY.find((entry) => entry.label === label);

  test("nothing before Run says anything at all", () => {
    /* Not an assertion about this mirror: an assertion about the frozen
       answers, so that the day a boundary starts refusing one of these, this
       test is what notices. */
    CAPTURED_KERNEL_REACHABILITY.forEach((entry) => {
      expect(entry.format).toBeNull();
      expect(entry.draft).toEqual([]);
      expect(entry.preflight_structure).toBeNull();
    });
  });

  test("so the mirror refuses everything Run's preparation refuses", () => {
    const refused = CAPTURED_KERNEL_REACHABILITY.filter(
      (entry) => entry.prepare !== null && entry.kernel !== undefined,
    );
    expect(refused.length).toBeGreaterThan(3);
    refused.forEach((entry) => {
      expect(kernel_problems(entry.kernel).length).toBeGreaterThan(0);
    });
  });

  test("an Agent node with no kernel is refused by Run alone", () => {
    const entry = row("an Agent node with no kernel at all");
    expect(entry.kernel).toBeUndefined();
    expect(entry.prepare.code).toBe("invalid_shape");
    expect(kernel_is_configured(undefined)).toBe(false);
  });

  test("a provider contradicting its protocol passes Run and fails mid-run", () => {
    const entry = row("a provider that contradicts its protocol");
    expect(entry.prepare).toBeNull();
    expect(entry.transport.raised).toBe("ValueError");
    const problems = kernel_problems(entry.kernel);
    expect(problems.map((item) => item.code)).toContain(
      PROVIDER_PROTOCOL_CONFLICT,
    );
  });

  test("a configured Kernel is accepted everywhere, including here", () => {
    const entry = row("a configured Kernel");
    expect(entry.prepare).toBeNull();
    expect(entry.transport).toBeNull();
    expect(kernel_problems(entry.kernel)).toEqual([]);
  });
});

describe("the transport rule the validator does not have", () => {
  const profile = (over) => ({
    id: "p",
    provider: "openai",
    model: "m",
    protocol: "openai-responses",
    endpoint: "https://api.openai.com/v1",
    credential_ref: "openai",
    context_window: 100000,
    output_limit: 8192,
    capabilities: { json_schema: true, images: true, files: true },
    ...over,
  });
  const kernel = (over) => ({
    schema_version: 1,
    profile: profile(over),
    prompt: "",
    max_iterations: 4,
    output_tokens: 1024,
    history: "root",
    overflow: "error",
    json_schema: null,
  });

  KERNEL_PROTOCOLS.forEach((protocol) => {
    test(`an unknown brand may be reached over ${protocol}`, () => {
      expect(
        kernel_problems(kernel({ provider: "my-llm", protocol })),
      ).toEqual([]);
    });
  });

  Object.entries(NATIVE_PROTOCOL_BY_PROVIDER).forEach(([provider, expected]) => {
    test(`${provider} must be reached over ${expected}`, () => {
      expect(kernel_problems(kernel({ provider, protocol: expected }))).toEqual([]);
      const wrong = KERNEL_PROTOCOLS.find((item) => item !== expected);
      const problems = kernel_problems(kernel({ provider, protocol: wrong }));
      expect(problems.map((item) => item.code)).toContain(
        PROVIDER_PROTOCOL_CONFLICT,
      );
    });
  });
});

describe("what the editor writes when a model is picked", () => {
  const profile = {
    id: "openai:gpt-6-sol",
    provider: "openai",
    model: "gpt-6-sol",
    protocol: "openai-responses",
    endpoint: "https://api.openai.com/v1",
    credential_ref: "openai",
    context_window: 1050000,
    output_limit: 128000,
    capabilities: { json_schema: true, images: true, files: true },
  };

  test("the kernel it writes is one the runtime accepts", () => {
    const kernel = new_kernel_config(profile);
    expect(kernel_problems(kernel)).toEqual([]);
    expect(kernel.max_iterations).toBe(DEFAULT_MAX_ITERATIONS);
    expect(kernel.history).toBe("root");
    expect(kernel.overflow).toBe("error");
    expect(kernel.json_schema).toBeNull();
    expect(kernel.prompt).toBe("");
  });

  test("the reservation starts at what the model can actually produce", () => {
    expect(new_kernel_config(profile).output_tokens).toBe(128000);
  });

  test("a model whose window is smaller than its output limit still fits", () => {
    /* Not hypothetical: the reservation has to be strictly below the window,
       so a model declaring the same number for both would otherwise be
       written as a kernel the runtime refuses. */
    const narrow = { ...profile, context_window: 4096, output_limit: 4096 };
    const kernel = new_kernel_config(narrow);
    expect(kernel.output_tokens).toBe(4095);
    expect(kernel_problems(kernel)).toEqual([]);
    expect(reservation_ceiling(narrow)).toBe(4095);
  });

  test("replacing the model brings an oversized reservation down", () => {
    const kernel = new_kernel_config(profile);
    const smaller = {
      ...profile,
      id: "anthropic:claude-sonnet-4",
      provider: "anthropic",
      model: "claude-sonnet-4",
      protocol: "anthropic",
      endpoint: "https://api.anthropic.com",
      credential_ref: "anthropic",
      context_window: 200000,
      output_limit: 16384,
    };
    const moved = with_kernel_profile(kernel, smaller);
    expect(moved.output_tokens).toBe(16384);
    expect(kernel_problems(moved)).toEqual([]);
  });

  test("a reservation that still fits is kept exactly", () => {
    const kernel = { ...new_kernel_config(profile), output_tokens: 2048 };
    const moved = with_kernel_profile(kernel, {
      ...profile,
      id: "other",
      output_limit: 16384,
    });
    expect(moved.output_tokens).toBe(2048);
  });

  test("a schema the new model cannot be asked for is dropped, not left to fail", () => {
    const schema = {
      type: "object",
      properties: { a: { type: "string" } },
      required: ["a"],
      additionalProperties: false,
    };
    const kernel = { ...new_kernel_config(profile), json_schema: schema };
    expect(kernel_problems(kernel)).toEqual([]);
    const plain = with_kernel_profile(kernel, {
      ...profile,
      id: "plain",
      capabilities: { json_schema: false, images: true, files: true },
    });
    expect(plain.json_schema).toBeNull();
    expect(kernel_problems(plain)).toEqual([]);
  });
});


describe("the producer's own profiles, through this editor's rules", () => {
  /* The check neither side can make alone. The producer admits every profile
     it offers with the runtime's `validate_kernel_config`; here the same
     bytes — captured from the route, after JSON — go through the mirror. Both
     sides passing their own fixtures would prove only that they agree with
     themselves. */
  const { profiles, unavailable } = CAPTURED_KERNEL_CATALOG;

  const kernel_for = (profile) => ({
    schema_version: 1,
    profile,
    prompt: "",
    max_iterations: DEFAULT_MAX_ITERATIONS,
    output_tokens: 1,
    history: "root",
    overflow: "error",
    json_schema: null,
  });

  test("the catalog is the real one and not an empty stand-in", () => {
    expect(profiles.length).toBe(19);
    expect(unavailable.length).toBe(12);
  });

  profiles.forEach((profile) => {
    test(`admitted: ${profile.id}`, () => {
      expect(kernel_problems(kernel_for(profile))).toEqual([]);
    });
  });

  test("what the editor would write for each is admissible too", () => {
    /* Including the reservation it picks: the ceiling is derived from the
       profile's own numbers, and a model whose window and limit are the same
       number is the case that catches a reservation written at the limit. */
    profiles.forEach((profile) => {
      const kernel = new_kernel_config(profile);
      expect(kernel_problems(kernel)).toEqual([]);
      expect(kernel.output_tokens).toBeLessThan(profile.context_window);
      expect(kernel.output_tokens).toBeLessThanOrEqual(profile.output_limit);
    });
  });

  test("every profile survived JSON as whole numbers", () => {
    profiles.forEach((profile) => {
      expect(Number.isInteger(profile.context_window)).toBe(true);
      expect(Number.isInteger(profile.output_limit)).toBe(true);
    });
  });

  test("structured output is offered on every protocol this wheel exposes", () => {
    /* Anthropic included, whose capability file says the chat path's own
       ResponseFormat adapter is not native. The Kernel sends `output_config`
       instead, so denying it here would deny a capability this runtime has. */
    const by_protocol = {};
    profiles.forEach((profile) => {
      by_protocol[profile.protocol] = by_protocol[profile.protocol] || [];
      by_protocol[profile.protocol].push(profile.capabilities.json_schema);
    });
    expect(Object.keys(by_protocol).sort()).toEqual([
      "anthropic",
      "gemini",
      "openai-responses",
    ]);
    Object.values(by_protocol).forEach((flags) => {
      expect(flags.every((flag) => flag === true)).toBe(true);
    });
  });

  test("a model is withheld with a reason rather than silently", () => {
    unavailable.forEach((entry) => {
      expect(typeof entry.reason).toBe("string");
      expect(entry.reason.length).toBeGreaterThan(0);
      expect(typeof entry.id).toBe("string");
    });
    expect([...new Set(unavailable.map((entry) => entry.reason))]).toEqual([
      "output_limit_unknown",
    ]);
  });

  test("nothing is offered and withheld at once", () => {
    const offered = new Set(profiles.map((profile) => profile.id));
    unavailable.forEach((entry) => expect(offered.has(entry.id)).toBe(false));
  });
});
