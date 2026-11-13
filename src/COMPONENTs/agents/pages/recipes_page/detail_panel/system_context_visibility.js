import { node_bindings, node_output_mappings } from "../skeleton_document";
import { binding_problems, output_mapping_is_editable } from "../skeleton_io";

/* UI only. Follow stored aliases back to the Agent's runtime metadata rather
   than hiding every business field named context. Ambiguous/invalid addresses
   and cycles stay visible; none of these helpers changes the stored graph. */
function unique(rows, predicate) {
  const matches = rows.filter(predicate);
  return matches.length === 1 ? matches[0] : null;
}

function context_reference(document, value, suffix, seen) {
  if (value?.kind !== "ref" || typeof value.node_id !== "string" || !Array.isArray(value.path)) return false;
  const path = [...value.path, ...suffix];
  const node = unique(document?.nodes || [], (entry) => entry?.id === value.node_id);
  if (!node || typeof path[0] !== "string") return false;
  const mapping = unique(node_output_mappings(node), (entry) => entry?.name === path[0]);
  return context_mapping(document, node, mapping, path.slice(1), seen);
}

function context_binding(document, binding, suffix, seen) {
  if (!binding || seen.has(binding) || binding_problems([binding]).length) return false;
  const nextSeen = new Set(seen).add(binding);
  return context_reference(document, binding.value, suffix, nextSeen);
}

function context_mapping(document, node, mapping, suffix, seen) {
  if (!output_mapping_is_editable(mapping) || seen.has(mapping)) return false;
  const path = [...mapping.source.path, ...suffix];
  if (mapping.source.kind === "result") return node?.type === "agent" && path[0] === "context";
  if (mapping.source.kind !== "input" || typeof path[0] !== "string") return false;
  const binding = unique(node_bindings(node), (entry) => entry?.name === path[0]);
  return context_binding(document, binding, path.slice(1), new Set(seen).add(mapping));
}

export function is_system_context_output(document, node, mapping) {
  if (node_output_mappings(node).filter((entry) => entry?.name === mapping?.name).length !== 1) return false;
  return context_mapping(document, node, mapping, [], new Set());
}

export function is_system_context_input(document, node, binding) {
  if (node_bindings(node).filter((entry) => entry?.name === binding?.name).length !== 1) return false;
  return context_binding(document, binding, [], new Set());
}

/* End's legacy metadata passthrough is internal too. Other nodes' explicit
   inputs remain editable: they can use metadata in their own processing. */
export function visible_input_rows(document, node, rowDiagnostics) {
  return node_bindings(node).flatMap((binding, index) => (
    node?.type === "end" && !rowDiagnostics?.[index]?.length && is_system_context_input(document, node, binding)
      ? [] : [{ binding, index }]
  ));
}
