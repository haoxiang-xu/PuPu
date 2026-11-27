/* The documents the builder emits, as one case set both sides can be checked
 * against.
 *
 * They are composed with the real builder functions rather than written out by
 * hand, so this is the producer's own output. When the Skeleton runtime ships a
 * pinned build artifact, the paired contract test emits these to a file and the
 * strict consumer reads them back — the shape `shipped_provider_wire_contract`
 * already uses in this repo — instead of the two sides sharing one loose
 * fixture and proving each other right.
 *
 * Verified against `unchain.skeleton.resolve_inputs` / `map_outputs` on
 * 2026-09-27: 18 of 18 verdicts agreed. That run used an unpinned working tree,
 * so it is evidence of agreement on that day, not the contract test itself. */

import {
  first_present_expression,
  literal_expression,
  make_binding,
  make_output_mapping,
  ref_expression,
  with_missing_policy,
} from "./skeleton_io";

const ref = ref_expression("start", ["text"]);
const absent = ref_expression("start", ["absent"]);

export const BINDING_CASES = Object.freeze([
  { label: "a present value", accepted: true, doc: [make_binding({ name: "topic", value: ref, missing: "error" })] },
  {
    label: "an explicit null under the fail policy",
    accepted: true,
    /* The policy is about absence: a resolved null is a value and passes. */
    doc: [make_binding({ name: "topic", value: literal_expression(null), missing: "error" })],
  },
  { label: "an absent value under the null policy", accepted: true, doc: [make_binding({ name: "topic", value: absent, missing: "null" })] },
  {
    label: "an absent value under the default policy",
    accepted: true,
    doc: [make_binding({ name: "topic", value: absent, missing: "default", default_value: "none" })],
  },
  {
    label: "a policy switched away from default drops its default",
    accepted: true,
    doc: [with_missing_policy(make_binding({ name: "t", value: ref, missing: "default", default_value: 1 }), "null")],
  },
  { label: "first_present over two sources", accepted: true, doc: [make_binding({ name: "topic", value: first_present_expression([absent, ref]), missing: "error" })] },

  { label: "a default beside another policy", accepted: false, doc: [{ name: "a", value: ref, missing: "null", default: 1 }] },
  { label: "the default policy without a default", accepted: false, doc: [{ name: "a", value: ref, missing: "default" }] },
  { label: "a policy the runtime does not know", accepted: false, doc: [{ name: "a", value: ref, missing: "optional" }] },
  { label: "two bindings claiming one name", accepted: false, doc: [{ name: "a", value: ref, missing: "error" }, { name: "a", value: ref, missing: "error" }] },
  { label: "first_present over a single source", accepted: false, doc: [{ name: "a", value: first_present_expression([ref]), missing: "error" }] },
  { label: "a negative path index", accepted: false, doc: [{ name: "a", value: ref_expression("x", [-1]), missing: "error" }] },
  { label: "an expression kind the runtime does not know", accepted: false, doc: [{ name: "a", value: { kind: "env" }, missing: "error" }] },
  { label: "a ref with no node", accepted: false, doc: [{ name: "a", value: { kind: "ref", node_id: "", path: [] }, missing: "error" }] },
]);

export const OUTPUT_MAPPING_CASES = Object.freeze([
  { label: "an input source", accepted: true, doc: [make_output_mapping({ name: "a", kind: "input", path: ["topic"] })] },
  { label: "a result source", accepted: true, doc: [make_output_mapping({ name: "a", kind: "result", path: [] })] },
  { label: "a source kind the runtime does not know", accepted: false, doc: [make_output_mapping({ name: "a", kind: "context", path: [] })] },
  {
    label: "two outputs claiming one name",
    accepted: false,
    doc: [make_output_mapping({ name: "a", kind: "input", path: [] }), make_output_mapping({ name: "a", kind: "result", path: [] })],
  },
]);
