const VAR_RE = /\{\{#([^.}]+)\.([^#}]+)#\}\}/g;

export function parse_chip_string(s) {
  if (!s) return [];
  const nodes = [];
  let last = 0;
  let m;
  VAR_RE.lastIndex = 0;
  while ((m = VAR_RE.exec(s)) !== null) {
    if (m.index > last) {
      nodes.push({ kind: "text", value: s.slice(last, m.index) });
    }
    nodes.push({ kind: "var", node_id: m[1], field: m[2] });
    last = m.index + m[0].length;
  }
  if (last < s.length) {
    nodes.push({ kind: "text", value: s.slice(last) });
  }
  return nodes;
}

export function serialize_chip_nodes(nodes) {
  return nodes
    .map((n) =>
      n.kind === "var" ? `{{#${n.node_id}.${n.field}#}}` : n.value,
    )
    .join("");
}
