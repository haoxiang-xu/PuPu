function is_chip(node) {
  return (
    node &&
    node.nodeType === 1 &&
    node.dataset &&
    typeof node.dataset.chipRaw === "string"
  );
}

export function extract_value(container) {
  let value = "";
  for (const child of container.childNodes) {
    if (child.nodeType === 3) {
      value += child.textContent;
    } else if (is_chip(child)) {
      value += child.dataset.chipRaw;
    } else if (child.nodeType === 1) {
      value += child.textContent;
    }
  }
  return value;
}

export function dom_to_offset(container, node, dom_offset) {
  if (node === container) {
    let off = 0;
    for (let i = 0; i < dom_offset; i++) {
      const child = container.childNodes[i];
      if (child.nodeType === 3) off += child.textContent.length;
      else if (is_chip(child)) off += child.dataset.chipRaw.length;
      else off += child.textContent.length;
    }
    return off;
  }

  let off = 0;
  for (const child of container.childNodes) {
    if (child === node) {
      if (child.nodeType === 3) return off + dom_offset;
      if (is_chip(child)) {
        return dom_offset === 0 ? off : off + child.dataset.chipRaw.length;
      }
      return off + dom_offset;
    }
    if (child.contains && child.contains(node)) {
      if (is_chip(child)) {
        return off + child.dataset.chipRaw.length;
      }
      return off + child.textContent.length;
    }
    if (child.nodeType === 3) off += child.textContent.length;
    else if (is_chip(child)) off += child.dataset.chipRaw.length;
    else off += child.textContent.length;
  }
  return off;
}

export function offset_to_dom(container, target_offset) {
  let remaining = Math.max(0, target_offset);
  const children = container.childNodes;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const next = children[i + 1];
    if (child.nodeType === 3) {
      const len = child.textContent.length;
      if (remaining < len) return { node: child, offset: remaining };
      if (remaining === len) {
        if (next && is_chip(next)) return { node: container, offset: i + 1 };
        return { node: child, offset: len };
      }
      remaining -= len;
    } else if (is_chip(child)) {
      const len = child.dataset.chipRaw.length;
      if (remaining === 0) return { node: container, offset: i };
      if (remaining < len) return { node: container, offset: i + 1 };
      if (remaining === len) {
        if (next && next.nodeType === 3) return { node: next, offset: 0 };
        return { node: container, offset: i + 1 };
      }
      remaining -= len;
    } else {
      const len = child.textContent.length;
      if (remaining <= len) return { node: child, offset: remaining };
      remaining -= len;
    }
  }
  const last = children[children.length - 1];
  if (last && last.nodeType === 3) {
    return { node: last, offset: last.textContent.length };
  }
  return { node: container, offset: children.length };
}
