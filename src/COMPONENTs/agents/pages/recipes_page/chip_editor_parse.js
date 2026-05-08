const TOKEN_RE = /\{\{#([^.}]+)\.([^#}]+)#\}\}|\{\{([A-Za-z0-9_:-]+)\}\}/g;

export function parse_chip_string(s) {
  if (!s) return [];
  const nodes = [];
  let last = 0;
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(s)) !== null) {
    if (m.index > last) {
      nodes.push({ kind: "text", value: s.slice(last, m.index) });
    }
    if (m[3]) {
      nodes.push({ kind: "system_prompt", name: m[3] });
    } else {
      nodes.push({ kind: "var", node_id: m[1], field: m[2] });
    }
    last = m.index + m[0].length;
  }
  if (last < s.length) {
    nodes.push({ kind: "text", value: s.slice(last) });
  }
  return nodes;
}

export function serialize_chip_nodes(nodes) {
  return nodes
    .map((n) => {
      if (n.kind === "var") return `{{#${n.node_id}.${n.field}#}}`;
      if (n.kind === "system_prompt") return `{{${n.name}}}`;
      return n.value;
    })
    .join("");
}
