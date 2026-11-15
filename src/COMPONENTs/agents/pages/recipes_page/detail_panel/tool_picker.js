import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Select from "./panel_select";
import CommandTree from "../../../../chat-input/components/command_tree";
import { ToolkitIconFrame } from "../../../../toolkit/components/toolkit_icon";
import { withMcpStoreIcon } from "../../../../../SERVICEs/mcp_toolkit_store";
import { api } from "../../../../../SERVICEs/api";
import { subscribeToolkitCatalogRefresh } from "../../../../../SERVICEs/toolkit_catalog_refresh";
import { read_toolkit_catalog } from "../toolkit_pool_config";
import { pickerSelectProps } from "./panel_style";

/* Picking a tool (#484): the tools as the library files them, one folder per
 * toolkit with the toolkit's icon, each tool with its own (or its toolkit's)
 * icon and its description under its name, in the panel's explorer Select —
 * the one the Workflow and Skill pickers use. Typing searches every tool
 * flat. A Tool Call and a Hook use it.
 *
 * A value is `${toolkitId}${TOOL_KEY}${name}` — also the explorer row's id, so
 * it is printable. `pinned` choices of the caller's own (a stored tool the
 * library no longer lists, "Every tool") sit first. */

export const TOOL_KEY = "::";
const ACCENT = "#ea7547";

export function useToolLibrary() {
  const [library, setLibrary] = useState({ status: "loading", rows: [] });
  const ticket = useRef(0);
  const alive = useRef(true);
  const read = useCallback(async () => {
    const mine = ++ticket.current;
    setLibrary((old) => ({ ...old, status: "loading" }));
    try {
      const rows = read_toolkit_catalog(await api.unchain.listToolModalCatalog({ strict: true }));
      if (alive.current && mine === ticket.current) setLibrary({ status: "ready", rows });
    } catch (_error) {
      if (alive.current && mine === ticket.current) setLibrary((old) => ({ ...old, status: "error" }));
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    read();
    const unsubscribe = subscribeToolkitCatalogRefresh(read);
    return () => {
      alive.current = false;
      ticket.current += 1;
      unsubscribe();
    };
  }, [read]);
  return [library, read];
}

/* Where a tool name is in the library: the first visible toolkit offering it. */
export function tool_value(library, name) {
  if (typeof name !== "string" || !name) return null;
  const kit = (library.rows || []).find((row) => row.hidden !== true && row.tools.some((item) => item.name === name && item.hidden !== true));
  return kit ? `${kit.toolkitId}${TOOL_KEY}${name}` : null;
}

export default function ToolPicker({ library, value, pinned = [], isDark, editable, placeholder, onPick, style, dropdownStyle }) {
  const visible = useMemo(() => (library.rows || []).filter((kit) => kit.hidden !== true), [library.rows]);
  const icon_of = (kit, item) => (
    <ToolkitIconFrame icon={(item && item.icon) || withMcpStoreIcon(kit).toolkitIcon || {}} isDark={isDark}
      size={16} iconSize={10} transparentIconSize={14} borderRadius={4} fallbackColor={ACCENT} />
  );
  const options = [
    ...pinned.map((option) => ({ ...option, pinned: true })),
    ...visible.flatMap((kit) => kit.tools.filter((item) => item.hidden !== true).map((item) => ({
      value: `${kit.toolkitId}${TOOL_KEY}${item.name}`,
      label: item.title || item.name,
      icon: icon_of(kit, item),
      description: item.description || "",
    }))),
  ];
  const optionsKey = options.map((option) => `${option.value}\u0001${option.label}`).join("\n");
  const tree = useMemo(() => {
    const data = {};
    const byValue = new Map(options.map((option) => [option.value, option]));
    const leaf = (id) => {
      data[id] = { id, label: byValue.get(id).label, type: "file", kind: "command", option: byValue.get(id) };
      return id;
    };
    const root = pinned.map((option) => leaf(option.value));
    visible.forEach((kit) => {
      const children = kit.tools.filter((item) => item.hidden !== true).map((item) => leaf(`${kit.toolkitId}${TOOL_KEY}${item.name}`));
      if (children.length === 0) return;
      const id = `folder:${kit.toolkitId}`;
      const mark = withMcpStoreIcon(kit).toolkitIcon || {};
      data[id] = { id, label: kit.toolkitName || kit.toolkitId, type: "folder", kind: "folder", children,
        prefix_icon: "tool",
        prefix_render: (size) => <ToolkitIconFrame icon={mark} isDark={isDark} size={size} iconSize={Math.round(size * 0.62)}
          transparentIconSize={size} borderRadius={4} fallbackColor={ACCENT} /> };
      root.push(id);
    });
    return { data, root };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey, isDark]);
  const renderTree = ({ highlighted_value, render_option, on_hover_row, on_visible_change }) => (
    <CommandTree data={tree.data} root={tree.root} activeNodeId={highlighted_value ?? null}
      onHover={on_hover_row} onVisibleChange={on_visible_change} defaultExpanded={false} isDark={isDark} bare width="100%"
      renderRow={({ node: row, depth }) => render_option(row.option, { depth })} />
  );
  return (
    <Select
      options={options}
      value={value}
      set_value={onPick}
      filterable
      palette_tree={renderTree}
      placeholder={placeholder}
      disabled={!editable}
      dropdown_style={dropdownStyle || { maxHeight: "min(280px, 40vh)" }}
      {...pickerSelectProps}
      {...(style ? { style: { ...pickerSelectProps.style, ...style } } : {})}
    />
  );
}
