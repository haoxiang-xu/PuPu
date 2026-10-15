/* The Kernel Loop's own configuration — the model it runs on, and how.
 *
 * `validate_kernel_config` (`unchain/skeleton/kernel_config.py`) closes an
 * Agent node's `config.kernel` to exactly eight keys, and
 * `agent_preparation.py:29` closes the node's config to exactly
 * `{execution, kernel}`. Both are mirrored here, rule by rule, against the
 * frozen answers in `kernel_config_capture.js` rather than against a reading
 * of the validator.
 *
 * This mirror exists because nothing else tells the author. Measured on the
 * pinned pair (`CAPTURED_KERNEL_REACHABILITY`): an Agent node with no kernel
 * at all is accepted by the format check that `save_draft` runs, draws no
 * draft diagnostic, and passes `validate_skeleton_for_execution` — only
 * `prepare_agent_graph` refuses it, which PuPu reaches when the author
 * presses Run. One case is worse still: a profile whose provider contradicts
 * its protocol passes all four, including Run's preparation, and fails when
 * the Kernel binds its provider adapter — mid-run, after the author was told
 * the Agent was ready.
 *
 * Two things this file does NOT do:
 *   - it does not decide admission. `validate_kernel_config` does, and the
 *     capture is checked against that validator in both directions;
 *   - it does not invent a profile. A profile's endpoint, credential
 *     reference, window and capabilities are facts about a deployment that
 *     only the host can answer, so they are read from the producer
 *     (`kernel_profiles` in `skeleton_resources.js`) and carried unchanged.
 *     The runtime says this itself: "Model/provider resolution stays
 *     host-owned" (`legacy.py`, `materialize_legacy_agent`).
 *
 * Declared gap — `1` and `1.0`. Python's JSON reader produces a float for
 * `1.0` and the runtime refuses it; `JSON.parse` produces the same number as
 * `1`, so this mirror cannot see the difference. Nothing the editor writes
 * can reach that state (`JSON.stringify(1)` is `"1"`), so it is reachable
 * only through an imported or hand-edited file, which then saves here and is
 * refused at Run. The three capture cases that state it are skipped by name
 * in the test rather than quietly passing. */

import { own } from "./document_values";
import { output_schema_problems } from "./output_schema";

export const KERNEL_CONFIG_KEY = "kernel";
export const KERNEL_SCHEMA_VERSION = 1;

/* `:21-23`. Alphabetical, because that is the order missing fields are
   reported in — `_closed_object` walks `sorted(required)`, so an empty kernel
   is answered with `history` and not with `schema_version`. */
export const KERNEL_KEYS = Object.freeze([
  "history",
  "json_schema",
  "max_iterations",
  "output_tokens",
  "overflow",
  "profile",
  "prompt",
  "schema_version",
]);

/* `:24-27`, alphabetical for the same reason. */
export const PROFILE_KEYS = Object.freeze([
  "capabilities",
  "context_window",
  "credential_ref",
  "endpoint",
  "id",
  "model",
  "output_limit",
  "protocol",
  "provider",
]);

/* `:28-29`. The order the runtime checks them in, which is not alphabetical —
   it names the first that is not an exact non-empty string. */
export const PROFILE_TEXT_KEYS = Object.freeze([
  "id",
  "provider",
  "model",
  "protocol",
  "endpoint",
  "credential_ref",
]);

export const CAPABILITY_KEYS = Object.freeze(["files", "images", "json_schema"]);

/* `:31`. */
export const KERNEL_PROTOCOLS = Object.freeze([
  "openai-responses",
  "anthropic",
  "gemini",
  "ollama",
]);

/* `:55` and `:57`. Both read as behaviour, so the labels can too: a Kernel
   either sees the root session history or starts from nothing, and an
   overflowing window either stops or is compressed. */
export const HISTORY_SCOPES = Object.freeze(["root", "none"]);
export const OVERFLOW_POLICIES = Object.freeze(["error", "compress"]);

/* `kernel_profile.py:19-25`, `_NATIVE_PROTOCOLS`. A brand the runtime knows
   must carry its own protocol; a brand it does not know may carry any of the
   four, which is how an endpoint-bound compatible provider is expressed.
   Read with `own`, never indexed — see `transport_problems`. */
export const NATIVE_PROTOCOL_BY_PROVIDER = Object.freeze({
  openai: "openai-responses",
  anthropic: "anthropic",
  gemini: "gemini",
  ollama: "ollama",
  hyperspace: "anthropic",
});

const is_object = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const is_count = (value) =>
  typeof value === "number" && Number.isInteger(value) && value >= 1;

const is_exact_text = (value) =>
  typeof value === "string" && value.trim() !== "" && value === value.trim();

function problem(code, where, message) {
  return { code, where, message };
}

/* The runtime's path, written the way every other problem in this editor
   writes one. */
export function kernel_where(path) {
  return path
    .reduce(
      (text, step) =>
        typeof step === "number" ? `${text}[${step}]` : `${text}.${step}`,
      "",
    )
    .replace(/^\./, "");
}

/* `io.py:_closed_object`. Unknown fields first, in the object's own key order,
   then missing ones in alphabetical order. The runtime raises on the first it
   finds; this reports all of them, because a form with eight fields that
   named one problem at a time would make the author guess how many are left.
   The capture test therefore checks that the runtime's single verdict is
   among these, not that it is the only one. */
function closed(value, path, required, problems) {
  if (!is_object(value)) {
    problems.push(
      problem("invalid_type", kernel_where(path), "value must be an object"),
    );
    return false;
  }
  Object.keys(value).forEach((key) => {
    if (!required.includes(key)) {
      problems.push(
        problem("unknown_field", kernel_where([...path, key]), "unknown field"),
      );
    }
  });
  [...required].sort().forEach((key) => {
    if (!(key in value)) {
      problems.push(
        problem(
          "missing_field",
          kernel_where([...path, key]),
          "required field is missing",
        ),
      );
    }
  });
  return true;
}

/* `:33-39`. The endpoint is where the request actually goes, so the rules are
 * about what a transport can be pointed at: a scheme it speaks, a host to
 * resolve, and nothing smuggled into the parts a provider SDK would drop — a
 * credential in the authority, a query or a fragment. The port has to parse,
 * which is why an impossible one is refused here rather than at connect time.
 *
 * This is `urlsplit`, ported. The first version asked `URL` instead, on the
 * reasoning that its verdicts on the eleven captured cases were `urlsplit`'s —
 * and they were, on those eleven. Measured across 142 addresses, the two
 * parsers disagree on eighteen, and on SEVEN of them `URL` is the more
 * permissive one, so this panel said nothing at all about an address the
 * runtime refuses. None of the seven is exotic: `http://@host/` (Python reads
 * an empty username there, and empty is not None), `http:\\host` and
 * `http:/host` (the WHATWG parser takes both as an authority, `urlsplit`
 * requires `//`). A lookalike parser cannot mirror a rule; only the rule can.
 *
 * So what follows is CPython 3.12's `urlsplit`, `_check_bracketed_netloc`,
 * `_check_bracketed_host`, `_checknetloc` and `SplitResult.port`, in the order
 * the runtime reaches them, with the validator's own five questions asked at
 * the end. Every ValueError any of them raises is the same verdict here,
 * because the runtime catches them all and reports one `invalid_value`.
 *
 * Checked against the real validator on the 142 enumerated addresses in
 * `CAPTURED_ENDPOINTS` and on 4000 mutations of the five this build's producer
 * actually emits: 4142 agreements, nothing in either direction. */

/* `ipaddress.IPv4Address`, whose `_parse_octet` is stricter than it looks:
   exactly four parts, ASCII decimal digits only, at most three of them, no
   leading zero, and at most 255. Reached only by an IPv6 address written with
   an embedded IPv4 tail, `[::ffff:1.2.3.4]`. */
const DIGITS = /^[0-9]+$/;

function ipv4_is_parseable(text) {
  const octets = text.split(".");
  if (octets.length !== 4) return false;
  return octets.every((octet) => {
    if (!DIGITS.test(octet) || octet.length > 3) return false;
    if (octet !== "0" && octet[0] === "0") return false;
    return Number(octet) <= 255;
  });
}

/* `ipaddress.IPv6Address`, including the zone id it accepts — `[::1%eth0]` is
   a real endpoint and the runtime takes it. */
const HEXTET = /^[0-9a-fA-F]{1,4}$/;

function ipv6_is_parseable(text) {
  let address = text;
  const percent = text.indexOf("%");
  if (percent >= 0) {
    const zone = text.slice(percent + 1);
    if (zone === "" || zone.includes("%")) return false;
    address = text.slice(0, percent);
  }
  if (address === "") return false;
  const parts = address.split(":");
  if (parts.length < 3) return false;
  if (parts[parts.length - 1].includes(".")) {
    if (!ipv4_is_parseable(parts.pop())) return false;
    parts.push("0", "0");
  }
  if (parts.length > 9) return false;
  let skipped = null;
  for (let i = 1; i < parts.length - 1; i += 1) {
    if (parts[i] !== "") continue;
    if (skipped !== null) return false;
    skipped = i;
  }
  if (skipped === null) {
    if (parts.length !== 8) return false;
    return parts.every((part) => HEXTET.test(part));
  }
  let above = skipped;
  let below = parts.length - skipped - 1;
  /* A single leading or trailing colon is only permitted as part of `::`. */
  if (parts[0] === "") {
    above -= 1;
    if (above) return false;
  }
  if (parts[parts.length - 1] === "") {
    below -= 1;
    if (below) return false;
  }
  if (8 - (above + below) < 1) return false;
  return [...parts.slice(0, above), ...parts.slice(parts.length - below)].every(
    (part) => HEXTET.test(part),
  );
}

/* `_check_bracketed_host`: an IPvFuture literal, or an address that parses as
   IPv6. An IPv4 in brackets is refused by name there, and refused here by
   failing to be an IPv6 — the same verdict for the same address. */
const IPVFUTURE = /^v[0-9a-fA-F]+\.[\s\S]+$/;

function bracketed_host_is_addressable(host) {
  return host.startsWith("v") ? IPVFUTURE.test(host) : ipv6_is_parseable(host);
}

/* `_check_bracketed_netloc`, which exists to mirror the split `hostname`
   performs: nothing may sit before the bracket, and the only thing that may
   follow the closing one is the port delimiter. */
function bracketed_netloc_is_addressable(netloc) {
  const hostport = netloc.slice(netloc.lastIndexOf("@") + 1);
  const open = hostport.indexOf("[");
  if (open < 0) return true;
  if (open > 0) return false;
  const rest = hostport.slice(1);
  const close = rest.indexOf("]");
  const host = close < 0 ? rest : rest.slice(0, close);
  const tail = close < 0 ? "" : rest.slice(close + 1);
  if (tail && tail[0] !== ":") return false;
  return bracketed_host_is_addressable(host);
}

/* `_checknetloc`: a character that is not `/?#@:` but normalises into one
   under NFKC would be read as a delimiter by IDNA and not by the split above,
   so `http://\u2100/` — `a/c` once normalised — is refused. ASCII is left
   alone, as it is there. */
function netloc_survives_nfkc(netloc) {
  if (!netloc) return true;
  /* eslint-disable-next-line no-control-regex */
  if (!/[^\u0000-\u007f]/.test(netloc)) return true;
  const stripped = netloc.replace(/[@:#?]/g, "");
  const normalized = stripped.normalize("NFKC");
  if (stripped === normalized) return true;
  return !/[/?#@:]/.test(normalized);
}

/* `_splitnetloc`: the authority ends at the first `/`, `?` or `#`. */
function split_authority(url, start) {
  let end = url.length;
  ["/", "?", "#"].forEach((mark) => {
    const at = url.indexOf(mark, start);
    if (at >= 0) end = Math.min(end, at);
  });
  return [url.slice(start, end), url.slice(end)];
}

const SCHEME_CHARS = /^[A-Za-z0-9+\-.]+$/;

export function endpoint_is_addressable(value) {
  if (!is_exact_text(value)) return false;

  /* `urlsplit` strips U+0000 to U+0020 from the front and removes tab, CR and
     LF from anywhere at all, so an address is parsed after that and not
     before — the text rule above has only refused surrounding whitespace. The
     control characters below are that rule, not a mistake in writing it. */
  /* eslint-disable-next-line no-control-regex */
  const unwrapped = value.replace(/^[\u0000-\u0020]+/, "");
  let rest = unwrapped.replace(/[\t\r\n]/g, "");
  let scheme = "";
  let netloc = "";
  const colon = rest.indexOf(":");
  if (
    colon > 0 &&
    /^[A-Za-z]$/.test(rest[0]) &&
    SCHEME_CHARS.test(rest.slice(0, colon))
  ) {
    scheme = rest.slice(0, colon).toLowerCase();
    rest = rest.slice(colon + 1);
  }
  if (rest.slice(0, 2) === "//") {
    [netloc, rest] = split_authority(rest, 2);
    const opens = netloc.includes("[");
    const closes = netloc.includes("]");
    if (opens !== closes) return false;
    if (opens && !bracketed_netloc_is_addressable(netloc)) return false;
  }
  let fragment = "";
  let query = "";
  const hash = rest.indexOf("#");
  if (hash >= 0) {
    fragment = rest.slice(hash + 1);
    rest = rest.slice(0, hash);
  }
  const mark = rest.indexOf("?");
  if (mark >= 0) {
    query = rest.slice(mark + 1);
    rest = rest.slice(0, mark);
  }
  if (!netloc_survives_nfkc(netloc)) return false;

  if (scheme !== "http" && scheme !== "https") return false;
  /* `username` is not None for any authority holding an `@`, even
     `http://@host/`, where it is the empty string. The runtime asks whether it
     is None, so one `@` is the whole answer. */
  if (netloc.includes("@")) return false;
  if (query || fragment) return false;

  const bracket = netloc.indexOf("[");
  let hostname = "";
  let port = "";
  if (bracket >= 0) {
    const inside = netloc.slice(bracket + 1);
    hostname = inside.split("]")[0];
    const tail = inside.slice(hostname.length + 1);
    port = tail.includes(":") ? tail.slice(tail.indexOf(":") + 1) : "";
  } else {
    const divide = netloc.indexOf(":");
    hostname = divide >= 0 ? netloc.slice(0, divide) : netloc;
    port = divide >= 0 ? netloc.slice(divide + 1) : "";
  }
  if (!hostname) return false;
  /* An absent port is None and asked nothing; `http://h:/` really is accepted
     by the runtime, because an empty one reads as absent. */
  if (port === "") return true;
  if (!DIGITS.test(port)) return false;
  return Number(port) <= 65535;
}

/* `:17-19` reports every one of these as the same code at the same path, so
   the message is the only thing that distinguishes them. */
function reject(problems, code, path, message) {
  problems.push(problem(code, kernel_where(path), message));
}

export function profile_problems(profile, base) {
  const problems = [];
  const path = [...base];
  if (!closed(profile, path, PROFILE_KEYS, problems)) return problems;

  PROFILE_TEXT_KEYS.forEach((key) => {
    if (!(key in profile)) return;
    if (!is_exact_text(profile[key])) {
      reject(
        problems,
        "invalid_value",
        [...path, key],
        `${key} must be an exact non-empty string`,
      );
    }
  });

  /* `:31`. An unknown protocol is `unsupported_capability` and not an unknown
     variant: the runtime cannot speak it, which is a statement about this
     build rather than about the document being malformed. An empty one is
     already reported above, and the runtime stops there too. */
  if (
    is_exact_text(profile.protocol) &&
    !KERNEL_PROTOCOLS.includes(profile.protocol)
  ) {
    reject(
      problems,
      "unsupported_capability",
      [...path, "protocol"],
      "this build speaks openai-responses, anthropic, gemini and ollama",
    );
  }

  if (is_exact_text(profile.endpoint) && !endpoint_is_addressable(profile.endpoint)) {
    reject(
      problems,
      "invalid_value",
      [...path, "endpoint"],
      "endpoint must be an http or https address with no credentials, query or fragment",
    );
  }

  ["context_window", "output_limit"].forEach((key) => {
    if (!(key in profile)) return;
    if (!is_count(profile[key])) {
      reject(
        problems,
        "invalid_value",
        [...path, key],
        `${key} must be a whole number of tokens`,
      );
    }
  });

  /* `:41-43`. A flag that is not a boolean is reported on the capabilities
     object and not on the flag, because the check is one pass over its
     values — so this names the object too, rather than being more precise
     than the thing it mirrors. A flag that is absent is already reported as a
     missing field, and is not reported a second time as an unreadable one. */
  if ("capabilities" in profile) {
    const capabilities = profile.capabilities;
    const readable = closed(
      capabilities,
      [...path, "capabilities"],
      CAPABILITY_KEYS,
      problems,
    );
    const stated = readable
      ? CAPABILITY_KEYS.filter((key) => key in capabilities)
      : [];
    if (stated.some((key) => typeof capabilities[key] !== "boolean")) {
      reject(
        problems,
        "invalid_type",
        [...path, "capabilities"],
        "every capability must be stated as true or false",
      );
    }
  }

  return problems;
}

/* The rule `validate_kernel_config` does not have.
 *
 * `kernel_profile._transport_for` raises a bare `ValueError` when a brand the
 * runtime knows carries another brand's protocol — openai with anthropic, or
 * anthropic with openai-responses. It has no error code, because it is not a
 * document problem to the runtime; it happens when the Kernel binds its
 * adapter, which is during the run. Measured: such a profile passes the
 * format check, the draft diagnostics, the execution gate AND Run's
 * preparation.
 *
 * So the code below is this editor's own, not the runtime's, and is named as
 * such wherever it is shown. */
export const PROVIDER_PROTOCOL_CONFLICT = "provider_protocol_conflict";

export function transport_problems(profile, base) {
  if (!is_object(profile)) return [];
  const { provider, protocol } = profile;
  if (!is_exact_text(provider) || !is_exact_text(protocol)) return [];
  /* Read, not indexed. `_NATIVE_PROTOCOLS.get(brand)` answers None for a
     brand it does not hold, and indexing a JS object answers with the
     prototype's — so `__proto__` was answered with an object and
     `constructor` with a function, and this reported a contradiction for two
     provider names the runtime has no rule for at all. Those two are exactly
     the Object.prototype members that survive `toLowerCase`, which is why
     `toString` and the rest never showed it. The rule, and the reason four
     copies of it is how the defect kept returning, are in `own`. */
  const expected = own(NATIVE_PROTOCOL_BY_PROVIDER, provider.toLowerCase());
  if (expected === undefined || expected === protocol) return [];
  return [
    problem(
      PROVIDER_PROTOCOL_CONFLICT,
      kernel_where([...base, "protocol"]),
      `${provider} is reached over ${expected}, so this Kernel would fail on its first turn`,
    ),
  ];
}

/* Exactly what `validate_kernel_config` would refuse, in its order, and
 * nothing more — this is the half that the capture checks in both directions,
 * so it may not carry a rule the validator does not have.
 *
 * `base` addresses the kernel itself, so the capture's own paths come out of
 * it unchanged; the panel passes the node's path instead. A problem inside
 * `json_schema` keeps the root the runtime gives it — `validate_output_schema`
 * reports under `schema`, not under `kernel.json_schema` — because that is
 * the path the author would see in a store refusal. */
export function kernel_admission_problems(kernel, base = [KERNEL_CONFIG_KEY]) {
  const problems = [];
  const path = [...base];
  if (!closed(kernel, path, KERNEL_KEYS, problems)) return problems;

  if (
    "schema_version" in kernel &&
    kernel.schema_version !== KERNEL_SCHEMA_VERSION
  ) {
    reject(
      problems,
      "unknown_variant",
      [...path, "schema_version"],
      "this build writes and reads version one",
    );
  }

  if ("profile" in kernel) {
    problems.push(...profile_problems(kernel.profile, [...path, "profile"]));
  }

  ["max_iterations", "output_tokens"].forEach((key) => {
    if (!(key in kernel)) return;
    if (!is_count(kernel[key])) {
      reject(
        problems,
        "invalid_value",
        [...path, key],
        `${key} must be a whole number of one or more`,
      );
    }
  });

  /* `:48-49`. The reservation is checked against the profile's own numbers, so
     it is only answerable once both are readable — and it is strictly below
     the window, not equal to it, because a turn with no room for input is not
     a turn. */
  const profile = kernel.profile;
  if (is_count(kernel.output_tokens) && is_object(profile)) {
    const over_limit =
      is_count(profile.output_limit) && kernel.output_tokens > profile.output_limit;
    const fills_window =
      is_count(profile.context_window) &&
      kernel.output_tokens >= profile.context_window;
    if (over_limit || fills_window) {
      reject(
        problems,
        "invalid_value",
        [...path, "output_tokens"],
        over_limit
          ? "the reply reservation is larger than this model's output limit"
          : "the reply reservation leaves no room in the context window",
      );
    }
  }

  if ("prompt" in kernel && typeof kernel.prompt !== "string") {
    reject(problems, "invalid_type", [...path, "prompt"], "prompt must be text");
  }

  if ("history" in kernel && !HISTORY_SCOPES.includes(kernel.history)) {
    reject(
      problems,
      "unknown_variant",
      [...path, "history"],
      "history is either the root session or nothing",
    );
  }

  if ("overflow" in kernel && !OVERFLOW_POLICIES.includes(kernel.overflow)) {
    reject(
      problems,
      "unknown_variant",
      [...path, "overflow"],
      "an overflowing window either stops the run or is compressed",
    );
  }

  /* `:58-62`. The capability gate comes before the schema itself: a model that
     cannot be asked for JSON makes the schema moot, and this is the rule
     acceptance 5 turns on — the node says so and stays unavailable rather than
     falling back to text. */
  if ("json_schema" in kernel && kernel.json_schema !== null) {
    const capabilities = is_object(profile) ? profile.capabilities : null;
    const allowed = is_object(capabilities)
      ? capabilities.json_schema === true
      : false;
    if (!allowed) {
      reject(
        problems,
        "unsupported_capability",
        [...path, "json_schema"],
        "this model cannot be asked for structured output",
      );
    } else {
      problems.push(...output_schema_problems(kernel.json_schema));
    }
  }

  return problems;
}

/* Everything that will refuse this Kernel at any boundary, which is what the
 * panel has to say: the validator's rules, plus the one rule that lives past
 * them. Keeping them in separate functions is not tidiness — the capture can
 * only check a mirror of the validator against the validator, and a mirror
 * that quietly carried an extra rule would have to be excused case by case,
 * which is how a mirror stops being evidence. */
export function kernel_problems(kernel, base = [KERNEL_CONFIG_KEY]) {
  const problems = kernel_admission_problems(kernel, base);
  if (!is_object(kernel)) return problems;
  return [
    ...problems,
    ...transport_problems(kernel.profile, [...base, "profile"]),
  ];
}

export function kernel_is_configured(kernel) {
  return is_object(kernel) && kernel_problems(kernel).length === 0;
}

/* Not a runtime rule: the runtime takes any whole number of one or more. This
   is the number of turns an Agent is allowed to take before PuPu stops it,
   and it has to start somewhere the author can see and change. */
export const DEFAULT_MAX_ITERATIONS = 12;

/* What the editor writes when the author picks a model.
 *
 * Every field the author has not been asked about yet has to be SOME value,
 * because the runtime closes the object — there is no partial kernel it would
 * keep. So the defaults are chosen to be the ones that do nothing surprising:
 * the Kernel sees the root session history, which is what §11 settles as the
 * default; an overflowing window stops the run rather than silently dropping
 * what the author wrote; and the reply reservation is the model's own output
 * limit, so nothing is capped below what the model can do until the author
 * says otherwise. `json_schema` is null, which is "plain text", and is the
 * only state acceptance 5 allows for a model that cannot be asked for JSON. */
export function new_kernel_config(profile, { prompt = "" } = {}) {
  if (!is_object(profile)) return null;
  const limit = is_count(profile.output_limit) ? profile.output_limit : 1;
  const window = is_count(profile.context_window) ? profile.context_window : 1;
  return {
    schema_version: KERNEL_SCHEMA_VERSION,
    profile,
    prompt,
    max_iterations: DEFAULT_MAX_ITERATIONS,
    output_tokens: Math.max(1, Math.min(limit, window - 1)),
    history: "root",
    overflow: "error",
    json_schema: null,
  };
}

/* Replacing the model is replacing the profile, and the reservation belongs to
   the old one: a number inside the previous model's limit can be outside the
   new one's, and leaving it there writes a kernel the runtime refuses at Run.
   So it is carried when it still fits and brought down to the new model's
   limit when it does not — which is a change the panel states, rather than
   one the author discovers. */
export function with_kernel_profile(kernel, profile) {
  if (!is_object(kernel) || !is_object(profile)) return kernel;
  const limit = is_count(profile.output_limit) ? profile.output_limit : 1;
  const window = is_count(profile.context_window) ? profile.context_window : 1;
  const ceiling = Math.max(1, Math.min(limit, window - 1));
  const reserved = is_count(kernel.output_tokens)
    ? Math.min(kernel.output_tokens, ceiling)
    : ceiling;
  const capabilities = is_object(profile.capabilities) ? profile.capabilities : {};
  return {
    ...kernel,
    profile,
    output_tokens: reserved,
    /* A schema the new model cannot be asked for is not kept as a draft: the
       kernel would be refused at Run, and the author chose the model. The
       panel says the schema was dropped. */
    json_schema: capabilities.json_schema === true ? kernel.json_schema : null,
  };
}

export function reservation_ceiling(profile) {
  if (!is_object(profile)) return 1;
  const limit = is_count(profile.output_limit) ? profile.output_limit : 1;
  const window = is_count(profile.context_window) ? profile.context_window : 1;
  return Math.max(1, Math.min(limit, window - 1));
}
