import {
  CAPTURED_ENDPOINTS,
  CAPTURED_KERNEL_ADMISSION,
  CAPTURED_KERNEL_REACHABILITY,
  CAPTURED_PROVIDER_TRANSPORTS,
  CAPTURED_PYTHON_SPACE,
  CAPTURED_TEXT_FIELDS,
} from "./kernel_config_capture";
import { CAPTURED_KERNEL_CATALOG } from "./kernel_profile_catalog_capture";
import {
  DEFAULT_MAX_ITERATIONS,
  endpoint_is_addressable,
  kernel_admission_problems,
  python_strip,
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


describe("the endpoint, address by address", () => {
  const profile = (endpoint) => ({
    id: "p",
    provider: "openai",
    model: "gpt-4.1",
    protocol: "openai-responses",
    endpoint,
    credential_ref: "c",
    context_window: 100000,
    output_limit: 4096,
    capabilities: { json_schema: true, images: true, files: false },
  });
  const kernel = (endpoint) => ({
    schema_version: 1,
    profile: profile(endpoint),
    prompt: "",
    max_iterations: 1,
    output_tokens: 1,
    history: "root",
    overflow: "error",
    json_schema: null,
  });

  test("the capture is a shape enumeration and not a list of good addresses", () => {
    expect(CAPTURED_ENDPOINTS.length).toBeGreaterThanOrEqual(140);
    const accepted = CAPTURED_ENDPOINTS.filter((entry) => entry.accepted);
    expect(accepted.length).toBeGreaterThan(40);
    expect(CAPTURED_ENDPOINTS.length - accepted.length).toBeGreaterThan(40);
    /* Every address this build's producer actually emits is in it, so the
       corpus cannot drift into describing only the exotic. */
    [
      "https://api.openai.com/v1",
      "https://api.anthropic.com",
      "https://generativelanguage.googleapis.com",
      "http://127.0.0.1:11434",
      "http://localhost:11434",
    ].forEach((endpoint) => {
      const row = CAPTURED_ENDPOINTS.find((entry) => entry.endpoint === endpoint);
      expect(row).toBeDefined();
      expect(row.accepted).toBe(true);
    });
  });

  CAPTURED_ENDPOINTS.forEach((entry) => {
    test(`${entry.accepted ? "addressable" : "refused"}: ${JSON.stringify(
      entry.endpoint,
    )}`, () => {
      expect(endpoint_is_addressable(entry.endpoint)).toBe(entry.accepted);
    });
  });

  test("the whole kernel answers the same way, at the runtime's own path", () => {
    /* One problem, with the runtime's own code and path. The wording is this
       editor's, and there are two of them for this path — the runtime reports
       `invalid_value` on `endpoint` both for text that is not exact and for
       an address it cannot be pointed at — so the message is checked for
       being one of the two rather than for being a particular one. */
    const said = new Set();
    CAPTURED_ENDPOINTS.forEach((entry) => {
      const problems = kernel_admission_problems(kernel(entry.endpoint));
      if (entry.accepted) {
        expect(problems).toEqual([]);
        return;
      }
      expect(problems.map((item) => [item.code, item.where])).toEqual([
        ["invalid_value", "kernel.profile.endpoint"],
      ]);
      said.add(problems[0].message);
    });
    /* And both wordings are reached, so neither is dead. */
    expect([...said].sort()).toEqual([
      "endpoint must be an exact non-empty string",
      "endpoint must be an http or https address with no credentials, query or fragment",
    ]);
  });

  /* The seven the previous mirror passed in silence. Named, because a corpus
     that happened to stop covering them would still be 135 green cases. */
  [
    "http://@host/",
    "https://@api.openai.com/v1",
    "http:\\\\host/",
    "http:\\\\\\\\host/",
    "https:\\\\api.openai.com\\v1",
    "http:/host/",
    "http:host/",
  ].forEach((endpoint) => {
    test(`still refused: ${JSON.stringify(endpoint)}`, () => {
      const row = CAPTURED_ENDPOINTS.find((entry) => entry.endpoint === endpoint);
      expect(row).toBeDefined();
      expect(row.accepted).toBe(false);
      expect(endpoint_is_addressable(endpoint)).toBe(false);
    });
  });

  test("an empty port reads as no port, which the runtime accepts", () => {
    expect(endpoint_is_addressable("http://h:/")).toBe(true);
    expect(endpoint_is_addressable("http://h:65535/")).toBe(true);
    expect(endpoint_is_addressable("http://h:65536/")).toBe(false);
  });

  test("a bracketed host is read as the runtime reads it", () => {
    expect(endpoint_is_addressable("http://[::1]:11434/")).toBe(true);
    expect(endpoint_is_addressable("http://[::1%eth0]/")).toBe(true);
    expect(endpoint_is_addressable("http://[1.2.3.4]/")).toBe(false);
    expect(endpoint_is_addressable("http://[::1]x/")).toBe(false);
  });
});

describe("a provider name the runtime has no rule for", () => {
  const kernel = (provider, protocol) => ({
    schema_version: 1,
    profile: {
      id: "p",
      provider,
      model: "m",
      protocol,
      endpoint: "https://example.test/v1",
      credential_ref: "c",
      context_window: 100000,
      output_limit: 4096,
      capabilities: { json_schema: true, images: false, files: false },
    },
    prompt: "",
    max_iterations: 1,
    output_tokens: 1,
    history: "root",
    overflow: "error",
    json_schema: null,
  });

  test("the capture holds both halves, so neither direction is untested", () => {
    expect(CAPTURED_PROVIDER_TRANSPORTS.filter((row) => row.bound).length).toBeGreaterThan(8);
    expect(CAPTURED_PROVIDER_TRANSPORTS.filter((row) => !row.bound).length).toBeGreaterThan(4);
  });

  CAPTURED_PROVIDER_TRANSPORTS.forEach((row) => {
    test(`${row.provider} over ${row.protocol} ${
      row.bound ? "binds" : "contradicts itself"
    }`, () => {
      const problems = kernel_problems(kernel(row.provider, row.protocol));
      const conflicts = problems.filter(
        (problem) => problem.code === PROVIDER_PROTOCOL_CONFLICT,
      );
      expect(conflicts.length).toBe(row.bound ? 0 : 1);
      /* Whatever the verdict, nothing else may be wrong with the kernel —
         otherwise this would be measuring some other rule. */
      expect(problems.length).toBe(conflicts.length);
    });
  });

  /* The reported defect, by name. `__proto__` and `constructor` are the only
     two Object.prototype members that survive `toLowerCase`, so they were the
     only two provider names this editor invented a contradiction for. */
  ["__proto__", "constructor"].forEach((provider) => {
    KERNEL_PROTOCOLS.forEach((protocol) => {
      test(`${provider} may be reached over ${protocol}`, () => {
        expect(kernel_problems(kernel(provider, protocol))).toEqual([]);
      });
    });
  });

  test("the validator's own half never carries the pair rule", () => {
    expect(
      kernel_admission_problems(kernel("openai", "anthropic")),
    ).toEqual([]);
  });
});


describe("the whitespace the runtime strips, and the whitespace JavaScript does", () => {
  /* The residual from the last round: the structure of `urlsplit` was ported
     and its STRING rule was not, so the mirror still disagreed with the
     runtime on six characters — and `trim()` looked close enough to hide it
     for a whole round. */
  test("the mirror strips exactly the code points the interpreter does", () => {
    const measured = new Set(CAPTURED_PYTHON_SPACE);
    const mine = [];
    for (let cp = 0; cp <= 0x10ffff; cp += 1) {
      /* Lone surrogates cannot be a character on their own in either
         language, and `String.fromCodePoint` would make one here. */
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      if (python_strip(String.fromCodePoint(cp)) === "") mine.push(cp);
    }
    expect(mine).toEqual([...measured].sort((a, b) => a - b));
  });

  test("the five JavaScript would have kept are stripped", () => {
    [0x001c, 0x001d, 0x001e, 0x001f, 0x0085].forEach((cp) => {
      const space = String.fromCodePoint(cp);
      expect(CAPTURED_PYTHON_SPACE).toContain(cp);
      expect(space.trim()).toBe(space);
      expect(python_strip(space)).toBe("");
      expect(endpoint_is_addressable(`${space}https://a/`)).toBe(false);
      expect(endpoint_is_addressable(`https://a/${space}`)).toBe(false);
    });
  });

  test("the one JavaScript would have stripped is kept", () => {
    /* A byte order mark is not whitespace to Python, so an address wearing
       one is exact text — and is then an ordinary address the runtime takes.
       `trim()` removed it, and this mirror refused an address Run accepts. */
    expect(CAPTURED_PYTHON_SPACE).not.toContain(0xfeff);
    expect("﻿".trim()).toBe("");
    expect(python_strip("﻿")).toBe("﻿");
    expect(endpoint_is_addressable("https://a/﻿")).toBe(true);
  });

  test("a leading byte order mark is refused, for want of a scheme", () => {
    /* Not by the text rule — by `urlsplit`, which does not strip it either
       and then finds no scheme. The verdict is the same; the reason is not,
       and the capture is what says which. */
    expect(endpoint_is_addressable("﻿https://a/")).toBe(false);
  });

  test("a port with more digits than CPython will convert is refused", () => {
    const zeros = (count) => `http://h:${"0".repeat(count)}80`;
    expect(endpoint_is_addressable(zeros(4298))).toBe(true);
    expect(endpoint_is_addressable(zeros(4400))).toBe(false);
    expect(endpoint_is_addressable(`http://h:${"9".repeat(4301)}`)).toBe(false);
  });

  CAPTURED_TEXT_FIELDS.forEach((entry) => {
    test(`${entry.key} with ${entry.label} is ${
      entry.accepted ? "accepted" : "refused"
    }`, () => {
      const profile = {
        id: "p",
        provider: "openai",
        model: "m",
        protocol: "openai-responses",
        endpoint: "https://a/",
        credential_ref: "c",
        context_window: 100000,
        output_limit: 4096,
        capabilities: { json_schema: true, images: true, files: false },
        [entry.key]: entry.value,
      };
      const problems = kernel_admission_problems({
        schema_version: 1,
        profile,
        prompt: "",
        max_iterations: 1,
        output_tokens: 1,
        history: "root",
        overflow: "error",
        json_schema: null,
      });
      if (entry.accepted) {
        expect(problems).toEqual([]);
        return;
      }
      expect(problems.map((item) => [item.code, item.where])).toContainEqual([
        entry.code,
        `kernel.${entry.path.slice(1).join(".")}`,
      ]);
    });
  });
});
